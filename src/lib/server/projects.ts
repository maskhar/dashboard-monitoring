import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, projectAssignments, projectProgress, projects, users } from "@/db/schema";
import { HttpError } from "./authz";
import { canEditProject, validateProjectState, type AppRole, type ProjectState } from "./domain";

type Actor = { id: string; role: AppRole };
export type ProjectView = "active" | "archived" | "deleted" | "all";

export type CreateProjectInput = {
  code: string; brand: string; startDate?: string; dueDate?: string; program?: string; category?: string;
  notes?: string; status?: ProjectState; progress?: number; assigneeId?: string;
};

export type ProjectBulkInput =
  | { ids: string[]; action: "assign"; assigneeId: string | null }
  | { ids: string[]; action: "archive" | "restore" }
  | { ids: string[]; action: "status"; status: ProjectState };

function conflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new HttpError(409, "Project code already exists");
  throw error;
}

export async function createProject(actor: Actor, input: CreateProjectInput) {
  const status = input.status ?? "BACKLOG";
  const progress = input.progress ?? 0;
  try { validateProjectState(status, progress); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid project state"); }
  if (input.startDate && input.dueDate && input.startDate > input.dueDate) throw new HttpError(400, "startDate must not be after dueDate");
  try {
    return await db.transaction(async (tx) => {
      if (input.assigneeId) {
        const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).limit(1);
        if (!staff) throw new HttpError(400, "PIC must be an active STAFF user");
      }
      const { assigneeId, ...values } = input;
      const [created] = await tx.insert(projects).values({ ...values, status, progress, publishedAt: status === "PUBLISHED" ? new Date() : null }).returning();
      if (assigneeId) await tx.insert(projectAssignments).values({ projectId: created.id, userId: assigneeId, role: "PIC" });
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.created", entityType: "PROJECT", entityId: created.id, changes: { ...values, status, progress, assigneeId: assigneeId ?? null } });
      return created;
    });
  } catch (error) { return conflict(error); }
}

export async function listProjects(actor: Actor, input: { q?: string; status?: ProjectState; view?: ProjectView; limit?: number; offset?: number }) {
  return listProjectsInternal(actor, input);
}

async function listProjectsInternal(actor: Actor, input: { q?: string; status?: ProjectState; view?: ProjectView; limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const view = actor.role === "ADMIN" ? input.view ?? "active" : "active";
  const filters = view === "active" ? [isNull(projects.archivedAt), isNull(projects.deletedAt)]
    : view === "archived" ? [isNotNull(projects.archivedAt), isNull(projects.deletedAt)]
      : view === "deleted" ? [isNotNull(projects.deletedAt)] : [];
  if (actor.role === "STAFF") filters.push(sql`exists (select 1 from ${projectAssignments} pa where pa.project_id = ${projects.id} and pa.user_id = ${actor.id} and pa.active = true)`);
  if (input.q) filters.push(or(ilike(projects.code, `%${input.q}%`), ilike(projects.brand, `%${input.q}%`))!);
  if (input.status) filters.push(eq(projects.status, input.status));
  return db.select({ id: projects.id, code: projects.code, brand: projects.brand, program: projects.program, category: projects.category, status: projects.status, progress: projects.progress, startDate: projects.startDate, dueDate: projects.dueDate, publishedAt: projects.publishedAt, notes: projects.notes, version: projects.version, archivedAt: projects.archivedAt, deletedAt: projects.deletedAt, createdAt: projects.createdAt, updatedAt: projects.updatedAt, assignee: { id: users.id, name: users.name } }).from(projects).leftJoin(projectAssignments, and(eq(projectAssignments.projectId, projects.id), eq(projectAssignments.active, true), eq(projectAssignments.role, "PIC"))).leftJoin(users, eq(projectAssignments.userId, users.id)).where(and(...filters)).orderBy(asc(projects.code)).limit(limit).offset(Math.max(input.offset ?? 0, 0));
}

export async function changeProjectLifecycle(actor: Actor, id: string, action: "archive" | "restore" | "delete") {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(projects).where(eq(projects.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Project not found");
    const now = new Date();
    const changes = action === "archive" ? { archivedAt: now } : action === "delete" ? { archivedAt: now, deletedAt: now } : { archivedAt: null, deletedAt: null };
    const [row] = await tx.update(projects).set({ ...changes, updatedAt: now }).where(eq(projects.id, id)).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: `project.${action}`, entityType: "PROJECT", entityId: id, changes: { from: { archivedAt: current.archivedAt, deletedAt: current.deletedAt }, to: changes } });
    return row;
  });
}

