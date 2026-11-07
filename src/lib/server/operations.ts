import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditEvents, dailyMilestones, gates, kpiActuals, kpiDefinitions, kpiTargets, monitoringPeriods, onboardingTasks, users, weeklyPlans } from "@/db/schema";
import type { Actor } from "./access";
import { HttpError } from "./authz";

type WorkStatus = typeof weeklyPlans.status.enumValues[number];
type GateStatus = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED" | "BLOCKED" | "CANCELLED";
const assigned = (actor: Actor, column: AnyPgColumn) => actor.role === "ADMIN" ? undefined : eq(column, actor.id);
const finished = new Set(["COMPLETED", "CANCELLED"]);

export type OperationalEntity = "KPI_TARGET" | "WEEKLY_PLAN" | "DAILY_MILESTONE" | "GATE" | "ONBOARDING_TASK";
export type OperationView = "active" | "archived" | "deleted" | "all";
export type CreateOperationInput =
  | { type: "WEEKLY_PLAN"; periodId: string; week: number; focus: string; deliverable: string; dueDate?: string; assigneeId?: string }
  | { type: "DAILY_MILESTONE"; periodId: string; day: number; title: string; deliverable: string; dueDate?: string; assigneeId?: string }
  | { type: "GATE"; periodId: string; title: string; assigneeId?: string }
  | { type: "KPI_TARGET"; periodId: string; code: string; name: string; unit: string; target: number; assigneeId?: string };

function lifecycleFilter(table: typeof weeklyPlans | typeof dailyMilestones | typeof gates | typeof kpiTargets, view: OperationView) {
  if (view === "active") return and(isNull(table.archivedAt), isNull(table.deletedAt));
  if (view === "archived") return and(isNotNull(table.archivedAt), isNull(table.deletedAt));
  if (view === "deleted") return isNotNull(table.deletedAt);
  return undefined;
}

export async function createOperation(actor: Actor, input: CreateOperationInput) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  try {
    return await db.transaction(async (tx) => {
      const [period] = await tx.select().from(monitoringPeriods).where(eq(monitoringPeriods.id, input.periodId)).limit(1);
      if (!period) throw new HttpError(400, "Monitoring period not found");
      if (input.assigneeId) {
        const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).limit(1);
        if (!staff) throw new HttpError(400, "PIC must be an active STAFF user");
      }
      if ("dueDate" in input && input.dueDate && (input.dueDate < period.startDate || input.dueDate > period.endDate)) throw new HttpError(400, "dueDate must be within monitoring period");
      if (input.type === "DAILY_MILESTONE" && input.day > 14) throw new HttpError(400, "14-day onboarding only accepts day 1 through 14");
      let row: Record<string, unknown>;
      if (input.type === "WEEKLY_PLAN") [row] = await tx.insert(weeklyPlans).values({ periodId: input.periodId, week: input.week, focus: input.focus, deliverable: input.deliverable, dueDate: input.dueDate, assigneeId: input.assigneeId }).returning();
      else if (input.type === "DAILY_MILESTONE") [row] = await tx.insert(dailyMilestones).values({ periodId: input.periodId, day: input.day, title: input.title, deliverable: input.deliverable, dueDate: input.dueDate, assigneeId: input.assigneeId }).returning();
      else if (input.type === "GATE") [row] = await tx.insert(gates).values({ periodId: input.periodId, title: input.title, assigneeId: input.assigneeId }).returning();
      else {
        const [definition] = await tx.insert(kpiDefinitions).values({ code: input.code, name: input.name, unit: input.unit }).onConflictDoUpdate({ target: kpiDefinitions.code, set: { name: input.name, unit: input.unit, active: true, updatedAt: new Date() } }).returning();
        [row] = await tx.insert(kpiTargets).values({ periodId: input.periodId, kpiId: definition.id, target: String(input.target), assigneeId: input.assigneeId }).returning();
      }
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "operation.created", entityType: input.type, entityId: String(row.id), changes: input });
      return row;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new HttpError(409, "Operational item already exists");
    throw error;
  }
}

export async function changeOperationLifecycle(actor: Actor, entityType: Exclude<OperationalEntity, "ONBOARDING_TASK">, id: string, action: "archive" | "restore" | "delete") {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  const table = { KPI_TARGET: kpiTargets, WEEKLY_PLAN: weeklyPlans, DAILY_MILESTONE: dailyMilestones, GATE: gates }[entityType];
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Operational item not found");
    const now = new Date();
    const changes = action === "archive" ? { archivedAt: now } : action === "delete" ? { archivedAt: now, deletedAt: now } : { archivedAt: null, deletedAt: null };
    const [row] = await tx.update(table).set({ ...changes, updatedAt: now }).where(eq(table.id, id)).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: `operation.${action}`, entityType, entityId: id, changes: { from: { archivedAt: current.archivedAt, deletedAt: current.deletedAt }, to: changes } });
    return row;
  });
}

