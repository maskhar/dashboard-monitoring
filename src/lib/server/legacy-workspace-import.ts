import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditEvents,
  dataJobs,
  projectAssignments,
  projectCostItems,
  projectDocumentRequirements,
  projectPhaseInstances,
  projects,
  projectStageInstances,
  projectWorkspaceImports,
  projectWorkspaces,
  users,
} from "@/db/schema";
import { HttpError } from "./authz";

export const LEGACY_WORKSPACE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_PROJECTS_PER_IMPORT = 500;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

const COST_CATEGORY_MAP = {
  "Material rangka & panel": "FRAME_PANEL_MATERIAL",
  Finishing: "FINISHING",
  Kelistrikan: "ELECTRICAL",
  "Cetak & branding": "PRINTING_BRANDING",
  "Bahan pendukung": "SUPPORTING_MATERIAL",
  "Tenaga kerja": "LABOR",
  Operasional: "OPERATIONS",
  Pengiriman: "SHIPPING",
} as const;

const TEAM_ROLE_MAP = {
  pic: "PIC",
  asisten: "PIC_ASSISTANT",
  desainer: "DESIGNER",
  pl: "PROJECT_LEADER",
  tukang: "PRODUCTION_TEAM",
  keuangan: "FINANCE_ADMIN",
  pendamping: "INSTALLATION_SUPPORT",
} as const;

const PHASE_TEMPLATES = [
  { phaseNumber: 1, code: "G1", name: "Penawaran", decisionOwnerRole: "PIC" },
  { phaseNumber: 2, code: "G2", name: "Kontrak", decisionOwnerRole: "FINANCE_ADMIN" },
  { phaseNumber: 3, code: "G3", name: "Perencanaan", decisionOwnerRole: "PROJECT_LEADER" },
  { phaseNumber: 4, code: "G4", name: "Produksi", decisionOwnerRole: "PROJECT_LEADER" },
  { phaseNumber: 5, code: "G5", name: "Instalasi & serah terima", decisionOwnerRole: "PIC" },
  { phaseNumber: 6, code: "CLOSE", name: "Penagihan & tutup buku", decisionOwnerRole: "FINANCE_ADMIN" },
] as const;

const STAGE_TEMPLATES = [
  { phaseNumber: 1, title: "Penawaran harga & BOQ", defaultRole: "PIC" },
  { phaseNumber: 1, title: "Negosiasi & persetujuan penawaran", defaultRole: "PIC" },
  { phaseNumber: 2, title: "Penerbitan SPK / kontrak kerja", defaultRole: "PIC" },
  { phaseNumber: 3, title: "Survei & pengukuran lokasi", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 3, title: "Finalisasi & persetujuan gambar kerja", defaultRole: "DESIGNER" },
  { phaseNumber: 3, title: "Penyusunan anggaran & jadwal kerja", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 4, title: "Belanja material", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 4, title: "Penerimaan & pengecekan material", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 4, title: "Produksi", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 4, title: "Quality Control internal", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 5, title: "Pengiriman", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 5, title: "Pemasangan di lokasi", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 5, title: "Pemeriksaan bersama klien", defaultRole: "PIC" },
  { phaseNumber: 5, title: "Perbaikan & finalisasi", defaultRole: "PROJECT_LEADER" },
  { phaseNumber: 5, title: "Penandatanganan BAST", defaultRole: "PIC" },
  { phaseNumber: 6, title: "Penagihan & pelunasan sesuai termin", defaultRole: "FINANCE_ADMIN" },
] as const;

const DOCUMENT_TEMPLATES = [
  { code: "penawaran", label: "Surat penawaran + BOQ + gambar konsep", phaseNumber: 1 },
  { code: "acc_penawaran", label: "Persetujuan penawaran tertulis", phaseNumber: 1 },
  { code: "spk", label: "SPK bertanda tangan + bukti DP", phaseNumber: 2 },
  { code: "survei", label: "Form survei lokasi + foto", phaseNumber: 3 },
  { code: "gambar_acc", label: "Gambar kerja ber-ACC klien", phaseNumber: 3 },
  { code: "rab_final", label: "RAB final terkunci + jadwal kerja", phaseNumber: 3 },
  { code: "nota", label: "Nota belanja + checklist penerimaan material", phaseNumber: 4 },
  { code: "qc", label: "Checklist QC internal", phaseNumber: 4 },
  { code: "surat_jalan", label: "Surat jalan", phaseNumber: 5 },
  { code: "punchlist", label: "Punch list pemeriksaan bersama", phaseNumber: 5 },
  { code: "bast", label: "BAST bertanda tangan + foto akhir", phaseNumber: 5 },
  { code: "invoice", label: "Invoice pelunasan + bukti bayar", phaseNumber: 6 },
  { code: "laporan", label: "Laporan margin aktual vs RAB", phaseNumber: 6 },
] as const;

const DOCUMENT_CODES = DOCUMENT_TEMPLATES.map((document) => document.code);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_SCHEMA = z.string().uuid();

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const optionalDateSchema = z.string().max(10).refine((value) => value === "" || isCalendarDate(value), "Invalid calendar date").default("");

