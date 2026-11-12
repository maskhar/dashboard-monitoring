import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/db/schema", async () => await import("../../src/db/schema"));
function authzMock() { return {
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  requireUser: mock.requireUser,
  apiError: (error: { name?: string; status?: number; message: string }) => Response.json(
    { error: error.message },
    { status: error.status ?? (error.name === "ZodError" || error.name === "SyntaxError" ? 400 : 500) },
  ),
}; }
vi.mock("@/lib/server/authz", authzMock);
vi.mock("../../src/lib/server/authz", authzMock);
vi.mock("@/lib/server/approvals", async () => await import("../../src/lib/server/approvals"));

import { approvals, projectAssignments, projectPhaseInstances } from "../../src/db/schema";
import { decideApproval } from "../../src/lib/server/approvals";

const approvalRoute = await import("../../src/app/api/approvals/[id]/route");

function chain(rows: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "where", "limit", "for", "set", "values", "returning", "onConflictDoNothing"]) query[method] = vi.fn(() => query);
  query.then = vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)));
  return query;
}

function select(rows: unknown[]) {
  const query = chain(rows);
  mock.select.mockReturnValueOnce(query);
  return query;
}

function update(rows: unknown[]) {
  const query = chain(rows);
  mock.update.mockReturnValueOnce(query);
  return query;
}

const tx = { select: mock.select, update: mock.update, insert: mock.insert };
const actor = { id: "11111111-1111-4111-8111-111111111111", role: "ADMIN" as const };
const approvalId = "22222222-2222-4222-8222-222222222222";
const phaseId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  mock.transaction.mockImplementation((callback) => callback(tx));
  mock.insert.mockImplementation(() => chain([]));
  mock.requireUser.mockResolvedValue(actor);
});

describe("generic approval decision hardening", () => {
  it("rejects project phase decisions before mutating approval or phase state", async () => {
    select([{
      id: approvalId,
      entityType: "PROJECT_PHASE",
      entityId: phaseId,
      approvalType: "PROJECT_GATE_APPROVAL",
      status: "PENDING",
      requestedBy: actor.id,
      submittedSnapshot: { projectId: "44444444-4444-4444-8444-444444444444" },
      baseVersion: 2,
    }]);

    await expect(decideApproval(actor.id, approvalId, "APPROVED")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("/api/projects/{projectId}/phases/{phaseId}/decision"),
    });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("returns safe guidance from the generic HTTP endpoint", async () => {
    select([{
      id: approvalId,
      entityType: "PROJECT_PHASE",
      entityId: phaseId,
      approvalType: "PROJECT_GATE_APPROVAL",
      status: "PENDING",
      requestedBy: actor.id,
      submittedSnapshot: {},
      baseVersion: 2,
    }]);
    const response = await approvalRoute.POST(
      new Request("http://localhost/api/approvals/id", { method: "POST", body: JSON.stringify({ decision: "APPROVED" }) }),
      { params: Promise.resolve({ id: approvalId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: expect.stringContaining("/api/projects/{projectId}/phases/{phaseId}/decision") });
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("keeps supported weekly approvals atomic and trims decision notes", async () => {
    select([{
      id: approvalId,
      entityType: "WEEKLY_PLAN",
      entityId: "55555555-5555-4555-8555-555555555555",
      approvalType: "WEEKLY_REVIEW",
      status: "PENDING",
      requestedBy: actor.id,
      submittedSnapshot: { progress: 80, status: "IN_REVIEW", reviewNote: "Ready", nextAction: null },
      baseVersion: 4,
    }]);
    select([{ id: "55555555-5555-4555-8555-555555555555", version: 4 }]);
    update([]);
    const approvalUpdate = update([{ id: approvalId, status: "APPROVED", decisionNote: "Reviewed" }]);

    await expect(decideApproval(actor.id, approvalId, "APPROVED", "  Reviewed  ")).resolves.toMatchObject({ status: "APPROVED" });
    expect(mock.update).toHaveBeenCalledTimes(2);
    expect(approvalUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED", decisionNote: "Reviewed" }));
    expect(mock.insert).toHaveBeenCalledTimes(3);
  });

  it("rejects unknown HTTP fields before opening a transaction", async () => {
    const response = await approvalRoute.POST(
      new Request("http://localhost/api/approvals/id", { method: "POST", body: JSON.stringify({ decision: "APPROVED", unexpected: true }) }),
      { params: Promise.resolve({ id: approvalId }) },
    );

    expect(response.status).toBe(400);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

describe("approval and assignment schema hardening", () => {
  it("declares singleton-role and lifecycle constraints", () => {
    const config = getTableConfig(projectAssignments);
    expect(config.indexes.map((index) => index.config.name)).toContain("project_active_singleton_role_uq");
    expect(config.checks.map((constraint) => constraint.name)).toContain("project_assignment_lifecycle");
  });

  it("declares phase and approval coherence constraints", () => {
    expect(getTableConfig(projectPhaseInstances).checks.map((constraint) => constraint.name)).toEqual(expect.arrayContaining([
      "project_phase_decision_owner_role",
      "project_phase_pass_metadata_pair",
      "project_phase_pass_status_coherence",
    ]));
    expect(getTableConfig(approvals).checks.map((constraint) => constraint.name)).toEqual(expect.arrayContaining([
      "approvals_base_version_positive",
      "approvals_project_phase_type_coherence",
      "approvals_decision_coherence",
    ]));
  });

  it("keeps migration 0011 forward-only and data preserving", () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0011_many_sister_grimm.sql"), "utf8");
    expect(migration).toContain("CREATE UNIQUE INDEX \"project_active_singleton_role_uq\"");
    expect(migration).toContain("ADD CONSTRAINT \"approvals_decision_coherence\"");
    expect(migration).not.toMatch(/\b(?:delete|drop|truncate|update)\b/i);
  });
});
