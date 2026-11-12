import { describe, expect, it } from "vitest";
import {
  calculateProjectWorkspaceMetrics,
  percentageSumIsBelowHundred,
  type WorkspaceFinancials,
} from "../../src/lib/project-workspace-metrics";

const financials: WorkspaceFinancials = {
  contractValue: "1000.00",
  targetMarginPct: "20",
  retentionPct: "10",
  overheadPct: "10",
  contingencyPct: "5",
  vatEnabled: true,
  vatPct: "11",
  withholdingEnabled: true,
  withholdingPct: "2.5",
};

describe("project workspace metrics", () => {
  it("calculates money with fixed-point arithmetic and rounds half up", () => {
    const metrics = calculateProjectWorkspaceMetrics(financials, [
      { quantity: "1.0050", unitPrice: "1.00", actualAmount: null },
      { quantity: "2", unitPrice: "10.005", actualAmount: "0" },
    ]);

    expect(metrics).toMatchObject({
      plannedHpp: "21.03",
      actualHpp: "0.00",
      actualReportedItems: 1,
      overhead: "2.10",
      contingency: "1.05",
      plannedCost: "24.18",
      retention: "100.00",
      minimumPrice: "34.54",
      plannedMargin: "875.82",
      plannedMarginPct: "87.5820",
      actualOverhead: "0.00",
      actualMargin: "900.00",
      actualMarginPct: "90.0000",
      vat: "110.00",
      withholding: "25.00",
    });
  });

  it("distinguishes an unreported actual from a reported zero", () => {
    const withoutActual = calculateProjectWorkspaceMetrics(financials, [
      { quantity: "1", unitPrice: "10", actualAmount: null },
    ]);
    const zeroActual = calculateProjectWorkspaceMetrics(financials, [
      { quantity: "1", unitPrice: "10", actualAmount: "0" },
    ]);

    expect(withoutActual.actualHpp).toBe("0.00");
    expect(withoutActual.actualReportedItems).toBe(0);
    expect(zeroActual.actualHpp).toBe("0.00");
    expect(zeroActual.actualReportedItems).toBe(1);
  });

  it("returns null ratios when contract value or pricing denominator is zero", () => {
    const zeroContract = calculateProjectWorkspaceMetrics(
      { ...financials, contractValue: "0" },
      [{ quantity: "1", unitPrice: "10", actualAmount: "5" }],
    );
    const noPricingRoom = calculateProjectWorkspaceMetrics(
      { ...financials, targetMarginPct: "90", retentionPct: "10" },
      [{ quantity: "1", unitPrice: "10", actualAmount: null }],
    );

    expect(zeroContract.plannedMarginPct).toBeNull();
    expect(zeroContract.actualMarginPct).toBeNull();
    expect(noPricingRoom.minimumPrice).toBeNull();
  });

  it("honors enabled tax flags independently", () => {
    const disabled = calculateProjectWorkspaceMetrics(
      { ...financials, vatEnabled: false, withholdingEnabled: false },
      [],
    );

    expect(disabled.vat).toBe("0.00");
    expect(disabled.withholding).toBe("0.00");
  });

  it("requires combined constrained percentages to remain below 100", () => {
    expect(percentageSumIsBelowHundred("99.9999", "0")).toBe(true);
    expect(percentageSumIsBelowHundred("99.9999", "0.0001")).toBe(false);
    expect(percentageSumIsBelowHundred("50", "50")).toBe(false);
    expect(percentageSumIsBelowHundred("49.9999", "50")).toBe(true);
  });

  it("rounds excess precision deterministically and rejects non-decimal input", () => {
    expect(percentageSumIsBelowHundred("99.99994")).toBe(true);
    expect(percentageSumIsBelowHundred("99.99995")).toBe(false);
    expect(() => percentageSumIsBelowHundred("1e2")).toThrow("Invalid decimal value: 1e2");
    expect(() => calculateProjectWorkspaceMetrics(financials, [
      { quantity: " 1", unitPrice: "10", actualAmount: null },
    ])).toThrow("Invalid decimal value:  1");
  });
});
