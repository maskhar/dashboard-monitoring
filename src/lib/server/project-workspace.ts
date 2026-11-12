import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalActions,
  approvals,
  auditEvents,
  evidence,
  notificationJobs,
  projectAssignments,
  projectCostItems,
  projectDocumentRequirements,
  projectPhaseInstances,
  projects,
  projectStageInstances,
  projectWorkspaces,
  users,
} from "@/db/schema";
import { calculateProjectWorkspaceMetrics, percentageSumIsBelowHundred } from "@/lib/project-workspace-metrics";
import { canAccessEntity, type Actor } from "./access";
import { HttpError } from "./authz";
import { prepareEvidenceUpload } from "./evidence";

export const PROJECT_COST_CATEGORIES = [
  "FRAME_PANEL_MATERIAL",
  "FINISHING",
  "ELECTRICAL",
  "PRINTING_BRANDING",
  "SUPPORTING_MATERIAL",
  "LABOR",
  "OPERATIONS",
  "SHIPPING",
] as const;

export const PROJECT_WORKSPACE_ROLES = [
  "PIC",
  "PIC_ASSISTANT",
  "DESIGNER",
  "PROJECT_LEADER",
  "PRODUCTION_TEAM",
  "FINANCE_ADMIN",
  "INSTALLATION_SUPPORT",
] as const;

export type ProjectWorkspaceRole = typeof PROJECT_WORKSPACE_ROLES[number];

export type WorkStatus = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED" | "BLOCKED" | "CANCELLED";
export type CommercialStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "LOCKED";
export type DocumentReviewStatus = "ACCEPTED" | "REJECTED" | "WAIVED";
export type CommercialAction = "SUBMIT" | "APPROVE" | "LOCK";
export type PhaseDecision = "APPROVED" | "REJECTED";

const SINGLETON_WORKSPACE_ROLES = new Set<ProjectWorkspaceRole>(["PIC", "PROJECT_LEADER", "FINANCE_ADMIN", "DESIGNER", "PIC_ASSISTANT"]);
const FINANCIAL_WORKSPACE_ROLES = new Set<ProjectWorkspaceRole>(["PIC", "PROJECT_LEADER", "FINANCE_ADMIN"]);
const DOCUMENT_UPLOAD_ROLES: Record<number, ReadonlySet<ProjectWorkspaceRole>> = {
  1: new Set(["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER"]),
  2: new Set(["PIC", "PIC_ASSISTANT", "FINANCE_ADMIN"]),
  3: new Set(["PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER"]),
  4: new Set(["PIC_ASSISTANT", "PROJECT_LEADER"]),
  5: new Set(["PIC", "PIC_ASSISTANT", "PROJECT_LEADER"]),
  6: new Set(["PIC_ASSISTANT", "PROJECT_LEADER", "FINANCE_ADMIN"]),
};

const PHASE_TEMPLATES = [
  { phaseNumber: 1, code: "G1", name: "Penawaran", decisionOwnerRole: "PIC", status: "ACTIVE" },
  { phaseNumber: 2, code: "G2", name: "Kontrak", decisionOwnerRole: "FINANCE_ADMIN", status: "WAITING" },
  { phaseNumber: 3, code: "G3", name: "Perencanaan", decisionOwnerRole: "PROJECT_LEADER", status: "WAITING" },
  { phaseNumber: 4, code: "G4", name: "Produksi", decisionOwnerRole: "PROJECT_LEADER", status: "WAITING" },
  { phaseNumber: 5, code: "G5", name: "Instalasi & serah terima", decisionOwnerRole: "PIC", status: "WAITING" },
  { phaseNumber: 6, code: "CLOSE", name: "Penagihan & tutup buku", decisionOwnerRole: "FINANCE_ADMIN", status: "WAITING" },
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

export class ProjectWorkspaceVersionConflict extends HttpError {
  constructor(public current: unknown, message = "Workspace data changed; reload before saving") {
    super(409, message);
  }
}

export function assertProjectWorkspaceVersion(current: { version: number }, expectedVersion: number) {
  if (current.version !== expectedVersion) throw new ProjectWorkspaceVersionConflict(current);
}

async function assertProjectAccess(actor: Actor, projectId: string) {
  if (!await canAccessEntity(actor, "PROJECT", projectId)) throw new HttpError(403, "Forbidden");
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

async function assertProjectMutable(actor: Actor, projectId: string) {
  const project = await assertProjectAccess(actor, projectId);
  assertProjectMutationAllowed(project);
  return project;
}

async function assignmentRoles(projectId: string, userId: string) {
  const rows = await db.select({ role: projectAssignments.role }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.userId, userId), eq(projectAssignments.active, true)));
  return new Set(rows.map((row) => row.role));
}

async function requireWorkspace(projectId: string) {
  const [workspace] = await db.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);
  if (!workspace) throw new HttpError(404, "Project workspace not initialized");
  return workspace;
}

export function canViewProjectWorkspaceFinancials(actor: Actor, roles: Iterable<string>) {
  if (actor.role === "ADMIN") return true;
  for (const role of roles) if (FINANCIAL_WORKSPACE_ROLES.has(role as ProjectWorkspaceRole)) return true;
  return false;
}

export function assertProjectMutationAllowed(project: { archivedAt: Date | null }) {
  if (project.archivedAt) throw new HttpError(409, "Archived projects are read-only");
}

export function presentProjectWorkspaceFinancials<TWorkspace extends Record<string, unknown>, TCost>(actor: Actor, roles: Iterable<string>, workspace: TWorkspace, financialMetrics: Record<string, unknown>, costItems: TCost[]) {
  if (canViewProjectWorkspaceFinancials(actor, roles)) return { workspace, financialMetrics, costItems };
  return {
    workspace: { ...workspace, contractValue: null, currency: null, targetMarginPct: null, retentionPct: null, overheadPct: null, contingencyPct: null, vatEnabled: false, vatPct: null, withholdingEnabled: false, withholdingPct: null },
    financialMetrics: {},
    costItems: [] as TCost[],
  };
}

export function projectCommercialTransition(current: CommercialStatus, action: CommercialAction, isAdmin: boolean): CommercialStatus {
  if (action === "SUBMIT" && current === "DRAFT") return "SUBMITTED";
  if (action === "APPROVE" && isAdmin && current === "SUBMITTED") return "APPROVED";
  if (action === "LOCK" && isAdmin && current === "APPROVED") return "LOCKED";
  throw new HttpError(409, `Commercial status cannot transition from ${current} using ${action}`);
}

type WorkspaceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function recalculateProjectPhaseReadiness(tx: WorkspaceTransaction, projectId: string, actorId?: string, cancellationReason = "Phase requirements changed") {
  const [phases, documents] = await Promise.all([
    tx.select().from(projectPhaseInstances).where(eq(projectPhaseInstances.projectId, projectId)).orderBy(asc(projectPhaseInstances.phaseNumber)),
    tx.select({ phaseNumber: projectDocumentRequirements.phaseNumber, required: projectDocumentRequirements.required, status: projectDocumentRequirements.status }).from(projectDocumentRequirements).where(eq(projectDocumentRequirements.projectId, projectId)),
  ]);
  const currentPhase = phases.find((phase) => phase.status !== "PASSED")?.phaseNumber ?? 6;
  const changedPhases: Array<{ id: string; from: string; to: string }> = [];
  const cancelledApprovalIds: string[] = [];

  for (const phase of phases) {
    if (phase.status === "PASSED") continue;
    const required = documents.filter((document) => document.phaseNumber === phase.phaseNumber && document.required);
    const ready = required.every((document) => document.status === "ACCEPTED" || document.status === "WAIVED");
    const status = phase.phaseNumber === currentPhase
      ? ready ? (phase.status === "APPROVAL_PENDING" ? "APPROVAL_PENDING" : "READY") : "ACTIVE"
      : "WAITING";
    if (status === phase.status) continue;
    if (phase.status === "APPROVAL_PENDING" && status !== "APPROVAL_PENDING") {
      const pending = await tx.select().from(approvals).where(and(eq(approvals.entityType, "PROJECT_PHASE"), eq(approvals.entityId, phase.id), eq(approvals.approvalType, "PROJECT_GATE_APPROVAL"), eq(approvals.status, "PENDING"))).for("update");
      if (pending.length) {
        const now = new Date();
        await tx.update(approvals).set({ status: "CANCELLED", decidedBy: actorId ?? null, decidedAt: now, decisionNote: cancellationReason }).where(inArray(approvals.id, pending.map((approval) => approval.id)));
        if (actorId) await tx.insert(approvalActions).values(pending.map((approval) => ({ approvalId: approval.id, action: "CANCELLED", actorId, note: cancellationReason })));
        cancelledApprovalIds.push(...pending.map((approval) => approval.id));
      }
    }
    await tx.update(projectPhaseInstances).set({ status, version: sql`${projectPhaseInstances.version} + 1`, updatedAt: new Date() }).where(and(eq(projectPhaseInstances.id, phase.id), eq(projectPhaseInstances.version, phase.version)));
    changedPhases.push({ id: phase.id, from: phase.status, to: status });
  }

  await tx.update(projectWorkspaces).set({ currentPhase, version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(eq(projectWorkspaces.projectId, projectId));
  return { currentPhase, changedPhases, cancelledApprovalIds };
}

function canManageProfile(actor: Actor, roles: Set<string>) {
  return actor.role === "ADMIN" || roles.has("PIC") || roles.has("PROJECT_LEADER");
}

function canManagePlan(actor: Actor, roles: Set<string>) {
  return actor.role === "ADMIN" || roles.has("PROJECT_LEADER");
}

function canManageActual(actor: Actor, roles: Set<string>) {
  return actor.role === "ADMIN" || roles.has("PROJECT_LEADER") || roles.has("FINANCE_ADMIN");
}

export function assertProjectCostMutationAllowed(workspace: Pick<typeof projectWorkspaces.$inferSelect, "commercialStatus">, actor: Actor, overrideReason?: string) {
  if (workspace.commercialStatus === "DRAFT") return;
  if (workspace.commercialStatus === "LOCKED" && actor.role === "ADMIN" && overrideReason?.trim()) return;
  throw new HttpError(409, `Cost items cannot be changed while commercial status is ${workspace.commercialStatus}`);
}

export function canUploadProjectPhaseDocument(actor: Actor, roles: Iterable<string>, phaseNumber: number) {
  if (actor.role === "ADMIN") return true;
  const allowed = DOCUMENT_UPLOAD_ROLES[phaseNumber];
  return Boolean(allowed && [...roles].some((role) => allowed.has(role as ProjectWorkspaceRole)));
}

async function assertDocumentReplacementAllowed(tx: WorkspaceTransaction, projectId: string, requirement: typeof projectDocumentRequirements.$inferSelect) {
  const [phase] = await tx.select({ status: projectPhaseInstances.status }).from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), eq(projectPhaseInstances.phaseNumber, requirement.phaseNumber))).limit(1);
  if (!phase) throw new HttpError(404, "Project phase not found");
  if (phase.status === "PASSED") throw new HttpError(409, "Reopen the passed phase before replacing evidence");
  if (requirement.status === "ACCEPTED") throw new HttpError(409, "Reset the accepted document before replacing evidence");
}

async function assertDocumentUploadPreparationAllowed(actor: Actor, roles: Set<string>, projectId: string, requirementId: string) {
  const [row] = await db.select({ requirement: projectDocumentRequirements, phaseStatus: projectPhaseInstances.status }).from(projectDocumentRequirements).innerJoin(projectPhaseInstances, and(eq(projectPhaseInstances.projectId, projectDocumentRequirements.projectId), eq(projectPhaseInstances.phaseNumber, projectDocumentRequirements.phaseNumber))).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.projectId, projectId))).limit(1);
  if (!row) throw new HttpError(404, "Document requirement not found");
  if (!canUploadProjectPhaseDocument(actor, roles, row.requirement.phaseNumber)) throw new HttpError(403, "Your project role cannot upload evidence for this phase");
  if (row.phaseStatus === "PASSED") throw new HttpError(409, "Reopen the passed phase before replacing evidence");
  if (row.requirement.status === "ACCEPTED") throw new HttpError(409, "Reset the accepted document before replacing evidence");
}

function businessDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function initializeProjectWorkspace(actor: Actor, projectId: string) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  await db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).for("update").limit(1);
    if (!project) throw new HttpError(404, "Project not found");
    assertProjectMutationAllowed(project);
    const [existing] = await tx.select({ projectId: projectWorkspaces.projectId }).from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).limit(1);
    if (existing) throw new HttpError(409, "Project workspace already initialized");

    await tx.insert(projectWorkspaces).values({ projectId });
    await tx.insert(projectPhaseInstances).values(PHASE_TEMPLATES.map((phase) => ({ projectId, ...phase })));
    await tx.insert(projectStageInstances).values(STAGE_TEMPLATES.map((stage, index) => ({ projectId, stageNumber: index + 1, ...stage })));
    await tx.insert(projectDocumentRequirements).values(DOCUMENT_TEMPLATES.map((document) => ({ projectId, ...document })));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      action: "project.workspace.created",
      entityType: "PROJECT",
      entityId: projectId,
      metadata: { phases: PHASE_TEMPLATES.length, stages: STAGE_TEMPLATES.length, documents: DOCUMENT_TEMPLATES.length },
    });
  });
  return getProjectWorkspace(actor, projectId);
}

