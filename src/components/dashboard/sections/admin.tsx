"use client";

import { AlertTriangle, CheckCircle2, FileJson, LoaderCircle, Pencil, Plus, RefreshCcw, Search, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { displayStatus, EmptyState, formatDate, initials, PageHeading, readJson, StatusBadge, type Approval, type AuditEvent, type User, type Viewer } from "./common";

export function ApprovalsSection({ viewer, items, reload, setMessage, setError }: { viewer: Viewer; items: Approval[]; reload: () => Promise<void>; setMessage: (value: string) => void; setError: (value: string) => void }) {
  async function decide(id: string, decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") { const note = decision === "APPROVED" ? "Disetujui melalui dashboard" : window.prompt(decision === "REJECTED" ? "Alasan penolakan" : "Catatan revisi"); if (decision !== "APPROVED" && !note) return; try { await readJson(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note }) }); setMessage("Keputusan approval tersimpan."); await reload(); } catch (error) { setError(error instanceof Error ? error.message : "Keputusan gagal disimpan."); } }
  return <><PageHeading eyebrow={viewer.role === "ADMIN" ? "KONTROL ADMIN" : "TRACKING SUBMISSION"} title={viewer.role === "ADMIN" ? "Persetujuan" : "Pengajuan saya"} description={viewer.role === "ADMIN" ? "Tinjau perubahan sebelum menjadi data resmi." : "Pantau pengajuan yang masih menunggu keputusan Admin."} />
    <div className="approval-page">{items.map((item) => <article key={item.id}><div className="approval-main"><span className="approval-kind">{item.entityType.slice(0, 1)}</span><div><small>{item.id.slice(0, 8)} - {displayStatus(item.entityType)}</small><h2>{item.approvalType.replaceAll("_", " ")}</h2><p>Diajukan {formatDate(item.submittedAt, true)}{item.requester?.name ? ` oleh ${item.requester.name}` : ""}</p></div></div><dl className="approval-snapshot">{Object.entries(item.submittedSnapshot ?? {}).map(([field, value]) => <div key={field}><dt>{field.replaceAll("_", " ")}</dt><dd>{value === null ? "Kosong" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>{viewer.role === "ADMIN" ? <div className="approval-actions"><button className="secondary-button compact" onClick={() => void decide(item.id, "REVISION_REQUESTED")}>Revisi</button><button className="secondary-button compact" onClick={() => void decide(item.id, "REJECTED")}>Tolak</button><button className="primary-button compact" onClick={() => void decide(item.id, "APPROVED")}><CheckCircle2 size={16} /> Setujui</button></div> : <StatusBadge status={item.status} />}</article>)}{items.length === 0 ? <EmptyState title="Tidak ada pengajuan" description="Semua pengajuan sudah selesai atau belum ada data yang diajukan." /> : null}</div>
  </>;
}

function UserEditor({ user, busy, close, save }: { user: User; busy: boolean; close: () => void; save: (values: { name: string; email: string; phone: string | null }) => Promise<void> }) {
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone ?? "" });
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="user-editor" role="dialog" aria-modal="true" aria-labelledby="user-editor-title" onSubmit={(event) => { event.preventDefault(); void save({ ...form, phone: form.phone.trim() || null }); }}>
    <div className="management-form-head"><div><p className="eyebrow">EDIT PROFIL</p><h2 id="user-editor-title">{user.name}</h2></div><button type="button" className="icon-button" aria-label="Tutup edit pengguna" onClick={close}><X size={18} /></button></div>
    <div className="management-form-grid user-editor-grid"><label>Nama lengkap<input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="wide">Nomor kontak / WhatsApp<input maxLength={50} placeholder="Contoh: 0812..." value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div>
    <div className="management-form-actions"><button type="button" className="secondary-button" onClick={close}>Batal</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Menyimpan..." : "Simpan profil"}</button></div>
  </form></div>;
}

const LEGACY_IMPORT_ENDPOINT = "/api/projects/workspace-imports";
const CREATE_PROJECT_VALUE = "__create_new__";

type ExistingProjectOption = { id: string; code: string; brand: string; version: number | null; workspaceVersion: number | null; hasWorkspace: boolean; workspaceKnown: boolean };
type LegacyProjectPreview = { sourceId: string; name: string; client: string | null; valid: boolean; errors: string[]; suggestedProjectId: string | null; suggestedCode: string };
type LegacyTeamPreview = { sourceName: string; role: string | null; candidateIds: string[]; suggestedUserId: string | null; ambiguous: boolean };
type LegacyImportPreview = {
  fileName: string;
  checksum: string | null;
  projects: LegacyProjectPreview[];
  team: LegacyTeamPreview[];
  issues: string[];
  existingProjects: ExistingProjectOption[];
};
type ReconciliationTotals = { create: number; update: number; unchanged: number; skipped: number; mappedUsers: number; unmappedUsers: number; warnings: number; errors: number };
type ImportIssue = { severity: "ERROR" | "WARNING"; code: string; message: string; project: string | null };
type ImportWarning = Omit<ImportIssue, "severity">;
type HppReconciliation = { create: number; update: number; unchanged: number; actualZeroAmbiguous: number; sourceTotal: number | null; targetTotal: number | null };
type PreviewBinding = { legacyId: string; previewId: string | null; targetProjectVersion: number | null; targetWorkspaceVersion: number | null; alreadyImported: boolean };
type ReconciliationReport = { canCommit: boolean; totals: ReconciliationTotals; issues: ImportIssue[]; warnings: ImportWarning[]; hpp: HppReconciliation; bindings: PreviewBinding[] };
type ImportResult = { importId: string | null; idempotent: boolean; message: string; report: ReconciliationReport };
type ProjectMappingState = { target: string; code: string; brand: string };
type ImportMappings = { projects: Record<string, ProjectMappingState>; users: Record<string, string> };

function recordOf(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arrayOf(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringOf(...values: unknown[]) { return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? ""; }
function numberOf(...values: unknown[]) { const value = values.find((item) => typeof item === "number" && Number.isFinite(item)); return typeof value === "number" ? value : 0; }
function optionalNumberOf(...values: unknown[]) { const value = values.find((item) => typeof item === "number" && Number.isFinite(item)); return typeof value === "number" ? value : null; }
function booleanOf(...values: unknown[]) { const value = values.find((item) => typeof item === "boolean"); return typeof value === "boolean" ? value : false; }
function importPayloadRoot(payload: unknown) { const root = recordOf(payload); return recordOf(root.data ?? root.preview ?? root.result ?? root); }

async function importResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const root = recordOf(payload);
    throw new Error(stringOf(root.error, root.message) || `Request import gagal (${response.status})`);
  }
  return payload;
}

async function previewLegacyImport(file: File) {
  const form = new FormData();
  form.set("action", "preview");
  form.set("file", file);
  return importResponse(await fetch(LEGACY_IMPORT_ENDPOINT, { method: "POST", body: form }));
}

async function executeLegacyImport(action: "preview" | "commit", file: File, mappings: ImportMappings, bindings: PreviewBinding[] = []) {
  const projectMapping = Object.fromEntries(Object.entries(mappings.projects).map(([legacyId, value]) => {
    const base = value.target === CREATE_PROJECT_VALUE ? { create: { code: value.code, brand: value.brand } } : { projectId: value.target };
    if (action === "preview") return [legacyId, base];
    const previewId = bindings.find((binding) => binding.legacyId === legacyId)?.previewId;
    return [legacyId, { ...base, previewId }];
  }));
  const userMapping = Object.fromEntries(Object.entries(mappings.users).map(([legacyName, userId]) => [legacyName, userId || null]));
  const form = new FormData();
  form.set("action", action);
  form.set("file", file);
  form.set("projectMapping", JSON.stringify(projectMapping));
  form.set("userMapping", JSON.stringify(userMapping));
  return importResponse(await fetch(LEGACY_IMPORT_ENDPOINT, { method: "POST", body: form }));
}

async function loadExistingProjectOptions() {
  const result: ExistingProjectOption[] = [];
  for (let offset = 0; ; offset += 100) {
    const payload = await readJson<{ data: Array<{ id: string; code: string; brand: string; version?: number }> }>(`/api/projects?limit=100&offset=${offset}`);
    result.push(...payload.data.map((project) => ({ id: project.id, code: project.code, brand: project.brand, version: project.version ?? null, workspaceVersion: null, hasWorkspace: false, workspaceKnown: false })));
    if (payload.data.length < 100) return result;
  }
}

function normalizePreview(payload: unknown, fileName: string, activeUsers: User[], loadedProjects: ExistingProjectOption[]): LegacyImportPreview {
  const root = importPayloadRoot(payload);
  const rawProjects = arrayOf(root.projects ?? root.legacyProjects ?? root.items);
  const projects = rawProjects.map((value, index) => {
    const project = recordOf(value);
    const errors = arrayOf(project.errors ?? project.issues).map((error) => typeof error === "string" ? error : stringOf(recordOf(error).message)).filter(Boolean);
    return {
      sourceId: stringOf(project.sourceId, project.legacyProjectId, project.legacyId, project.id) || `legacy-${index + 1}`,
      name: stringOf(project.name, project.nama, project.projectName, project.title) || `Proyek legacy ${index + 1}`,
      client: stringOf(project.client, project.klien, project.brand) || null,
      valid: project.valid !== false && errors.length === 0,
      errors,
      suggestedProjectId: stringOf(project.suggestedProjectId, project.targetProjectId, project.matchedProjectId) || null,
      suggestedCode: stringOf(project.suggestedCode, project.code, project.projectCode).toUpperCase(),
    };
  });
  const embeddedNames = rawProjects.flatMap((value) => Object.values(recordOf(recordOf(value).team))).flatMap((value) => typeof value === "string" ? value.split(",") : []).map((name) => name.trim()).filter(Boolean);
  const rawTeam = arrayOf(root.team ?? root.teamMembers ?? root.userMappings ?? root.people);
  const teamSource = rawTeam.length ? rawTeam : [...new Set(embeddedNames)].map((sourceName) => ({ sourceName }));
  const team = teamSource.map((value) => {
    const member = typeof value === "string" ? { sourceName: value } : recordOf(value);
    const sourceName = stringOf(member.sourceName, member.legacyName, member.name, member.nama);
    const serverCandidates = arrayOf(member.candidates ?? member.matches).map((candidate) => typeof candidate === "string" ? candidate : stringOf(recordOf(candidate).id, recordOf(candidate).userId)).filter(Boolean);
    const localCandidates = activeUsers.filter((user) => user.name.localeCompare(sourceName, "id", { sensitivity: "base" }) === 0).map((user) => user.id);
    const candidateIds = [...new Set([...serverCandidates, ...localCandidates])];
    return {
      sourceName,
      role: stringOf(member.role, member.legacyRole) || null,
      candidateIds,
      suggestedUserId: stringOf(member.suggestedUserId, member.userId, candidateIds.length === 1 ? candidateIds[0] : "") || null,
      ambiguous: booleanOf(member.ambiguous) || candidateIds.length > 1,
    };
  }).filter((member) => member.sourceName);
  const serverProjects = arrayOf(root.existingProjects ?? root.projectOptions ?? root.targets).map((value) => {
    const project = recordOf(value);
    const workspace = recordOf(project.workspace);
    const workspaceVersion = optionalNumberOf(project.workspaceVersion, workspace.version);
    const hasWorkspace = booleanOf(project.hasWorkspace, project.workspaceExists) || workspaceVersion !== null || Object.keys(workspace).length > 0;
    return {
      id: stringOf(project.id, project.projectId),
      code: stringOf(project.code),
      brand: stringOf(project.brand, project.name, project.nama),
      version: optionalNumberOf(project.version, project.projectVersion, project.targetVersion),
      workspaceVersion,
      hasWorkspace,
      workspaceKnown: "hasWorkspace" in project || "workspaceExists" in project || "workspaceVersion" in project || "workspace" in project,
    };
  }).filter((project) => project.id);
  const projectMap = new Map([...loadedProjects, ...serverProjects].map((project) => [project.id, project]));
  const issues = arrayOf(root.errors ?? root.issues).map((issue) => typeof issue === "string" ? issue : stringOf(recordOf(issue).message, recordOf(issue).error)).filter(Boolean);
  return {
    fileName: stringOf(root.fileName, root.sourceName) || fileName,
    checksum: stringOf(root.checksum, root.sourceHash, recordOf(root.source).hash) || null,
    projects,
    team,
    issues,
    existingProjects: [...projectMap.values()],
  };
}

function normalizeTotals(payload: unknown): ReconciliationTotals {
  const root = importPayloadRoot(payload);
  const totals = recordOf(root.totals ?? root.reconciliation ?? root.summary ?? root);
  const warnings = arrayOf(root.warnings ?? recordOf(root.reconciliation).warnings);
  const errors = arrayOf(root.errors ?? recordOf(root.reconciliation).errors);
  return {
    create: numberOf(totals.create, totals.created, totals.projectsToCreate, totals.createdProjects),
    update: numberOf(totals.update, totals.updated, totals.projectsToUpdate, totals.updatedProjects),
    unchanged: numberOf(totals.unchanged, totals.alreadyImported, totals.unchangedProjects),
    skipped: numberOf(totals.skipped, totals.skippedProjects),
    mappedUsers: numberOf(totals.mappedUsers, totals.usersMapped),
    unmappedUsers: numberOf(totals.unmappedUsers, totals.usersUnmapped),
    warnings: numberOf(totals.warnings, totals.warningCount, warnings.length),
    errors: numberOf(totals.errors, totals.errorCount, errors.length),
  };
}

function warningMessage(code: string, fallback: string) {
  if (code === "ACTUAL_ZERO_AMBIGUOUS") return "Nilai realisasi 0 ambigu: belum diisi atau benar-benar nol. Periksa item HPP terkait.";
  if (["COMPLETED_STAGE_UNRESOLVED", "COMPLETED_STAGE_MAPPING_UNRESOLVED", "STAGE_COMPLETED_UNRESOLVED"].includes(code)) return "Tahap berstatus selesai belum dapat direkonsiliasi penuh ke tahap workspace baru.";
  return fallback || code.replaceAll("_", " ");
}

function normalizeWarnings(payload: unknown): ImportWarning[] {
  const root = importPayloadRoot(payload);
  return arrayOf(root.warnings ?? recordOf(root.reconciliation).warnings ?? recordOf(root.summary).warnings).map((value) => {
    const warning = typeof value === "string" ? { code: value } : recordOf(value);
    const code = stringOf(warning.code, warning.type, warning.warningCode).toUpperCase() || "IMPORT_WARNING";
    return { code, message: warningMessage(code, stringOf(warning.message, warning.detail)), project: stringOf(warning.project, warning.projectName, warning.legacyProjectName) || null };
  });
}

function normalizeHpp(payload: unknown): HppReconciliation {
  const root = importPayloadRoot(payload);
  const reconciliation = recordOf(root.reconciliation);
  const hpp = recordOf(root.hpp ?? root.costs ?? reconciliation.hpp ?? reconciliation.costs);
  return {
    create: numberOf(hpp.create, hpp.created, hpp.itemsToCreate, hpp.createdItems),
    update: numberOf(hpp.update, hpp.updated, hpp.itemsToUpdate, hpp.updatedItems),
    unchanged: numberOf(hpp.unchanged, hpp.unchangedItems),
    actualZeroAmbiguous: numberOf(hpp.actualZeroAmbiguous, hpp.zeroActualAmbiguous, normalizeWarnings(payload).filter((warning) => warning.code === "ACTUAL_ZERO_AMBIGUOUS").length),
    sourceTotal: optionalNumberOf(hpp.sourceTotal, hpp.legacyTotal, hpp.sourceHppTotal),
    targetTotal: optionalNumberOf(hpp.targetTotal, hpp.resultTotal, hpp.targetHppTotal),
  };
}

function normalizeReconciliation(payload: unknown): ReconciliationReport {
  const root = importPayloadRoot(payload);
  const issues = arrayOf(root.issues).map((value) => {
    const issue = recordOf(value);
    return {
      severity: stringOf(issue.severity).toUpperCase() === "WARNING" ? "WARNING" as const : "ERROR" as const,
      code: stringOf(issue.code).toUpperCase() || "IMPORT_ISSUE",
      message: stringOf(issue.message, issue.detail),
      project: stringOf(issue.legacyId, issue.project, issue.projectName) || null,
    };
  });
  const warnings = issues.filter((issue) => issue.severity === "WARNING").map((issue) => ({ code: issue.code, message: issue.message, project: issue.project }));
  const bindings = arrayOf(root.projects).map((value) => {
    const project = recordOf(value);
    return {
      legacyId: stringOf(project.legacyId, project.sourceId),
      previewId: stringOf(project.previewId) || null,
      targetProjectVersion: optionalNumberOf(project.targetProjectVersion),
      targetWorkspaceVersion: optionalNumberOf(project.targetWorkspaceVersion),
      alreadyImported: booleanOf(project.alreadyImported),
    };
  }).filter((binding) => binding.legacyId);
  return { canCommit: root.canCommit === true, totals: normalizeTotals(root.reconciliation ?? payload), issues, warnings, hpp: normalizeHpp(root.reconciliation ?? payload), bindings };
}

function normalizeImportResult(payload: unknown): ImportResult {
  const root = importPayloadRoot(payload);
  return {
    importId: stringOf(root.importId, root.id) || null,
    idempotent: booleanOf(root.idempotent, root.alreadyImported, root.duplicate) || stringOf(root.status).toUpperCase() === "ALREADY_IMPORTED",
    message: stringOf(root.message) || "Import legacy selesai diproses.",
    report: { ...normalizeReconciliation(payload), canCommit: true },
  };
}

function ReconciliationCards({ totals }: { totals: ReconciliationTotals }) {
  const cards = [["Proyek baru", totals.create], ["Diperbarui", totals.update], ["Tanpa perubahan", totals.unchanged], ["Dilewati", totals.skipped], ["User terpetakan", totals.mappedUsers], ["User null", totals.unmappedUsers]] as const;
  return <div className="legacy-import-totals">{cards.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

function HppReconciliationCards({ hpp }: { hpp: HppReconciliation }) {
  return <div className="legacy-hpp-reconciliation"><div><span>Item HPP baru</span><strong>{hpp.create}</strong></div><div><span>Item HPP update</span><strong>{hpp.update}</strong></div><div><span>Item tetap</span><strong>{hpp.unchanged}</strong></div><div className={hpp.actualZeroAmbiguous ? "warning" : ""}><span>Realisasi 0 ambigu</span><strong>{hpp.actualZeroAmbiguous}</strong></div>{hpp.sourceTotal !== null ? <div><span>Total HPP legacy</span><strong>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(hpp.sourceTotal)}</strong></div> : null}{hpp.targetTotal !== null ? <div><span>Total setelah import</span><strong>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(hpp.targetTotal)}</strong></div> : null}</div>;
}

export function LegacyImportPanel({ users, reload, setMessage }: { users: User[]; reload: () => Promise<void>; setMessage: (value: string) => void }) {
  const activeUsers = users.filter((user) => user.status === "ACTIVE");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [projectMappings, setProjectMappings] = useState<Record<string, ProjectMappingState>>({});
  const [userMappings, setUserMappings] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState<ReconciliationReport | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "dry-run" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  function reset() { setFile(null); setPreview(null); setProjectMappings({}); setUserMappings({}); setDryRun(null); setResult(null); setError(""); setWarningsAcknowledged(false); }
  function invalidateDryRun() { setDryRun(null); setResult(null); setWarningsAcknowledged(false); }
  async function createPreview() {
    if (!file) return;
    setBusy("preview"); setError(""); setDryRun(null); setResult(null);
    try {
      const [payload, existingProjects] = await Promise.all([previewLegacyImport(file), loadExistingProjectOptions()]);
      const next = normalizePreview(payload, file.name, activeUsers, existingProjects);
      const nextProjects = Object.fromEntries(next.projects.map((project) => [project.sourceId, { target: project.suggestedProjectId && next.existingProjects.some((item) => item.id === project.suggestedProjectId) ? project.suggestedProjectId : CREATE_PROJECT_VALUE, code: project.suggestedCode.startsWith("DP-") ? project.suggestedCode : "", brand: project.name }]));
      const nextUsers = Object.fromEntries(next.team.map((member) => [member.sourceName, member.suggestedUserId && activeUsers.some((user) => user.id === member.suggestedUserId) && !member.ambiguous ? member.suggestedUserId : ""]));
      setPreview(next); setProjectMappings(nextProjects); setUserMappings(nextUsers);
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : "Preview import gagal dibuat."); }
    finally { setBusy(null); }
  }
  async function reconcile() {
    if (!preview) return;
    setBusy("dry-run"); setError(""); setResult(null);
    try { setDryRun(normalizeReconciliation(await executeLegacyImport("preview", file!, { projects: projectMappings, users: userMappings }))); setWarningsAcknowledged(false); }
    catch (reconcileError) { setError(reconcileError instanceof Error ? reconcileError.message : "Dry-run import gagal."); }
    finally { setBusy(null); }
  }
  async function commit() {
    if (!preview || !dryRun || !window.confirm(`Commit import ${preview.projects.length} proyek dari ${preview.fileName}? Server akan menjaga idempotensi agar data yang sama tidak terduplikasi.`)) return;
    setBusy("commit"); setError("");
    try {
      const next = normalizeImportResult(await executeLegacyImport("commit", file!, { projects: projectMappings, users: userMappings }, dryRun.bindings));
      setResult(next); setMessage(next.idempotent ? "Import sudah pernah diproses; tidak ada data duplikat." : "Import legacy berhasil dikomit."); await reload();
    } catch (commitError) { setError(commitError instanceof Error ? commitError.message : "Commit import gagal."); }
    finally { setBusy(null); }
  }

  const invalidProjects = preview?.projects.filter((project) => !project.valid).length ?? 0;
  const ambiguousUsers = preview?.team.filter((member) => member.ambiguous).length ?? 0;
  const mappingRows = preview?.projects.map((project) => ({ project, mapping: projectMappings[project.sourceId] ?? { target: CREATE_PROJECT_VALUE, code: "", brand: project.name } })) ?? [];
  const invalidCodes = mappingRows.filter(({ mapping }) => mapping.target === CREATE_PROJECT_VALUE && !/^DP-[A-Z0-9][A-Z0-9-]{0,27}$/.test(mapping.code)).length;
  const unconfirmedWorkspaceUpdates = mappingRows.filter(({ mapping }) => preview?.existingProjects.find((option) => option.id === mapping.target)?.hasWorkspace).length;
  const missingTargetVersions = mappingRows.filter(({ mapping }) => { const target = preview?.existingProjects.find((option) => option.id === mapping.target); return mapping.target !== CREATE_PROJECT_VALUE && (!target || target.version === null || !target.workspaceKnown); }).length;
  const currentStep = result ? 4 : dryRun ? 3 : preview ? 2 : 1;
  const mappingBlocked = invalidProjects > 0 || invalidCodes > 0 || unconfirmedWorkspaceUpdates > 0 || missingTargetVersions > 0;
  const commitBlocked = !dryRun || !dryRun.canCommit || dryRun.bindings.some((binding) => !binding.previewId && !binding.alreadyImported) || dryRun.totals.errors > 0 || mappingBlocked || (dryRun.warnings.length > 0 && !warningsAcknowledged) || busy !== null;
  return <section className="legacy-import-panel" aria-labelledby="legacy-import-title">
    <div className="legacy-import-head"><div><p className="eyebrow">MIGRASI DATA</p><h2 id="legacy-import-title">Importer ruang proyek legacy</h2><p>Preview JSON di server, petakan proyek dan tim, lalu verifikasi perubahan sebelum commit.</p></div><FileJson size={28} aria-hidden="true" /></div>
    <ol className="legacy-import-steps" aria-label="Tahapan import">{["Pilih JSON", "Mapping", "Dry-run", "Commit"].map((label, index) => <li key={label} className={currentStep >= index + 1 ? "active" : ""} aria-current={currentStep === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    {error ? <p className="legacy-import-alert error" role="alert"><AlertTriangle size={17} aria-hidden="true" />{error}</p> : null}
    {!preview ? <div className="legacy-import-upload"><label htmlFor="legacy-import-file"><Upload size={22} aria-hidden="true" /><span><strong>{file?.name ?? "Pilih berkas JSON legacy"}</strong><small>Maksimalkan hasil dengan export utuh dari Ruang Proyek lama.</small></span><input id="legacy-import-file" aria-label="Pilih berkas JSON legacy" type="file" accept="application/json,.json" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></label><button type="button" className="primary-button" disabled={!file || busy !== null} onClick={() => void createPreview()}>{busy === "preview" ? <><LoaderCircle className="spin" size={17} /> Membuat preview...</> : "Preview di server"}</button></div> : null}
    {preview ? <>
      <div className="legacy-import-summary"><div><strong>{preview.projects.length}</strong><span>Total proyek</span></div><div className={invalidProjects ? "danger" : "success"}><strong>{preview.projects.length - invalidProjects}</strong><span>Valid</span></div><div className={invalidProjects ? "danger" : ""}><strong>{invalidProjects}</strong><span>Error proyek</span></div><div className={ambiguousUsers ? "warning" : ""}><strong>{ambiguousUsers}</strong><span>Nama ambigu</span></div><div><strong>{preview.team.length}</strong><span>Nama tim</span></div></div>
      <div className="legacy-import-source"><span><FileJson size={16} aria-hidden="true" /><strong>{preview.fileName}</strong>{preview.checksum ? <code title={preview.checksum}>{preview.checksum.slice(0, 12)}</code> : null}</span><button type="button" className="secondary-button compact" onClick={reset}><RefreshCcw size={15} aria-hidden="true" /> Ganti file</button></div>
      {preview.issues.length ? <div className="legacy-import-issues" role="alert"><strong>Validasi file</strong><ul>{preview.issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></div> : null}
      <div className="legacy-import-block"><div className="legacy-import-block-title"><div><span>01</span><h3>Mapping proyek</h3></div><p>Pilih target berversi. Proyek baru wajib memiliki kode DP; proyek yang sudah memiliki workspace tidak dapat ditimpa.</p></div><div className="legacy-project-mappings">{mappingRows.map(({ project, mapping }) => { const target = preview.existingProjects.find((option) => option.id === mapping.target); return <article key={project.sourceId} className={!project.valid ? "invalid" : ""}><div className="legacy-mapping-identity"><strong>{project.name}</strong><small>{project.client ? `${project.client} · ` : ""}{project.sourceId}</small>{project.errors.map((item) => <em key={item}>{item}</em>)}</div><div className="legacy-mapping-controls"><label>Tujuan proyek <span className="sr-only">{project.name}</span><select aria-label={`Tujuan proyek ${project.name}`} value={mapping.target} disabled={!project.valid || busy !== null} onChange={(event) => { setProjectMappings((current) => ({ ...current, [project.sourceId]: { ...mapping, target: event.target.value } })); invalidateDryRun(); }}><option value={CREATE_PROJECT_VALUE}>Buat proyek baru</option>{preview.existingProjects.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.brand} · proyek v{option.version ?? "?"} · workspace {option.workspaceVersion === null ? option.workspaceKnown ? "baru" : "?" : `v${option.workspaceVersion}`}</option>)}</select></label>{mapping.target === CREATE_PROJECT_VALUE ? <label>Kode proyek DP <input aria-label={`Kode proyek baru ${project.name}`} value={mapping.code} placeholder="DP-001" pattern="DP-[A-Z0-9][A-Z0-9-]{0,27}" disabled={!project.valid || busy !== null} onChange={(event) => { setProjectMappings((current) => ({ ...current, [project.sourceId]: { ...mapping, code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") } })); invalidateDryRun(); }} /><small>Wajib unik dan diawali DP-.</small></label> : target ? <div className="legacy-target-version"><strong>Target terkunci versi</strong><span>Proyek v{target.version ?? "tidak tersedia"} · {target.workspaceKnown ? target.hasWorkspace ? `Workspace v${target.workspaceVersion ?? "?"}` : "Workspace belum ada" : "Metadata workspace belum tersedia"}</span>{target.hasWorkspace ? <em><AlertTriangle size={14} aria-hidden="true" /> Workspace existing tidak dapat ditimpa; pilih proyek tanpa workspace atau buat proyek baru.</em> : null}{!target.workspaceKnown || target.version === null ? <em><AlertTriangle size={14} aria-hidden="true" /> Preview server wajib mengirim versi proyek dan status workspace.</em> : null}</div> : null}</div></article>; })}</div></div>
      <div className="legacy-import-block"><div className="legacy-import-block-title"><div><span>02</span><h3>Mapping tim</h3></div><p>Nama yang tidak pasti dibiarkan null sampai Admin memilih user aktif.</p></div><div className="legacy-team-mappings">{preview.team.map((member) => { const candidates = activeUsers.filter((user) => member.candidateIds.includes(user.id)); return <article key={member.sourceName} className={member.ambiguous ? "ambiguous" : ""}><div><strong>{member.sourceName}</strong><small>{member.role ?? "Role legacy tidak disebutkan"}</small>{member.ambiguous ? <em><AlertTriangle size={14} aria-hidden="true" /> Ambigu: {candidates.length || member.candidateIds.length} kandidat</em> : null}</div><label>User aktif <span className="sr-only">untuk {member.sourceName}</span><select aria-label={`Pengguna untuk ${member.sourceName}`} value={userMappings[member.sourceName] ?? ""} disabled={busy !== null} onChange={(event) => { setUserMappings((current) => ({ ...current, [member.sourceName]: event.target.value })); invalidateDryRun(); }}><option value="">Tidak dipetakan (null)</option>{activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label></article>; })}</div></div>
      {mappingBlocked ? <p className="legacy-import-alert error" role="alert"><AlertTriangle size={17} aria-hidden="true" />Mapping belum siap: {invalidCodes} kode DP tidak valid, {unconfirmedWorkspaceUpdates} target sudah memiliki workspace, dan {missingTargetVersions} target belum memiliki metadata versi lengkap.</p> : null}
      <div className="legacy-import-block reconciliation"><div className="legacy-import-block-title"><div><span>03</span><h3>Rekonsiliasi</h3></div><p>Dry-run tidak menulis data. Periksa proyek, HPP, dan warning sebelum commit.</p></div>{dryRun ? <><ReconciliationCards totals={dryRun.totals} /><HppReconciliationCards hpp={dryRun.hpp} />{dryRun.warnings.length ? <div className="legacy-import-warning-list" role="status"><strong>{dryRun.warnings.length} warning perlu ditinjau</strong>{dryRun.warnings.map((warning, index) => <div key={`${warning.code}-${index}`}><code>{warning.code}</code><p>{warning.message}{warning.project ? ` · ${warning.project}` : ""}</p></div>)}<label><input type="checkbox" checked={warningsAcknowledged} onChange={(event) => setWarningsAcknowledged(event.target.checked)} /> Saya sudah meninjau warning dan memahami dampaknya.</label></div> : null}{dryRun.totals.errors || dryRun.warnings.length ? <p className={`legacy-import-alert ${dryRun.totals.errors ? "error" : "warning"}`} role="status"><AlertTriangle size={17} aria-hidden="true" />{dryRun.totals.errors} error dan {dryRun.warnings.length} warning ditemukan.</p> : <p className="legacy-import-alert success" role="status"><CheckCircle2 size={17} aria-hidden="true" />Dry-run bersih. Import siap dikomit.</p>}</> : <p className="legacy-import-empty">Mapping berubah atau belum diperiksa. Jalankan dry-run untuk menghitung dampak.</p>}
        <div className="legacy-import-actions"><button type="button" className="secondary-button" disabled={busy !== null || mappingBlocked} onClick={() => void reconcile()}>{busy === "dry-run" ? <><LoaderCircle className="spin" size={17} /> Memeriksa...</> : "Jalankan dry-run"}</button><button type="button" className="primary-button" disabled={commitBlocked} onClick={() => void commit()}>{busy === "commit" ? <><LoaderCircle className="spin" size={17} /> Mengimpor...</> : "Konfirmasi & commit"}</button></div>
      </div>
      {result ? <div className="legacy-import-result" role="status"><CheckCircle2 size={24} aria-hidden="true" /><div><strong>{result.idempotent ? "Import idempotent" : "Import selesai"}</strong><p>{result.message}</p>{result.importId ? <code>{result.importId}</code> : null}</div><ReconciliationCards totals={result.report.totals} /><HppReconciliationCards hpp={result.report.hpp} /></div> : null}
    </> : null}
  </section>;
}

export function UserManagementSection({ viewer, users, reload, setMessage, setError }: { viewer: Viewer; users: User[]; reload: () => Promise<void>; setMessage: (value: string) => void; setError: (value: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "STAFF", status: "ACTIVE", phone: "", password: "" });
  const [editing, setEditing] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function createUser(event: React.FormEvent) { event.preventDefault(); try { await readJson("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, phone: form.phone || null, password: form.password || undefined }) }); setForm({ name: "", email: "", role: "STAFF", status: "ACTIVE", phone: "", password: "" }); setMessage("Pengguna dibuat."); await reload(); } catch (error) { setError(error instanceof Error ? error.message : "Pengguna gagal dibuat."); } }
  async function updateUser(id: string, values: Record<string, unknown>) { try { await readJson(`/api/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }); setMessage("Pengguna diperbarui."); await reload(); } catch (error) { setError(error instanceof Error ? error.message : "Pengguna gagal diperbarui."); } }
  async function saveProfile(values: { name: string; email: string; phone: string | null }) { if (!editing) return; setBusyId(editing.id); try { await updateUser(editing.id, values); setEditing(null); } finally { setBusyId(null); } }
  async function deleteUser(user: User) { if (user.id === viewer.id || !window.confirm(`Hapus akun ${user.name}? Akun tidak dapat login lagi, tetapi histori pekerjaan tetap disimpan.`)) return; setBusyId(user.id); try { await readJson(`/api/users/${user.id}`, { method: "DELETE" }); setMessage(`Pengguna ${user.name} dihapus.`); await reload(); } catch (error) { setError(error instanceof Error ? error.message : "Pengguna gagal dihapus."); } finally { setBusyId(null); } }
  return <><PageHeading eyebrow="ADMINISTRASI" title="Pengguna dan role" description="Kelola akun aktif, role, status, dan akses dashboard." />
    <form className="user-form" onSubmit={createUser}><input required placeholder="Nama lengkap" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><input placeholder="Nomor WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /><input type="password" minLength={8} placeholder="Password development" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>STAFF</option><option>ADMIN</option></select><button className="primary-button compact" type="submit"><Plus size={16} /> Tambah pengguna</button></form>
    <div className="data-panel user-management-panel"><div className="table-scroll"><table className="users-table"><thead><tr><th>Pengguna</th><th>Kontak</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}{user.id === viewer.id ? " · Akun Anda" : ""}</small></td><td>{user.phone ?? "-"}</td><td><select aria-label={`Role ${user.name}`} value={user.role} disabled={busyId === user.id || user.id === viewer.id} onChange={(event) => void updateUser(user.id, { role: event.target.value })}><option>ADMIN</option><option>STAFF</option></select></td><td><select aria-label={`Status ${user.name}`} value={user.status} disabled={busyId === user.id || user.id === viewer.id} onChange={(event) => void updateUser(user.id, { status: event.target.value })}><option>ACTIVE</option><option>INVITED</option><option>SUSPENDED</option></select></td><td><div className="user-row-actions"><button type="button" className="secondary-button compact" disabled={busyId === user.id} onClick={() => setEditing(user)}><Pencil size={15} /> Edit</button><button type="button" className="danger-button compact" title={user.id === viewer.id ? "Akun yang sedang digunakan tidak dapat dihapus" : undefined} disabled={busyId === user.id || user.id === viewer.id} onClick={() => void deleteUser(user)}><Trash2 size={15} /> Hapus</button></div></td></tr>)}</tbody></table></div></div>
    {editing ? <UserEditor key={editing.id} user={editing} busy={busyId === editing.id} close={() => setEditing(null)} save={saveProfile} /> : null}
  </>;
}

export function AuditSection({ items }: { items: AuditEvent[] }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.actorName} ${item.action} ${item.entityType} ${item.entityId}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageHeading eyebrow="AUDIT TRAIL" title="Riwayat perubahan" description="Catatan append-only dari autentikasi, proyek, assignment, bukti, approval, import, dan pengguna." /><div className="audit-page"><div className="toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pengguna, entity, atau aksi" /></label><span className="result-count">{filtered.length} event</span></div><div className="audit-list">{filtered.map((item) => <div key={item.id}><span className="avatar">{initials(item.actorName ?? "System")}</span><p><strong>{item.actorName ?? "System"}</strong> {item.action.replaceAll(".", " ")}<small>{item.entityType} - {formatDate(item.createdAt, true)} - {item.result}</small></p><span className="audit-id">{item.id.slice(0, 8)}</span></div>)}</div></div></>;
}

