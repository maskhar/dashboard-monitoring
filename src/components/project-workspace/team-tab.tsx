"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleUserRound, Mail, RefreshCw, Save, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { jsonRequest, loadActiveWorkspaceUsers, workspaceRequest } from "./api";
import { roleLabel } from "./format";
import styles from "./workspace.module.css";
import type { MutationRunner, WorkspaceAssignment, WorkspaceRole, WorkspaceSnapshot, WorkspaceUser } from "./types";

const workspaceRoles: WorkspaceRole[] = ["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER", "PRODUCTION_TEAM", "FINANCE_ADMIN", "INSTALLATION_SUPPORT"];
const multiUserRoles = new Set<WorkspaceRole>(["PRODUCTION_TEAM", "INSTALLATION_SUPPORT"]);

type Props = { projectId: string; snapshot: WorkspaceSnapshot; runMutation: MutationRunner; editable: boolean };

export function TeamTab({ projectId, snapshot, runMutation, editable }: Props) {
  const activeAssignments = snapshot.assignments.filter((assignment) => assignment.active !== false);
  const grouped = activeAssignments.reduce<Record<string, typeof activeAssignments>>((roles, assignment) => {
    (roles[assignment.role] ??= []).push(assignment);
    return roles;
  }, {});
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(editable);
  const [usersError, setUsersError] = useState("");
  const [newAssignment, setNewAssignment] = useState<{ userId: string; role: WorkspaceRole }>({ userId: "", role: "DESIGNER" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const loadUsers = useCallback(async () => {
    if (!editable) return;
    setUsersLoading(true);
    setUsersError("");
    try { setUsers(await loadActiveWorkspaceUsers()); }
    catch (error) { setUsersError(error instanceof Error ? error.message : "Pengguna aktif gagal dimuat."); }
    finally { setUsersLoading(false); }
  }, [editable]);

  useEffect(() => { const timer = window.setTimeout(() => { void loadUsers(); }, 0); return () => window.clearTimeout(timer); }, [loadUsers]);

  const availableUsers = users.filter((user) => !activeAssignments.some((assignment) => assignment.userId === user.id && assignment.role === newAssignment.role));

  async function addAssignment(event: React.FormEvent) {
    event.preventDefault();
    if (!newAssignment.userId) { setAddError("Pilih anggota tim terlebih dahulu."); return; }
    setAdding(true);
    setAddError("");
    const result = await runMutation(
      () => workspaceRequest(`/api/projects/${projectId}/workspace/assignments`, jsonRequest("POST", { ...newAssignment, version: snapshot.workspace.version })),
      `${roleLabel(newAssignment.role)} diperbarui.`,
    );
    if (!result.ok) setAddError(result.conflict ? "Data tim berubah. Muat snapshot terbaru lalu coba kembali." : result.error);
    else setNewAssignment((value) => ({ ...value, userId: "" }));
    setAdding(false);
  }

  return <div className={styles.tabStack}>
    {editable ? <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>KELOLA TIM</span><h2>Tambah assignment</h2></div><small>Role inti menerima satu user aktif. Tim Produksi dan Dukungan Instalasi dapat memiliki beberapa anggota.</small></div>
      {usersError ? <div className={styles.inlineError} role="alert"><span>{usersError}</span><button type="button" onClick={() => void loadUsers()}><RefreshCw size={15} aria-hidden="true" />Coba lagi</button></div> : null}
      <form className={styles.assignmentForm} onSubmit={addAssignment}>
        <label><span>Role proyek</span><select value={newAssignment.role} disabled={adding} onChange={(event) => setNewAssignment({ role: event.target.value as WorkspaceRole, userId: "" })}>{workspaceRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
        <label><span>Pengguna aktif</span><select value={newAssignment.userId} disabled={adding || usersLoading} onChange={(event) => setNewAssignment((value) => ({ ...value, userId: event.target.value }))}><option value="">{usersLoading ? "Memuat pengguna..." : "Pilih pengguna"}</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.email}</option>)}</select></label>
        <button type="submit" className={styles.primaryButton} disabled={adding || usersLoading || !newAssignment.userId}><UserPlus size={17} aria-hidden="true" />{adding ? "Menambahkan..." : multiUserRoles.has(newAssignment.role) ? "Tambah anggota" : "Tetapkan role"}</button>
      </form>
      {addError ? <p className={styles.fieldError} role="alert">{addError}</p> : null}
    </section> : null}

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>TIM KERJA</span><h2>Assignment proyek</h2></div><div className={styles.compactStat}><UsersRound size={18} aria-hidden="true" /><strong>{activeAssignments.length}</strong><span>anggota aktif</span></div></div>
      <p className={styles.sectionIntro}>{editable ? "Ubah role atau anggota langsung dari kartu assignment. Perubahan akses berlaku setelah snapshot disegarkan." : "Assignment proyek bersifat read-only untuk akun Staff."}</p>
      {activeAssignments.length ? <div className={styles.teamGrid}>
        {Object.entries(grouped).map(([role, members]) => <section key={role} className={styles.teamRole}>
          <div className={styles.teamRoleHeading}><ShieldCheck size={18} aria-hidden="true" /><div><h3>{roleLabel(role)}</h3><span>{members.length} anggota</span></div></div>
          <div className={styles.teamMemberList}>{members.map((assignment) => editable ? <AssignmentEditor key={assignment.id} projectId={projectId} assignment={assignment} users={users} version={snapshot.workspace.version} runMutation={runMutation} /> : <ReadOnlyMember key={assignment.id} assignment={assignment} />)}</div>
        </section>)}
      </div> : <div className={styles.emptyState}><UsersRound size={28} aria-hidden="true" /><h3>Belum ada assignment</h3><p>{editable ? "Tambahkan pengguna aktif dan tetapkan role proyek." : "Tim proyek belum ditetapkan oleh Admin."}</p></div>}
    </section>
  </div>;
}

