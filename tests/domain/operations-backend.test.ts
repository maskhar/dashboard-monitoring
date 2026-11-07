import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mock = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn(), transaction: vi.fn(), requireUser: vi.fn(), access: vi.fn() }));
vi.mock("@/db", () => ({ db: mock }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
vi.mock("@/lib/server/access", () => ({ canAccessEntity: mock.access }));
vi.mock("@/lib/server/authz", async () => await import("../../src/lib/server/authz"));
vi.mock("@/lib/server/operations", async () => await import("../../src/lib/server/operations"));
vi.mock("../../src/lib/server/authz", () => ({
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  requireUser: mock.requireUser,
  apiError: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 400 }),
}));

import { assignOperation, getOperations, operationalSummary, updateDay, updateGate, updateKpi, updateWeek } from "../../src/lib/server/operations";
import { auditEvents } from "../../src/db/schema";

const admin = { id: "admin", role: "ADMIN" as const };
const staff = { id: "staff", role: "STAFF" as const };
function chain(rows: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["from", "where", "orderBy", "limit", "for", "innerJoin", "leftJoin", "set", "values", "returning", "onConflictDoNothing"]) query[name] = vi.fn(() => query);
  query.then = vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)));
  return query;
}
function select(rows: unknown[]) { const query = chain(rows); mock.select.mockReturnValueOnce(query); return query; }
function update(rows: unknown[]) { const query = chain(rows); mock.update.mockReturnValueOnce(query); return query; }
beforeEach(() => {
  vi.resetAllMocks();
  mock.transaction.mockImplementation((fn) => fn(mock));
  mock.insert.mockImplementation(() => chain([]));
  mock.requireUser.mockResolvedValue(admin);
  mock.access.mockResolvedValue(true);
});

describe("operations HTTP validation and approval dedup", () => {
  const context = { params: Promise.resolve({ id: "item" }) };
  const request = (input: unknown) => new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(input) });

  it("returns 400 for invalid or empty daily fields", async () => {
    const { PATCH } = await import("../../src/app/api/operations/days/[id]/route");
    for (const input of [{}, { progress: -1 }, { status: "INVALID" }, { completed: true, progress: 30 }]) {
      expect((await PATCH(request(input), context)).status).toBe(400);
    }
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for missing weekly version and conflicting aliases", async () => {
    const { PATCH } = await import("../../src/app/api/operations/weeks/[id]/route");
    for (const input of [{ progress: 10 }, { version: 1 }, { version: 1, managerNote: "one", reviewNote: "two" }]) {
      expect((await PATCH(request(input), context)).status).toBe(400);
    }
  });

  it("returns 400 for invalid KPI and gate status", async () => {
    const kpi = await import("../../src/app/api/operations/kpis/[targetId]/route");
    expect((await kpi.PATCH(request({ actual: -1 }), { params: Promise.resolve({ targetId: "target" }) })).status).toBe(400);
    const gate = await import("../../src/app/api/operations/gates/[id]/route");
    expect((await gate.PATCH(request({ status: "INVALID" }), context)).status).toBe(400);
  });

  it("returns 409 for existing pending approval without side effects", async () => {
    const { POST } = await import("../../src/app/api/approvals/route");
    const insert = chain([]);
    mock.insert.mockReturnValueOnce(insert);
    const response = await POST(request({ entityType: "WEEKLY_PLAN", entityId: "11111111-1111-4111-8111-111111111111", approvalType: "WEEKLY_REVIEW", baseVersion: 1, submittedSnapshot: { progress: 5 } }));
    expect(response.status).toBe(409);
    expect(insert.onConflictDoNothing).toHaveBeenCalled();
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });
});