export async function assignOperation(actor: Actor, input: { entityType: OperationalEntity; entityId: string; userId: string | null }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  const table = { KPI_TARGET: kpiTargets, WEEKLY_PLAN: weeklyPlans, DAILY_MILESTONE: dailyMilestones, GATE: gates, ONBOARDING_TASK: onboardingTasks }[input.entityType];
  return db.transaction(async (tx) => {
    const archivedAt = "archivedAt" in table ? table.archivedAt : sql<Date | null>`null`;
    const deletedAt = "deletedAt" in table ? table.deletedAt : sql<Date | null>`null`;
    const [current] = await tx.select({ id: table.id, assigneeId: table.assigneeId, archivedAt, deletedAt }).from(table).where(eq(table.id, input.entityId)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Operational item not found");
    if (current.archivedAt || current.deletedAt) throw new HttpError(409, "Archived or deleted items cannot be assigned");
    if (input.userId !== null) {
      const [staff] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.userId), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"))).for("share").limit(1);
      if (!staff) throw new HttpError(400, "PIC must be an active STAFF user");
    }
    const version = input.entityType === "WEEKLY_PLAN" ? { version: sql`${weeklyPlans.version} + 1` } : input.entityType === "ONBOARDING_TASK" ? { version: sql`${onboardingTasks.version} + 1` } : {};
    const [row] = await tx.update(table).set({ assigneeId: input.userId, updatedAt: new Date(), ...version }).where(eq(table.id, input.entityId)).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "operation.assignment.updated", entityType: input.entityType, entityId: input.entityId, changes: { from: current.assigneeId, to: input.userId } });
    return row;
  });
}

export function operationalSummary(period: { startDate: string; endDate: string } | null, weeks: { status: string; dueDate: string | null }[], days: { status: string; dueDate: string | null }[], phaseGates: { status: string }[], now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const periodPosition = !period ? "NO_PERIOD" : today < period.startDate ? "UPCOMING" : today > period.endDate ? "ENDED" : "ACTIVE";
  const totalDays = period ? Math.floor((Date.parse(period.endDate) - Date.parse(period.startDate)) / 86400000) + 1 : 0;
  const currentDay = period ? Math.max(0, Math.min(totalDays, Math.floor((Date.parse(today) - Date.parse(period.startDate)) / 86400000) + 1)) : 0;
  const counts = (items: { status: string; dueDate: string | null }[]) => ({ total: items.length, completed: items.filter((item) => item.status === "COMPLETED").length, overdue: items.filter((item) => Boolean(item.dueDate && item.dueDate < today && !finished.has(item.status))).length });
  return { periodPosition, businessDate: today, currentDay, currentWeek: Math.ceil(currentDay / 7), totalDays, totalWeeks: Math.ceil(totalDays / 7), weeks: counts(weeks), days: counts(days), gates: { total: phaseGates.length, completed: phaseGates.filter((gate) => gate.status === "COMPLETED").length } };
}

