type DecimalParts = { negative: boolean; digits: bigint; scale: number };
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_TWO = BigInt(2);
const BIGINT_TEN = BigInt(10);

function parseDecimal(value: string | number | null | undefined): DecimalParts | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? String(value) : value.trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] ?? "";
  return { negative: match[1] === "-", digits: BigInt(`${match[2]}${fraction}`), scale: fraction.length };
}

function roundDecimal(parts: DecimalParts, targetScale: number) {
  if (parts.scale <= targetScale) return { ...parts, digits: parts.digits * BIGINT_TEN ** BigInt(targetScale - parts.scale), scale: targetScale };
  const divisor = BIGINT_TEN ** BigInt(parts.scale - targetScale);
  const quotient = parts.digits / divisor;
  const remainder = parts.digits % divisor;
  return { ...parts, digits: quotient + (remainder * BIGINT_TWO >= divisor ? BIGINT_ONE : BIGINT_ZERO), scale: targetScale };
}

function decimalString(parts: DecimalParts) {
  const raw = parts.digits.toString().padStart(parts.scale + 1, "0");
  const whole = parts.scale ? raw.slice(0, -parts.scale) : raw;
  const fraction = parts.scale ? raw.slice(-parts.scale) : "";
  return `${parts.negative && parts.digits !== BIGINT_ZERO ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function multiplyDecimalStrings(left: string | number, right: string | number, targetScale = 2) {
  const leftParts = parseDecimal(left);
  const rightParts = parseDecimal(right);
  if (!leftParts || !rightParts) return null;
  return decimalString(roundDecimal({
    negative: leftParts.negative !== rightParts.negative,
    digits: leftParts.digits * rightParts.digits,
    scale: leftParts.scale + rightParts.scale,
  }, targetScale));
}

export function formatCurrency(value: string | number | null | undefined, currency = "IDR") {
  const parsed = parseDecimal(value);
  if (!parsed) return "-";
  const fractionDigits = 2;
  const rounded = roundDecimal(parsed, fractionDigits);
  const base = BIGINT_TEN ** BigInt(fractionDigits);
  const whole = rounded.digits / base;
  const fraction = fractionDigits ? (rounded.digits % base).toString().padStart(fractionDigits, "0") : "";
  const formatter = new Intl.NumberFormat("id-ID", { style: "currency", currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  const source = rounded.negative && rounded.digits !== BIGINT_ZERO ? -(whole === BIGINT_ZERO ? BIGINT_ONE : whole) : whole;
  return formatter.formatToParts(source).map((part) => {
    if (part.type === "integer" && whole === BIGINT_ZERO && rounded.negative && rounded.digits !== BIGINT_ZERO) return "0";
    if (part.type === "fraction") return fraction;
    return part.value;
  }).join("");
}

export function formatPercent(value: string | number | null | undefined) {
  const parsed = parseDecimal(value);
  if (!parsed) return "-";
  const rounded = roundDecimal(parsed, 2);
  const negative = rounded.negative && rounded.digits !== BIGINT_ZERO;
  const raw = decimalString({ ...rounded, negative: false });
  const [whole, fraction] = raw.split(".");
  const grouped = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(BigInt(whole));
  return `${negative ? "-" : ""}${grouped}${fraction && fraction !== "00" ? `,${fraction.replace(/0+$/, "")}` : ""}%`;
}

export function formatWorkspaceDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", includeTime ? {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  } : { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(date);
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    NOT_STARTED: "Belum dimulai",
    IN_PROGRESS: "Berjalan",
    IN_REVIEW: "Dalam review",
    COMPLETED: "Selesai",
    BLOCKED: "Terhambat",
    CANCELLED: "Dibatalkan",
    WAITING: "Menunggu",
    ACTIVE: "Aktif",
    READY: "Siap gate",
    APPROVAL_PENDING: "Menunggu persetujuan",
    PASSED: "Lolos",
    REOPENED: "Dibuka kembali",
    MISSING: "Belum tersedia",
    UPLOADED: "Sudah diunggah",
    ACCEPTED: "Diterima",
    REJECTED: "Ditolak",
    WAIVED: "Dikecualikan",
    DRAFT: "Draft",
    SUBMITTED: "Diajukan",
    APPROVED: "Disetujui",
    LOCKED: "Dikunci",
  };
  return labels[status] ?? status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    PIC: "PIC",
    PIC_ASSISTANT: "Asisten PIC",
    DESIGNER: "Desainer",
    PROJECT_LEADER: "Project Leader",
    PRODUCTION_TEAM: "Tim Produksi",
    FINANCE_ADMIN: "Finance & Admin",
    INSTALLATION_SUPPORT: "Dukungan Instalasi",
  };
  return labels[role] ?? statusLabel(role);
}
