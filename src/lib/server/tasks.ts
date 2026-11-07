import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, projects, tasks, users } from "@/db/schema";
import { HttpError } from "./authz";
import type { AppRole } from "./domain";

export type WorkStatus = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED" | "BLOCKED" | "CANCELLED";
export type TaskView = "active" | "archived" | "deleted";
type Actor = { id: string; role: AppRole };

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  projectId?: string | null;
  dueDate?: string | null;
  status?: WorkStatus;
  progress?: number;
  assigneeId?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  version: number;
  action?: "archive" | "restore";
};

export type TaskBulkInput =
  | { ids: string[]; action: "assign"; assigneeId: string | null }
  | { ids: string[]; action: "archive" | "restore" }
  | { ids: string[]; action: "status"; status: WorkStatus };

export function validateTaskState(status: WorkStatus, progress: number) {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new HttpError(400, "Progress must be an integer from 0 to 100");
  if (status === "COMPLETED" && progress !== 100) throw new HttpError(400, "Completed tasks require 100% progress");
  if (status === "NOT_STARTED" && progress !== 0) throw new HttpError(400, "Not started tasks require 0% progress");
  if (status !== "COMPLETED" && progress === 100) throw new HttpError(400, "Only completed tasks may have 100% progress");
}

export function assertTaskUpdateAllowed(actor: Actor, assigneeId: string | null, active: boolean, input: UpdateTaskInput) {
  if (actor.role === "ADMIN") return;
  if (!active || assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
  const allowed = new Set(["progress", "status", "version"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new HttpError(403, "Staff may only update progress and status");
}

function rethrowConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new HttpError(409, "Task conflicts with an existing record");
  throw error;
}

async function validateRelations(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], input: { projectId?: string | null; assigneeId?: string | null }) {
  if (input.projectId) {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), isNull(projects.archivedAt), isNull(projects.deletedAt))).limit(1);
    if (!project) throw new HttpError(400, "projectId must reference an active project");
  }
  if (input.assigneeId) {
    const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).limit(1);
    if (!staff) throw new HttpError(400, "assigneeId must reference an active STAFF user");
  }
}

export async function listTasks(actor: Actor, view: TaskView = "active") {
  const effectiveView = actor.role === "ADMIN" ? view : "active";
  const filters = effectiveView === "active"
    ? [isNull(tasks.archivedAt), isNull(tasks.deletedAt)]
    : effectiveView === "archived"
      ? [isNotNull(tasks.archivedAt), isNull(tasks.deletedAt)]
      : [isNotNull(tasks.deletedAt)];
  if (actor.role === "STAFF") filters.push(eq(tasks.assigneeId, actor.id));
  return db.select({
    id: tasks.id,
    projectId: tasks.projectId,
    title: tasks.title,
    description: tasks.description,
    dueDate: tasks.dueDate,
    status: tasks.status,
    progress: tasks.progress,
    assigneeId: tasks.assigneeId,
    archivedAt: tasks.archivedAt,
    deletedAt: tasks.deletedAt,
    version: tasks.version,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    project: { id: projects.id, code: projects.code, brand: projects.brand },
    assignee: { id: users.id, name: users.name },
  }).from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...filters))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
}

export async function createTask(actor: Actor, input: CreateTaskInput) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  const status = input.status ?? "NOT_STARTED";
  const progress = input.progress ?? 0;
  validateTaskState(status, progress);
  try {
    return await db.transaction(async (tx) => {
      await validateRelations(tx, input);
      const [row] = await tx.insert(tasks).values({ ...input, title: input.title.trim(), status, progress }).returning();
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "task.created", entityType: "TASK", entityId: row.id, changes: { to: row } });
      return row;
    });
  } catch (error) { return rethrowConflict(error); }
}

