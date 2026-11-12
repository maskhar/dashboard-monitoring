export type WorkspaceFinancials = {
  contractValue: string;
  targetMarginPct: string;
  retentionPct: string;
  overheadPct: string;
  contingencyPct: string;
  vatEnabled: boolean;
  vatPct: string;
  withholdingEnabled: boolean;
  withholdingPct: string;
};

export type WorkspaceCost = {
  quantity: string;
  unitPrice: string;
  actualAmount: string | null;
};

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 4;
const PERCENT_SCALE = 4;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const PERCENT_ONE_HUNDRED = BigInt(100) * TEN ** BigInt(PERCENT_SCALE);

function parseFixed(value: string, scale: number) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Invalid decimal value: ${value}`);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(scale)}`;
  const kept = padded.slice(0, scale);
  const remainder = padded.slice(scale);
  let result = BigInt(whole) * TEN ** BigInt(scale) + BigInt(kept || "0");
  if (remainder[0] && remainder[0] >= "5") result += ONE;
  return negative ? -result : result;
}

function divideRounded(numerator: bigint, denominator: bigint) {
  if (denominator === ZERO) throw new Error("Division by zero");
  const negative = (numerator < ZERO) !== (denominator < ZERO);
  const absoluteNumerator = numerator < ZERO ? -numerator : numerator;
  const absoluteDenominator = denominator < ZERO ? -denominator : denominator;
  const quotient = (absoluteNumerator + absoluteDenominator / TWO) / absoluteDenominator;
  return negative ? -quotient : quotient;
}

function formatFixed(value: bigint, scale: number) {
  const negative = value < ZERO;
  const absolute = negative ? -value : value;
  const divisor = TEN ** BigInt(scale);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function percentageOf(amount: bigint, percentage: bigint) {
  return divideRounded(amount * percentage, PERCENT_ONE_HUNDRED);
}

export function percentageSumIsBelowHundred(...values: string[]) {
  return values.reduce((sum, value) => sum + parseFixed(value, PERCENT_SCALE), ZERO) < PERCENT_ONE_HUNDRED;
}

export function calculateProjectWorkspaceMetrics(financials: WorkspaceFinancials, costs: WorkspaceCost[]) {
  const contractValue = parseFixed(financials.contractValue, MONEY_SCALE);
  const targetMarginPct = parseFixed(financials.targetMarginPct, PERCENT_SCALE);
  const retentionPct = parseFixed(financials.retentionPct, PERCENT_SCALE);
  const overheadPct = parseFixed(financials.overheadPct, PERCENT_SCALE);
  const contingencyPct = parseFixed(financials.contingencyPct, PERCENT_SCALE);
  const vatPct = parseFixed(financials.vatPct, PERCENT_SCALE);
  const withholdingPct = parseFixed(financials.withholdingPct, PERCENT_SCALE);

  let plannedHpp = ZERO;
  let actualHpp = ZERO;
  let actualReportedItems = 0;
  for (const item of costs) {
    const quantity = parseFixed(item.quantity, QUANTITY_SCALE);
    const unitPrice = parseFixed(item.unitPrice, MONEY_SCALE);
    plannedHpp += divideRounded(quantity * unitPrice, TEN ** BigInt(QUANTITY_SCALE));
    if (item.actualAmount !== null) {
      actualHpp += parseFixed(item.actualAmount, MONEY_SCALE);
      actualReportedItems += 1;
    }
  }

  const overhead = percentageOf(plannedHpp, overheadPct);
  const contingency = percentageOf(plannedHpp, contingencyPct);
  const plannedCost = plannedHpp + overhead + contingency;
  const retention = percentageOf(contractValue, retentionPct);
  const denominator = PERCENT_ONE_HUNDRED - retentionPct - targetMarginPct;
  const minimumPrice = denominator > ZERO ? divideRounded(plannedCost * PERCENT_ONE_HUNDRED, denominator) : null;
  const plannedMargin = contractValue - plannedCost - retention;
  const plannedMarginPct = contractValue === ZERO ? null : divideRounded(plannedMargin * PERCENT_ONE_HUNDRED, contractValue);
  const actualOverhead = percentageOf(actualHpp, overheadPct);
  const actualMargin = contractValue - actualHpp - actualOverhead - retention;
  const actualMarginPct = contractValue === ZERO ? null : divideRounded(actualMargin * PERCENT_ONE_HUNDRED, contractValue);
  const vat = financials.vatEnabled ? percentageOf(contractValue, vatPct) : ZERO;
  const withholding = financials.withholdingEnabled ? percentageOf(contractValue, withholdingPct) : ZERO;

  return {
    plannedHpp: formatFixed(plannedHpp, MONEY_SCALE),
    actualHpp: formatFixed(actualHpp, MONEY_SCALE),
    actualReportedItems,
    overhead: formatFixed(overhead, MONEY_SCALE),
    contingency: formatFixed(contingency, MONEY_SCALE),
    plannedCost: formatFixed(plannedCost, MONEY_SCALE),
    retention: formatFixed(retention, MONEY_SCALE),
    minimumPrice: minimumPrice === null ? null : formatFixed(minimumPrice, MONEY_SCALE),
    plannedMargin: formatFixed(plannedMargin, MONEY_SCALE),
    plannedMarginPct: plannedMarginPct === null ? null : formatFixed(plannedMarginPct, PERCENT_SCALE),
    actualOverhead: formatFixed(actualOverhead, MONEY_SCALE),
    actualMargin: formatFixed(actualMargin, MONEY_SCALE),
    actualMarginPct: actualMarginPct === null ? null : formatFixed(actualMarginPct, PERCENT_SCALE),
    vat: formatFixed(vat, MONEY_SCALE),
    withholding: formatFixed(withholding, MONEY_SCALE),
  };
}
