import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { dailyMilestones, gates, kpiDefinitions, kpiTargets, monitoringPeriods, projects, weeklyPlans } from "../src/db/schema";

type ProjectStatus = "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "PUBLISHED";
type ProjectSeed = { code: string; brand: string; program: string | null; category: string | null; startDate: string | null; dueDate: string | null; progress: number; status: ProjectStatus };
export type TemplateSeedData = {
  periods: { name: string; startDate: string; endDate: string; status: string }[];
  kpis: { code: string; name: string; unit: string; targets: number[] }[];
  weeks: { week: number; focus: string; deliverable: string; reviewNote: string; dueDate: string }[];
  milestones: { day: number; dueDate: string; title: string; deliverable: string }[];
  gates: { id: string; title: string }[];
  projects: ProjectSeed[];
};

function capture(source: string, pattern: RegExp) { const match = source.match(pattern); if (!match?.[1]) throw new Error(`Seed source did not match ${pattern}`); return match[1]; }
function excelDate(serial: number) { return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10); }
function stableUuid(namespace: string, value: string) { const hex = createHash("sha256").update(`${namespace}:${value}`).digest("hex").slice(0, 32).split(""); hex[12] = "4"; hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16); return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`; }

export function extractTemplateSeedData(adminHtml: string, designHtml: string): TemplateSeedData {
  const months = JSON.parse(capture(adminHtml, /var M=(\[[^;]+\]);/)) as string[];
  const sourceKpis = JSON.parse(capture(adminHtml, /var KPI=(\[[\s\S]+?\]);\s*var WK=/)) as [string, number[]][];
  const sourceWeeks = JSON.parse(capture(adminHtml, /var WK=(\[[\s\S]+?\]);\s*var DY=/)) as [string, string, string][];
  const sourceDays = JSON.parse(capture(adminHtml, /var DY=(\[[\s\S]+?\]);\s*var GATE=/)) as [number, string, string][];
  const sourceGates = JSON.parse(capture(adminHtml, /var GATE=(\[[^;]+\]);/)) as string[];
  const rawProjects = capture(designHtml, /const RAW=`([\s\S]+?)`;/);
  const programs: Record<string, string> = { BB: "Brand Birth", RB: "Rebranding", BI: "Brand+ing" };
  const statuses: Record<string, ProjectStatus> = { B: "BACKLOG", I: "IN_PROGRESS", R: "REVIEW", P: "PUBLISHED" };
  const periods = months.map((name, index) => { const start = new Date(Date.UTC(2026, 10 + index, 1)); const end = new Date(Date.UTC(2026, 11 + index, 0)); return { name, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), status: index === 0 ? "ACTIVE" : "DRAFT" }; });
  const projectsData = rawProjects.split("\n").filter(Boolean).map((line, index) => { const [brand, program, category, start, due, progressText, state] = line.split("|"); const progress = Number(progressText); return { code: `DP-${String(index + 1).padStart(3, "0")}`, brand, program: programs[program] ?? null, category: category || null, startDate: start ? `2026-${start}` : null, dueDate: due ? `2026-${due}` : null, progress, status: statuses[state] ?? (progress === 100 ? "PUBLISHED" : "BACKLOG") }; });
  return {
    periods,
    kpis: sourceKpis.map(([name, targets], index) => ({ code: `KPI-${String(index + 1).padStart(2, "0")}`, name, unit: index === 8 ? "IDR" : "COUNT", targets })),
    weeks: sourceWeeks.map(([focus, deliverable, reviewNote], index) => ({ week: index + 1, focus, deliverable, reviewNote, dueDate: excelDate(46332 + 7 * index) })),
    milestones: sourceDays.slice(0, 14).map(([serial, title, deliverable], index) => ({ day: index + 1, dueDate: excelDate(serial), title, deliverable })),
    gates: sourceGates.map((title) => ({ id: stableUuid("template-gate", title), title })),
    projects: projectsData,
  };
}

export async function seedTemplateData(data: TemplateSeedData) {
  await db.transaction(async (tx) => {
    const periodRows = [];
    for (const period of data.periods) {
      await tx.insert(monitoringPeriods).values(period).onConflictDoNothing({ target: monitoringPeriods.name });
      const [row] = await tx.select().from(monitoringPeriods).where(eq(monitoringPeriods.name, period.name)).limit(1);
      periodRows.push(row);
    }
    for (const kpi of data.kpis) {
      await tx.insert(kpiDefinitions).values({ code: kpi.code, name: kpi.name, unit: kpi.unit }).onConflictDoNothing({ target: kpiDefinitions.code });
      const [definition] = await tx.select().from(kpiDefinitions).where(eq(kpiDefinitions.code, kpi.code)).limit(1);
      for (let index = 0; index < periodRows.length; index++) {
        const target = String(kpi.targets[index]);
        const predicate = and(eq(kpiTargets.periodId, periodRows[index].id), eq(kpiTargets.kpiId, definition.id));
        const [existing] = await tx.select({ id: kpiTargets.id }).from(kpiTargets).where(predicate).limit(1);
        if (!existing) await tx.insert(kpiTargets).values({ periodId: periodRows[index].id, kpiId: definition.id, target, assigneeId: null });
      }
    }
    const onboarding = periodRows[0];
    for (const week of data.weeks) await tx.insert(weeklyPlans).values({ periodId: onboarding.id, ...week, assigneeId: null }).onConflictDoNothing({ target: [weeklyPlans.periodId, weeklyPlans.week] });
    for (const milestone of data.milestones) await tx.insert(dailyMilestones).values({ periodId: onboarding.id, ...milestone, assigneeId: null }).onConflictDoNothing({ target: [dailyMilestones.periodId, dailyMilestones.day] });
    for (const gate of data.gates) {
      const [existing] = await tx.select({ id: gates.id }).from(gates).where(and(eq(gates.periodId, onboarding.id), eq(gates.title, gate.title))).limit(1);
      if (!existing) await tx.insert(gates).values({ id: gate.id, periodId: onboarding.id, title: gate.title, assigneeId: null });
    }
    for (const project of data.projects) await tx.insert(projects).values({ ...project, publishedAt: null }).onConflictDoNothing({ target: projects.code });
  });
}

async function main() {
  const [adminHtml, designHtml] = await Promise.all([readFile("dashboard-monitoring-admin.html", "utf8"), readFile("dashboard-monitoring-design.html", "utf8")]);
  const data = extractTemplateSeedData(adminHtml, designHtml);
  await seedTemplateData(data);
  console.log(JSON.stringify({ periods: data.periods.length, kpiDefinitions: data.kpis.length, kpiTargets: data.kpis.length * data.periods.length, weeklyPlans: data.weeks.length, dailyMilestones: data.milestones.length, gates: data.gates.length, projects: data.projects.length, users: 0, assignments: 0, approvals: 0, evidence: 0, auditEvents: 0 }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((error) => { console.error(error); process.exitCode = 1; });
