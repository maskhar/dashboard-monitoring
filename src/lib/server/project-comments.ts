import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, projectAssignments, projectComments, projects, users } from "@/db/schema";
import { HttpError } from "./authz";
import type { AppRole } from "./domain";

type Actor = { id: string; role: AppRole };

async function assertProjectAccess(actor: Actor, projectId: string) {
  const assignmentAccess = actor.role === "ADMIN" ? undefined : sql`exists (select 1 from ${projectAssignments} pa where pa.project_id = ${projects.id} and pa.user_id = ${actor.id} and pa.active = true)`;
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt), assignmentAccess)).limit(1);
  if (!project) throw new HttpError(404, "Project not found");
}

export async function listProjectComments(actor: Actor, projectId: string) {
  await assertProjectAccess(actor, projectId);
  return db.select({ id: projectComments.id, body: projectComments.body, createdAt: projectComments.createdAt, author: { id: users.id, name: users.name } })
    .from(projectComments)
    .innerJoin(users, eq(projectComments.authorId, users.id))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt))
    .limit(200);
}

export async function createProjectComment(actor: Actor, projectId: string, body: string) {
  await assertProjectAccess(actor, projectId);
  return db.transaction(async (tx) => {
    const [comment] = await tx.insert(projectComments).values({ projectId, authorId: actor.id, body }).returning({ id: projectComments.id, body: projectComments.body, createdAt: projectComments.createdAt });
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.comment.created", entityType: "PROJECT", entityId: projectId, metadata: { commentId: comment.id } });
    const [author] = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
    return { ...comment, author: author ?? { id: actor.id, name: "User" } };
  });
}
