import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class VersionConflict extends Error {
    current: unknown;

    constructor(message: string, current: unknown) {
      super(message);
      this.current = current;
    }
  }

  return {
    VersionConflict,
    requireUser: vi.fn(),
    getWorkspace: vi.fn(),
    initializeWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    changeCommercial: vi.fn(),
    listCosts: vi.fn(),
    createCost: vi.fn(),
    updateCost: vi.fn(),
    deleteCost: vi.fn(),
    updateStage: vi.fn(),
    uploadDocument: vi.fn(),
    linkDocument: vi.fn(),
    reviewDocument: vi.fn(),
    resetDocument: vi.fn(),
    submitPhase: vi.fn(),
    decidePhase: vi.fn(),
    reopenPhase: vi.fn(),
    listAssignments: vi.fn(),
    createAssignment: vi.fn(),
    setAssignments: vi.fn(),
    updateAssignment: vi.fn(),
    deactivateAssignment: vi.fn(),
  };
});

vi.mock("@/lib/server/authz", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: { name?: string; message?: string; status?: number }) => Response.json(
    { error: error.message ?? "Request failed" },
    { status: error.status ?? (error.name === "ZodError" || error.name === "SyntaxError" ? 400 : 500) },
  ),
}));

vi.mock("@/lib/server/project-workspace", () => ({
  ProjectWorkspaceVersionConflict: mocks.VersionConflict,
  PROJECT_COST_CATEGORIES: ["MATERIAL", "LABOR", "VENDOR", "OPERATIONAL"],
  PROJECT_WORKSPACE_ROLES: ["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER", "PRODUCTION_TEAM", "FINANCE_ADMIN", "INSTALLATION_SUPPORT"],
  getProjectWorkspace: mocks.getWorkspace,
  initializeProjectWorkspace: mocks.initializeWorkspace,
  updateProjectWorkspace: mocks.updateWorkspace,
  changeProjectCommercialStatus: mocks.changeCommercial,
  listProjectCostItems: mocks.listCosts,
  createProjectCostItem: mocks.createCost,
  updateProjectCostItem: mocks.updateCost,
  deleteProjectCostItem: mocks.deleteCost,
  updateProjectStage: mocks.updateStage,
  uploadProjectDocumentRequirement: mocks.uploadDocument,
  linkProjectDocumentEvidence: mocks.linkDocument,
  reviewProjectDocumentRequirement: mocks.reviewDocument,
  resetProjectDocumentRequirement: mocks.resetDocument,
  submitProjectPhase: mocks.submitPhase,
  decideProjectPhase: mocks.decidePhase,
  reopenProjectPhase: mocks.reopenPhase,
  listProjectWorkspaceAssignments: mocks.listAssignments,
  createProjectWorkspaceAssignment: mocks.createAssignment,
  setProjectWorkspaceRoleAssignments: mocks.setAssignments,
  updateProjectWorkspaceAssignment: mocks.updateAssignment,
  deactivateProjectWorkspaceAssignment: mocks.deactivateAssignment,
}));

const workspaceRoute = await import("../../src/app/api/projects/[id]/workspace/route");
const costCollectionRoute = await import("../../src/app/api/projects/[id]/cost-items/route");
const costItemRoute = await import("../../src/app/api/projects/[id]/cost-items/[itemId]/route");
const stageRoute = await import("../../src/app/api/projects/[id]/stages/[stageId]/route");
const documentAttachmentRoute = await import("../../src/app/api/projects/[id]/documents/[requirementId]/attachment/route");
const documentLinkRoute = await import("../../src/app/api/projects/[id]/documents/[requirementId]/link/route");
const documentReviewRoute = await import("../../src/app/api/projects/[id]/documents/[requirementId]/review/route");
const documentResetRoute = await import("../../src/app/api/projects/[id]/documents/[requirementId]/reset/route");
const phaseSubmitRoute = await import("../../src/app/api/projects/[id]/phases/[phaseId]/submit/route");
const phaseDecisionRoute = await import("../../src/app/api/projects/[id]/phases/[phaseId]/decision/route");
const phaseReopenRoute = await import("../../src/app/api/projects/[id]/phases/[phaseId]/reopen/route");
const assignmentCollectionRoute = await import("../../src/app/api/projects/[id]/workspace/assignments/route");
const assignmentItemRoute = await import("../../src/app/api/projects/[id]/workspace/assignments/[assignmentId]/route");

