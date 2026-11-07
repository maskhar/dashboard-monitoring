"use client";

import { Archive, Check, Eye, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttachmentsPanel } from "./attachments";
import { ProjectSearchInput } from "./project-search-input";
import { RowActionsMenu } from "./row-actions-menu";
import { displayStatus, formatDate, PageHeading, Progress, readJson, workApiStatus, type Project, type Task, type User, type Viewer } from "./common";

type TaskView = "active" | "archived" | "deleted";
type TaskDraft = { title: string; description: string; dueDate: string; projectId: string; assigneeId: string; status: string; progress: number };
const emptyTask: TaskDraft = { title: "", description: "", dueDate: "", projectId: "", assigneeId: "", status: "NOT_STARTED", progress: 0 };

function draftFrom(task: Task): TaskDraft {
  return { title: task.title, description: task.description ?? "", dueDate: task.dueDate ?? "", projectId: task.projectId ?? task.project?.id ?? "", assigneeId: task.assigneeId ?? task.assignee?.id ?? "", status: task.status, progress: task.progress };
}

function TaskDetail({ task, close, setMessage, setError }: { task: Task; close: () => void; setMessage: (value: string) => void; setError: (value: string) => void }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="task-detail-title" className="management-form" style={{ position: "fixed", inset: "5vh max(16px, 8vw)", zIndex: 50, overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
    <div className="management-form-head"><div><p className="eyebrow">DETAIL TUGAS</p><h2 id="task-detail-title">{task.title}</h2></div><button type="button" className="icon-button" aria-label="Tutup detail tugas" onClick={close}><X size={18} /></button></div>
    <div className="design-metrics"><article><strong>{task.progress}%</strong><span>Progres</span></article><article><strong>{displayStatus(task.status)}</strong><span>Status</span></article><article><strong>{task.assignee?.name ?? "-"}</strong><span>PIC</span></article><article><strong>{formatDate(task.dueDate)}</strong><span>Deadline</span></article></div>
    <div className="management-form-grid"><label>Proyek<span>{task.project ? `${task.project.code} - ${task.project.brand}` : "Tanpa proyek"}</span></label><label className="wide">Deskripsi<span>{task.description || "Belum ada deskripsi."}</span></label></div>
    <AttachmentsPanel entityType="TASK" entityId={task.id} setMessage={setMessage} setError={setError} />
  </div>;
}

function TaskRow({ task, viewer, view, projects, staff, busy, save, manage, openDetail, selected, toggle }: { task: Task; viewer: Viewer; view: TaskView; projects: Project[]; staff: User[]; busy: boolean; save: (task: Task, draft: TaskDraft) => Promise<void>; manage: (task: Task, action: "archive" | "restore" | "delete") => Promise<void>; openDetail: (task: Task) => void; selected: boolean; toggle: (id: string) => void }) {
  const [draft, setDraft] = useState(() => draftFrom(task));
  const active = view === "active";
  const admin = viewer.role === "ADMIN";
  const original = draftFrom(task);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const controlDisabled = busy || !active;

  return <tr className="task-row">
    {admin ? <td className="selection-cell" data-label="Pilih"><input type="checkbox" aria-label={`Pilih ${task.title}`} checked={selected} disabled={busy} onChange={() => toggle(task.id)} /></td> : null}
    <td className="task-identity-cell" data-label="Tugas">{admin && active ? <div className="task-editor-stack"><input className="inline-input" aria-label={`Judul ${task.title}`} value={draft.title} placeholder="Judul tugas" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><textarea aria-label={`Deskripsi ${task.title}`} value={draft.description} placeholder="Tambahkan deskripsi singkat" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div> : <><strong>{task.title}</strong><small>{task.description || "Tanpa deskripsi"}</small></>}</td>
    <td className="task-project-cell" data-label="Proyek">{admin && active ? <ProjectSearchInput projects={projects} value={draft.projectId} disabled={busy} ariaLabel={`Proyek ${task.title}`} onChange={(projectId) => setDraft({ ...draft, projectId })} /> : <span>{task.project ? `${task.project.code} - ${task.project.brand}` : "Tanpa proyek"}</span>}</td>
    <td className="task-date-cell" data-label="Deadline">{admin && active ? <input className="inline-input" aria-label={`Deadline ${task.title}`} type="date" value={draft.dueDate} disabled={busy} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /> : formatDate(task.dueDate)}</td>
    <td className="task-pic-cell" data-label="PIC">{admin && active ? <select aria-label={`PIC ${task.title}`} value={draft.assigneeId} disabled={busy} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">Belum ditugaskan</option>{staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select> : <span>{task.assignee?.name ?? "Belum ditugaskan"}</span>}</td>
    <td className="task-status-cell" data-label="Status"><select aria-label={`Status ${task.title}`} value={displayStatus(draft.status)} disabled={controlDisabled} onChange={(event) => { const status = workApiStatus[event.target.value]; setDraft({ ...draft, status, progress: status === "COMPLETED" ? 100 : status === "NOT_STARTED" ? 0 : draft.progress === 100 ? 0 : draft.progress }); }}>{Object.keys(workApiStatus).map((status) => <option key={status}>{status}</option>)}</select></td>
    <td className="task-progress-cell" data-label="Progres"><div className="progress-cell"><input aria-label={`Progres ${task.title}`} type="number" min="0" max="100" step="5" value={draft.progress} disabled={controlDisabled} onChange={(event) => { const progress = Math.min(100, Math.max(0, Number(event.target.value))); setDraft({ ...draft, progress, status: progress === 100 ? "COMPLETED" : progress === 0 && draft.status === "COMPLETED" ? "NOT_STARTED" : progress > 0 && draft.status === "NOT_STARTED" ? "IN_PROGRESS" : draft.status }); }} /><span>%</span><Progress value={draft.progress} /></div></td>
    <td className="action-cell" data-label="Aksi"><div className="row-management"><button type="button" className="secondary-button compact" onClick={() => openDetail(task)}><Eye size={15} aria-hidden="true" /> Detail</button>{dirty && active ? <button type="button" className="primary-button compact save-row" disabled={busy || !draft.title.trim()} onClick={() => void save(task, draft)}><Check size={15} /> Simpan</button> : null}{admin ? <RowActionsMenu label={`Aksi tugas ${task.title}`}>{active ? <><button type="button" role="menuitem" disabled={busy} onClick={() => void manage(task, "archive")}><Archive size={15} /> Arsipkan</button><button type="button" role="menuitem" className="danger-text" disabled={busy} onClick={() => void manage(task, "delete")}><Trash2 size={15} /> Hapus</button></> : <button type="button" role="menuitem" disabled={busy} onClick={() => void manage(task, "restore")}><RotateCcw size={15} /> Pulihkan</button>}</RowActionsMenu> : null}</div></td>
  </tr>;
}

export function TasksSection({ viewer, projects, users, setMessage, setError }: { viewer: Viewer; projects: Project[]; users: User[]; setMessage: (value: string) => void; setError: (value: string) => void }) {
  const admin = viewer.role === "ADMIN";
  const [view, setView] = useState<TaskView>("active");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyTask);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); const [bulkAction, setBulkAction] = useState("assign"); const [bulkValue, setBulkValue] = useState(""); const [bulkBusy, setBulkBusy] = useState(false);
  const staff = useMemo(() => users.filter((user) => user.role === "STAFF" && user.status === "ACTIVE"), [users]);

  const loadTasks = useCallback(async () => {
    setLoading(true); setError("");
    try { const payload = await readJson<{ data: Task[] }>(`/api/tasks?view=${admin ? view : "active"}`); setTasks(payload.data); }
    catch (error) { setError(error instanceof Error ? error.message : "Daftar tugas gagal dimuat."); }
    finally { setLoading(false); }
  }, [admin, setError, view]);

  useEffect(() => { const timer = window.setTimeout(() => { void loadTasks(); }, 0); return () => window.clearTimeout(timer); }, [loadTasks]);
  async function createTask(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setError("");
    try {
      await readJson("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() || undefined, dueDate: form.dueDate || undefined, projectId: form.projectId || undefined, assigneeId: form.assigneeId || undefined }) });
      setForm(emptyTask); setShowCreate(false); setMessage("Tugas ditambahkan."); await loadTasks();
    } catch (error) { setError(error instanceof Error ? error.message : "Tugas gagal ditambahkan."); } finally { setCreating(false); }
  }

  async function saveTask(task: Task, draft: TaskDraft) {
    setBusyId(task.id); setError("");
    const body = viewer.role === "ADMIN" ? { title: draft.title.trim(), description: draft.description.trim() || null, dueDate: draft.dueDate || null, projectId: draft.projectId || null, assigneeId: draft.assigneeId || null, status: draft.status, progress: draft.progress, version: task.version } : { status: draft.status, progress: draft.progress, version: task.version };
    try { await readJson(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setMessage("Tugas tersimpan."); await loadTasks(); }
    catch (error) { setError(error instanceof Error ? error.message : "Tugas gagal disimpan."); } finally { setBusyId(""); }
  }

  async function manage(task: Task, action: "archive" | "restore" | "delete") {
    const question = action === "archive" ? `Arsipkan tugas ${task.title}?` : action === "delete" ? `Hapus tugas ${task.title}? Tugas dipindahkan ke tempat sampah.` : `Pulihkan tugas ${task.title}?`;
    if (!window.confirm(question)) return;
    setBusyId(task.id); setError("");
    try { if (action === "delete") await readJson(`/api/tasks/${task.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: task.version }) }); else await readJson(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, version: task.version }) }); setMessage(action === "archive" ? "Tugas diarsipkan." : action === "delete" ? "Tugas dipindahkan ke tempat sampah." : "Tugas dipulihkan."); await loadTasks(); }
    catch (error) { setError(error instanceof Error ? error.message : "Aksi tugas gagal."); } finally { setBusyId(""); }
  }
  function toggleSelected(id: string) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function runBulk() { if (!selectedIds.length) return; const action = view === "active" ? bulkAction : "restore"; if ((action === "assign" || action === "status") && !bulkValue) { setError("Pilih nilai aksi bulk."); return; } if ((action === "archive" || action === "restore") && !window.confirm(`${action === "archive" ? "Arsipkan" : "Pulihkan"} ${selectedIds.length} tugas?`)) return; setBulkBusy(true); setError(""); try { const body = action === "assign" ? { ids: selectedIds, action, assigneeId: bulkValue === "_" ? null : bulkValue } : action === "status" ? { ids: selectedIds, action, status: bulkValue } : { ids: selectedIds, action }; await readJson("/api/tasks/bulk", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setMessage(`${selectedIds.length} tugas diperbarui.`); setSelectedIds([]); await loadTasks(); } catch (error) { setError(error instanceof Error ? error.message : "Aksi bulk tugas gagal."); } finally { setBulkBusy(false); } }

  return <>
    {selectedTask ? <TaskDetail task={selectedTask} close={() => setSelectedTask(null)} setMessage={setMessage} setError={setError} /> : null}
    <PageHeading eyebrow="MANAJEMEN KERJA" title="Tugas" description={admin ? "Kelola tugas lintas proyek, PIC, deadline, dan progres." : "Perbarui status dan progres tugas yang ditugaskan kepada Anda."} actions={admin ? <button type="button" className="primary-button compact" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Tambah Tugas</button> : undefined} />
    {admin && showCreate ? <form className="management-form" onSubmit={createTask}><div className="management-form-head"><div><p className="eyebrow">TUGAS BARU</p><h2>Tambah tugas</h2></div><button type="button" className="icon-button" aria-label="Tutup form tambah tugas" onClick={() => setShowCreate(false)}><X size={18} /></button></div><div className="management-form-grid"><label>Judul<input value={form.title} required maxLength={250} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Deadline<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label><label>Proyek<ProjectSearchInput projects={projects} value={form.projectId} ariaLabel="Cari proyek tugas baru" onChange={(projectId) => setForm({ ...form, projectId })} /></label><label>PIC<select value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}><option value="">Belum ditugaskan</option>{staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="wide">Deskripsi<textarea value={form.description} maxLength={4000} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></div><div className="management-form-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Batal</button><button className="primary-button" disabled={creating}>{creating ? "Menambahkan..." : "Tambah tugas"}</button></div></form> : null}
    {admin ? <div className="toolbar"><select aria-label="Tampilan tugas" value={view} onChange={(event) => { setView(event.target.value as TaskView); setSelectedIds([]); }}><option value="active">Aktif</option><option value="archived">Arsip</option><option value="deleted">Tempat sampah</option></select><span className="result-count">{loading ? "Memuat..." : `${tasks.length} tugas`}</span></div> : null}
    {admin ? <div className="bulk-toolbar" aria-label="Aksi bulk tugas"><strong>{selectedIds.length} dipilih</strong>{view === "active" ? <><select aria-label="Aksi bulk tugas" value={bulkAction} onChange={(event) => { setBulkAction(event.target.value); setBulkValue(""); }}><option value="assign">Ubah PIC</option><option value="status">Ubah status</option><option value="archive">Arsipkan</option></select>{bulkAction === "assign" ? <select aria-label="PIC bulk tugas" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}><option value="">Pilih PIC</option><option value="_">Belum ditugaskan</option>{staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select> : bulkAction === "status" ? <select aria-label="Status bulk tugas" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)}><option value="">Pilih status</option>{Object.entries(workApiStatus).map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select> : null}</> : <span>Tugas akan dipulihkan ke daftar aktif.</span>}<button type="button" className="primary-button compact" disabled={!selectedIds.length || bulkBusy} onClick={() => void runBulk()}>{bulkBusy ? "Memproses..." : view === "active" ? "Terapkan" : "Pulihkan"}</button></div> : null}
    <div className="data-panel tasks-panel"><div className="table-scroll"><table className="tasks-table"><caption className="sr-only">Daftar tugas</caption><thead><tr>{admin ? <th className="selection-cell"><input type="checkbox" aria-label="Pilih semua tugas" checked={tasks.length > 0 && tasks.every((task) => selectedIds.includes(task.id))} disabled={!tasks.length || bulkBusy} onChange={() => setSelectedIds(tasks.every((task) => selectedIds.includes(task.id)) ? [] : tasks.map((task) => task.id))} /></th> : null}<th>Tugas</th><th>Proyek</th><th>Deadline</th><th>PIC</th><th>Status</th><th>Progres</th><th>Aksi</th></tr></thead><tbody>{tasks.map((task) => <TaskRow key={`${task.id}:${task.version}:${view}`} task={task} viewer={viewer} view={view} projects={projects} staff={staff} busy={busyId === task.id || bulkBusy} save={saveTask} manage={manage} openDetail={setSelectedTask} selected={selectedIds.includes(task.id)} toggle={toggleSelected} />)}{tasks.length === 0 ? <tr><td colSpan={admin ? 8 : 7}>{loading ? "Memuat tugas..." : "Belum ada tugas pada tampilan ini."}</td></tr> : null}</tbody></table></div></div>
  </>;
}
