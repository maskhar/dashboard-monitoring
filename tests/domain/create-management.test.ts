import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/authz", () => ({ apiError: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/server/operations", () => ({ createOperation: vi.fn(), getOperations: vi.fn() }));
vi.mock("@/lib/server/projects", () => ({ createProject: vi.fn(), listProjects: vi.fn() }));

const { createOperationSchema } = await import("../../src/app/api/operations/route");
const { createProjectSchema } = await import("../../src/app/api/projects/route");

const periodId = "11111111-1111-4111-8111-111111111111";
const assigneeId = "22222222-2222-4222-8222-222222222222";

describe("admin create validation", () => {
  it("accepts complete project input and codes longer than three digits", () => {
    expect(createProjectSchema.parse({
      code: "DP-1000", brand: "Brand", program: "Program", category: "Category",
      startDate: "2026-11-01", dueDate: "2026-11-30", notes: "Notes",
      status: "IN_PROGRESS", progress: 20, assigneeId,
    })).toMatchObject({ code: "DP-1000", progress: 20, assigneeId });
  });

  it("rejects incomplete projects and malformed dates, codes, or assignees", () => {
    for (const input of [
      { code: "DP-12", brand: "Brand", program: "P", category: "C", startDate: "2026-11-01", dueDate: "2026-11-30" },
      { code: "DP-100", brand: "Brand", program: "P", category: "C", startDate: "01-11-2026", dueDate: "2026-11-30" },
      { code: "DP-100", brand: "Brand", program: "P", category: "C", startDate: "2026-11-01", dueDate: "2026-11-30", assigneeId: "staff" },
    ]) expect(createProjectSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { type: "WEEKLY_PLAN", periodId, week: 1, focus: "Focus", deliverable: "Output", dueDate: "2026-11-07", assigneeId },
    { type: "DAILY_MILESTONE", periodId, day: 1, title: "Day one", deliverable: "Output" },
    { type: "GATE", periodId, title: "Gate one" },
    { type: "KPI_TARGET", periodId, code: "KPI-1", name: "KPI", unit: "COUNT", target: 10, assigneeId },
  ])("accepts $type operation payload", (input) => {
    expect(createOperationSchema.safeParse(input).success).toBe(true);
  });

  it("rejects invalid discriminators and entity-specific values", () => {
    for (const input of [
      { type: "UNKNOWN", periodId },
      { type: "WEEKLY_PLAN", periodId, week: 0, focus: "Focus", deliverable: "Output" },
      { type: "DAILY_MILESTONE", periodId, day: 1, title: "", deliverable: "Output" },
      { type: "GATE", periodId: "period", title: "Gate" },
      { type: "KPI_TARGET", periodId, code: "KPI-1", name: "KPI", unit: "COUNT", target: -1 },
    ]) expect(createOperationSchema.safeParse(input).success).toBe(false);
  });
});