export async function getProjectWorkspace(actor: Actor, projectId: string) {
  const project = await assertProjectAccess(actor, projectId);
  const workspace = await requireWorkspace(projectId);
  const [assignments, phases, stages, costItems, documents] = await Promise.all([
    db.select({ id: projectAssignments.id, userId: projectAssignments.userId, role: projectAssignments.role, active: projectAssignments.active, assignedAt: projectAssignments.assignedAt, name: users.name, email: users.email }).from(projectAssignments).innerJoin(users, eq(projectAssignments.userId, users.id)).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.active, true))).orderBy(asc(projectAssignments.assignedAt)),
    db.select().from(projectPhaseInstances).where(eq(projectPhaseInstances.projectId, projectId)).orderBy(asc(projectPhaseInstances.phaseNumber)),
    db.select().from(projectStageInstances).where(eq(projectStageInstances.projectId, projectId)).orderBy(asc(projectStageInstances.stageNumber)),
    db.select().from(projectCostItems).where(and(eq(projectCostItems.projectId, projectId), isNull(projectCostItems.archivedAt), isNull(projectCostItems.deletedAt))).orderBy(asc(projectCostItems.position), asc(projectCostItems.createdAt)),
    db.select({
      id: projectDocumentRequirements.id,
      projectId: projectDocumentRequirements.projectId,
      phaseNumber: projectDocumentRequirements.phaseNumber,
      code: projectDocumentRequirements.code,
      label: projectDocumentRequirements.label,
      required: projectDocumentRequirements.required,
      status: projectDocumentRequirements.status,
      attachmentId: projectDocumentRequirements.attachmentId,
      reviewedBy: projectDocumentRequirements.reviewedBy,
      reviewedAt: projectDocumentRequirements.reviewedAt,
      reviewNote: projectDocumentRequirements.reviewNote,
      version: projectDocumentRequirements.version,
      createdAt: projectDocumentRequirements.createdAt,
      updatedAt: projectDocumentRequirements.updatedAt,
      attachment: { id: evidence.id, originalName: evidence.originalName, scanStatus: evidence.scanStatus },
    }).from(projectDocumentRequirements).leftJoin(evidence, and(eq(projectDocumentRequirements.attachmentId, evidence.id), isNull(evidence.deletedAt))).where(eq(projectDocumentRequirements.projectId, projectId)).orderBy(asc(projectDocumentRequirements.phaseNumber), asc(projectDocumentRequirements.createdAt)),
  ]);
  const financialMetrics = calculateProjectWorkspaceMetrics(workspace, costItems);
  const today = businessDate();
  const completedStages = stages.filter((stage) => stage.status === "COMPLETED").length;
  const lateStages = stages.filter((stage) => Boolean(stage.plannedEnd && stage.plannedEnd < today && stage.status !== "COMPLETED" && stage.status !== "CANCELLED")).length;
  const requiredDocuments = documents.filter((document) => document.required).length;
  const acceptedDocuments = documents.filter((document) => document.required && (document.status === "ACCEPTED" || document.status === "WAIVED")).length;
  const actorRoles = assignments.filter((assignment) => assignment.userId === actor.id).map((assignment) => assignment.role);
  const financialPresentation = presentProjectWorkspaceFinancials(actor, actorRoles, workspace, financialMetrics, costItems);
  const operationalMetrics = { completedStages, totalStages: stages.length, lateStages, acceptedDocuments, requiredDocuments };

  return {
    project,
    workspace: financialPresentation.workspace,
    metrics: { ...financialPresentation.financialMetrics, ...operationalMetrics },
    assignments,
    phases,
    stages,
    costItems: financialPresentation.costItems,
    documents,
  };
}

async function lockProjectPhase(tx: WorkspaceTransaction, projectId: string, phaseId: string, version: number) {
  const [phase] = await tx.select().from(projectPhaseInstances).where(and(eq(projectPhaseInstances.id, phaseId), eq(projectPhaseInstances.projectId, projectId))).for("update").limit(1);
  if (!phase) throw new HttpError(404, "Project phase not found");
  if (phase.version !== version) throw new ProjectWorkspaceVersionConflict(phase, "Project phase changed; reload before saving");
  return phase;
}

export async function changeProjectCommercialStatus(actor: Actor, projectId: string, input: { action: CommercialAction; version: number; note?: string | null }) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  if (input.action === "SUBMIT" && !canViewProjectWorkspaceFinancials(actor, roles)) throw new HttpError(403, "Only PIC, Project Leader, Finance, or ADMIN can submit commercial data");
  if (input.action !== "SUBMIT" && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can approve or lock commercial data");
  return db.transaction(async (tx) => {
    const current = await lockWorkspace(tx, projectId);
    if (current.version !== input.version) throw new ProjectWorkspaceVersionConflict(current);
    const commercialStatus = projectCommercialTransition(current.commercialStatus as CommercialStatus, input.action, actor.role === "ADMIN");
    const now = new Date();
    const [updated] = await tx.update(projectWorkspaces).set({ commercialStatus, version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, input.version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: `project.commercial.${input.action.toLowerCase()}`, entityType: "PROJECT", entityId: projectId, changes: { from: current.commercialStatus, to: commercialStatus }, metadata: { note: input.note?.trim() || null } });
    if (input.action === "SUBMIT") await tx.insert(notificationJobs).values({ eventType: "PROJECT_COMMERCIAL_SUBMITTED", channel: "IN_APP", recipient: "ADMIN", payload: { projectId, version: updated.version }, idempotencyKey: `project:${projectId}:commercial:${updated.version}:submitted` }).onConflictDoNothing();
    return updated;
  });
}

export async function submitProjectPhase(actor: Actor, projectId: string, phaseId: string, version: number) {
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const phase = await lockProjectPhase(tx, projectId, phaseId, version);
    if (phase.status !== "READY") throw new HttpError(409, "Only READY phases can be submitted");
    if (actor.role !== "ADMIN") {
      const [owner] = await tx.select({ id: projectAssignments.id }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.userId, actor.id), eq(projectAssignments.role, phase.decisionOwnerRole), eq(projectAssignments.active, true))).limit(1);
      if (!owner) throw new HttpError(403, "Only the phase decision owner or ADMIN can submit this phase");
    }
    const [approval] = await tx.insert(approvals).values({ entityType: "PROJECT_PHASE", entityId: phase.id, approvalType: "PROJECT_GATE_APPROVAL", requestedBy: actor.id, submittedSnapshot: { projectId, phaseNumber: phase.phaseNumber, code: phase.code, name: phase.name }, baseVersion: version + 1 }).onConflictDoNothing().returning();
    if (!approval) throw new HttpError(409, "A pending phase approval already exists");
    const [updated] = await tx.update(projectPhaseInstances).set({ status: "APPROVAL_PENDING", version: sql`${projectPhaseInstances.version} + 1`, updatedAt: new Date() }).where(and(eq(projectPhaseInstances.id, phaseId), eq(projectPhaseInstances.version, version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(phase, "Project phase changed; reload before saving");
    await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(approvalActions).values({ approvalId: approval.id, action: "SUBMITTED", actorId: actor.id });
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.phase.submitted", entityType: "PROJECT", entityId: projectId, changes: { from: phase, to: updated }, metadata: { phaseId, approvalId: approval.id } });
    await tx.insert(notificationJobs).values({ eventType: "PROJECT_PHASE_SUBMITTED", channel: "IN_APP", recipient: "ADMIN", payload: { projectId, phaseId, approvalId: approval.id }, idempotencyKey: `project-phase:${phaseId}:approval:${approval.id}:submitted` }).onConflictDoNothing();
    return { phase: updated, approval };
  });
}

