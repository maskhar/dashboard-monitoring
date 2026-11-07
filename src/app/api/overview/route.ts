import { sql } from "drizzle-orm";
import { db } from "@/db";
import { approvals, auditEvents } from "@/db/schema";
import { apiError, requireUser } from "@/lib/server/authz";
import { projectOverview } from "@/lib/server/projects";
export async function GET() { try { const actor = await requireUser(); const [projects, pending, activity] = await Promise.all([projectOverview(actor), db.select({ count: sql<number>`count(*)::int` }).from(approvals).where(actor.role === "ADMIN" ? sql`${approvals.status} = 'PENDING'` : sql`${approvals.status} = 'PENDING' and ${approvals.requestedBy} = ${actor.id}`), db.select().from(auditEvents).where(actor.role === "ADMIN" ? undefined : sql`${auditEvents.actorId} = ${actor.id}`).orderBy(sql`${auditEvents.createdAt} desc`).limit(10)]); return Response.json({ projects, pendingApprovals: pending[0]?.count ?? 0, activity }); } catch (e) { return apiError(e); } }