export async function getOperations(actor: Actor, periodId?: string | null, requestedView: OperationView = "active") {
  const view = actor.role === "ADMIN" ? requestedView : "active";
  const periods = await db.select().from(monitoringPeriods).orderBy(asc(monitoringPeriods.startDate));
  if (!periods.length) return { periods: [], period: null, timelinePeriod: null, programPeriod: null, kpis: [], monthlyKpis: [], allKpis: [], weeklyPlans: [], dailyMilestones: [], gates: [], onboarding: [], summary: operationalSummary(null, [], [], []) };
  const timelineRows = await db.select({ periodId: weeklyPlans.periodId, week: weeklyPlans.week, dueDate: weeklyPlans.dueDate }).from(weeklyPlans).where(and(inArray(weeklyPlans.periodId, periods.map((period) => period.id)), lifecycleFilter(weeklyPlans, "active"))).orderBy(asc(weeklyPlans.week));
  const timelineIds = new Set(timelineRows.map((row) => row.periodId));
  const timelinePeriod = periods.find((candidate) => timelineIds.has(candidate.id) && new Date(`${candidate.startDate}T00:00:00Z`).getUTCMonth() === 10) ?? periods.find((candidate) => timelineIds.has(candidate.id)) ?? periods[0];
  const period = (periodId ? periods.find((candidate) => candidate.id === periodId) : undefined) ?? timelinePeriod;
  const firstDue = timelineRows.find((row) => row.periodId === timelinePeriod.id && row.dueDate)?.dueDate;
  const programPeriod = { startDate: firstDue ? new Date(Date.parse(firstDue) - 4 * 86400000).toISOString().slice(0, 10) : periods[0].startDate, endDate: periods.reduce((latest, item) => item.endDate > latest ? item.endDate : latest, periods[0].endDate) };
  const [allKpis, weeks, days, phaseGates, onboarding] = await Promise.all([
    db.select({ target: kpiTargets, definition: kpiDefinitions, actual: kpiActuals }).from(kpiTargets).innerJoin(kpiDefinitions, eq(kpiTargets.kpiId, kpiDefinitions.id)).leftJoin(kpiActuals, eq(kpiActuals.targetId, kpiTargets.id)).where(and(inArray(kpiTargets.periodId, periods.map((item) => item.id)), assigned(actor, kpiTargets.assigneeId), lifecycleFilter(kpiTargets, view))).orderBy(desc(kpiActuals.reportedAt)),
    db.select().from(weeklyPlans).where(and(eq(weeklyPlans.periodId, timelinePeriod.id), assigned(actor, weeklyPlans.assigneeId), lifecycleFilter(weeklyPlans, view))).orderBy(asc(weeklyPlans.week)),
    db.select().from(dailyMilestones).where(and(eq(dailyMilestones.periodId, timelinePeriod.id), assigned(actor, dailyMilestones.assigneeId), lifecycleFilter(dailyMilestones, view), lte(dailyMilestones.day, 14))).orderBy(asc(dailyMilestones.day)),
    db.select().from(gates).where(and(eq(gates.periodId, timelinePeriod.id), assigned(actor, gates.assigneeId), lifecycleFilter(gates, view))),
    db.select().from(onboardingTasks).where(and(eq(onboardingTasks.periodId, timelinePeriod.id), assigned(actor, onboardingTasks.assigneeId))).orderBy(asc(onboardingTasks.day)),
  ]);
  const seen = new Set<string>();
  const monthlyKpis = allKpis.filter((row) => { if (seen.has(row.target.id)) return false; seen.add(row.target.id); return true; }).map((row) => ({ ...row, actual: row.actual ? presentKpiActual(row.actual) : null }));
  const kpis = monthlyKpis.filter((row) => row.target.periodId === period.id);
  const [summaryWeeks, summaryDays, summaryGates] = view === "active" ? [weeks, days, phaseGates] : await Promise.all([
    db.select().from(weeklyPlans).where(and(eq(weeklyPlans.periodId, timelinePeriod.id), assigned(actor, weeklyPlans.assigneeId), lifecycleFilter(weeklyPlans, "active"))),
    db.select().from(dailyMilestones).where(and(eq(dailyMilestones.periodId, timelinePeriod.id), assigned(actor, dailyMilestones.assigneeId), lifecycleFilter(dailyMilestones, "active"), lte(dailyMilestones.day, 14))),
    db.select().from(gates).where(and(eq(gates.periodId, timelinePeriod.id), assigned(actor, gates.assigneeId), lifecycleFilter(gates, "active"))),
  ]);
  return { periods, period, timelinePeriod, programPeriod, kpis, monthlyKpis, allKpis: monthlyKpis, weeklyPlans: weeks, dailyMilestones: days, gates: phaseGates, onboarding, summary: operationalSummary(programPeriod, summaryWeeks, summaryDays, summaryGates) };
}

function presentKpiActual<T extends { status: string; actual: string }>(row: T) { return { ...row, actual: row.status === "UNREPORTED" ? null : row.actual }; }