export async function decideProjectPhase(actor: Actor, projectId: string, phaseId: string, input: { decision: PhaseDecision; version: number; note?: string | null }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  if (input.decision === "REJECTED" && !input.note?.trim()) throw new HttpError(400, "A rejection note is required");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const phase = await lockProjectPhase(tx, projectId, phaseId, input.version);
    if (phase.status !== "APPROVAL_PENDING") throw new HttpError(409, "Only pending phase approvals can be decided");
    const [approval] = await tx.select().from(approvals).where(and(eq(approvals.entityType, "PROJECT_PHASE"), eq(approvals.entityId, phase.id), eq(approvals.approvalType, "PROJECT_GATE_APPROVAL"), eq(approvals.status, "PENDING"))).for("update").limit(1);
    if (!approval) throw new HttpError(409, "Pending phase approval not found");
    if (approval.baseVersion !== input.version) throw new HttpError(409, "Phase changed after approval submission");
    const now = new Date();
    const phaseChanges = input.decision === "APPROVED"
      ? { status: "PASSED", passedAt: now, passedBy: actor.id }
      : { status: "READY", passedAt: null, passedBy: null };
    const [updated] = await tx.update(projectPhaseInstances).set({ ...phaseChanges, version: sql`${projectPhaseInstances.version} + 1`, updatedAt: now }).where(and(eq(projectPhaseInstances.id, phaseId), eq(projectPhaseInstances.version, input.version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(phase, "Project phase changed; reload before saving");
    const [updatedApproval] = await tx.update(approvals).set({ status: input.decision, decidedBy: actor.id, decidedAt: now, decisionNote: input.note?.trim() || null }).where(eq(approvals.id, approval.id)).returning();
    await tx.insert(approvalActions).values({ approvalId: approval.id, action: input.decision, actorId: actor.id, note: input.note?.trim() || null });
    const phaseState = await recalculateProjectPhaseReadiness(tx, projectId);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: input.decision === "APPROVED" ? "project.phase.passed" : "project.phase.rejected", entityType: "PROJECT", entityId: projectId, changes: { from: phase, to: updated }, metadata: { phaseId, approvalId: approval.id, note: input.note?.trim() || null, ...phaseState } });
    await tx.insert(notificationJobs).values({ eventType: "PROJECT_PHASE_DECIDED", channel: "IN_APP", recipient: approval.requestedBy, payload: { projectId, phaseId, approvalId: approval.id, decision: input.decision }, idempotencyKey: `project-phase:${phaseId}:approval:${approval.id}:${input.decision.toLowerCase()}` }).onConflictDoNothing();
    return { phase: updated, approval: updatedApproval };
  });
}

export async function reopenProjectPhase(actor: Actor, projectId: string, phaseId: string, input: { version: number; reason: string }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const phase = await lockProjectPhase(tx, projectId, phaseId, input.version);
    if (phase.status !== "PASSED") throw new HttpError(409, "Only PASSED phases can be reopened");
    const now = new Date();
    const affectedPhases = await tx.select().from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), sql`${projectPhaseInstances.phaseNumber} >= ${phase.phaseNumber}`)).for("update");
    const affectedIds = affectedPhases.map((item) => item.id);
    const downstreamIds = affectedPhases.filter((item) => item.id !== phaseId).map((item) => item.id);
    if (downstreamIds.length) await tx.update(projectPhaseInstances).set({ status: "WAITING", passedAt: null, passedBy: null, version: sql`${projectPhaseInstances.version} + 1`, updatedAt: now }).where(inArray(projectPhaseInstances.id, downstreamIds));
    const [reopened] = await tx.update(projectPhaseInstances).set({ status: "REOPENED", version: sql`${projectPhaseInstances.version} + 1`, updatedAt: now }).where(eq(projectPhaseInstances.id, phaseId)).returning();
    await tx.update(projectDocumentRequirements).set({ status: sql`case when ${projectDocumentRequirements.attachmentId} is null then 'MISSING' else 'UPLOADED' end`, reviewedBy: null, reviewedAt: null, reviewNote: null, version: sql`${projectDocumentRequirements.version} + 1`, updatedAt: now }).where(and(eq(projectDocumentRequirements.projectId, projectId), eq(projectDocumentRequirements.phaseNumber, phase.phaseNumber), inArray(projectDocumentRequirements.status, ["ACCEPTED", "WAIVED"])));
    const downstreamStages = await tx.select().from(projectStageInstances).where(and(eq(projectStageInstances.projectId, projectId), gt(projectStageInstances.phaseNumber, phase.phaseNumber))).for("update");
    if (downstreamStages.length) await tx.update(projectStageInstances).set({ status: "NOT_STARTED", progress: 0, actualStart: null, actualEnd: null, version: sql`${projectStageInstances.version} + 1`, updatedAt: now }).where(inArray(projectStageInstances.id, downstreamStages.map((stage) => stage.id)));
    const pendingApprovals = affectedIds.length ? await tx.select().from(approvals).where(and(eq(approvals.entityType, "PROJECT_PHASE"), inArray(approvals.entityId, affectedIds), eq(approvals.status, "PENDING"))).for("update") : [];
    if (pendingApprovals.length) {
      await tx.update(approvals).set({ status: "CANCELLED", decidedBy: actor.id, decidedAt: now, decisionNote: input.reason }).where(inArray(approvals.id, pendingApprovals.map((approval) => approval.id)));
      await tx.insert(approvalActions).values(pendingApprovals.map((approval) => ({ approvalId: approval.id, action: "CANCELLED", actorId: actor.id, note: input.reason })));
    }
    await tx.update(projectWorkspaces).set({ currentPhase: phase.phaseNumber, version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.phase.reopened", entityType: "PROJECT", entityId: projectId, changes: { from: affectedPhases, to: { reopenedPhase: phaseId, downstreamStatus: "WAITING" } }, metadata: { phaseId, reason: input.reason, resetStageIds: downstreamStages.map((stage) => stage.id), cancelledApprovalIds: pendingApprovals.map((approval) => approval.id) } });
    return reopened;
  });
}

async function lockWorkspace(tx: WorkspaceTransaction, projectId: string) {
  const [project] = await tx.select({ id: projects.id, archivedAt: projects.archivedAt }).from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).for("update").limit(1);
  if (!project) throw new HttpError(404, "Project not found");
  assertProjectMutationAllowed(project);
  const [workspace] = await tx.select().from(projectWorkspaces).where(eq(projectWorkspaces.projectId, projectId)).for("update").limit(1);
  if (!workspace) throw new HttpError(404, "Project workspace not initialized");
  return workspace;
}