export async function updateTask(actor: Actor, id: string, input: UpdateTaskInput) {
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update").limit(1);
      if (!current) throw new HttpError(404, "Task not found");
      if (current.version !== input.version) throw new HttpError(409, "Task changed; reload before saving");
      const active = !current.archivedAt && !current.deletedAt;
      assertTaskUpdateAllowed(actor, current.assigneeId, active, input);

      if (input.action) {
        if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
        const now = new Date();
        const lifecycle = input.action === "archive" ? { archivedAt: now } : { archivedAt: null, deletedAt: null };
        const [row] = await tx.update(tasks).set({ ...lifecycle, version: sql`${tasks.version} + 1`, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.version, input.version))).returning();
        if (!row) throw new HttpError(409, "Task changed; reload before saving");
        await tx.insert(auditEvents).values({ actorId: actor.id, action: `task.${input.action}`, entityType: "TASK", entityId: id, changes: { from: current, to: row } });
        return row;
      }

      if (!active) throw new HttpError(409, "Archived or deleted tasks cannot be updated");
      await validateRelations(tx, input);
      const status = input.status ?? current.status;
      const progress = input.progress ?? current.progress;
      validateTaskState(status, progress);
      const { version, action, ...changes } = input;
      void action;
      const [row] = await tx.update(tasks).set({ ...changes, status, progress, version: sql`${tasks.version} + 1`, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.version, version))).returning();
      if (!row) throw new HttpError(409, "Task changed; reload before saving");
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "task.updated", entityType: "TASK", entityId: id, changes: { from: current, to: row } });
      return row;
    });
  } catch (error) { return rethrowConflict(error); }
}

export async function deleteTask(actor: Actor, id: string, version: number) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Task not found");
    if (current.version !== version) throw new HttpError(409, "Task changed; reload before saving");
    const now = new Date();
    const [row] = await tx.update(tasks).set({ archivedAt: current.archivedAt ?? now, deletedAt: now, version: sql`${tasks.version} + 1`, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.version, version))).returning();
    if (!row) throw new HttpError(409, "Task changed; reload before saving");
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "task.deleted", entityType: "TASK", entityId: id, changes: { from: current, to: row } });
    return row;
  });
}

export async function bulkUpdateTasks(actor: Actor, input: TaskBulkInput) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const current = await tx.select().from(tasks).where(inArray(tasks.id, input.ids)).for("update");
    if (current.length !== input.ids.length) throw new HttpError(404, "One or more tasks were not found");
    const active = current.every((task) => !task.archivedAt && !task.deletedAt);
    if ((input.action === "assign" || input.action === "status") && !active) throw new HttpError(409, "Archived or deleted tasks cannot be changed");
    if (input.action === "archive" && !active) throw new HttpError(409, "Only active tasks can be archived");
    if (input.action === "restore" && current.some((task) => !task.archivedAt && !task.deletedAt)) throw new HttpError(409, "Only archived or deleted tasks can be restored");
    const now = new Date();

    if (input.action === "assign") {
      if (input.assigneeId) await validateRelations(tx, { assigneeId: input.assigneeId });
      await tx.update(tasks).set({ assigneeId: input.assigneeId, version: sql`${tasks.version} + 1`, updatedAt: now }).where(inArray(tasks.id, input.ids));
      await tx.insert(auditEvents).values(current.map((task) => ({ actorId: actor.id, action: "task.assignment.bulk_updated", entityType: "TASK", entityId: task.id, changes: { from: task.assigneeId, to: input.assigneeId }, metadata: { bulk: true, count: input.ids.length } })));
    } else if (input.action === "status") {
      for (const task of current) {
        const progress = input.status === "COMPLETED" ? 100 : input.status === "NOT_STARTED" ? 0 : task.progress === 100 ? 0 : task.progress;
        validateTaskState(input.status, progress);
        await tx.update(tasks).set({ status: input.status, progress, version: sql`${tasks.version} + 1`, updatedAt: now }).where(eq(tasks.id, task.id));
        await tx.insert(auditEvents).values({ actorId: actor.id, action: "task.status.bulk_updated", entityType: "TASK", entityId: task.id, changes: { from: { status: task.status, progress: task.progress }, to: { status: input.status, progress } }, metadata: { bulk: true, count: input.ids.length } });
      }
    } else {
      const lifecycle = input.action === "archive" ? { archivedAt: now } : { archivedAt: null, deletedAt: null };
      await tx.update(tasks).set({ ...lifecycle, version: sql`${tasks.version} + 1`, updatedAt: now }).where(inArray(tasks.id, input.ids));
      await tx.insert(auditEvents).values(current.map((task) => ({ actorId: actor.id, action: `task.${input.action}.bulk`, entityType: "TASK", entityId: task.id, changes: { from: { archivedAt: task.archivedAt, deletedAt: task.deletedAt }, to: lifecycle }, metadata: { bulk: true, count: input.ids.length } })));
    }
    return { action: input.action, updated: input.ids.length, ids: input.ids };
  });
}
