import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  auditEvents: {}, dataJobs: {}, projectAssignments: {}, projectCostItems: {}, projectDocumentRequirements: {},
  projectPhaseInstances: {}, projects: {}, projectStageInstances: {}, projectWorkspaceImports: {}, projectWorkspaces: {}, users: {},
}));
vi.mock("@/lib/server/authz", () => ({ HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("../../src/lib/server/authz", () => ({ HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } } }));

const { assertLegacyImportTargetFresh, buildLegacyProjectPlan, legacyImportPublicErrorMessage, parseLegacyWorkspaceExport } = await import("../../src/lib/server/legacy-workspace-import");

function source(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    legacyOne: {
      nama: "Booth Legacy",
      klien: "Klien A",
      lokasi: "Jakarta",
      jenis: "Booth",
      tanggalDeal: "2026-10-01",
      nilaiKontrak: "26000000",
      targetMargin: 25,
      retensiPct: 5,
      overheadPct: 2,
      kontinjensiPct: 1,
      ppnOn: true,
      ppnPct: 11,
      pphOn: false,
      pphPct: 2,
      items: [{ kat: "Finishing", uraian: "Cat", vol: "2", sat: "kaleng", harga: "100000", realisasi: 0 }],
      team: { pic: "Siti", keuangan: "Adza" },
      stages: [{ mulai: "2026-10-02", selesai: "2026-10-03", status: "Selesai", pic: "Siti" }],
      docs: { penawaran: true },
      catatan: "Migrasi",
      ...overrides,
    },
  }));
}

describe("legacy project workspace import", () => {
  it("parses utero.projects objects and produces stable normalized values", () => {
    const parsed = parseLegacyWorkspaceExport(source());
    expect(parsed.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].project).toMatchObject({ nilaiKontrak: "26000000.00", targetMargin: "25.0000" });
  });

  it("keeps zero actual unreported and completed stages in review", () => {
    const project = parseLegacyWorkspaceExport(source()).projects[0].project;
    const plan = buildLegacyProjectPlan("legacyOne", project, { Siti: "11111111-1111-4111-8111-111111111111", Adza: "22222222-2222-4222-8222-222222222222" });
    expect(plan.costItems[0]).toMatchObject({ actualAmount: null, quantity: "2.0000", unitPrice: "100000.00" });
    expect(plan.stages[0]).toMatchObject({ status: "IN_REVIEW", progress: 100, actualEnd: null });
    expect(plan.documents.find((document) => document.code === "penawaran")?.status).toBe("LEGACY_CONFIRMED");
    expect(plan.phases.every((phase) => phase.status !== "PASSED")).toBe(true);
  });

  it("rejects PIC and Finance Admin resolving to one user", () => {
    const project = parseLegacyWorkspaceExport(source({ team: { pic: "Siti", keuangan: "Siti" } })).projects[0].project;
    expect(() => buildLegacyProjectPlan("legacyOne", project, { Siti: "11111111-1111-4111-8111-111111111111" })).toThrow(/PIC and FINANCE_ADMIN/);
  });

  it("rejects stale project versions and any non-idempotent workspace overwrite", () => {
    expect(() => assertLegacyImportTargetFresh({ currentProjectVersion: 3, expectedProjectVersion: 2, currentWorkspaceVersion: null, expectedWorkspaceVersion: null })).toThrow(/changed after preview/);
    expect(() => assertLegacyImportTargetFresh({ currentProjectVersion: 3, expectedProjectVersion: 3, currentWorkspaceVersion: 1, expectedWorkspaceVersion: 1 })).toThrow(/workspace changed/);
    expect(() => assertLegacyImportTargetFresh({ currentProjectVersion: 3, expectedProjectVersion: 3, currentWorkspaceVersion: null, expectedWorkspaceVersion: null })).not.toThrow();
  });

  it("keeps expected HTTP errors but sanitizes internal failures", () => {
    expect(legacyImportPublicErrorMessage(new Error("duplicate key value violates unique constraint projects_code_key"))).toBe("Import failed");
    try {
      assertLegacyImportTargetFresh({ currentProjectVersion: 2, expectedProjectVersion: 1, currentWorkspaceVersion: null, expectedWorkspaceVersion: null });
      throw new Error("Expected freshness check to fail");
    } catch (error) {
      expect(legacyImportPublicErrorMessage(error)).toBe("Target project changed after preview; run preview again");
    }
  });
});
