"use client";

import { Archive, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Paperclip, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EmptyState, formatCurrency, formatDate, PageHeading, Progress, readJson, StatusBadge, type Approval, type DailyMilestone, type Gate, type KpiRow, type OperationsData, type User, type Viewer, type WeeklyPlan, workApiStatus } from "./common";
import { attainment, dash, isCurrency, KpiScore, MonthSelector, OperationsSummary, overdue, useKpiPeriod, weekStart, type ParityData } from "./operations-parity";
import { OperationsCalendar } from "./calendar-operations";

type Save = (path: string, body: Record<string, unknown>, message: string) => Promise<boolean>;
type EvidenceFile = { id: string; originalName: string; size: number; createdAt: string; uploadedBy: { id: string; name: string } };
type Upload = (file: File, entityType: string, entityId: string) => Promise<EvidenceFile>;
type AssignmentProps = { viewer: Viewer; users: User[]; save: Save };
type OpsView = "active" | "archived" | "deleted";
type Manage = (path: string, label: string, action: "archive" | "restore" | "delete") => Promise<void>;
type ManagementProps = { viewer: Viewer; view: OpsView; path: string; label: string; manage: Manage };
const tabs = [["kpi", "Target KPI"], ["timeline", "Program 3 Bulan"], ["onboarding", "14 Hari Pertama"], ["gates", "Gate Kelulusan"]] as const;
const firstDays = <T extends { day: number }>(items: T[]) => items.filter((item) => item.day <= 14);
function formatFileSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

function ManagementActions({ viewer, view, path, label, manage }: ManagementProps) {
  if (viewer.role !== "ADMIN") return null;
  return <div className="row-management">{view === "active" ? <><button type="button" className="secondary-button compact" onClick={() => void manage(path, label, "archive")}><Archive size={15} /> Arsip</button><button type="button" className="danger-button compact" onClick={() => void manage(path, label, "delete")}><Trash2 size={15} /> Hapus</button></> : <button type="button" className="secondary-button compact" onClick={() => void manage(path, label, "restore")}><RotateCcw size={15} /> Pulihkan</button>}</div>;
}

function Assignment({ viewer, users, save, entityType, item }: AssignmentProps & { entityType: string; item: { id: string; assigneeId: string | null } }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (viewer.role !== "ADMIN") return null;
  const staff = users.filter((user) => user.role === "STAFF" && user.status === "ACTIVE");
  return <label className="ops-field">PIC<select disabled={busy} value={item.assigneeId ?? ""} onChange={async (event) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    await save("/api/operations/assignment", { entityType, entityId: item.id, userId: event.target.value || null }, "PIC operasional diperbarui.");
    lock.current = false; setBusy(false);
  }}><option value="">Belum ditugaskan</option>{item.assigneeId && !staff.some((user) => user.id === item.assigneeId) ? <option value={item.assigneeId} disabled>{users.find((user) => user.id === item.assigneeId)?.name ?? "PIC saat ini"} (tidak tersedia)</option> : null}{staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>;
}

export function Evidence({ type, id, upload }: { type: string; id: string; upload: Upload }) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("loading");
  const [feedback, setFeedback] = useState("Memuat daftar bukti...");
  useEffect(() => { let active = true; readJson<{ data: EvidenceFile[] }>(`/api/evidence?entityType=${encodeURIComponent(type)}&entityId=${encodeURIComponent(id)}`).then((result) => { if (active) { setFiles(result.data); setStatus("idle"); setFeedback(""); } }).catch((error) => { if (active) { setStatus("error"); setFeedback(error instanceof Error ? error.message : "Daftar bukti gagal dimuat."); } }); return () => { active = false; }; }, [type, id]);
  return <div className="evidence-control">
    <label className="evidence-button"><Paperclip size={15} aria-hidden="true" /><span>{busy ? "Mengunggah..." : "Unggah bukti"}</span><input aria-label={`Unggah bukti ${type} ${id}`} disabled={busy} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx" onChange={async (event) => {
      const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
      setBusy(true); setStatus("loading"); setFeedback(`Mengunggah ${file.name}...`);
      try { const saved = await upload(file, type, id); setFiles((items) => [saved, ...items.filter((item) => item.id !== saved.id)]); setStatus("success"); setFeedback(`${file.name} berhasil diunggah.`); }
      catch (error) { setStatus("error"); setFeedback(error instanceof Error ? error.message : "Upload bukti gagal."); }
      finally { setBusy(false); input.value = ""; }
    }} /></label>
    {feedback ? <p className={`evidence-feedback ${status}`} role={status === "error" ? "alert" : "status"}>{status === "loading" ? <LoaderCircle size={14} className="evidence-spinner" aria-hidden="true" /> : status === "success" ? <CheckCircle2 size={14} aria-hidden="true" /> : null}<span>{feedback}</span></p> : null}
    {files.length ? <ul className="evidence-list" aria-label="File bukti"><>{files.map((file) => <li key={file.id}><div><strong>{file.originalName}</strong><span>{formatFileSize(file.size)} · {file.uploadedBy.name}</span></div><a href={`/api/evidence/${file.id}`} download aria-label={`Unduh ${file.originalName}`}><Download size={15} aria-hidden="true" /> Unduh</a></li>)}</></ul> : status !== "loading" ? <p className="evidence-empty">Belum ada file bukti.</p> : null}
  </div>;
}

