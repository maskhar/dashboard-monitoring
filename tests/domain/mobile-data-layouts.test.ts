import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile data layouts", () => {
  it("turns task rows into labeled mobile cards", () => {
    const component = readFileSync("src/components/dashboard/sections/tasks.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain('className="data-panel tasks-panel"');
    expect(component).toContain('data-label="Tugas"');
    expect(component).toContain('data-label="Progres"');
    expect(styles).toContain(".tasks-table .task-row");
    expect(styles).toContain(".tasks-table thead { display: none; }");
  });

  it("turns KPI rows into labeled mobile cards", () => {
    const component = readFileSync("src/components/dashboard/sections/operations.tsx", "utf8");
    const styles = readFileSync("src/components/dashboard/sections/operations-parity.css", "utf8");

    expect(component).toContain('className="data-panel kpi-panel"');
    expect(component).toContain('className="kpi-table"');
    expect(component).toContain('data-label="Bukti / evaluasi"');
    expect(styles).toContain(".ops-parity .kpi-table thead { display: none; }");
    expect(styles).toContain(".ops-parity .kpi-table tr");
  });
});