export async function updateKpi(actor: Actor, targetId: string, input: { actual: number | null; evaluation?: string | null; version?: number }) {
  if (input.actual !== null && (!Number.isFinite(input.actual) || input.actual < 0)) throw new HttpError(400, "Actual must be nonnegative or null");
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(kpiTargets).where(eq(kpiTargets.id, targetId)).for("update").limit(1);
    if (!target) throw new HttpError(404, "KPI target not found");
    if (target.archivedAt || target.deletedAt) throw new HttpError(409, "Archived or deleted items cannot be updated");
    if (actor.role === "STAFF" && target.assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
    const [current] = await tx.select().from(kpiActuals).where(eq(kpiActuals.targetId, targetId)).orderBy(desc(kpiActuals.reportedAt)).limit(1);
    if ((current && current.version !== input.version) || (!current && input.version !== undefined)) throw new HttpError(409, "KPI changed; reload before saving");
    const changes = { actual: String(input.actual ?? 0), status: input.actual === null ? "UNREPORTED" : "DRAFT", ...(input.evaluation !== undefined ? { evaluation: input.evaluation } : {}), reportedBy: actor.id, reportedAt: new Date() };
    const [row] = current ? await tx.update(kpiActuals).set({ ...changes, version: sql`${kpiActuals.version} + 1` }).where(and(eq(kpiActuals.id, current.id), eq(kpiActuals.version, current.version))).returning() : await tx.insert(kpiActuals).values({ targetId, ...changes }).returning();
    if (!row) throw new HttpError(409, "KPI changed; reload before saving");
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "kpi.actual.updated", entityType: "KPI_TARGET", entityId: targetId, changes: { from: current ?? null, to: row } });
    return presentKpiActual(row);
  });
}

export async function updateWeek(actor: Actor, id: string, input: { progress?: number; status?: WorkStatus; managerNote?: string | null; reviewNote?: string | null; nextAction?: string | null; version: number }) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(weeklyPlans).where(eq(weeklyPlans.id, id)).limit(1);
    if (!current) throw new HttpError(404, "Weekly plan not found");
    if (current.archivedAt || current.deletedAt) throw new HttpError(409, "Archived or deleted items cannot be updated");
    if (actor.role === "STAFF" && current.assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
    if (current.version !== input.version) throw new HttpError(409, "Weekly plan changed; reload before saving");
    if (actor.role === "STAFF" && (input.managerNote !== undefined || input.reviewNote !== undefined)) throw new HttpError(403, "Only ADMIN can set reviewNote");
    const reviewNote = input.reviewNote !== undefined ? input.reviewNote : input.managerNote;
    const [row] = await tx.update(weeklyPlans).set({ progress: input.progress, status: input.status, ...(reviewNote !== undefined ? { reviewNote } : {}), ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}), version: sql`${weeklyPlans.version} + 1`, updatedAt: new Date() }).where(and(eq(weeklyPlans.id, id), eq(weeklyPlans.version, input.version))).returning();
    if (!row) throw new HttpError(409, "Weekly plan changed; reload before saving");
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "weekly_plan.updated", entityType: "WEEKLY_PLAN", entityId: id, changes: { from: current, to: row } });
    return row;
  });
}

export async function updateDay(actor: Actor, id: string, input: { completed?: boolean; status?: WorkStatus; progress?: number; evidenceNote?: string | null; mentorNote?: string | null }) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(dailyMilestones).where(eq(dailyMilestones.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Daily milestone not found");
    if (current.archivedAt || current.deletedAt) throw new HttpError(409, "Archived or deleted items cannot be updated");
    if (actor.role === "STAFF" && current.assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
    if (actor.role === "STAFF" && input.mentorNote !== undefined) throw new HttpError(403, "Only ADMIN can set mentorNote");
    const status = input.status ?? (input.completed === undefined ? current.status : input.completed ? "COMPLETED" : "NOT_STARTED");
    const progress = input.progress ?? (input.completed === undefined ? current.progress : input.completed ? 100 : 0);
    const [row] = await tx.update(dailyMilestones).set({ status, progress, ...(input.evidenceNote !== undefined ? { evidenceNote: input.evidenceNote } : {}), ...(input.mentorNote !== undefined ? { mentorNote: input.mentorNote } : {}), updatedAt: new Date() }).where(eq(dailyMilestones.id, id)).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "daily_milestone.updated", entityType: "DAILY_MILESTONE", entityId: id, changes: { from: current, to: row } });
    return row;
  });
}

export async function updateGate(actor: Actor, id: string, input: { status: GateStatus }) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(gates).where(eq(gates.id, id)).for("update").limit(1);
    if (!current) throw new HttpError(404, "Gate not found");
    if (current.archivedAt || current.deletedAt) throw new HttpError(409, "Archived or deleted items cannot be updated");
    if (actor.role === "STAFF" && current.assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
    const [row] = await tx.update(gates).set({ status: input.status, updatedAt: new Date() }).where(eq(gates.id, id)).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "gate.updated", entityType: "GATE", entityId: id, changes: { from: current, to: row } });
    return row;
  });
}