function fixedDecimal(value: string | number, scale: number, integerDigits: number, label: string) {
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error(`${label} number is not safely representable; use a decimal string`);
  const normalized = raw === "" ? "0" : raw.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${label} must be a non-negative decimal`);
  const [wholeRaw, fractionRaw = ""] = normalized.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  if (whole.length > integerDigits || fractionRaw.length > scale) throw new Error(`${label} exceeds numeric precision`);
  return `${whole}.${fractionRaw.padEnd(scale, "0")}`;
}

function decimalSchema(scale: number, integerDigits: number, label: string) {
  return z.union([z.string(), z.number()]).transform((value, context) => {
    try {
      return fixedDecimal(value, scale, integerDigits, label);
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : `${label} is invalid` });
      return z.NEVER;
    }
  });
}

const moneySchema = decimalSchema(2, 17, "Money");
const quantitySchema = decimalSchema(4, 14, "Quantity");
const percentageSchema = decimalSchema(4, 3, "Percentage").refine((value) => BigInt(value.replace(".", "")) <= BigInt(1_000_000), "Percentage must be between 0 and 100");

const legacyItemSchema = z.object({
  id: z.string().max(200).optional(),
  kat: z.enum(Object.keys(COST_CATEGORY_MAP) as [keyof typeof COST_CATEGORY_MAP, ...(keyof typeof COST_CATEGORY_MAP)[]]),
  uraian: z.string().max(1000).default(""),
  vol: quantitySchema.default("1.0000"),
  sat: z.string().max(100).default("lot"),
  harga: moneySchema.default("0.00"),
  realisasi: moneySchema.default("0.00"),
}).strict();

const legacyStageSchema = z.object({
  mulai: optionalDateSchema,
  selesai: optionalDateSchema,
  status: z.enum(["Belum mulai", "Proses", "Selesai"]).default("Belum mulai"),
  pic: z.string().max(300).default(""),
}).strict();

const teamSchema = z.object({
  pic: z.string().max(500).optional(),
  asisten: z.string().max(500).optional(),
  desainer: z.string().max(500).optional(),
  pl: z.string().max(500).optional(),
  tukang: z.string().max(1000).optional(),
  keuangan: z.string().max(500).optional(),
  pendamping: z.string().max(1000).optional(),
}).strict().default({});

const docsSchema = z.object(Object.fromEntries(DOCUMENT_CODES.map((code) => [code, z.boolean().optional()])) as Record<(typeof DOCUMENT_CODES)[number], z.ZodOptional<z.ZodBoolean>>).strict().default({});

const legacyProjectSchema = z.object({
  nama: z.string().trim().min(1).max(300),
  klien: z.string().trim().max(300).default(""),
  lokasi: z.string().trim().max(500).default(""),
  jenis: z.string().trim().max(200).default(""),
  tanggalDeal: optionalDateSchema,
  nilaiKontrak: moneySchema.default("0.00"),
  targetMargin: percentageSchema.default("25.0000"),
  retensiPct: percentageSchema.default("5.0000"),
  overheadPct: percentageSchema.default("0.0000"),
  kontinjensiPct: percentageSchema.default("0.0000"),
  ppnOn: z.boolean().default(false),
  ppnPct: percentageSchema.default("11.0000"),
  pphOn: z.boolean().default(false),
  pphPct: percentageSchema.default("2.0000"),
  items: z.array(legacyItemSchema).max(5000).default([]),
  team: teamSchema,
  stages: z.array(legacyStageSchema).max(16).default([]),
  docs: docsSchema,
  catatan: z.string().max(20_000).default(""),
  updatedAt: z.union([z.number().int().nonnegative(), z.string().datetime({ offset: true })]).optional(),
}).strict().superRefine((project, context) => {
  const target = BigInt(project.targetMargin.replace(".", ""));
  const retention = BigInt(project.retensiPct.replace(".", ""));
  if (target + retention >= BigInt(1_000_000)) context.addIssue({ code: "custom", path: ["targetMargin"], message: "Target margin plus retention must be below 100" });
});

const createProjectSchema = z.object({
  code: z.string().trim().regex(/^DP-[A-Z0-9][A-Z0-9-]{0,27}$/),
  brand: z.string().trim().min(1).max(300).optional(),
  program: z.string().trim().max(300).nullable().optional(),
  category: z.string().trim().max(200).nullable().optional(),
}).strict();

export const legacyProjectMappingSchema = z.record(z.string().min(1), z.union([
  z.object({ projectId: UUID_SCHEMA }).strict(),
  z.object({ create: createProjectSchema }).strict(),
]));

export const legacyCommitProjectMappingSchema = z.record(z.string().min(1), z.union([
  z.object({ projectId: UUID_SCHEMA, previewId: UUID_SCHEMA }).strict(),
  z.object({ create: createProjectSchema, previewId: UUID_SCHEMA }).strict(),
]));

export const legacyUserMappingSchema = z.record(z.string().trim().min(1).max(500), UUID_SCHEMA.nullable());

type LegacyProject = z.infer<typeof legacyProjectSchema>;
type ProjectMapping = z.infer<typeof legacyProjectMappingSchema>;
type CommitProjectMapping = z.infer<typeof legacyCommitProjectMappingSchema>;
type UserMapping = z.infer<typeof legacyUserMappingSchema>;
type WorkspaceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LegacyImportIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  legacyId?: string;
  field?: string;
  candidates?: Array<{ id: string; label: string }>;
};

export type ParsedLegacyWorkspaceExport = {
  sourceHash: string;
  sourceBytes: number;
  projects: Array<{ legacyId: string; project: LegacyProject }>;
};

export function assertLegacyImportTargetFresh(input: {
  currentProjectVersion: number;
  currentWorkspaceVersion: number | null;
  expectedProjectVersion: number | null;
  expectedWorkspaceVersion: number | null;
}) {
  if (input.expectedProjectVersion === null || input.currentProjectVersion !== input.expectedProjectVersion) throw new HttpError(409, "Target project changed after preview; run preview again");
  if (input.currentWorkspaceVersion !== null || input.expectedWorkspaceVersion !== null) throw new HttpError(409, "Target workspace changed after preview; run preview again");
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRawProjects(raw: unknown) {
  let payload = raw;
  if (plainObject(raw) && "projects" in raw) {
    const wrapper = z.object({ projects: z.unknown(), exportedAt: z.unknown().optional(), version: z.unknown().optional() }).strict().parse(raw);
    payload = wrapper.projects;
  }
  if (Array.isArray(payload)) {
    return payload.map((entry, index) => {
      const parsed = z.object({ id: z.string().min(1), data: z.unknown() }).strict().parse(entry);
      return { legacyId: parsed.id, raw: parsed.data, index };
    });
  }
  if (!plainObject(payload)) throw new HttpError(400, "Legacy export must be an object map or an array of { id, data }");
  return Object.entries(payload).map(([legacyId, project], index) => ({ legacyId, raw: project, index }));
}

export function parseLegacyWorkspaceExport(buffer: Buffer): ParsedLegacyWorkspaceExport {
  if (!buffer.length || buffer.length > LEGACY_WORKSPACE_IMPORT_MAX_BYTES) throw new HttpError(400, `JSON file must be between 1 and ${LEGACY_WORKSPACE_IMPORT_MAX_BYTES} bytes`);
  let raw: unknown;
  try {
    raw = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON source");
  }
  const entries = extractRawProjects(raw);
  if (!entries.length || entries.length > MAX_PROJECTS_PER_IMPORT) throw new HttpError(400, `Legacy export must contain 1-${MAX_PROJECTS_PER_IMPORT} projects`);
  const seen = new Set<string>();
  const parsed = entries.map(({ legacyId, raw: project }) => {
    const cleanId = legacyId.trim();
    if (!cleanId || seen.has(cleanId)) throw new HttpError(400, `Duplicate or empty legacy project id: ${legacyId}`);
    seen.add(cleanId);
    return { legacyId: cleanId, project: legacyProjectSchema.parse(project) };
  });
  return {
    sourceHash: createHash("sha256").update(buffer).digest("hex"),
    sourceBytes: buffer.length,
    projects: parsed,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function splitTeamNames(value: string | undefined) {
  return (value ?? "").split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean);
}

function referencedNames(project: LegacyProject) {
  const names: string[] = [];
  for (const value of Object.values(project.team)) names.push(...splitTeamNames(value));
  for (const stage of project.stages) if (stage.pic.trim()) names.push(stage.pic.trim());
  const unique = new Map<string, string>();
  for (const name of names) if (!unique.has(normalizeName(name))) unique.set(normalizeName(name), name);
  return [...unique.values()];
}

function referencedNamesAcrossSource(projects: ParsedLegacyWorkspaceExport["projects"]) {
  const names = new Map<string, string>();
  for (const { project } of projects) {
    for (const name of referencedNames(project)) if (!names.has(normalizeName(name))) names.set(normalizeName(name), name);
  }
  return names.values();
}

function decimalProductCents(quantity: string, unitPrice: string) {
  return BigInt(quantity.replace(".", "")) * BigInt(unitPrice.replace(".", "")) / BigInt(10_000);
}

function centsToNumber(cents: bigint) {
  return Number(cents) / 100;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function mappingHash(sourceHash: string, legacyId: string, projectMapping: ProjectMapping[string], userMapping: UserMapping) {
  const normalizedEntries: Array<[string, string | null]> = Object.entries(userMapping).map(([name, userId]) => [normalizeName(name), userId]);
  const normalizedUsers = Object.fromEntries(normalizedEntries.sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256").update(JSON.stringify(stableValue({ sourceHash, legacyId, projectMapping, userMapping: normalizedUsers }))).digest("hex");
}

function userMapByNormalizedName(mapping: UserMapping) {
  const normalized = new Map<string, string | null>();
  for (const [name, userId] of Object.entries(mapping)) {
    const key = normalizeName(name);
    if (normalized.has(key) && normalized.get(key) !== userId) throw new HttpError(422, `Conflicting user mappings for ${name}`);
    normalized.set(key, userId);
  }
  return normalized;
}

function stageState(status: LegacyProject["stages"][number]["status"]) {
  if (status === "Proses") return { status: "IN_PROGRESS" as const, progress: 50 };
  if (status === "Selesai") return { status: "IN_REVIEW" as const, progress: 100 };
  return { status: "NOT_STARTED" as const, progress: 0 };
}

function importDate(project: LegacyProject) {
  if (typeof project.updatedAt === "number") return new Date(project.updatedAt).toISOString().slice(0, 10);
  if (typeof project.updatedAt === "string") return new Date(project.updatedAt).toISOString().slice(0, 10);
  return null;
}

export function buildLegacyProjectPlan(legacyId: string, project: LegacyProject, userMapping: UserMapping) {
  const normalizedUsers = userMapByNormalizedName(userMapping);
  const assignments: Array<{ role: typeof TEAM_ROLE_MAP[keyof typeof TEAM_ROLE_MAP]; userId: string }> = [];
  for (const [legacyRole, role] of Object.entries(TEAM_ROLE_MAP) as Array<[keyof typeof TEAM_ROLE_MAP, typeof TEAM_ROLE_MAP[keyof typeof TEAM_ROLE_MAP]]>) {
    for (const name of splitTeamNames(project.team[legacyRole])) {
      const userId = normalizedUsers.get(normalizeName(name));
      if (userId) assignments.push({ role, userId });
    }
  }
  const dedupedAssignments = [...new Map(assignments.map((assignment) => [`${assignment.role}:${assignment.userId}`, assignment])).values()];
  const picUserId = dedupedAssignments.find((assignment) => assignment.role === "PIC")?.userId;
  const financeUserId = dedupedAssignments.find((assignment) => assignment.role === "FINANCE_ADMIN")?.userId;
  if (picUserId && picUserId === financeUserId) throw new HttpError(422, `Legacy project ${legacyId} maps PIC and FINANCE_ADMIN to the same user`);
  for (const role of ["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER", "FINANCE_ADMIN"] as const) {
    if (new Set(dedupedAssignments.filter((assignment) => assignment.role === role).map((assignment) => assignment.userId)).size > 1) throw new HttpError(422, `Legacy project ${legacyId} maps multiple users to singleton role ${role}`);
  }

  const stages = STAGE_TEMPLATES.map((template, index) => {
    const source = project.stages[index] ?? { mulai: "", selesai: "", status: "Belum mulai" as const, pic: "" };
    const state = stageState(source.status);
    return {
      stageNumber: index + 1,
      ...template,
      assigneeId: source.pic.trim() ? normalizedUsers.get(normalizeName(source.pic)) ?? null : null,
      plannedStart: source.mulai || null,
      plannedEnd: source.selesai || null,
      actualStart: null,
      actualEnd: null,
      ...state,
    };
  });
  const activeStage = stages.find((stage) => stage.status !== "IN_REVIEW") ?? stages[stages.length - 1];
  const progress = Math.round(stages.reduce((sum, stage) => sum + stage.progress, 0) / stages.length);
  const dates = stages.flatMap((stage) => [stage.plannedStart, stage.plannedEnd]).filter((value): value is string => Boolean(value)).sort();
  const nonzeroActualItems = project.items.filter((item) => item.realisasi !== "0.00").length;
  return {
    legacyId,
    project: {
      status: progress === 0 ? "BACKLOG" as const : "IN_PROGRESS" as const,
      progress,
      startDate: dates[0] ?? null,
      dueDate: dates.at(-1) ?? null,
      sourceUpdatedDate: importDate(project),
    },
    workspace: {
      clientName: project.klien || null,
      location: project.lokasi || null,
      dealDate: project.tanggalDeal || null,
      contractValue: project.nilaiKontrak,
      currency: "IDR",
      targetMarginPct: project.targetMargin,
      retentionPct: project.retensiPct,
      overheadPct: project.overheadPct,
      contingencyPct: project.kontinjensiPct,
      vatEnabled: project.ppnOn,
      vatPct: project.ppnPct,
      withholdingEnabled: project.pphOn,
      withholdingPct: project.pphPct,
      commercialStatus: "DRAFT",
      currentPhase: activeStage.phaseNumber,
    },
    costItems: project.items.map((item, position) => ({
      category: COST_CATEGORY_MAP[item.kat],
      description: item.uraian.trim() || `Legacy item ${position + 1}`,
      quantity: item.vol,
      unit: item.sat.trim() || "unit",
      unitPrice: item.harga,
      actualAmount: item.realisasi === "0.00" ? null : item.realisasi,
      position,
    })),
    phases: PHASE_TEMPLATES.map((phase) => ({ ...phase, status: phase.phaseNumber === activeStage.phaseNumber ? "ACTIVE" : "WAITING" })),
    stages,
    documents: DOCUMENT_TEMPLATES.map((document) => ({
      ...document,
      status: project.docs[document.code] ? "LEGACY_CONFIRMED" : "MISSING",
    })),
    assignments: dedupedAssignments,
    counts: {
      costItems: project.items.length,
      actualAmountsReported: nonzeroActualItems,
      completedStagesRequiringReview: project.stages.filter((stage) => stage.status === "Selesai").length,
      confirmedDocuments: DOCUMENT_TEMPLATES.filter((document) => project.docs[document.code]).length,
      unresolvedUsers: referencedNames(project).filter((name) => !normalizedUsers.get(normalizeName(name))).length,
    },
  };
}

type PreviewOptions = { projectMapping?: ProjectMapping; userMapping?: UserMapping };

async function savePreviewLedger(input: {
  actorId: string;
  expiresAt: Date;
  idempotencyKey: string;
  legacyId: string;
  mappingHash: string;
  sourceBytes: number;
  sourceHash: string;
  targetProjectId: string | null;
  targetProjectVersion: number | null;
  targetWorkspaceVersion: number | null;
}) {
  return db.transaction(async (tx) => {
    let [ledger] = await tx.select().from(projectWorkspaceImports).where(eq(projectWorkspaceImports.idempotencyKey, input.idempotencyKey)).for("update").limit(1);
    if (ledger?.status === "SUCCEEDED") {
      if (ledger.mappingHash !== input.mappingHash) throw new HttpError(409, "This exact source project was already imported with a different mapping");
      return ledger.id;
    }
    if (!ledger) {
      const [created] = await tx.insert(projectWorkspaceImports).values({
        idempotencyKey: input.idempotencyKey,
        sourceHash: input.sourceHash,
        legacyId: input.legacyId,
        status: "PREVIEWED",
        mappingHash: input.mappingHash,
        targetProjectId: input.targetProjectId,
        targetProjectVersion: input.targetProjectVersion,
        targetWorkspaceVersion: input.targetWorkspaceVersion,
        previewExpiresAt: input.expiresAt,
        createdBy: input.actorId,
        summary: { sourceBytes: input.sourceBytes },
      }).onConflictDoNothing({ target: projectWorkspaceImports.idempotencyKey }).returning();
      ledger = created;
      if (!ledger) [ledger] = await tx.select().from(projectWorkspaceImports).where(eq(projectWorkspaceImports.idempotencyKey, input.idempotencyKey)).for("update").limit(1);
      if (ledger?.status === "SUCCEEDED") {
        if (ledger.mappingHash !== input.mappingHash) throw new HttpError(409, "This exact source project was already imported with a different mapping");
        return ledger.id;
      }
    }
    if (!ledger) throw new HttpError(409, "Could not create preview binding");
    const [updated] = await tx.update(projectWorkspaceImports).set({
      status: "PREVIEWED",
      mappingHash: input.mappingHash,
      targetProjectId: input.targetProjectId,
      targetProjectVersion: input.targetProjectVersion,
      targetWorkspaceVersion: input.targetWorkspaceVersion,
      previewExpiresAt: input.expiresAt,
      createdBy: input.actorId,
      error: null,
      updatedAt: new Date(),
    }).where(eq(projectWorkspaceImports.id, ledger.id)).returning({ id: projectWorkspaceImports.id });
    return updated.id;
  });
}

export async function previewLegacyWorkspaceImport(actorId: string, buffer: Buffer, options: PreviewOptions = {}) {
  const source = parseLegacyWorkspaceExport(buffer);
  const projectMapping = legacyProjectMappingSchema.parse(options.projectMapping ?? {});
  const userMapping = legacyUserMappingSchema.parse(options.userMapping ?? {});
  const issues: LegacyImportIssue[] = [];
  const [projectRows, workspaceRows, userRows, ledgerRows] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, brand: projects.brand, program: projects.program, version: projects.version, archivedAt: projects.archivedAt }).from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.code)),
    db.select({ projectId: projectWorkspaces.projectId, version: projectWorkspaces.version }).from(projectWorkspaces),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.status, "ACTIVE"), isNull(users.deletedAt))).orderBy(asc(users.name)),
    db.select().from(projectWorkspaceImports).where(inArray(projectWorkspaceImports.idempotencyKey, source.projects.map(({ legacyId }) => `project-workspace-import:${source.sourceHash}:${legacyId}`))),
  ]);
  const projectsById = new Map(projectRows.map((row) => [row.id, row]));
  const workspacesByProject = new Map(workspaceRows.map((row) => [row.projectId, row]));
  const usersById = new Map(userRows.map((row) => [row.id, row]));
  const usersByName = new Map<string, typeof userRows>();
  for (const user of userRows) usersByName.set(normalizeName(user.name), [...(usersByName.get(normalizeName(user.name)) ?? []), user]);
  const ledgerByKey = new Map(ledgerRows.map((row) => [row.idempotencyKey, row]));
  const normalizedUserMapping = userMapByNormalizedName(userMapping);
  const team = [...referencedNamesAcrossSource(source.projects)].map((name) => {
    const candidates = usersByName.get(normalizeName(name)) ?? [];
    return {
      sourceName: name,
      candidates: candidates.map((candidate) => ({ id: candidate.id, label: `${candidate.name} <${candidate.email}>` })),
      suggestedUserId: candidates.length === 1 ? candidates[0].id : null,
      ambiguous: candidates.length > 1,
    };
  });
  const sourceIds = new Set(source.projects.map(({ legacyId }) => legacyId));
  for (const key of Object.keys(projectMapping)) if (!sourceIds.has(key)) issues.push({ severity: "ERROR", code: "UNKNOWN_PROJECT_MAPPING", legacyId: key, message: "Project mapping does not exist in source" });
  const referenced = new Map<string, string>();
  for (const { project } of source.projects) for (const name of referencedNames(project)) if (!referenced.has(normalizeName(name))) referenced.set(normalizeName(name), name);
  for (const [key, name] of referenced) {
    if (!normalizedUserMapping.has(key)) {
      const candidates = usersByName.get(key) ?? [];
      issues.push({
        severity: "ERROR",
        code: candidates.length > 1 ? "USER_NAME_AMBIGUOUS" : "USER_MAPPING_REQUIRED",
        field: name,
        message: candidates.length > 1 ? `Multiple active users match ${name}; explicit mapping required` : `Explicit user mapping required for ${name}; use null to leave unresolved`,
        candidates: candidates.map((candidate) => ({ id: candidate.id, label: `${candidate.name} <${candidate.email}>` })),
      });
    }
  }
  for (const name of Object.keys(userMapping)) if (!referenced.has(normalizeName(name))) issues.push({ severity: "ERROR", code: "UNKNOWN_USER_MAPPING", field: name, message: "User mapping name does not occur in the source" });
  for (const [name, userId] of Object.entries(userMapping)) if (userId && !usersById.has(userId)) issues.push({ severity: "ERROR", code: "USER_NOT_ACTIVE", field: name, message: `Mapped user ${userId} is not active` });

  const targetIds = new Set<string>();
  const createCodes = new Set<string>();
  const previews = [];
  let costItems = 0;
  let actualZeroAmbiguous = 0;
  let sourceHppCents = BigInt(0);
  for (const { legacyId, project } of source.projects) {
    const mapping = projectMapping[legacyId];
    const idempotencyKey = `project-workspace-import:${source.sourceHash}:${legacyId}`;
    const prior = ledgerByKey.get(idempotencyKey);
    const projectCandidates = projectRows.filter((row) => [row.code, row.brand, row.program].filter(Boolean).some((value) => normalizeName(value!) === normalizeName(project.nama)));
    if (!mapping) {
      issues.push({
        severity: "ERROR",
        code: projectCandidates.length > 1 ? "PROJECT_MATCH_AMBIGUOUS" : "PROJECT_MAPPING_REQUIRED",
        legacyId,
        message: projectCandidates.length > 1 ? "Multiple projects match legacy project name; explicit mapping required" : "Explicit existing-project or create mapping required",
        candidates: projectCandidates.map((candidate) => ({ id: candidate.id, label: `${candidate.code} - ${candidate.brand}` })),
      });
      previews.push({ legacyId, name: project.nama, candidates: projectCandidates, previewId: null });
      continue;
    }
    const hash = mappingHash(source.sourceHash, legacyId, mapping, userMapping);
    if (prior?.status === "SUCCEEDED" && prior.mappingHash !== hash) issues.push({ severity: "ERROR", code: "IDEMPOTENCY_MAPPING_CONFLICT", legacyId, message: "This exact source project was already imported with a different mapping" });
    let targetProjectId: string | null = null;
    let targetProjectVersion: number | null = null;
    let targetWorkspaceVersion: number | null = null;
    if ("projectId" in mapping) {
      const target = projectsById.get(mapping.projectId);
      if (!target) issues.push({ severity: "ERROR", code: "PROJECT_NOT_FOUND", legacyId, message: `Mapped project ${mapping.projectId} was not found` });
      else {
        targetProjectId = target.id;
        targetProjectVersion = target.version;
        if (target.archivedAt) issues.push({ severity: "ERROR", code: "PROJECT_ARCHIVED", legacyId, message: "Archived project is read-only" });
        const workspace = workspacesByProject.get(target.id);
        if (workspace && prior?.status !== "SUCCEEDED") {
          targetWorkspaceVersion = workspace.version;
          issues.push({ severity: "ERROR", code: "WORKSPACE_EXISTS", legacyId, message: "Target project already has a workspace; only exact idempotent replay is allowed" });
        }
        if (targetIds.has(target.id)) issues.push({ severity: "ERROR", code: "DUPLICATE_TARGET_PROJECT", legacyId, message: "Two legacy projects cannot target the same project" });
        targetIds.add(target.id);
      }
    } else {
      const codeKey = normalizeName(mapping.create.code);
      if (createCodes.has(codeKey) || projectRows.some((row) => normalizeName(row.code) === codeKey)) issues.push({ severity: "ERROR", code: "PROJECT_CODE_CONFLICT", legacyId, message: `Project code ${mapping.create.code} already exists or is duplicated in this import` });
      createCodes.add(codeKey);
    }
    try {
      const plan = buildLegacyProjectPlan(legacyId, project, userMapping);
      costItems += plan.counts.costItems;
      actualZeroAmbiguous += project.items.filter((item) => item.realisasi === "0.00").length;
      sourceHppCents += project.items.reduce((sum, item) => sum + decimalProductCents(item.vol, item.harga), BigInt(0));
      if (plan.counts.completedStagesRequiringReview) issues.push({ severity: "WARNING", code: "LEGACY_COMPLETION_REQUIRES_REVIEW", legacyId, message: `${plan.counts.completedStagesRequiringReview} completed legacy stages will import as IN_REVIEW without actualEnd` });
    } catch (error) {
      issues.push({ severity: "ERROR", code: "MAPPING_POLICY_VIOLATION", legacyId, message: error instanceof Error ? error.message : "Invalid mapping" });
    }
    previews.push({ legacyId, name: project.nama, candidates: projectCandidates, previewId: prior?.status === "SUCCEEDED" && prior.mappingHash === hash ? prior.id : null, mappingHash: hash, targetProjectId, targetProjectVersion, targetWorkspaceVersion, alreadyImported: prior?.status === "SUCCEEDED" && prior.mappingHash === hash });
  }

  const shared = {
    source: { hash: source.sourceHash, bytes: source.sourceBytes, projects: source.projects.length },
    team,
    existingProjects: projectRows.map((project) => ({ ...project, workspaceVersion: workspacesByProject.get(project.id)?.version ?? null, hasWorkspace: workspacesByProject.has(project.id) })),
    reconciliation: {
      totals: {
        create: Object.values(projectMapping).filter((mapping) => "create" in mapping).length,
        update: Object.values(projectMapping).filter((mapping) => "projectId" in mapping).length,
        unchanged: previews.filter((preview) => preview.alreadyImported).length,
        skipped: 0,
        mappedUsers: Object.values(userMapping).filter(Boolean).length,
        unmappedUsers: Object.values(userMapping).filter((value) => value === null).length,
        warnings: issues.filter((issue) => issue.severity === "WARNING").length,
        errors: issues.filter((issue) => issue.severity === "ERROR").length,
      },
      hpp: { create: costItems, update: 0, unchanged: 0, actualZeroAmbiguous, sourceTotal: centsToNumber(sourceHppCents), targetTotal: centsToNumber(sourceHppCents) },
    },
  };

  if (issues.some((issue) => issue.severity === "ERROR")) return { ...shared, canCommit: false, issues, projects: previews };

  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
  for (const preview of previews) {
    if (preview.alreadyImported || !preview.mappingHash) continue;
    const idempotencyKey = `project-workspace-import:${source.sourceHash}:${preview.legacyId}`;
    preview.previewId = await savePreviewLedger({ actorId, expiresAt, idempotencyKey, legacyId: preview.legacyId, mappingHash: preview.mappingHash, sourceBytes: source.sourceBytes, sourceHash: source.sourceHash, targetProjectId: preview.targetProjectId, targetProjectVersion: preview.targetProjectVersion, targetWorkspaceVersion: preview.targetWorkspaceVersion });
  }
  return { ...shared, canCommit: true, expiresAt: expiresAt.toISOString(), issues, projects: previews };
}

async function assertAssignmentCompatibility(tx: WorkspaceTransaction, projectId: string, assignments: Array<{ role: string; userId: string }>) {
  const active = await tx.select({ role: projectAssignments.role, userId: projectAssignments.userId }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.active, true)));
  const combined = [...active, ...assignments];
  for (const role of ["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER", "FINANCE_ADMIN"]) {
    if (new Set(combined.filter((assignment) => assignment.role === role).map((assignment) => assignment.userId)).size > 1) throw new HttpError(409, `Target project already has a conflicting ${role} assignment`);
  }
  const picUsers = new Set(combined.filter((assignment) => assignment.role === "PIC").map((assignment) => assignment.userId));
  if (combined.some((assignment) => assignment.role === "FINANCE_ADMIN" && picUsers.has(assignment.userId))) throw new HttpError(409, "The same user cannot hold PIC and FINANCE_ADMIN roles on one project");
  return active;
}

async function assertMappedUsersActive(tx: WorkspaceTransaction, userMapping: UserMapping) {
  const ids = [...new Set(Object.values(userMapping).filter((userId): userId is string => Boolean(userId)))];
  if (!ids.length) return;
  const active = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, "ACTIVE"), isNull(users.deletedAt)));
  if (active.length !== ids.length) throw new HttpError(409, "A mapped user is no longer active; run preview again");
}

async function commitOneProject(actorId: string, source: ParsedLegacyWorkspaceExport, legacyId: string, project: LegacyProject, mapping: CommitProjectMapping[string], userMapping: UserMapping) {
  const baseMapping = "projectId" in mapping ? { projectId: mapping.projectId } : { create: mapping.create };
  const hash = mappingHash(source.sourceHash, legacyId, baseMapping, userMapping);
  const idempotencyKey = `project-workspace-import:${source.sourceHash}:${legacyId}`;
  return db.transaction(async (tx) => {
    const [ledger] = await tx.select().from(projectWorkspaceImports).where(eq(projectWorkspaceImports.id, mapping.previewId)).for("update").limit(1);
    if (!ledger || ledger.idempotencyKey !== idempotencyKey) throw new HttpError(409, "Preview binding is missing or belongs to another source");
    if (ledger.mappingHash !== hash) throw new HttpError(409, "Import mappings changed after preview; run preview again");
    if (ledger.status === "SUCCEEDED") return { legacyId, projectId: ledger.targetProjectId, jobId: ledger.dataJobId, idempotent: true };
    if (ledger.createdBy !== actorId) throw new HttpError(409, "Preview binding belongs to another import session");
    if (ledger.status !== "PREVIEWED" || ledger.previewExpiresAt.getTime() < Date.now()) throw new HttpError(409, "Preview expired or is no longer committable; run preview again");
    await tx.update(projectWorkspaceImports).set({ status: "PROCESSING", updatedAt: new Date() }).where(eq(projectWorkspaceImports.id, ledger.id));

    let projectId: string;
    if ("projectId" in mapping) {
      const [target] = await tx.select().from(projects).where(and(eq(projects.id, mapping.projectId), isNull(projects.deletedAt))).for("update").limit(1);
      if (!target) throw new HttpError(404, "Mapped project not found");
      if (target.archivedAt) throw new HttpError(409, "Archived project is read-only");
      const [workspace] = await tx.select({ version: projectWorkspaces.version }).from(projectWorkspaces).where(eq(projectWorkspaces.projectId, target.id)).for("update").limit(1);
      assertLegacyImportTargetFresh({ currentProjectVersion: target.version, currentWorkspaceVersion: workspace?.version ?? null, expectedProjectVersion: ledger.targetProjectVersion, expectedWorkspaceVersion: ledger.targetWorkspaceVersion });
      projectId = target.id;
    } else {
      const [created] = await tx.insert(projects).values({
        code: mapping.create.code,
        brand: mapping.create.brand ?? project.nama,
        program: mapping.create.program ?? (project.klien || null),
        category: mapping.create.category ?? (project.jenis || null),
        status: "BACKLOG",
        progress: 0,
        notes: project.catatan || null,
      }).returning();
      projectId = created.id;
    }

    const plan = buildLegacyProjectPlan(legacyId, project, userMapping);
    await assertMappedUsersActive(tx, userMapping);
    const activeAssignments = await assertAssignmentCompatibility(tx, projectId, plan.assignments);
    const existingAssignmentKeys = new Set(activeAssignments.map((assignment) => `${assignment.role}:${assignment.userId}`));
    const newAssignments = plan.assignments.filter((assignment) => !existingAssignmentKeys.has(`${assignment.role}:${assignment.userId}`));
    const now = new Date();
    await tx.update(projects).set({
      status: plan.project.status,
      progress: plan.project.progress,
      startDate: plan.project.startDate,
      dueDate: plan.project.dueDate,
      version: sql`${projects.version} + 1`,
      updatedAt: now,
    }).where(eq(projects.id, projectId));
    await tx.insert(projectWorkspaces).values({ projectId, ...plan.workspace });
    await tx.insert(projectPhaseInstances).values(plan.phases.map((phase) => ({ projectId, ...phase })));
    await tx.insert(projectStageInstances).values(plan.stages.map((stage) => ({ projectId, ...stage })));
    await tx.insert(projectDocumentRequirements).values(plan.documents.map((document) => ({
      projectId,
      ...document,
      reviewedBy: document.status === "LEGACY_CONFIRMED" ? actorId : null,
      reviewedAt: document.status === "LEGACY_CONFIRMED" ? now : null,
      reviewNote: document.status === "LEGACY_CONFIRMED" ? `Imported from legacy source ${source.sourceHash}` : null,
    })));
    if (plan.costItems.length) await tx.insert(projectCostItems).values(plan.costItems.map((item) => ({ projectId, ...item })));
    if (newAssignments.length) await tx.insert(projectAssignments).values(newAssignments.map((assignment) => ({ projectId, ...assignment })));
    const [job] = await tx.insert(dataJobs).values({
      kind: "IMPORT",
      resourceType: "PROJECT_WORKSPACE",
      status: "SUCCEEDED",
      createdBy: actorId,
      filters: { sourceHash: source.sourceHash, legacyId },
      summary: { projectId, ...plan.counts, sourceStored: false },
      completedAt: now,
    }).returning();
    await tx.update(projectWorkspaceImports).set({
      status: "SUCCEEDED",
      targetProjectId: projectId,
      dataJobId: job.id,
      summary: { projectId, ...plan.counts, sourceStored: false },
      committedAt: now,
      updatedAt: now,
    }).where(eq(projectWorkspaceImports.id, ledger.id));
    await tx.insert(auditEvents).values({
      actorId,
      action: "project.workspace.legacy_imported",
      entityType: "PROJECT",
      entityId: projectId,
      correlationId: ledger.id,
      metadata: { importId: ledger.id, jobId: job.id, sourceHash: source.sourceHash, legacyId, ...plan.counts, sourceStored: false },
    });
    return { legacyId, projectId, jobId: job.id, idempotent: false };
  });
}

async function markImportFailed(actorId: string, previewId: string, error: unknown) {
  const message = legacyImportPublicErrorMessage(error);
  await db.transaction(async (tx) => {
    const [ledger] = await tx.select().from(projectWorkspaceImports).where(and(eq(projectWorkspaceImports.id, previewId), eq(projectWorkspaceImports.createdBy, actorId))).for("update").limit(1);
    if (!ledger || ledger.status === "SUCCEEDED") return;
    await tx.update(projectWorkspaceImports).set({ status: "FAILED", error: message, updatedAt: new Date() }).where(eq(projectWorkspaceImports.id, ledger.id));
    await tx.insert(auditEvents).values({ actorId, action: "project.workspace.legacy_import_failed", entityType: "PROJECT_WORKSPACE_IMPORT", entityId: ledger.id, result: "FAILURE", correlationId: ledger.id, metadata: { sourceHash: ledger.sourceHash, legacyId: ledger.legacyId, error: message } });
  });
}

export function legacyImportPublicErrorMessage(error: unknown) {
  return error instanceof HttpError ? error.message.slice(0, 2000) : "Import failed";
}

export async function commitLegacyWorkspaceImport(actorId: string, buffer: Buffer, projectMappingInput: CommitProjectMapping, userMappingInput: UserMapping) {
  const source = parseLegacyWorkspaceExport(buffer);
  const projectMapping = legacyCommitProjectMappingSchema.parse(projectMappingInput);
  const userMapping = legacyUserMappingSchema.parse(userMappingInput);
  const sourceIds = new Set(source.projects.map(({ legacyId }) => legacyId));
  if (Object.keys(projectMapping).length !== source.projects.length || Object.keys(projectMapping).some((legacyId) => !sourceIds.has(legacyId))) throw new HttpError(422, "Commit requires one preview-bound project mapping for every source project");
  const results: Array<{ legacyId: string; projectId: string | null; jobId: string | null; idempotent: boolean } | { legacyId: string; error: string }> = [];
  for (const { legacyId, project } of source.projects) {
    const mapping = projectMapping[legacyId];
    try {
      results.push(await commitOneProject(actorId, source, legacyId, project, mapping, userMapping));
    } catch (error) {
      if (!(error instanceof HttpError)) console.error("Legacy workspace import failed", { legacyId, previewId: mapping.previewId }, error);
      await markImportFailed(actorId, mapping.previewId, error);
      results.push({ legacyId, error: legacyImportPublicErrorMessage(error) });
    }
  }
  const succeeded = results.filter((result) => !("error" in result)).length;
  return { source: { hash: source.sourceHash, bytes: source.sourceBytes, projects: source.projects.length }, status: succeeded === results.length ? "SUCCEEDED" : succeeded ? "PARTIALLY_SUCCEEDED" : "FAILED", succeeded, failed: results.length - succeeded, results };
}