function AssignmentEditor({ projectId, assignment, users, version, runMutation }: { projectId: string; assignment: WorkspaceAssignment; users: WorkspaceUser[]; version: number; runMutation: MutationRunner }) {
  const [draft, setDraft] = useState({ userId: assignment.userId ?? assignment.user?.id ?? "", role: assignment.role });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = draft.userId !== (assignment.userId ?? assignment.user?.id ?? "") || draft.role !== assignment.role;

  async function save() {
    setBusy(true); setError("");
    const result = await runMutation(() => workspaceRequest(`/api/projects/${projectId}/workspace/assignments/${assignment.id}`, jsonRequest("PATCH", { ...draft, version })), "Assignment tim diperbarui.");
    if (!result.ok) setError(result.conflict ? "Assignment berubah. Muat data terbaru lalu ulangi." : result.error);
    setBusy(false);
  }

  async function remove() {
    const name = assignment.user?.name ?? assignment.name ?? "anggota ini";
    if (!window.confirm(`Nonaktifkan assignment ${name} sebagai ${roleLabel(assignment.role)}?`)) return;
    setBusy(true); setError("");
    const result = await runMutation(() => workspaceRequest(`/api/projects/${projectId}/workspace/assignments/${assignment.id}`, jsonRequest("DELETE", { version })), "Assignment dinonaktifkan.");
    if (!result.ok) setError(result.conflict ? "Assignment berubah. Muat data terbaru lalu ulangi." : result.error);
    setBusy(false);
  }

  return <article className={styles.assignmentEditor}>
    <div className={styles.assignmentIdentity}><span className={styles.avatar}><CircleUserRound size={21} aria-hidden="true" /></span><div><strong>{assignment.user?.name ?? assignment.name ?? "Pengguna"}</strong><small><Mail size={13} aria-hidden="true" />{assignment.user?.email ?? assignment.email ?? "Email tidak tersedia"}</small></div></div>
    <label><span>Pengguna</span><select aria-label={`Pengguna untuk ${roleLabel(assignment.role)}`} value={draft.userId} disabled={busy || !users.length} onChange={(event) => setDraft((value) => ({ ...value, userId: event.target.value }))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
    <label><span>Role</span><select aria-label={`Role ${assignment.user?.name ?? assignment.name ?? "pengguna"}`} value={draft.role} disabled={busy} onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value as WorkspaceRole }))}>{workspaceRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
    {error ? <p className={styles.fieldError} role="alert">{error}</p> : null}
    <div className={styles.assignmentActions}><button type="button" className={`${styles.secondaryButton} ${styles.dangerText}`} disabled={busy} onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" />Nonaktifkan</button><button type="button" className={styles.primaryButton} disabled={busy || !dirty || !draft.userId} onClick={() => void save()}><Save size={16} aria-hidden="true" />{busy ? "Memproses..." : "Simpan"}</button></div>
  </article>;
}

function ReadOnlyMember({ assignment }: { assignment: WorkspaceAssignment }) {
  const name = assignment.user?.name ?? assignment.name ?? "Pengguna";
  const email = assignment.user?.email ?? assignment.email;
  return <article className={styles.teamMember}><span className={styles.avatar}><CircleUserRound size={21} aria-hidden="true" /></span><div><strong>{name}</strong>{email ? <small><Mail size={13} aria-hidden="true" />{email}</small> : <small>ID {assignment.userId ?? assignment.user?.id ?? "-"}</small>}</div></article>;
}