async function assertActiveStaff(tx: WorkspaceTransaction, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return;
  const rows = await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, uniqueIds), eq(users.role, "STAFF"), eq(users.status, "ACTIVE"), isNull(users.deletedAt))).for("share");
  if (rows.length !== uniqueIds.length) throw new HttpError(400, "All assignment users must be active STAFF accounts");
}

async function assertAssignmentRoleConflict(tx: WorkspaceTransaction, projectId: string, role: ProjectWorkspaceRole, userIds: string[], excludeAssignmentId?: string) {
  const conflictingRole = role === "PIC" ? "FINANCE_ADMIN" : role === "FINANCE_ADMIN" ? "PIC" : null;
  if (!conflictingRole || !userIds.length) return;
  const filters = [eq(projectAssignments.projectId, projectId), eq(projectAssignments.role, conflictingRole), eq(projectAssignments.active, true), inArray(projectAssignments.userId, userIds)];
  if (excludeAssignmentId) filters.push(ne(projectAssignments.id, excludeAssignmentId));
  const [conflict] = await tx.select({ id: projectAssignments.id }).from(projectAssignments).where(and(...filters)).limit(1);
  if (conflict) throw new HttpError(409, "The same user cannot hold PIC and FINANCE_ADMIN roles on one project");
}

function presentAssignment(row: { assignment: typeof projectAssignments.$inferSelect; user: Pick<typeof users.$inferSelect, "id" | "name" | "email"> }) {
  return { ...row.assignment, user: row.user };
}

async function selectAssignments(tx: WorkspaceTransaction, projectId: string, activeOnly = true) {
  const filters = [eq(projectAssignments.projectId, projectId)];
  if (activeOnly) filters.push(eq(projectAssignments.active, true));
  const rows = await tx.select({ assignment: projectAssignments, user: { id: users.id, name: users.name, email: users.email } }).from(projectAssignments).innerJoin(users, eq(projectAssignments.userId, users.id)).where(and(...filters)).orderBy(asc(projectAssignments.role), asc(projectAssignments.assignedAt));
  return rows.map(presentAssignment);
}

export async function listProjectWorkspaceAssignments(actor: Actor, projectId: string, activeOnly = true) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectAccess(actor, projectId);
  await requireWorkspace(projectId);
  return db.transaction((tx) => selectAssignments(tx, projectId, activeOnly));
}

export async function createProjectWorkspaceAssignment(actor: Actor, projectId: string, input: { userId: string; role: ProjectWorkspaceRole; version: number }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectWorkspaceVersion(workspace, input.version);
    await assertActiveStaff(tx, [input.userId]);
    await assertAssignmentRoleConflict(tx, projectId, input.role, [input.userId]);
    const active = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.active, true))).for("update");
    if (active.some((assignment) => assignment.role === input.role && assignment.userId === input.userId)) throw new HttpError(409, "Workspace assignment already exists");
    const now = new Date();
    const replaced = SINGLETON_WORKSPACE_ROLES.has(input.role) ? active.filter((assignment) => assignment.role === input.role) : [];
    if (replaced.length) await tx.update(projectAssignments).set({ active: false, endedAt: now }).where(inArray(projectAssignments.id, replaced.map((assignment) => assignment.id)));
    const [created] = await tx.insert(projectAssignments).values({ projectId, userId: input.userId, role: input.role }).returning();
    const [updatedWorkspace] = await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, input.version))).returning();
    if (!updatedWorkspace) throw new ProjectWorkspaceVersionConflict(workspace);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.assignment.created", entityType: "PROJECT", entityId: projectId, changes: { from: replaced, to: created }, metadata: { assignmentId: created.id, role: input.role } });
    return created;
  });
}

export async function setProjectWorkspaceRoleAssignments(actor: Actor, projectId: string, input: { role: ProjectWorkspaceRole; userIds: string[]; version: number }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  const userIds = [...new Set(input.userIds)];
  if (SINGLETON_WORKSPACE_ROLES.has(input.role) && userIds.length > 1) throw new HttpError(400, `${input.role} accepts only one active user`);
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectWorkspaceVersion(workspace, input.version);
    await assertActiveStaff(tx, userIds);
    await assertAssignmentRoleConflict(tx, projectId, input.role, userIds);
    const before = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.role, input.role), eq(projectAssignments.active, true))).for("update");
    const desired = new Set(userIds);
    const removed = before.filter((assignment) => !desired.has(assignment.userId));
    const retainedUsers = new Set(before.filter((assignment) => desired.has(assignment.userId)).map((assignment) => assignment.userId));
    const addedUserIds = userIds.filter((userId) => !retainedUsers.has(userId));
    const now = new Date();
    if (removed.length) await tx.update(projectAssignments).set({ active: false, endedAt: now }).where(inArray(projectAssignments.id, removed.map((assignment) => assignment.id)));
    if (addedUserIds.length) await tx.insert(projectAssignments).values(addedUserIds.map((userId) => ({ projectId, userId, role: input.role })));
    if (removed.length || addedUserIds.length) {
      const [updatedWorkspace] = await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, input.version))).returning();
      if (!updatedWorkspace) throw new ProjectWorkspaceVersionConflict(workspace);
      const after = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.role, input.role), eq(projectAssignments.active, true)));
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.assignment.set", entityType: "PROJECT", entityId: projectId, changes: { from: before, to: after }, metadata: { role: input.role } });
    }
    return selectAssignments(tx, projectId);
  });
}

export async function updateProjectWorkspaceAssignment(actor: Actor, projectId: string, assignmentId: string, input: { userId: string; role: ProjectWorkspaceRole; version: number }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectWorkspaceVersion(workspace, input.version);
    const [current] = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.id, assignmentId), eq(projectAssignments.projectId, projectId))).for("update").limit(1);
    if (!current) throw new HttpError(404, "Workspace assignment not found");
    if (!current.active) throw new HttpError(409, "Inactive workspace assignments cannot be updated");
    await assertActiveStaff(tx, [input.userId]);
    await assertAssignmentRoleConflict(tx, projectId, input.role, [input.userId], assignmentId);
    const active = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.active, true), ne(projectAssignments.id, assignmentId))).for("update");
    if (active.some((assignment) => assignment.role === input.role && assignment.userId === input.userId)) throw new HttpError(409, "Workspace assignment already exists");
    const now = new Date();
    const replaced = SINGLETON_WORKSPACE_ROLES.has(input.role) ? active.filter((assignment) => assignment.role === input.role) : [];
    if (replaced.length) await tx.update(projectAssignments).set({ active: false, endedAt: now }).where(inArray(projectAssignments.id, replaced.map((assignment) => assignment.id)));
    const [updated] = await tx.update(projectAssignments).set({ userId: input.userId, role: input.role, assignedAt: now, endedAt: null }).where(eq(projectAssignments.id, assignmentId)).returning();
    const [updatedWorkspace] = await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, input.version))).returning();
    if (!updatedWorkspace) throw new ProjectWorkspaceVersionConflict(workspace);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.assignment.updated", entityType: "PROJECT", entityId: projectId, changes: { from: [current, ...replaced], to: updated }, metadata: { assignmentId } });
    return updated;
  });
}