export async function updateProject(actor: Actor, id: string, input: { status: ProjectState; progress: number; note?: string; version: number }) {
  try { validateProjectState(input.status, input.progress); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid project state"); }
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ project: projects, assigneeId: projectAssignments.userId }).from(projects).leftJoin(projectAssignments, and(eq(projectAssignments.projectId, projects.id), eq(projectAssignments.active, true), eq(projectAssignments.role, "PIC"))).where(eq(projects.id, id)).limit(1);
    if (!row) throw new HttpError(404, "Project not found");
    if (row.project.archivedAt || row.project.deletedAt) throw new HttpError(409, "Archived or deleted projects cannot be updated");
    if (!canEditProject(actor.role, actor.id, row.assigneeId)) throw new HttpError(403, "Forbidden");
    if (row.project.version !== input.version) throw new HttpError(409, "Project changed; reload before saving");
    const [updated] = await tx.update(projects).set({ status: input.status, progress: input.progress, notes: input.note, publishedAt: input.status === "PUBLISHED" ? new Date() : null, version: sql`${projects.version} + 1`, updatedAt: new Date() }).where(and(eq(projects.id, id), eq(projects.version, input.version))).returning();
    if (!updated) throw new HttpError(409, "Project changed; reload before saving");
    await tx.insert(projectProgress).values({ projectId: id, progress: input.progress, status: input.status, note: input.note, recordedBy: actor.id });
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.updated", entityType: "PROJECT", entityId: id, changes: { from: { status: row.project.status, progress: row.project.progress }, to: input } });
    return updated;
  });
}

export async function assignProject(actorId: string, projectId: string, userId: string | null) {
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new HttpError(404, "Project not found");
    if (project.archivedAt || project.deletedAt) throw new HttpError(409, "Archived or deleted projects cannot be assigned");
    if (userId) {
      const [staff] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).limit(1);
      if (!staff) throw new HttpError(400, "PIC must be an active STAFF user");
    }
    const [previous] = await tx.select({ id: projectAssignments.id, userId: projectAssignments.userId }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.active, true), eq(projectAssignments.role, "PIC"))).limit(1);
    if (previous) await tx.update(projectAssignments).set({ active: false, endedAt: new Date() }).where(eq(projectAssignments.id, previous.id));
    let assignment = null;
    if (userId) [assignment] = await tx.insert(projectAssignments).values({ projectId, userId, role: "PIC" }).returning();
    await tx.insert(auditEvents).values({ actorId, action: "project.assignment.updated", entityType: "PROJECT", entityId: projectId, changes: { from: previous?.userId ?? null, to: userId } });
    return { projectId, userId, assignment };
  });
}