function KpiEditor({ row, upload, management, ...props }: AssignmentProps & { row: KpiRow; upload: Upload; management: Omit<ManagementProps, "path" | "label"> }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const formId = useId();
  const score = attainment(row);
  return <tr data-testid="kpi-row"><td className="ops-copy" data-label="Indikator / PIC"><strong>{row.definition.name}</strong><small>{row.definition.code}{isCurrency(row) ? " - Target bersama Founder dan Manajer" : ""}</small>{management.view === "active" ? <Assignment {...props} entityType="KPI_TARGET" item={row.target} /> : null}</td>
    <td data-label="Target">{isCurrency(row) ? formatCurrency(Number(row.target.target)) : Number(row.target.target)}</td>
    <td data-label="Aktual"><label className="ops-field">Aktual<input form={formId} className="inline-input ops-kpi-input" name="actual" type="number" min="0" step="any" defaultValue={row.actual?.actual ?? ""} disabled={busy || management.view !== "active"} /></label>{isCurrency(row) && row.actual?.actual !== null && row.actual?.actual !== undefined ? <small>{formatCurrency(Number(row.actual.actual))}</small> : null}</td>
    <td data-label="Capaian">{score === null ? <span className="muted">{Number(row.target.target) === 0 ? dash : "Belum dilaporkan"}</span> : <div className="attainment"><strong>{Math.round(score)}%</strong><Progress value={score} tone={score >= 100 ? "success" : "warning"} /></div>}</td>
    <td data-label="Bukti / evaluasi"><form id={formId} className="ops-editor ops-note" onSubmit={async (event) => { event.preventDefault(); if (lock.current) return; const fields = new FormData(event.currentTarget); lock.current = true; setBusy(true); await props.save(`/api/operations/kpis/${row.target.id}`, { actual: String(fields.get("actual") ?? "").trim() === "" ? null : Number(fields.get("actual")), evaluation: String(fields.get("evaluation") ?? ""), version: row.actual?.version }, "Aktual dan evaluasi KPI tersimpan."); lock.current = false; setBusy(false); }}>
      <label className="ops-field">Evaluasi / catatan bukti<textarea name="evaluation" maxLength={4000} defaultValue={row.actual?.evaluation ?? ""} disabled={busy || management.view !== "active"} /></label><div className="ops-actions"><button className="secondary-button compact" disabled={busy || management.view !== "active"}>{busy ? "Menyimpan..." : "Simpan KPI"}</button>{management.view === "active" ? <Evidence type="KPI_TARGET" id={row.target.id} upload={upload} /> : null}<ManagementActions {...management} path={`/api/operations/kpis/${row.target.id}`} label={row.definition.name} /></div>
    </form></td></tr>;
}