export async function deactivateProjectWorkspaceAssignment(actor: Actor, projectId: string, assignmentId: string, version: number) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectWorkspaceVersion(workspace, version);
    const [current] = await tx.select().from(projectAssignments).where(and(eq(projectAssignments.id, assignmentId), eq(projectAssignments.projectId, projectId))).for("update").limit(1);
    if (!current) throw new HttpError(404, "Workspace assignment not found");
    if (!current.active) throw new HttpError(409, "Workspace assignment already inactive");
    const now = new Date();
    const [updated] = await tx.update(projectAssignments).set({ active: false, endedAt: now }).where(eq(projectAssignments.id, assignmentId)).returning();
    const [updatedWorkspace] = await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, version))).returning();
    if (!updatedWorkspace) throw new ProjectWorkspaceVersionConflict(workspace);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.assignment.deactivated", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { assignmentId } });
    return updated;
  });
}

async function lockDocumentRequirement(tx: WorkspaceTransaction, projectId: string, requirementId: string, version: number) {
  const [requirement] = await tx.select().from(projectDocumentRequirements).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.projectId, projectId))).for("update").limit(1);
  if (!requirement) throw new HttpError(404, "Document requirement not found");
  if (requirement.version !== version) throw new ProjectWorkspaceVersionConflict(requirement, "Document requirement changed; reload before saving");
  return requirement;
}

async function canReviewDocument(tx: WorkspaceTransaction, actor: Actor, projectId: string, phaseNumber: number) {
  if (actor.role === "ADMIN") return true;
  const [phase] = await tx.select({ decisionOwnerRole: projectPhaseInstances.decisionOwnerRole }).from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), eq(projectPhaseInstances.phaseNumber, phaseNumber))).limit(1);
  if (!phase) throw new HttpError(404, "Project phase not found");
  const [assignment] = await tx.select({ id: projectAssignments.id }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.userId, actor.id), eq(projectAssignments.role, phase.decisionOwnerRole), eq(projectAssignments.active, true))).limit(1);
  return Boolean(assignment);
}

export async function uploadProjectDocumentRequirement(actor: Actor, projectId: string, requirementId: string, version: number, file: File) {
  await assertProjectMutable(actor, projectId);
  await requireWorkspace(projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  await assertDocumentUploadPreparationAllowed(actor, roles, projectId, requirementId);
  const prepared = await prepareEvidenceUpload(actor, file, "PROJECT", projectId);
  try {
    return await db.transaction(async (tx) => {
      await lockWorkspace(tx, projectId);
      const current = await lockDocumentRequirement(tx, projectId, requirementId, version);
      if (!canUploadProjectPhaseDocument(actor, roles, current.phaseNumber)) throw new HttpError(403, "Your project role cannot upload evidence for this phase");
      await assertDocumentReplacementAllowed(tx, projectId, current);
      const [attachment] = await tx.insert(evidence).values(prepared.values).returning();
      const [updated] = await tx.update(projectDocumentRequirements).set({ attachmentId: attachment.id, status: "UPLOADED", reviewedBy: null, reviewedAt: null, reviewNote: null, version: sql`${projectDocumentRequirements.version} + 1`, updatedAt: new Date() }).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.version, version))).returning();
      if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Document requirement changed; reload before saving");
      const phaseState = await recalculateProjectPhaseReadiness(tx, projectId, actor.id, "Document evidence was replaced");
      await tx.insert(auditEvents).values([
        { actorId: actor.id, action: "evidence.uploaded", entityType: "PROJECT", entityId: projectId, metadata: { evidenceId: attachment.id, size: attachment.size, checksum: attachment.checksum, requirementId } },
        { actorId: actor.id, action: "project.document.uploaded", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { requirementId, evidenceId: attachment.id, ...phaseState } },
      ]);
      return { ...updated, attachment: { id: attachment.id, originalName: attachment.originalName, scanStatus: attachment.scanStatus } };
    });
  } catch (error) {
    await prepared.cleanup();
    throw error;
  }
}

export async function linkProjectDocumentEvidence(actor: Actor, projectId: string, requirementId: string, input: { evidenceId: string; version: number }) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const current = await lockDocumentRequirement(tx, projectId, requirementId, input.version);
    if (!canUploadProjectPhaseDocument(actor, roles, current.phaseNumber)) throw new HttpError(403, "Your project role cannot link evidence for this phase");
    await assertDocumentReplacementAllowed(tx, projectId, current);
    const [attachment] = await tx.select().from(evidence).where(and(eq(evidence.id, input.evidenceId), eq(evidence.entityType, "PROJECT"), eq(evidence.entityId, projectId), isNull(evidence.deletedAt))).for("share").limit(1);
    if (!attachment) throw new HttpError(400, "Evidence must belong to this project");
    const [updated] = await tx.update(projectDocumentRequirements).set({ attachmentId: attachment.id, status: "UPLOADED", reviewedBy: null, reviewedAt: null, reviewNote: null, version: sql`${projectDocumentRequirements.version} + 1`, updatedAt: new Date() }).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.version, input.version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Document requirement changed; reload before saving");
    const phaseState = await recalculateProjectPhaseReadiness(tx, projectId, actor.id, "Document evidence was relinked");
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.document.linked", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { requirementId, evidenceId: attachment.id, ...phaseState } });
    return { ...updated, attachment: { id: attachment.id, originalName: attachment.originalName, scanStatus: attachment.scanStatus } };
  });
}