export async function bulkUpdateProjects(actor: Actor, input: ProjectBulkInput) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const current = await tx.select().from(projects).where(inArray(projects.id, input.ids)).for("update");
    if (current.length !== input.ids.length) throw new HttpError(404, "One or more projects were not found");
    const active = current.every((project) => !project.archivedAt && !project.deletedAt);
    if ((input.action === "assign" || input.action === "status") && !active) throw new HttpError(409, "Archived or deleted projects cannot be changed");
    if (input.action === "archive" && !active) throw new HttpError(409, "Only active projects can be archived");
    if (input.action === "restore" && current.some((project) => !project.archivedAt && !project.deletedAt)) throw new HttpError(409, "Only archived or deleted projects can be restored");

    const now = new Date();
    if (input.action === "assign") {
      if (input.assigneeId) {
        const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).limit(1);
        if (!staff) throw new HttpError(400, "PIC must be an active STAFF user");
      }
      const previous = await tx.select({ id: projectAssignments.id, projectId: projectAssignments.projectId, userId: projectAssignments.userId }).from(projectAssignments).where(and(inArray(projectAssignments.projectId, input.ids), eq(projectAssignments.active, true), eq(projectAssignments.role, "PIC")));
      if (previous.length) await tx.update(projectAssignments).set({ active: false, endedAt: now }).where(inArray(projectAssignments.id, previous.map((item) => item.id)));
      if (input.assigneeId) await tx.insert(projectAssignments).values(input.ids.map((projectId) => ({ projectId, userId: input.assigneeId!, role: "PIC" })));
      const previousByProject = new Map(previous.map((item) => [item.projectId, item.userId]));
      await tx.insert(auditEvents).values(input.ids.map((id) => ({ actorId: actor.id, action: "project.assignment.bulk_updated", entityType: "PROJECT", entityId: id, changes: { from: previousByProject.get(id) ?? null, to: input.assigneeId }, metadata: { bulk: true, count: input.ids.length } })));
    } else if (input.action === "status") {
      for (const project of current) {
        const progress = input.status === "PUBLISHED" ? 100 : input.status === "BACKLOG" ? 0 : project.progress === 100 ? 0 : project.progress;
        validateProjectState(input.status, progress);
        await tx.update(projects).set({ status: input.status, progress, publishedAt: input.status === "PUBLISHED" ? now : null, version: sql`${projects.version} + 1`, updatedAt: now }).where(eq(projects.id, project.id));
        await tx.insert(projectProgress).values({ projectId: project.id, progress, status: input.status, recordedBy: actor.id, note: "Bulk status update" });
        await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.status.bulk_updated", entityType: "PROJECT", entityId: project.id, changes: { from: { status: project.status, progress: project.progress }, to: { status: input.status, progress } }, metadata: { bulk: true, count: input.ids.length } });
      }
    } else {
      const lifecycle = input.action === "archive" ? { archivedAt: now } : { archivedAt: null, deletedAt: null };
      await tx.update(projects).set({ ...lifecycle, version: sql`${projects.version} + 1`, updatedAt: now }).where(inArray(projects.id, input.ids));
      await tx.insert(auditEvents).values(current.map((project) => ({ actorId: actor.id, action: `project.${input.action}.bulk`, entityType: "PROJECT", entityId: project.id, changes: { from: { archivedAt: project.archivedAt, deletedAt: project.deletedAt }, to: lifecycle }, metadata: { bulk: true, count: input.ids.length } })));
    }
    return { action: input.action, updated: input.ids.length, ids: input.ids };
  });
}

export async function projectOverview(actor: Actor) {
  const visibility = actor.role === "ADMIN" ? sql`true` : sql`exists (select 1 from ${projectAssignments} pa where pa.project_id = ${projects.id} and pa.user_id = ${actor.id} and pa.active = true)`;
  const active = and(isNull(projects.archivedAt), isNull(projects.deletedAt), visibility);
  const [counts] = await db.select({ total: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${projects.dueDate} < (now() at time zone 'Asia/Jakarta')::date and ${projects.progress} < 100 and ${projects.status} not in ('PUBLISHED','CANCELLED'))::int`, unassigned: sql<number>`count(*) filter (where ${projects.progress} < 100 and ${projects.status} not in ('PUBLISHED','CANCELLED') and not exists (select 1 from ${projectAssignments} pa where pa.project_id = ${projects.id} and pa.active = true and pa.role = 'PIC'))::int`, inconsistent: sql<number>`count(*) filter (where (${projects.progress} = 100 and ${projects.status} = 'BACKLOG') or (${projects.progress} < 100 and ${projects.status} = 'PUBLISHED'))::int`, averageProgress: sql<number>`coalesce(round(avg(${projects.progress})),0)::int` }).from(projects).where(active);
  const statuses = await db.select({ status: projects.status, count: sql<number>`count(*)::int` }).from(projects).where(active).groupBy(projects.status);
  return { ...counts, statuses };
}




