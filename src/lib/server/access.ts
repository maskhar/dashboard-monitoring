import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyMilestones, gates, kpiActuals, kpiTargets, onboardingTasks, projectAssignments, tasks, weeklyPlans } from "@/db/schema";
import type { AppRole } from "./domain";

export type Actor = { id: string; role: AppRole };

export async function canAccessEntity(actor: Actor, entityType: string, entityId: string) {
  if (actor.role === "ADMIN") return true;
  const type = entityType.toUpperCase();
  if (type === "PROJECT") {
    const [row] = await db.select({ id: projectAssignments.id }).from(projectAssignments).where(and(eq(projectAssignments.projectId, entityId), eq(projectAssignments.userId, actor.id), eq(projectAssignments.active, true))).limit(1);
    return Boolean(row);
  }
  if (type === "TASK") {
    const [row] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, entityId), eq(tasks.assigneeId, actor.id))).limit(1);
    return Boolean(row);
  }
  if (type === "KPI_TARGET") {
    const [row] = await db.select({ id: kpiTargets.id }).from(kpiTargets).where(and(eq(kpiTargets.id, entityId), eq(kpiTargets.assigneeId, actor.id))).limit(1);
    return Boolean(row);
  }
  if (type === "KPI_ACTUAL") {
    const [row] = await db.select({ id: kpiActuals.id }).from(kpiActuals).innerJoin(kpiTargets, eq(kpiActuals.targetId, kpiTargets.id)).where(and(eq(kpiActuals.id, entityId), eq(kpiTargets.assigneeId, actor.id))).limit(1);
    return Boolean(row);
  }
  const tables = { WEEKLY_PLAN: weeklyPlans, DAILY_MILESTONE: dailyMilestones, GATE: gates, ONBOARDING_TASK: onboardingTasks } as const;
  const table = tables[type as keyof typeof tables];
  if (!table) return false;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, entityId), eq(table.assigneeId, actor.id))).limit(1);
  return Boolean(row);
}