export async function reviewProjectDocumentRequirement(actor: Actor, projectId: string, requirementId: string, input: { status: DocumentReviewStatus; version: number; note?: string | null }) {
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const current = await lockDocumentRequirement(tx, projectId, requirementId, input.version);
    const [phase] = await tx.select({ status: projectPhaseInstances.status }).from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), eq(projectPhaseInstances.phaseNumber, current.phaseNumber))).limit(1);
    if (!phase) throw new HttpError(404, "Project phase not found");
    if (phase.status === "PASSED") throw new HttpError(409, "Reopen the passed phase before changing document review");
    if (current.status === "ACCEPTED") throw new HttpError(409, "Reset the accepted document before reviewing it again");
    if (!await canReviewDocument(tx, actor, projectId, current.phaseNumber)) throw new HttpError(403, "Only ADMIN or the phase decision owner can review this document");
    if (input.status === "WAIVED" && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can waive a required document");
    if (input.status === "WAIVED" && !input.note?.trim()) throw new HttpError(400, "A waiver note is required");
    if (input.status === "REJECTED" && !input.note?.trim()) throw new HttpError(400, "A rejection note is required");
    let attachment: typeof evidence.$inferSelect | null = null;
    if (input.status !== "WAIVED") {
      if (!current.attachmentId) throw new HttpError(409, "Upload or link evidence before reviewing this requirement");
      [attachment] = await tx.select().from(evidence).where(and(eq(evidence.id, current.attachmentId), eq(evidence.entityType, "PROJECT"), eq(evidence.entityId, projectId), isNull(evidence.deletedAt))).for("share").limit(1);
      if (!attachment) throw new HttpError(409, "Linked evidence is unavailable");
      if (input.status === "ACCEPTED" && attachment.scanStatus !== "CLEAN" && (process.env.AUTH_MODE === "production" || attachment.scanStatus !== "SKIPPED")) throw new HttpError(409, "Evidence must pass malware scanning before acceptance");
    }
    const now = new Date();
    const [updated] = await tx.update(projectDocumentRequirements).set({ status: input.status, reviewedBy: actor.id, reviewedAt: now, reviewNote: input.note?.trim() || null, version: sql`${projectDocumentRequirements.version} + 1`, updatedAt: now }).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.version, input.version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Document requirement changed; reload before saving");
    const phaseState = await recalculateProjectPhaseReadiness(tx, projectId, actor.id, `Document review changed to ${input.status}`);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: `project.document.${input.status.toLowerCase()}`, entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { requirementId, evidenceId: attachment?.id ?? null, ...phaseState } });
    return updated;
  });
}

export async function resetProjectDocumentRequirement(actor: Actor, projectId: string, requirementId: string, input: { version: number; reason: string }) {
  if (actor.role !== "ADMIN") throw new HttpError(403, "Forbidden");
  await assertProjectMutable(actor, projectId);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const current = await lockDocumentRequirement(tx, projectId, requirementId, input.version);
    const [phase] = await tx.select({ status: projectPhaseInstances.status }).from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), eq(projectPhaseInstances.phaseNumber, current.phaseNumber))).limit(1);
    if (!phase) throw new HttpError(404, "Project phase not found");
    if (phase.status === "PASSED") throw new HttpError(409, "Reopen the passed phase before resetting its documents");
    const status = current.attachmentId ? "UPLOADED" : "MISSING";
    const [updated] = await tx.update(projectDocumentRequirements).set({ status, reviewedBy: null, reviewedAt: null, reviewNote: null, version: sql`${projectDocumentRequirements.version} + 1`, updatedAt: new Date() }).where(and(eq(projectDocumentRequirements.id, requirementId), eq(projectDocumentRequirements.version, input.version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Document requirement changed; reload before saving");
    const phaseState = await recalculateProjectPhaseReadiness(tx, projectId, actor.id, input.reason);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.document.reset", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { requirementId, reason: input.reason, ...phaseState } });
    return updated;
  });
}

export type UpdateWorkspaceInput = {
  version: number;
  clientName?: string | null;
  location?: string | null;
  dealDate?: string | null;
  contractValue?: string;
  currency?: string;
  targetMarginPct?: string;
  retentionPct?: string;
  overheadPct?: string;
  contingencyPct?: string;
  vatEnabled?: boolean;
  vatPct?: string;
  withholdingEnabled?: boolean;
  withholdingPct?: string;
  overrideReason?: string;
};

export async function updateProjectWorkspace(actor: Actor, projectId: string, input: UpdateWorkspaceInput) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  const { version, overrideReason, ...changes } = input;
  const profileFields = ["clientName", "location", "dealDate"];
  const changedFields = Object.keys(changes);
  const changesFinancials = changedFields.some((field) => !profileFields.includes(field));
  if (changedFields.some((field) => profileFields.includes(field)) && !canManageProfile(actor, roles)) throw new HttpError(403, "Forbidden");
  if (changesFinancials && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can update commercial fields");
  if (overrideReason && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can override a commercial lock");

  return db.transaction(async (tx) => {
    const current = await lockWorkspace(tx, projectId);
    if (current.version !== version) throw new ProjectWorkspaceVersionConflict(current);
    if (current.commercialStatus !== "DRAFT") {
      const lockedOverride = current.commercialStatus === "LOCKED" && actor.role === "ADMIN" && Boolean(overrideReason?.trim());
      if (!lockedOverride) throw new HttpError(409, `Workspace fields cannot be edited while commercial status is ${current.commercialStatus}`);
    }
    const targetMarginPct = changes.targetMarginPct ?? current.targetMarginPct;
    const retentionPct = changes.retentionPct ?? current.retentionPct;
    if (!percentageSumIsBelowHundred(targetMarginPct, retentionPct)) throw new HttpError(400, "targetMarginPct + retentionPct must be less than 100");
    const [updated] = await tx.update(projectWorkspaces).set({ ...changes, version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(and(eq(projectWorkspaces.projectId, projectId), eq(projectWorkspaces.version, version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current);
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.workspace.updated", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { lockOverridden: current.commercialStatus === "LOCKED", ...(overrideReason?.trim() ? { overrideReason: overrideReason.trim() } : {}) } });
    return updated;
  });
}

export type CreateCostItemInput = {
  category: typeof PROJECT_COST_CATEGORIES[number];
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  actualAmount?: string | null;
  position?: number;
  overrideReason?: string;
};

export async function listProjectCostItems(actor: Actor, projectId: string) {
  await assertProjectAccess(actor, projectId);
  await requireWorkspace(projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  if (!canViewProjectWorkspaceFinancials(actor, roles)) throw new HttpError(403, "Financial workspace access required");
  return db.select().from(projectCostItems).where(and(eq(projectCostItems.projectId, projectId), isNull(projectCostItems.archivedAt), isNull(projectCostItems.deletedAt))).orderBy(asc(projectCostItems.position), asc(projectCostItems.createdAt));
}

export async function createProjectCostItem(actor: Actor, projectId: string, input: CreateCostItemInput) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  if (!canManagePlan(actor, roles)) throw new HttpError(403, "Only Project Leader or ADMIN can create cost items");
  if (input.overrideReason && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can override a commercial lock");
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectCostMutationAllowed(workspace, actor, input.overrideReason);
    const { overrideReason, ...values } = input;
    let position = input.position;
    if (position === undefined) {
      const [last] = await tx.select({ position: projectCostItems.position }).from(projectCostItems).where(and(eq(projectCostItems.projectId, projectId), isNull(projectCostItems.deletedAt))).orderBy(sql`${projectCostItems.position} desc`).limit(1);
      position = (last?.position ?? -1) + 1;
    }
    const [created] = await tx.insert(projectCostItems).values({ projectId, ...values, position }).returning();
    await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.cost_item.created", entityType: "PROJECT", entityId: projectId, changes: { to: created }, metadata: { costItemId: created.id, lockOverridden: workspace.commercialStatus === "LOCKED", ...(overrideReason?.trim() ? { overrideReason: overrideReason.trim() } : {}) } });
    return created;
  });
}

export type UpdateCostItemInput = Partial<CreateCostItemInput> & { version: number };

export async function updateProjectCostItem(actor: Actor, projectId: string, itemId: string, input: UpdateCostItemInput) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  const { version, overrideReason, ...changes } = input;
  const planFields = ["category", "description", "quantity", "unit", "unitPrice", "position"];
  if (Object.keys(changes).some((field) => planFields.includes(field)) && !canManagePlan(actor, roles)) throw new HttpError(403, "Only Project Leader or ADMIN can update planned cost fields");
  if ("actualAmount" in changes && !canManageActual(actor, roles)) throw new HttpError(403, "Only Project Leader, Finance, or ADMIN can update actual cost");
  if (overrideReason && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can override a commercial lock");

  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectCostMutationAllowed(workspace, actor, overrideReason);
    const [current] = await tx.select().from(projectCostItems).where(and(eq(projectCostItems.id, itemId), eq(projectCostItems.projectId, projectId))).for("update").limit(1);
    if (!current) throw new HttpError(404, "Cost item not found");
    if (current.archivedAt || current.deletedAt) throw new HttpError(409, "Archived or deleted cost items cannot be updated");
    if (current.version !== version) throw new ProjectWorkspaceVersionConflict(current, "Cost item changed; reload before saving");
    const [updated] = await tx.update(projectCostItems).set({ ...changes, version: sql`${projectCostItems.version} + 1`, updatedAt: new Date() }).where(and(eq(projectCostItems.id, itemId), eq(projectCostItems.projectId, projectId), eq(projectCostItems.version, version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Cost item changed; reload before saving");
    await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.cost_item.updated", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: updated }, metadata: { costItemId: itemId, lockOverridden: workspace.commercialStatus === "LOCKED", ...(overrideReason?.trim() ? { overrideReason: overrideReason.trim() } : {}) } });
    return updated;
  });
}

export async function deleteProjectCostItem(actor: Actor, projectId: string, itemId: string, version: number, overrideReason?: string) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  if (!canManagePlan(actor, roles)) throw new HttpError(403, "Only Project Leader or ADMIN can delete cost items");
  if (overrideReason && actor.role !== "ADMIN") throw new HttpError(403, "Only ADMIN can override a commercial lock");
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, projectId);
    assertProjectCostMutationAllowed(workspace, actor, overrideReason);
    const [current] = await tx.select().from(projectCostItems).where(and(eq(projectCostItems.id, itemId), eq(projectCostItems.projectId, projectId))).for("update").limit(1);
    if (!current) throw new HttpError(404, "Cost item not found");
    if (current.deletedAt) throw new HttpError(409, "Cost item already deleted");
    if (current.version !== version) throw new ProjectWorkspaceVersionConflict(current, "Cost item changed; reload before deleting");
    const now = new Date();
    const [deleted] = await tx.update(projectCostItems).set({ archivedAt: now, deletedAt: now, version: sql`${projectCostItems.version} + 1`, updatedAt: now }).where(and(eq(projectCostItems.id, itemId), eq(projectCostItems.projectId, projectId), eq(projectCostItems.version, version))).returning();
    if (!deleted) throw new ProjectWorkspaceVersionConflict(current, "Cost item changed; reload before deleting");
    await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: now }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "project.cost_item.deleted", entityType: "PROJECT", entityId: projectId, changes: { from: current, to: deleted }, metadata: { costItemId: itemId, lockOverridden: workspace.commercialStatus === "LOCKED", ...(overrideReason?.trim() ? { overrideReason: overrideReason.trim() } : {}) } });
    return deleted;
  });
}

