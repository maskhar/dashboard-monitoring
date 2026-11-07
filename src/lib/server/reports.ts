import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { listProjects, type ProjectView } from "./projects";
import { jakartaDate } from "../project-metrics";
import type { Actor } from "./access";
import type { ProjectState } from "./domain";

const PAGE_SIZE = 100;
const projectStates = ["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"] as const;
const reportFilterSchema = z.object({ q: z.string().trim().min(1).optional(), status: z.enum(projectStates).optional(), archived: z.enum(["active", "archived", "deleted", "all"]).default("active") });

export type ReportFilters = { q?: string; status?: ProjectState; view?: ProjectView };
type ReportRow = Awaited<ReturnType<typeof listProjects>>[number];

export function parseReportFilters(searchParams: URLSearchParams): ReportFilters {
  const parsed = reportFilterSchema.parse(Object.fromEntries(searchParams));
  return { q: parsed.q, status: parsed.status, view: parsed.archived };
}

export async function listAllReportProjects(actor: Actor, filters: ReportFilters = {}) {
  const rows: ReportRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await listProjects(actor, { ...filters, limit: PAGE_SIZE, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function projectReportSummary(rows: ReportRow[], now = new Date()) {
  const today = jakartaDate(now);
  const byStatus = Object.fromEntries(projectStates.map((status) => [status, 0])) as Record<ProjectState, number>;
  let progressTotal = 0;
  let overdue = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    progressTotal += row.progress;
    if (row.dueDate && row.dueDate < today && row.progress < 100 && row.status !== "PUBLISHED" && row.status !== "CANCELLED") overdue += 1;
  }
  return { total: rows.length, averageProgress: rows.length ? Math.round(progressTotal / rows.length) : 0, overdue, completed: byStatus.PUBLISHED, byStatus };
}

function filterDescription(filters: ReportFilters) {
  return [filters.q && `Search: ${filters.q}`, filters.status && `Status: ${filters.status}`, `View: ${filters.view ?? "active"}`].filter(Boolean).join(" | ");
}

export async function projectsWorkbook(actor: Actor, filters: ReportFilters = {}) {
  const rows = await listAllReportProjects(actor, filters);
  const summary = projectReportSummary(rows);
  const wb = new ExcelJS.Workbook();
  const summarySheet = wb.addWorksheet("Summary");
  summarySheet.addRows([["Project report"], ["Filters", filterDescription(filters)], [], ["Metric", "Value"], ["Total projects", summary.total], ["Average progress", summary.averageProgress / 100], ["Published", summary.completed], ["Overdue", summary.overdue], [], ["Status", "Projects"], ...projectStates.map((status) => [status, summary.byStatus[status]])]);
  summarySheet.getColumn(1).width = 24;
  summarySheet.getColumn(2).width = 40;
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(4).font = { bold: true };
  summarySheet.getRow(10).font = { bold: true };
  summarySheet.getCell("B6").numFmt = "0%";
  const sheet = wb.addWorksheet("Projects");
  sheet.columns = [{ header: "Code", key: "code", width: 12 }, { header: "Brand", key: "brand", width: 28 }, { header: "Program", key: "program", width: 18 }, { header: "Category", key: "category", width: 22 }, { header: "Status", key: "status", width: 16 }, { header: "Progress", key: "progress", width: 12 }, { header: "Due date", key: "dueDate", width: 14 }];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = "A1:G1";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function projectsPdf(actor: Actor, filters: ReportFilters = {}) {
  const rows = await listAllReportProjects(actor, filters);
  const summary = projectReportSummary(rows);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  page.drawText("Utero Project Monitoring", { x: 40, y, size: 18, font: bold, color: rgb(0.08, 0.2, 0.16) });
  y -= 24;
  page.drawText(filterDescription(filters).slice(0, 90), { x: 40, y, size: 8, font });
  y -= 20;
  page.drawText(`Total: ${summary.total}   Average progress: ${summary.averageProgress}%   Published: ${summary.completed}   Overdue: ${summary.overdue}`, { x: 40, y, size: 9, font: bold });
  y -= 16;
  page.drawText(projectStates.map((status) => `${status}: ${summary.byStatus[status]}`).join("   "), { x: 40, y, size: 7, font });
  y -= 24;
  for (const row of rows) {
    if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
    page.drawText(`${row.code}  ${row.brand.slice(0, 34)}  ${row.status}  ${row.progress}%`, { x: 40, y, size: 9, font });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}