const projectId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const stageId = "33333333-3333-4333-8333-333333333333";
const requirementId = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555";
const userId = "66666666-6666-4666-8666-666666666666";
const assignmentId = "77777777-7777-4777-8777-777777777777";
const phaseId = "88888888-8888-4888-8888-888888888888";
const actor = { id: "admin", role: "ADMIN" as const };
const context = <T extends Record<string, string>>(params: T): { params: Promise<T> } => ({ params: Promise.resolve(params) });
const request = (method: string, body: unknown) => new Request("http://localhost/api", {
  method,
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

describe("project workspace API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(actor);
    mocks.getWorkspace.mockResolvedValue({ project: { id: projectId }, workspace: { version: 1 } });
    mocks.initializeWorkspace.mockResolvedValue({ id: projectId });
    mocks.updateWorkspace.mockResolvedValue({ version: 2 });
    mocks.changeCommercial.mockResolvedValue({ version: 2, commercialStatus: "SUBMITTED" });
    mocks.listCosts.mockResolvedValue([]);
    mocks.createCost.mockResolvedValue({ id: itemId });
    mocks.updateCost.mockResolvedValue({ id: itemId, version: 2 });
    mocks.deleteCost.mockResolvedValue({ deleted: true });
    mocks.updateStage.mockResolvedValue({ id: stageId, version: 2 });
    mocks.uploadDocument.mockResolvedValue({ id: requirementId, version: 2 });
    mocks.linkDocument.mockResolvedValue({ id: requirementId, version: 2 });
    mocks.reviewDocument.mockResolvedValue({ id: requirementId, version: 2 });
    mocks.resetDocument.mockResolvedValue({ id: requirementId, version: 3 });
    mocks.submitPhase.mockResolvedValue({ phase: { id: phaseId, status: "APPROVAL_PENDING" } });
    mocks.decidePhase.mockResolvedValue({ phase: { id: phaseId, status: "PASSED" } });
    mocks.reopenPhase.mockResolvedValue({ id: phaseId, status: "REOPENED" });
    mocks.listAssignments.mockResolvedValue([]);
    mocks.createAssignment.mockResolvedValue({ id: assignmentId });
    mocks.setAssignments.mockResolvedValue([]);
    mocks.updateAssignment.mockResolvedValue({ id: assignmentId });
    mocks.deactivateAssignment.mockResolvedValue({ id: assignmentId, active: false });
  });

  it("validates and delegates workspace reads and initialization", async () => {
    expect((await workspaceRoute.GET(new Request("http://localhost"), context({ id: projectId }))).status).toBe(200);
    expect(mocks.getWorkspace).toHaveBeenCalledWith(actor, projectId);

    expect((await workspaceRoute.POST(new Request("http://localhost", { method: "POST" }), context({ id: projectId }))).status).toBe(201);
    expect(mocks.requireUser).toHaveBeenLastCalledWith(["ADMIN"]);
    expect(mocks.initializeWorkspace).toHaveBeenCalledWith(actor, projectId);
  });

  it("accepts workspace decimal boundaries and rejects malformed patches", async () => {
    const valid = {
      version: 1,
      contractValue: "99999999999999999.99",
      targetMarginPct: "100.0000",
      retentionPct: "0",
      dealDate: null,
      currency: "IDR",
    };
    expect((await workspaceRoute.PATCH(request("PATCH", valid), context({ id: projectId }))).status).toBe(200);
    expect(mocks.updateWorkspace).toHaveBeenCalledWith(actor, projectId, valid);

    for (const input of [
      { version: 1 },
      { version: 1, targetMarginPct: "100.0001" },
      { version: 1, retentionPct: "1.00000" },
      { version: 1, contractValue: -1 },
      { version: 1, currency: "idr" },
      { version: 1, clientName: "Client", unknown: true },
    ]) {
      expect((await workspaceRoute.PATCH(request("PATCH", input), context({ id: projectId }))).status).toBe(400);
    }
    expect(mocks.updateWorkspace).toHaveBeenCalledTimes(1);
  });

  it("returns version conflicts with current server state", async () => {
    mocks.updateWorkspace.mockRejectedValue(new mocks.VersionConflict("Workspace version conflict", { version: 7 }));

    const response = await workspaceRoute.PATCH(
      request("PATCH", { version: 6, clientName: "Updated" }),
      context({ id: projectId }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Workspace version conflict", current: { version: 7 } });
  });

  it("uses explicit commercial actions and rejects arbitrary status patches", async () => {
    expect((await workspaceRoute.PATCH(
      request("PATCH", { version: 1, commercialAction: "SUBMIT", note: "Ready" }),
      context({ id: projectId }),
    )).status).toBe(200);
    expect(mocks.changeCommercial).toHaveBeenCalledWith(actor, projectId, { action: "SUBMIT", version: 1, note: "Ready" });

    expect((await workspaceRoute.PATCH(
      request("PATCH", { version: 1, commercialStatus: "LOCKED" }),
      context({ id: projectId }),
    )).status).toBe(400);
    expect(mocks.updateWorkspace).not.toHaveBeenCalledWith(actor, projectId, expect.objectContaining({ commercialStatus: "LOCKED" }));
  });

  it("validates cost creation including null and reported-zero actuals", async () => {
    const base = { category: "MATERIAL", description: "Panel", quantity: "0.0001", unit: "pcs", unitPrice: "0" };
    expect((await costCollectionRoute.POST(request("POST", { ...base, actualAmount: null }), context({ id: projectId }))).status).toBe(201);
    expect((await costCollectionRoute.POST(request("POST", { ...base, actualAmount: "0" }), context({ id: projectId }))).status).toBe(201);

    for (const input of [
      { ...base, quantity: "0" },
      { ...base, quantity: "1.00001" },
      { ...base, unitPrice: "1.001" },
      { ...base, actualAmount: 0 },
      { ...base, category: "OTHER" },
      { ...base, description: " " },
    ]) {
      expect((await costCollectionRoute.POST(request("POST", input), context({ id: projectId }))).status).toBe(400);
    }
    expect(mocks.createCost).toHaveBeenCalledTimes(2);
    expect(mocks.createCost.mock.calls.map((call) => call[2].actualAmount)).toEqual([null, "0"]);
  });

  it("validates cost updates and deletes with optimistic versions", async () => {
    expect((await costItemRoute.PATCH(
      request("PATCH", { version: 1, actualAmount: null }),
      context({ id: projectId, itemId }),
    )).status).toBe(200);
    expect(mocks.updateCost).toHaveBeenCalledWith(actor, projectId, itemId, { version: 1, actualAmount: null });

    expect((await costItemRoute.PATCH(
      request("PATCH", { version: 1 }),
      context({ id: projectId, itemId }),
    )).status).toBe(400);
    expect((await costItemRoute.DELETE(
      request("DELETE", { version: 0 }),
      context({ id: projectId, itemId }),
    )).status).toBe(400);
    expect((await costItemRoute.DELETE(
      request("DELETE", { version: 2 }),
      context({ id: projectId, itemId }),
    )).status).toBe(200);
    expect(mocks.deleteCost).toHaveBeenCalledWith(actor, projectId, itemId, 2, undefined);
  });

  it("constrains stage progress and requires a real stage change", async () => {
    expect((await stageRoute.PATCH(
      request("PATCH", { version: 1, progress: 0, assigneeId: null }),
      context({ id: projectId, stageId }),
    )).status).toBe(200);
    expect(mocks.updateStage).toHaveBeenCalledWith(actor, projectId, stageId, { version: 1, progress: 0, assigneeId: null });

    for (const input of [
      { version: 1, progress: -1 },
      { version: 1, progress: 101 },
      { version: 1, progress: 50.5 },
      { version: 1, overrideReason: "No stage field" },
      { version: 1, status: "DONE" },
    ]) {
      expect((await stageRoute.PATCH(request("PATCH", input), context({ id: projectId, stageId }))).status).toBe(400);
    }
    expect(mocks.updateStage).toHaveBeenCalledTimes(1);
  });

  it("validates document evidence links and review decisions", async () => {
    expect((await documentLinkRoute.POST(
      request("POST", { evidenceId, version: 1 }),
      context({ id: projectId, requirementId }),
    )).status).toBe(200);
    expect(mocks.linkDocument).toHaveBeenCalledWith(actor, projectId, requirementId, { evidenceId, version: 1 });

    expect((await documentReviewRoute.POST(
      request("POST", { status: "REJECTED", version: 2, note: "Wrong document" }),
      context({ id: projectId, requirementId }),
    )).status).toBe(200);
    expect(mocks.reviewDocument).toHaveBeenCalledWith(actor, projectId, requirementId, { status: "REJECTED", version: 2, note: "Wrong document" });

    for (const input of [
      { evidenceId: "bad", version: 1 },
      { evidenceId, version: 0 },
      { evidenceId, version: 1, extra: true },
    ]) {
      expect((await documentLinkRoute.POST(request("POST", input), context({ id: projectId, requirementId }))).status).toBe(400);
    }
    for (const input of [
      { status: "UPLOADED", version: 1 },
      { status: "ACCEPTED", version: 0 },
      { status: "REJECTED", version: 1, note: null },
      { status: "WAIVED", version: 1, note: "x".repeat(2001) },
    ]) {
      expect((await documentReviewRoute.POST(request("POST", input), context({ id: projectId, requirementId }))).status).toBe(400);
    }
    expect(mocks.linkDocument).toHaveBeenCalledTimes(1);
    expect(mocks.reviewDocument).toHaveBeenCalledTimes(1);
  });

  it("validates document reset and phase lifecycle actions", async () => {
    expect((await documentResetRoute.POST(
      request("POST", { version: 2, reason: "Replace accepted evidence" }),
      context({ id: projectId, requirementId }),
    )).status).toBe(200);
    expect(mocks.requireUser).toHaveBeenLastCalledWith(["ADMIN"]);
    expect(mocks.resetDocument).toHaveBeenCalledWith(actor, projectId, requirementId, { version: 2, reason: "Replace accepted evidence" });

    expect((await phaseSubmitRoute.POST(request("POST", { version: 3 }), context({ id: projectId, phaseId }))).status).toBe(200);
    expect(mocks.submitPhase).toHaveBeenCalledWith(actor, projectId, phaseId, 3);

    expect((await phaseDecisionRoute.POST(
      request("POST", { decision: "APPROVED", version: 4 }),
      context({ id: projectId, phaseId }),
    )).status).toBe(200);
    expect(mocks.requireUser).toHaveBeenLastCalledWith(["ADMIN"]);
    expect(mocks.decidePhase).toHaveBeenCalledWith(actor, projectId, phaseId, { decision: "APPROVED", version: 4 });

    expect((await phaseReopenRoute.POST(
      request("POST", { version: 5, reason: "Evidence invalidated" }),
      context({ id: projectId, phaseId }),
    )).status).toBe(200);
    expect(mocks.reopenPhase).toHaveBeenCalledWith(actor, projectId, phaseId, { version: 5, reason: "Evidence invalidated" });

    expect((await phaseDecisionRoute.POST(
      request("POST", { decision: "REJECTED", version: 4, note: null }),
      context({ id: projectId, phaseId }),
    )).status).toBe(400);
    expect((await phaseReopenRoute.POST(
      request("POST", { version: 5, reason: " " }),
      context({ id: projectId, phaseId }),
    )).status).toBe(400);
  });

  it("validates document uploads, coerces form versions, and enforces request size", async () => {
    const form = new FormData();
    const file = new File(["evidence"], "evidence.pdf", { type: "application/pdf" });
    form.set("file", file);
    form.set("version", "3");

    expect((await documentAttachmentRoute.POST(
      new Request("http://localhost/api", { method: "POST", body: form }),
      context({ id: projectId, requirementId }),
    )).status).toBe(201);
    expect(mocks.uploadDocument).toHaveBeenCalledWith(actor, projectId, requirementId, 3, expect.any(File));

    const missingFile = new FormData();
    missingFile.set("version", "1");
    expect((await documentAttachmentRoute.POST(
      new Request("http://localhost/api", { method: "POST", body: missingFile }),
      context({ id: projectId, requirementId }),
    )).status).toBe(400);

    const oversized = await documentAttachmentRoute.POST(
      new Request("http://localhost/api", { method: "POST", headers: { "content-length": String(12 * 1024 * 1024 + 1) } }),
      context({ id: projectId, requirementId }),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.uploadDocument).toHaveBeenCalledTimes(1);
  });

  it("requires admin assignment management and validates workspace roles", async () => {
    expect((await assignmentCollectionRoute.GET(
      new Request(`http://localhost/api?includeInactive=true`),
      context({ id: projectId }),
    )).status).toBe(200);
    expect(mocks.requireUser).toHaveBeenLastCalledWith(["ADMIN"]);
    expect(mocks.listAssignments).toHaveBeenCalledWith(actor, projectId, false);

    const assignment = { userId, role: "PROJECT_LEADER", version: 4 };
    expect((await assignmentCollectionRoute.POST(
      request("POST", assignment),
      context({ id: projectId }),
    )).status).toBe(201);
    expect(mocks.createAssignment).toHaveBeenCalledWith(actor, projectId, assignment);

    expect((await assignmentCollectionRoute.PUT(
      request("PUT", { role: "DESIGNER", userIds: [userId], version: 4 }),
      context({ id: projectId }),
    )).status).toBe(200);
    expect(mocks.setAssignments).toHaveBeenCalledWith(actor, projectId, { role: "DESIGNER", userIds: [userId], version: 4 });

    expect((await assignmentItemRoute.PATCH(
      request("PATCH", { userId, role: "PIC", version: 4 }),
      context({ id: projectId, assignmentId }),
    )).status).toBe(200);
    expect(mocks.updateAssignment).toHaveBeenCalledWith(actor, projectId, assignmentId, { userId, role: "PIC", version: 4 });

    expect((await assignmentItemRoute.DELETE(
      request("DELETE", { version: 4 }),
      context({ id: projectId, assignmentId }),
    )).status).toBe(200);
    expect(mocks.deactivateAssignment).toHaveBeenCalledWith(actor, projectId, assignmentId, 4);
  });

  it("returns conflict for stale workspace assignment mutations", async () => {
    const conflict = () => new mocks.VersionConflict("Workspace data changed; reload before saving", { version: 5 });
    mocks.createAssignment.mockRejectedValueOnce(conflict());
    mocks.setAssignments.mockRejectedValueOnce(conflict());
    mocks.updateAssignment.mockRejectedValueOnce(conflict());
    mocks.deactivateAssignment.mockRejectedValueOnce(conflict());

    const responses = await Promise.all([
      assignmentCollectionRoute.POST(request("POST", { userId, role: "DESIGNER", version: 4 }), context({ id: projectId })),
      assignmentCollectionRoute.PUT(request("PUT", { role: "DESIGNER", userIds: [userId], version: 4 }), context({ id: projectId })),
      assignmentItemRoute.PATCH(request("PATCH", { userId, role: "PIC", version: 4 }), context({ id: projectId, assignmentId })),
      assignmentItemRoute.DELETE(request("DELETE", { version: 4 }), context({ id: projectId, assignmentId })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Workspace data changed; reload before saving", current: { version: 5 } });
    }
  });

  it("rejects malformed workspace assignment payloads", async () => {
    for (const input of [
      { userId: "bad", role: "PIC", version: 1 },
      { userId, role: "OWNER", version: 1 },
      { userId, role: "PIC", version: 1, active: true },
      { userId, role: "PIC" },
    ]) {
      expect((await assignmentCollectionRoute.POST(request("POST", input), context({ id: projectId }))).status).toBe(400);
    }

    const tooManyUsers = Array.from({ length: 101 }, (_, index) => `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`);
    for (const input of [
      { role: "OWNER", userIds: [], version: 1 },
      { role: "PIC", userIds: ["bad"], version: 1 },
      { role: "PIC", userIds: tooManyUsers, version: 1 },
      { role: "PIC", userIds: [] },
    ]) {
      expect((await assignmentCollectionRoute.PUT(request("PUT", input), context({ id: projectId }))).status).toBe(400);
    }
    expect(mocks.createAssignment).not.toHaveBeenCalled();
    expect(mocks.setAssignments).not.toHaveBeenCalled();

    expect((await assignmentItemRoute.PATCH(request("PATCH", { userId, role: "PIC" }), context({ id: projectId, assignmentId }))).status).toBe(400);
    expect((await assignmentItemRoute.DELETE(request("DELETE", {}), context({ id: projectId, assignmentId }))).status).toBe(400);
    expect(mocks.updateAssignment).not.toHaveBeenCalled();
    expect(mocks.deactivateAssignment).not.toHaveBeenCalled();
  });
});