export type UpdateStageInput = {
  version: number;
  assigneeId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  status?: WorkStatus;
  progress?: number;
  overrideReason?: string;
};

export async function updateProjectStage(actor: Actor, projectId: string, stageId: string, input: UpdateStageInput) {
  await assertProjectMutable(actor, projectId);
  const roles = actor.role === "ADMIN" ? new Set<string>() : await assignmentRoles(projectId, actor.id);
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, projectId);
    const [current] = await tx.select().from(projectStageInstances).where(and(eq(projectStageInstances.id, stageId), eq(projectStageInstances.projectId, projectId))).for("update").limit(1);
    if (!current) throw new HttpError(404, "Project stage not found");
    if (actor.role !== "ADMIN" && !roles.has("PROJECT_LEADER") && current.assigneeId !== actor.id) throw new HttpError(403, "Forbidden");
    if (input.assigneeId !== undefined && actor.role !== "ADMIN" && !roles.has("PROJECT_LEADER")) throw new HttpError(403, "Only Project Leader or ADMIN can assign stages");
    if (current.version !== input.version) throw new ProjectWorkspaceVersionConflict(current, "Project stage changed; reload before saving");

    if (input.assigneeId) {
      const [assignment] = await tx.select({ id: projectAssignments.id }).from(projectAssignments).where(and(eq(projectAssignments.projectId, projectId), eq(projectAssignments.userId, input.assigneeId), eq(projectAssignments.active, true))).limit(1);
      if (!assignment) throw new HttpError(400, "Stage assignee must be an active project member");
    }

    const { version, overrideReason, ...changes } = input;
    const next = { ...current, ...changes };
    if (next.plannedStart && next.plannedEnd && next.plannedEnd < next.plannedStart) throw new HttpError(400, "plannedEnd must not be before plannedStart");
    if (next.actualStart && next.actualEnd && next.actualEnd < next.actualStart) throw new HttpError(400, "actualEnd must not be before actualStart");
    if (next.status === "COMPLETED" && !next.actualEnd) throw new HttpError(400, "Completed stages require actualEnd");

    let sequenceOverridden = false;
    if (current.phaseNumber > 1) {
      const [previousPhase] = await tx.select().from(projectPhaseInstances).where(and(eq(projectPhaseInstances.projectId, projectId), eq(projectPhaseInstances.phaseNumber, current.phaseNumber - 1))).limit(1);
      if (!previousPhase || previousPhase.status !== "PASSED") {
        if (actor.role !== "ADMIN" || !overrideReason?.trim()) throw new HttpError(409, "Previous project phase must pass before this stage can be changed");
        sequenceOverridden = true;
      }
    }

    const [updated] = await tx.update(projectStageInstances).set({ ...changes, version: sql`${projectStageInstances.version} + 1`, updatedAt: new Date() }).where(and(eq(projectStageInstances.id, stageId), eq(projectStageInstances.projectId, projectId), eq(projectStageInstances.version, version))).returning();
    if (!updated) throw new ProjectWorkspaceVersionConflict(current, "Project stage changed; reload before saving");
    await tx.update(projectWorkspaces).set({ version: sql`${projectWorkspaces.version} + 1`, updatedAt: new Date() }).where(eq(projectWorkspaces.projectId, projectId));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      action: "project.stage.updated",
      entityType: "PROJECT",
      entityId: projectId,
      changes: { from: current, to: updated },
      metadata: { stageId, sequenceOverridden, ...(sequenceOverridden ? { overrideReason: overrideReason!.trim() } : {}) },
    });
    return updated;
  });
}