function WeekEditor({ week, upload, pending, submit, management, ...props }: AssignmentProps & { week: WeeklyPlan & { startDate?: string | null }; upload: Upload; pending: boolean; submit: (week: WeeklyPlan, changes: Record<string, unknown>) => Promise<boolean>; management: Omit<ManagementProps, "path" | "label"> }) {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const lock = useRef(false);
  const admin = props.viewer.role === "ADMIN";
  const disabled = busy || management.view !== "active" || (!admin && (pending || submitted));
  return <article className="timeline-card" data-testid="weekly-plan"><div className="week-number"><span>{week.week}</span><i /></div><div>
    <div className="timeline-title"><div><small>AO-{String(week.week).padStart(3, "0")} - {formatDate(weekStart(week.dueDate, week.startDate))} sampai {formatDate(week.dueDate)}</small><h3>{week.focus}</h3><p className="muted">{week.deliverable}</p></div><div><StatusBadge status={week.status} />{overdue(week) ? <p className="ops-flag">Terlambat</p> : null}</div></div>
    <Progress value={week.progress} tone={week.status === "COMPLETED" ? "success" : "primary"} />
    <form onSubmit={async (event) => {
      event.preventDefault(); if (lock.current || disabled) return;
      const fields = new FormData(event.currentTarget);
      const changes = { progress: Number(fields.get("progress")), status: String(fields.get("status")), ...(admin ? { managerNote: String(fields.get("reviewNote") ?? ""), reviewNote: String(fields.get("reviewNote") ?? ""), nextAction: String(fields.get("nextAction") ?? "") } : {}) };
      lock.current = true; setBusy(true);
      const ok = admin ? await props.save(`/api/operations/weeks/${week.id}`, { ...changes, version: week.version }, `Minggu ${week.week} tersimpan.`) : await submit(week, changes);
      if (ok && !admin) setSubmitted(true);
      lock.current = false; setBusy(false);
    }}><div className="ops-fields">
      <label className="ops-field">Progres (%)<input className="compact-number" name="progress" type="number" min="0" max="100" step="1" required defaultValue={week.progress} disabled={disabled} /></label>
      <label className="ops-field">Status<select name="status" defaultValue={week.status} disabled={disabled}>{Object.entries(workApiStatus).map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="ops-field">Review Manajer<textarea name="reviewNote" maxLength={4000} defaultValue={week.reviewNote ?? ""} readOnly={!admin} disabled={busy} /></label>
      <label className="ops-field">Next action<textarea name="nextAction" maxLength={4000} defaultValue={week.nextAction ?? ""} readOnly={!admin} disabled={busy} /></label>
    </div><div className="ops-actions"><button className="secondary-button compact" disabled={disabled}>{busy ? "Menyimpan..." : admin ? "Simpan minggu" : pending || submitted ? "Menunggu review" : "Ajukan review"}</button>{management.view === "active" ? <Evidence type="WEEKLY_PLAN" id={week.id} upload={upload} /> : null}{!admin ? <span className="muted">Perubahan masih draft hingga diajukan.</span> : null}<ManagementActions {...management} path={`/api/operations/weeks/${week.id}`} label={`Minggu ${week.week}`} /></div></form>
    {management.view === "active" ? <Assignment {...props} entityType="WEEKLY_PLAN" item={week} /> : null}
  </div></article>;
}

function DayEditor({ day, upload, management, ...props }: AssignmentProps & { day: DailyMilestone; upload: Upload; management: Omit<ManagementProps, "path" | "label"> }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const formId = useId();
  return <tr data-testid="daily-milestone"><td><input form={formId} name="completed" type="checkbox" aria-label={`Hari ${day.day} selesai`} defaultChecked={day.status === "COMPLETED"} disabled={busy} /></td><td>Hari {day.day}</td><td>{formatDate(day.dueDate)}{overdue(day) ? <small className="ops-flag">Terlambat</small> : <small>{day.status === "COMPLETED" ? "Selesai" : "Belum selesai"}</small>}</td>
    <td className="ops-copy"><strong>{day.title}</strong><small>{day.deliverable}</small>{management.view === "active" ? <Assignment {...props} entityType="DAILY_MILESTONE" item={day} /> : null}</td>
    <td><label className="ops-field ops-note">Bukti hasil<textarea form={formId} name="evidenceNote" maxLength={4000} defaultValue={day.evidenceNote ?? ""} disabled={busy || management.view !== "active"} /></label>{management.view === "active" ? <Evidence type="DAILY_MILESTONE" id={day.id} upload={upload} /> : null}</td>
    <td><form id={formId} className="ops-editor ops-note" onSubmit={async (event) => { event.preventDefault(); if (lock.current) return; const fields = new FormData(event.currentTarget); lock.current = true; setBusy(true); await props.save(`/api/operations/days/${day.id}`, { completed: fields.has("completed"), evidenceNote: String(fields.get("evidenceNote") ?? ""), ...(props.viewer.role === "ADMIN" ? { mentorNote: String(fields.get("mentorNote") ?? "") } : {}) }, `Hari ${day.day} diperbarui.`); lock.current = false; setBusy(false); }}>
      <label className="ops-field">Catatan mentor<textarea name="mentorNote" maxLength={4000} defaultValue={day.mentorNote ?? ""} readOnly={props.viewer.role !== "ADMIN"} disabled={busy || management.view !== "active"} /></label><button className="secondary-button compact" disabled={busy || management.view !== "active"}>{busy ? "Menyimpan..." : "Simpan hari"}</button><ManagementActions {...management} path={`/api/operations/days/${day.id}`} label={`Hari ${day.day}`} />
    </form></td></tr>;
}

function GateEditor({ gate, upload, management, ...props }: AssignmentProps & { gate: Gate; upload: Upload; management: Omit<ManagementProps, "path" | "label"> }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function update(status: string) { if (lock.current) return; lock.current = true; setBusy(true); await props.save(`/api/operations/gates/${gate.id}`, { status }, "Status gate diperbarui."); lock.current = false; setBusy(false); }
  return <article className="panel" data-testid="phase-gate"><div className="panel-head"><h2>{gate.title}</h2><StatusBadge status={gate.status} /></div><div className="ops-editor"><label><input type="checkbox" checked={gate.status === "COMPLETED"} disabled={busy || management.view !== "active"} onChange={(event) => void update(event.target.checked ? "COMPLETED" : "NOT_STARTED")} /> Syarat terpenuhi</label><label className="ops-field">Status gate<select value={gate.status} disabled={busy || management.view !== "active"} onChange={(event) => void update(event.target.value)}>{!Object.values(workApiStatus).includes(gate.status) ? <option value={gate.status}>{gate.status}</option> : null}{Object.entries(workApiStatus).map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="muted">{gate.evidenceRequired ? "Bukti wajib sebelum kelulusan." : "Bukti tidak diwajibkan."}</p>{management.view === "active" ? <><Evidence type="GATE" id={gate.id} upload={upload} /><Assignment {...props} entityType="GATE" item={gate} /></> : null}<ManagementActions {...management} path={`/api/operations/gates/${gate.id}`} label={gate.title} /></div></article>;
}

export function OperationsSection({ viewer, data, users = [], reload, setMessage, setError }: { viewer: Viewer; data: OperationsData | null; users?: User[]; reload: () => Promise<void>; setMessage: (value: string) => void; setError: (value: string) => void }) {
  const [tab, setTab] = useState<typeof tabs[number][0]>("kpi");
  const [view, setView] = useState<OpsView>("active");
  const [storedData, setStoredData] = useState<OperationsData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [approvalsReady, setApprovalsReady] = useState(viewer.role === "ADMIN");
  const prefix = useId();
  const months = useKpiPeriod(data);
  useEffect(() => { if (view === "active") return; let current = true; readJson<OperationsData>(`/api/operations?view=${view}&periodId=${encodeURIComponent(months.periodId)}`).then((result) => { if (current) setStoredData(result); }).catch((error) => { if (current) setError(error instanceof Error ? error.message : "Data operasional gagal dimuat."); }); return () => { current = false; }; }, [view, months.periodId, setError]);
  useEffect(() => {
    if (viewer.role !== "STAFF") return;
    let active = true;
    readJson<{ data: Approval[] }>("/api/approvals?status=PENDING").then((result) => { if (active) { setPending(result.data.filter((item) => item.entityType === "WEEKLY_PLAN").map((item) => item.entityId)); setApprovalsReady(true); } }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Gagal memuat pengajuan."); });
    return () => { active = false; };
  }, [viewer.role, setError]);
  async function refresh() { months.refresh(); await reload(); }
  async function save(path: string, body: Record<string, unknown>, success: string) {
    try { await readJson(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
    catch (error) { setError(error instanceof Error ? error.message : "Perubahan gagal disimpan."); return false; }
    setMessage(success);
    try { await refresh(); } catch { setError("Perubahan tersimpan, tetapi pemuatan ulang gagal. Muat ulang halaman sebelum edit berikutnya."); }
    return true;
  }
  async function upload(file: File, entityType: string, entityId: string) {
    const form = new FormData(); form.set("file", file); form.set("entityType", entityType); form.set("entityId", entityId);
    const saved = await readJson<EvidenceFile>("/api/evidence", { method: "POST", body: form });
    setMessage("Bukti berhasil diunggah.");
    return saved;
  }
  async function submit(week: WeeklyPlan, changes: Record<string, unknown>) {
    if (pending.includes(week.id)) return false;
    try { await readJson("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType: "WEEKLY_PLAN", entityId: week.id, approvalType: "WEEKLY_REVIEW", baseVersion: week.version, submittedSnapshot: changes }) }); }
    catch (error) { setError(error instanceof Error ? error.message : "Pengajuan gagal."); return false; }
    setPending((items) => [...items, week.id]); setMessage(`Minggu ${week.week} diajukan untuk review.`);
    try { await reload(); } catch { setError("Pengajuan tersimpan, tetapi pemuatan ulang gagal."); }
    return true;
  }
  async function refreshScoped() { if (view === "active") return refresh(); const result = await readJson<OperationsData>(`/api/operations?view=${view}&periodId=${encodeURIComponent(months.periodId)}`); setStoredData(result); }
  async function manage(path: string, label: string, action: "archive" | "restore" | "delete") { const question = action === "archive" ? `Arsipkan ${label}? Item berpindah dari tampilan aktif.` : action === "delete" ? `Hapus ${label}? Item dipindahkan ke tempat sampah dan dapat dipulihkan.` : `Pulihkan ${label} ke tampilan aktif?`; if (!window.confirm(question)) return; try { if (action === "delete") await readJson(path, { method: "DELETE" }); else await readJson(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); setMessage(action === "archive" ? "Item diarsipkan." : action === "delete" ? "Item dipindahkan ke tempat sampah." : "Item dipulihkan."); await refreshScoped(); } catch (error) { setError(error instanceof Error ? error.message : "Aksi item gagal."); } }
  async function createItem(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!data?.period) return; const fields = new FormData(event.currentTarget); const assigneeId = String(fields.get("assigneeId") ?? "") || undefined; const dueDate = String(fields.get("dueDate") ?? "") || undefined; let body: Record<string, unknown>;
    if (tab === "timeline") body = { type: "WEEKLY_PLAN", periodId: data.period.id, week: Number(fields.get("week")), focus: String(fields.get("focus")), deliverable: String(fields.get("deliverable")), dueDate, assigneeId };
    else if (tab === "onboarding") body = { type: "DAILY_MILESTONE", periodId: data.period.id, day: Number(fields.get("day")), title: String(fields.get("title")), deliverable: String(fields.get("deliverable")), dueDate, assigneeId };
    else if (tab === "gates") body = { type: "GATE", periodId: data.period.id, title: String(fields.get("title")), assigneeId };
    else body = { type: "KPI_TARGET", periodId: months.periodId || data.period.id, code: String(fields.get("code")), name: String(fields.get("name")), unit: String(fields.get("unit")), target: Number(fields.get("target")), assigneeId };
    setCreating(true); try { await readJson("/api/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setShowCreate(false); setMessage("Item operasional ditambahkan."); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Item operasional gagal ditambahkan."); } finally { setCreating(false); }
  }
  const current = view === "active" ? data : storedData;
  if (!current?.period) return <EmptyState title="Belum ada periode" description="Admin perlu membuat periode monitoring terlebih dahulu." />;
  const visibleData = { ...current, dailyMilestones: firstDays(current.dailyMilestones) };
  const program = (current as ParityData).programPeriod ?? (current as ParityData).timelinePeriod ?? current.period;
  const assignment = { viewer, users, save };
  const management = { viewer, view, manage };
  return <div className="ops-parity">
    <PageHeading eyebrow="OPERASIONAL" title="Monitoring operasional" description={`Program 3 Bulan: ${formatDate(program.startDate)} sampai ${formatDate(program.endDate)}.`} actions={<>{viewer.role === "ADMIN" ? <><select aria-label="Tampilan operasional" value={view} onChange={(event) => { setView(event.target.value as OpsView); setShowCreate(false); }}><option value="active">Aktif</option><option value="archived">Arsip</option><option value="deleted">Tempat sampah</option></select>{view === "active" ? <button type="button" className="primary-button compact" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Tambah</button> : null}</> : null}<a className="secondary-button compact" href="/api/reports/excel"><FileSpreadsheet size={16} /> Export Excel</a></>} />
    {viewer.role === "ADMIN" && showCreate && view === "active" ? <form className="management-form" onSubmit={createItem}><div className="management-form-head"><div><p className="eyebrow">ITEM BARU</p><h2>Tambah {tabs.find(([id]) => id === tab)?.[1]}</h2></div><button type="button" className="icon-button" aria-label="Tutup form tambah item" onClick={() => setShowCreate(false)}><X size={18} /></button></div><div className="management-form-grid">{tab === "kpi" ? <><label>Kode<input name="code" required /></label><label>Nama KPI<input name="name" required /></label><label>Unit<input name="unit" required /></label><label>Target<input name="target" type="number" min="0" step="any" required /></label></> : tab === "timeline" ? <><label>Minggu<input name="week" type="number" min="1" required /></label><label>Fokus<input name="focus" required /></label><label className="wide">Deliverable<textarea name="deliverable" required /></label><label>Deadline<input name="dueDate" type="date" /></label></> : tab === "onboarding" ? <><label>Hari<input name="day" type="number" min="1" max="14" required /></label><label>Judul<input name="title" required /></label><label className="wide">Deliverable<textarea name="deliverable" required /></label><label>Deadline<input name="dueDate" type="date" /></label></> : <label className="wide">Judul gate<input name="title" required /></label>}<label>PIC<select name="assigneeId"><option value="">Belum ditugaskan</option>{users.filter((user) => user.role === "STAFF" && user.status === "ACTIVE").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div><div className="management-form-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Batal</button><button className="primary-button" disabled={creating}>{creating ? "Menambahkan..." : "Tambah item"}</button></div></form> : null}
    {view === "active" ? <OperationsSummary data={visibleData} /> : null}
    <OperationsCalendar data={visibleData} users={users} userId={viewer.id} />
    <div className="tabs" role="tablist" aria-label="Monitoring operasional">{tabs.map(([id, label], index) => <button key={id} type="button" role="tab" id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? "active" : ""} onClick={() => setTab(id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null; if (next === null) return; event.preventDefault(); setTab(tabs[next][0]); document.getElementById(`${prefix}-tab-${tabs[next][0]}`)?.focus(); }}>{label}</button>)}</div>
    <section role="tabpanel" id={`${prefix}-panel-kpi`} aria-labelledby={`${prefix}-tab-kpi`} tabIndex={0} hidden={tab !== "kpi"}>
      <div className="data-panel kpi-panel"><div className="panel-head padded"><div><h2>Target KPI bulanan</h2><p className="muted">Kosong berarti belum dilaporkan, bukan nol.</p></div><MonthSelector periods={months.periods} value={months.periodId} onChange={months.select} /></div>
      {view === "active" && months.error ? <p role="alert">{months.error} <button className="secondary-button compact" onClick={months.refresh}>Coba lagi</button></p> : view === "active" && months.loading ? <p role="status">Memuat KPI bulan...</p> : <><div className="panel padded"><KpiScore rows={view === "active" && months.current ? months.current.kpis : current.kpis} /></div><div className="table-scroll"><table className="kpi-table"><thead><tr><th>Indikator / PIC</th><th>Target</th><th>Aktual</th><th>Capaian</th><th>Bukti / evaluasi</th></tr></thead><tbody>{(view === "active" && months.current ? months.current.kpis : current.kpis).map((row) => <KpiEditor key={`${row.target.id}:${row.actual?.version ?? 0}:${view}`} row={row} upload={upload} management={management} {...assignment} />)}</tbody></table></div></>}</div>
    </section>
    <section role="tabpanel" id={`${prefix}-panel-timeline`} aria-labelledby={`${prefix}-tab-timeline`} tabIndex={0} hidden={tab !== "timeline"}><div className="timeline-grid">{current.weeklyPlans.map((week) => <WeekEditor key={`${week.id}:${week.version}:${view}`} week={week} upload={upload} pending={!approvalsReady || pending.includes(week.id)} submit={submit} management={management} {...assignment} />)}</div></section>
    <section role="tabpanel" id={`${prefix}-panel-onboarding`} aria-labelledby={`${prefix}-tab-onboarding`} tabIndex={0} hidden={tab !== "onboarding"}><div className="data-panel table-scroll"><table><thead><tr><th>Selesai</th><th>Hari</th><th>Tanggal / status</th><th>Fokus / PIC</th><th>Bukti hasil</th><th>Catatan mentor / aksi</th></tr></thead><tbody>{visibleData.dailyMilestones.map((day) => <DayEditor key={`${day.id}:${day.status}:${view}`} day={day} upload={upload} management={management} {...assignment} />)}</tbody></table></div></section>
    <section role="tabpanel" id={`${prefix}-panel-gates`} aria-labelledby={`${prefix}-tab-gates`} tabIndex={0} hidden={tab !== "gates"}><div className="gate-grid">{current.gates.map((gate) => <GateEditor key={`${gate.id}:${view}`} gate={gate} upload={upload} management={management} {...assignment} />)}</div><p className="muted">Pengadaan mandiri dimulai setelah fase penjualan dinyatakan lulus.</p></section>
  </div>;
}