describe("operations parity", () => {
  it("uses Jakarta business date and full program day/week position", () => {
    const summary = operationalSummary({ startDate: "2026-11-02", endDate: "2027-01-31" }, [
      { status: "IN_PROGRESS", dueDate: "2026-11-05" }, { status: "COMPLETED", dueDate: "2026-11-04" },
      { status: "CANCELLED", dueDate: "2026-11-03" }, { status: "NOT_STARTED", dueDate: "2026-11-06" },
    ], [], [{ status: "COMPLETED" }], new Date("2026-11-05T18:00:00Z"));
    expect(summary).toMatchObject({ businessDate: "2026-11-06", currentDay: 5, currentWeek: 1, totalDays: 91, totalWeeks: 13, periodPosition: "ACTIVE", weeks: { total: 4, completed: 1, overdue: 1 }, gates: { total: 1, completed: 1 } });
    expect(operationalSummary(null, [], [], []).periodPosition).toBe("NO_PERIOD");
  });

  it.each([admin, staff])("returns all months but keeps timeline and query authorization for $role", async (actor) => {
    select([{ id: "nov", startDate: "2026-11-01", endDate: "2026-11-30" }, { id: "dec", startDate: "2026-12-01", endDate: "2026-12-31" }, { id: "jan", startDate: "2027-01-01", endDate: "2027-01-31" }]);
    select([{ periodId: "nov", week: 1, dueDate: "2026-11-06" }]);
    const kpiQuery = select([
      { target: { id: "n", periodId: "nov" }, actual: { status: "UNREPORTED", actual: "0", evaluation: "Keep", version: 2 } },
      { target: { id: "d", periodId: "dec" }, actual: null },
      { target: { id: "j", periodId: "jan" }, actual: null },
    ]);
    const weekQuery = select([{ periodId: "nov", status: "NOT_STARTED", dueDate: "2026-11-06" }]);
    const dayQuery = select([]); const gateQuery = select([]); const onboardingQuery = select([]);
    const result = await getOperations(actor, "dec");
    expect(result.period?.id).toBe("dec");
    expect(result.timelinePeriod?.id).toBe("nov");
    expect(result.programPeriod).toEqual({ startDate: "2026-11-02", endDate: "2027-01-31" });
    expect(result.kpis).toHaveLength(1); expect(result.allKpis).toHaveLength(3);
    expect(result.monthlyKpis[0].actual).toMatchObject({ actual: null, evaluation: "Keep", version: 2 });
    for (const query of [kpiQuery, weekQuery, dayQuery, gateQuery, onboardingQuery]) {
      const sql = new PgDialect().sqlToQuery(query.where.mock.calls[0][0]);
      expect(sql.sql.includes("assignee_id")).toBe(actor.role === "STAFF");
      if (actor.role === "STAFF") expect(sql.params).toContain("staff");
    }
  });

  it("defaults to November timeline rather than latest KPI month", async () => {
    select([{ id: "nov", startDate: "2026-11-01", endDate: "2026-11-30" }, { id: "jan", startDate: "2027-01-01", endDate: "2027-01-31" }]);
    select([{ periodId: "nov", week: 1, dueDate: "2026-11-06" }]);
    for (let index = 0; index < 5; index++) select([]);
    expect((await getOperations(admin)).period?.id).toBe("nov");
  });

  it("unassigns operational PIC without requiring Staff lookup", async () => {
    select([{ id: "gate", assigneeId: "staff" }]);
    const mutation = update([{ id: "gate", assigneeId: null }]);
    await assignOperation(admin, { entityType: "GATE", entityId: "gate", userId: null });
    expect(mock.select).toHaveBeenCalledTimes(1);
    expect(mutation.set.mock.calls[0][0]).toMatchObject({ assigneeId: null });
  });

  it("updates weekly alias and next action with optimistic concurrency and audit", async () => {
    select([{ id: "week", assigneeId: null, version: 3 }]);
    const mutation = update([{ id: "week", version: 4 }]);
    await updateWeek(admin, "week", { managerNote: "Review", nextAction: "Next", version: 3 });
    expect(mutation.set.mock.calls[0][0]).toMatchObject({ reviewNote: "Review", nextAction: "Next" });
    expect(mock.insert).toHaveBeenCalledWith(auditEvents);
  });

  it("rejects stale weekly version and compare-and-swap race", async () => {
    select([{ assigneeId: null, version: 2 }]);
    await expect(updateWeek(admin, "week", { version: 1, progress: 10 })).rejects.toMatchObject({ status: 409 });
    select([{ assigneeId: null, version: 2 }]); update([]);
    await expect(updateWeek(admin, "week", { version: 2, progress: 10 })).rejects.toMatchObject({ status: 409 });
  });

  it("denies Staff global writes and privileged review notes", async () => {
    select([{ assigneeId: null, version: 1 }]);
    await expect(updateWeek(staff, "week", { version: 1, progress: 5 })).rejects.toMatchObject({ status: 403 });
    select([{ assigneeId: "staff", version: 1 }]);
    await expect(updateWeek(staff, "week", { version: 1, reviewNote: null })).rejects.toMatchObject({ status: 403 });
    select([{ assigneeId: null }]);
    await expect(updateDay(staff, "day", { completed: true })).rejects.toMatchObject({ status: 403 });
    select([{ assigneeId: null }]);
    await expect(updateGate(staff, "gate", { status: "COMPLETED" })).rejects.toMatchObject({ status: 403 });
    select([{ assigneeId: null }]);
    await expect(updateKpi(staff, "target", { actual: 1 })).rejects.toMatchObject({ status: 403 });
  });

  it("patches daily notes without resetting progress and audits gate status", async () => {
    select([{ assigneeId: "staff", status: "IN_PROGRESS", progress: 60 }]);
    const day = update([{ id: "day" }]);
    await updateDay(staff, "day", { evidenceNote: "Evidence" });
    expect(day.set.mock.calls[0][0]).toMatchObject({ status: "IN_PROGRESS", progress: 60, evidenceNote: "Evidence" });
    select([{ assigneeId: null }]); const gate = update([{ status: "COMPLETED" }]);
    await updateGate(admin, "gate", { status: "COMPLETED" });
    expect(gate.set.mock.calls[0][0]).toMatchObject({ status: "COMPLETED" });
    expect(mock.insert).toHaveBeenCalledWith(auditEvents);
  });

  it("clears KPI actual while retaining omitted evaluation and version", async () => {
    select([{ assigneeId: null }]); select([{ id: "actual", version: 2, evaluation: "Keep" }]);
    const mutation = update([{ id: "actual", actual: "0", status: "UNREPORTED", evaluation: "Keep", version: 3 }]);
    const result = await updateKpi(admin, "target", { actual: null, version: 2 });
    expect(mutation.set.mock.calls[0][0]).not.toHaveProperty("evaluation");
    expect(result).toMatchObject({ actual: null, evaluation: "Keep", version: 3 });
  });

  it("requires version for existing KPI and rejects negative actual", async () => {
    select([{ assigneeId: null }]); select([{ id: "actual", version: 2 }]);
    await expect(updateKpi(admin, "target", { actual: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(updateKpi(admin, "target", { actual: -1 })).rejects.toMatchObject({ status: 400 });
  });

  it("limits assignment to Admin and active Staff with audit", async () => {
    await expect(assignOperation(staff, { entityType: "WEEKLY_PLAN", entityId: "week", userId: "staff" })).rejects.toMatchObject({ status: 403 });
    select([{ id: "week", assigneeId: null }]); const userQuery = select([{ id: "staff" }]); const mutation = update([{ id: "week", assigneeId: "staff" }]);
    await assignOperation(admin, { entityType: "WEEKLY_PLAN", entityId: "week", userId: "staff" });
    expect(new PgDialect().sqlToQuery(userQuery.where.mock.calls[0][0]).params).toEqual(["staff", "STAFF", "ACTIVE"]);
    expect(mutation.set.mock.calls[0][0]).toHaveProperty("version");
    expect(mock.insert).toHaveBeenCalledWith(auditEvents);
    select([{ id: "week", assigneeId: null }]); select([]);
    await expect(assignOperation(admin, { entityType: "WEEKLY_PLAN", entityId: "week", userId: "inactive" })).rejects.toMatchObject({ status: 400 });
  });
});
