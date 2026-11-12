import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { approvalActions, approvals, auditEvents, notificationJobs, weeklyPlans } from "@/db/schema";
import { HttpError } from "./authz";

const weeklySnapshot = z.object({ progress: z.number().int().min(0).max(100), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]), reviewNote: z.string().max(4000).nullish(), nextAction: z.string().max(4000).nullish() });

export async function decideApproval(actorId: string, id: string, decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED", note?: string) {
  if (decision !== "APPROVED" && !note?.trim()) throw new HttpError(400, "Decision note is required");
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(approvals).where(eq(approvals.id, id)).for("update").limit(1);
    if (!request) throw new HttpError(404, "Approval not found");
    if (request.status !== "PENDING") throw new HttpError(409, "Approval already decided");
    if (request.entityType === "PROJECT_PHASE" || request.approvalType === "PROJECT_GATE_APPROVAL") {
      throw new HttpError(409, "Project phase approvals must use POST /api/projects/{projectId}/phases/{phaseId}/decision so phase and approval state remain consistent");
    }

    if (decision === "APPROVED" && request.entityType === "WEEKLY_PLAN") {
      const snapshot = weeklySnapshot.parse(request.submittedSnapshot);
      const [current] = await tx.select().from(weeklyPlans).where(eq(weeklyPlans.id, request.entityId)).for("update").limit(1);
      if (!current) throw new HttpError(404, "Weekly plan not found");
      if (current.version !== request.baseVersion) throw new HttpError(409, "Weekly plan changed; request revision and submit again");
      await tx.update(weeklyPlans).set({ progress: snapshot.progress, status: snapshot.status, reviewNote: snapshot.reviewNote ?? null, nextAction: snapshot.nextAction ?? null, version: sql`${weeklyPlans.version} + 1`, updatedAt: new Date() }).where(eq(weeklyPlans.id, request.entityId));
    }

    const now = new Date();
    const decisionNote = note?.trim() || null;
    const [updated] = await tx.update(approvals).set({ status: decision, decidedBy: actorId, decidedAt: now, decisionNote }).where(eq(approvals.id, id)).returning();
    await tx.insert(approvalActions).values({ approvalId: id, action: decision, actorId, note: decisionNote });
    await tx.insert(auditEvents).values({ actorId, action: `approval.${decision.toLowerCase()}`, entityType: request.entityType, entityId: request.entityId, metadata: { approvalId: id, applied: decision === "APPROVED" } });
    await tx.insert(notificationJobs).values({ eventType: "APPROVAL_DECIDED", channel: "EMAIL", recipient: request.requestedBy, payload: { approvalId: id, decision }, idempotencyKey: `approval:${id}:${decision}` }).onConflictDoNothing();
    return updated;
  });
}
