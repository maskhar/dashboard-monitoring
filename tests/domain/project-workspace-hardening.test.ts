import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  approvalActions: {}, approvals: {}, auditEvents: {}, evidence: {}, notificationJobs: {}, projectAssignments: {}, projectCostItems: {},
  projectDocumentRequirements: {}, projectPhaseInstances: {}, projects: {}, projectStageInstances: {}, projectWorkspaces: {}, users: {},
}));
vi.mock("@/lib/project-workspace-metrics", () => ({ calculateProjectWorkspaceMetrics: vi.fn(), percentageSumIsBelowHundred: vi.fn() }));
vi.mock("@/lib/server/access", () => ({ canAccessEntity: vi.fn() }));
vi.mock("@/lib/server/evidence", () => ({ prepareEvidenceUpload: vi.fn() }));
vi.mock("@/lib/server/authz", () => ({
  HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("../../src/lib/server/access", () => ({ canAccessEntity: vi.fn() }));
vi.mock("../../src/lib/server/evidence", () => ({ prepareEvidenceUpload: vi.fn() }));
vi.mock("../../src/lib/server/authz", () => ({
  HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } },
}));

const {
  assertProjectCostMutationAllowed,
  assertProjectMutationAllowed,
  assertProjectWorkspaceVersion,
  canUploadProjectPhaseDocument,
  canViewProjectWorkspaceFinancials,
  presentProjectWorkspaceFinancials,
  projectCommercialTransition,
} = await import("../../src/lib/server/project-workspace");

const admin = { id: "admin", role: "ADMIN" as const };
const staff = { id: "staff", role: "STAFF" as const };

describe("project workspace hardening policies", () => {
  it("limits financial visibility to core commercial roles", () => {
    expect(canViewProjectWorkspaceFinancials(admin, [])).toBe(true);
    expect(canViewProjectWorkspaceFinancials(staff, ["PIC"])).toBe(true);
    expect(canViewProjectWorkspaceFinancials(staff, ["PROJECT_LEADER"])).toBe(true);
    expect(canViewProjectWorkspaceFinancials(staff, ["FINANCE_ADMIN"])).toBe(true);
    expect(canViewProjectWorkspaceFinancials(staff, ["DESIGNER"])).toBe(false);

    const redacted = presentProjectWorkspaceFinancials(staff, ["DESIGNER"], {
      version: 2,
      contractValue: "1000000.00",
      currency: "IDR",
      targetMarginPct: "25.0000",
      retentionPct: "5.0000",
      overheadPct: "2.0000",
      contingencyPct: "1.0000",
      vatEnabled: true,
      vatPct: "11.0000",
      withholdingEnabled: true,
      withholdingPct: "2.0000",
    }, { plannedHpp: "500000.00", plannedMargin: "420000.00" }, [{ id: "cost" }]);
    expect(redacted.workspace).toMatchObject({ contractValue: null, currency: null, targetMarginPct: null, vatEnabled: false });
    expect(redacted.financialMetrics).toEqual({});
    expect(redacted.costItems).toEqual([]);
  });

  it("enforces archived and commercial lock mutation rules", () => {
    expect(() => assertProjectMutationAllowed({ archivedAt: new Date() })).toThrowError(expect.objectContaining({ status: 409 }));
    expect(() => assertProjectMutationAllowed({ archivedAt: null })).not.toThrow();
    expect(() => assertProjectCostMutationAllowed({ commercialStatus: "DRAFT" }, staff)).not.toThrow();
    expect(() => assertProjectCostMutationAllowed({ commercialStatus: "LOCKED" }, staff)).toThrowError(expect.objectContaining({ status: 409 }));
    expect(() => assertProjectCostMutationAllowed({ commercialStatus: "LOCKED" }, admin, "Emergency correction")).not.toThrow();
  });

  it("rejects stale workspace mutation versions with current state", () => {
    const current = { version: 8 };
    expect(() => assertProjectWorkspaceVersion(current, 7)).toThrowError(expect.objectContaining({ status: 409, current }));
    expect(() => assertProjectWorkspaceVersion(current, 8)).not.toThrow();
  });

  it("allows only strict commercial transitions", () => {
    expect(projectCommercialTransition("DRAFT", "SUBMIT", false)).toBe("SUBMITTED");
    expect(projectCommercialTransition("SUBMITTED", "APPROVE", true)).toBe("APPROVED");
    expect(projectCommercialTransition("APPROVED", "LOCK", true)).toBe("LOCKED");
    expect(() => projectCommercialTransition("DRAFT", "LOCK", true)).toThrowError(expect.objectContaining({ status: 409 }));
    expect(() => projectCommercialTransition("SUBMITTED", "APPROVE", false)).toThrowError(expect.objectContaining({ status: 409 }));
  });

  it("restricts document uploads by phase role", () => {
    expect(canUploadProjectPhaseDocument(admin, [], 6)).toBe(true);
    expect(canUploadProjectPhaseDocument(staff, ["DESIGNER"], 1)).toBe(true);
    expect(canUploadProjectPhaseDocument(staff, ["DESIGNER"], 6)).toBe(false);
    expect(canUploadProjectPhaseDocument(staff, ["FINANCE_ADMIN"], 2)).toBe(true);
    expect(canUploadProjectPhaseDocument(staff, ["PRODUCTION_TEAM"], 4)).toBe(false);
  });
});
