import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractTemplateSeedData } from "../../scripts/seed";
import { jakartaDate, projectMetrics } from "../../src/lib/project-metrics";

describe("design template parity", () => {
  it("preserves baseline on 6 November 2026 without fixing source anomalies", () => {
    const data = extractTemplateSeedData(readFileSync("dashboard-monitoring-admin.html", "utf8"), readFileSync("dashboard-monitoring-design.html", "utf8"));
    const rows = data.projects.map((row) => ({ ...row, ...projectMetrics(row, "2026-11-06") }));
    expect(rows).toHaveLength(65);
    expect(rows.filter((row) => row.status === "REVIEW")).toHaveLength(3);
    expect(rows.filter((row) => row.status === "PUBLISHED")).toHaveLength(6);
    expect(rows.filter((row) => row.isOverdue)).toHaveLength(13);
    expect(rows.filter((row) => row.isOpen)).toHaveLength(48);
    expect(rows.filter((row) => row.qualityIssue)).toHaveLength(8);
  });
  it("uses business date, not UTC, at Jakarta midnight", () => {
    expect(jakartaDate(new Date("2026-11-05T17:00:00Z"))).toBe("2026-11-06");
    expect(projectMetrics({ status: "BACKLOG", progress: 100, dueDate: "2026-11-01" }, "2026-11-06").isOverdue).toBe(false);
    expect(projectMetrics({ status: "CANCELLED", progress: 0, dueDate: "2026-11-01" }, "2026-11-06").isOpen).toBe(false);
  });
});
