import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listProjects: vi.fn() }));
vi.mock("../../src/lib/server/projects", () => ({ listProjects: mocks.listProjects }));
import { listAllReportProjects, parseReportFilters, projectReportSummary, projectsPdf, projectsWorkbook } from "../../src/lib/server/reports";

const actor = { id: "viewer", role: "ADMIN" as const };
const row = (index: number, overrides = {}) => ({ id: String(index), code: `DP-${String(index).padStart(3, "0")}`, brand: `Brand ${index}`, program: null, category: null, status: "IN_PROGRESS" as const, progress: 50, startDate: null, dueDate: null, publishedAt: null, notes: null, version: 1, assignmentVersion: 1, archivedAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), assignee: null, ...overrides });

beforeEach(() => { vi.clearAllMocks(); mocks.listProjects.mockResolvedValue([]); });
describe("complete project reporting", () => {
  it("pages through every visible project without hard truncation", async () => {
    mocks.listProjects.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => row(i))).mockResolvedValueOnce(Array.from({ length: 35 }, (_, i) => row(i + 100)));
    await expect(listAllReportProjects(actor, { status: "IN_PROGRESS" })).resolves.toHaveLength(135);
    expect(mocks.listProjects).toHaveBeenNthCalledWith(1, actor, { status: "IN_PROGRESS", limit: 100, offset: 0 });
    expect(mocks.listProjects).toHaveBeenNthCalledWith(2, actor, { status: "IN_PROGRESS", limit: 100, offset: 100 });
  });
  it("parses supported export filters", () => {
    expect(parseReportFilters(new URLSearchParams("q=Acme&status=REVIEW&archived=all"))).toEqual({ q: "Acme", status: "REVIEW", view: "all" });
  });
  it("computes useful aggregate metrics", () => {
    const rows = [row(1, { progress: 25, dueDate: "2026-01-01" }), row(2, { status: "PUBLISHED", progress: 100 }), row(3, { status: "BLOCKED", progress: 50 })];
    expect(projectReportSummary(rows, new Date("2026-02-01T00:00:00Z"))).toMatchObject({ total: 3, averageProgress: 58, overdue: 1, completed: 1, byStatus: { IN_PROGRESS: 1, PUBLISHED: 1, BLOCKED: 1 } });
  });
  it("includes summary and all rows in workbook", async () => {
    mocks.listProjects.mockResolvedValue([row(1), row(2, { status: "PUBLISHED", progress: 100 })]);
    const workbook = new ExcelJS.Workbook();
    const bytes = await projectsWorkbook(actor, { view: "active" });
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    expect(workbook.getWorksheet("Summary")?.getCell("B5").value).toBe(2);
    expect(workbook.getWorksheet("Projects")?.rowCount).toBe(3);
  });
  it.each(["ADMIN", "STAFF"] as const)("keeps %s visibility scope for both formats", async (role) => {
    const scopedActor = { id: "viewer", role };
    await projectsWorkbook(scopedActor, { q: "Acme" });
    await projectsPdf(scopedActor, { q: "Acme" });
    expect(mocks.listProjects).toHaveBeenNthCalledWith(1, scopedActor, { q: "Acme", limit: 100, offset: 0 });
    expect(mocks.listProjects).toHaveBeenNthCalledWith(2, scopedActor, { q: "Acme", limit: 100, offset: 0 });
  });
});
