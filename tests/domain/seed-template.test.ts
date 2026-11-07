import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractTemplateSeedData } from "../../scripts/seed";

describe("template seed extraction", () => {
  it("extracts every business row from both dashboard templates", async () => {
    const [adminHtml, designHtml] = await Promise.all([readFile("dashboard-monitoring-admin.html", "utf8"), readFile("dashboard-monitoring-design.html", "utf8")]);
    const data = extractTemplateSeedData(adminHtml, designHtml);
    expect({ periods: data.periods.length, kpis: data.kpis.length, weeks: data.weeks.length, milestones: data.milestones.length, gates: data.gates.length, projects: data.projects.length }).toEqual({ periods: 3, kpis: 9, weeks: 13, milestones: 14, gates: 5, projects: 65 });
    expect(data.milestones.map((item) => item.day)).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
    expect(data.projects[0]).toMatchObject({ code: "DP-001", brand: "Demo Brand 001", startDate: "2026-10-01", dueDate: "2026-10-10" });
    expect(data.projects.at(-1)).toMatchObject({ code: "DP-065", brand: "Demo Brand 065", status: "PUBLISHED", progress: 100 });
    expect(data.kpis[8]).toMatchObject({ name: "Pendapatan contoh", unit: "IDR", targets: [50000000, 75000000, 100000000] });
  });

  it("uses stable gate IDs", async () => {
    const [adminHtml, designHtml] = await Promise.all([readFile("dashboard-monitoring-admin.html", "utf8"), readFile("dashboard-monitoring-design.html", "utf8")]);
    expect(extractTemplateSeedData(adminHtml, designHtml).gates).toEqual(extractTemplateSeedData(adminHtml, designHtml).gates);
  });
});
