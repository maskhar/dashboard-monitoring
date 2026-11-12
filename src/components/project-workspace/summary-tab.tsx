"use client";

import { useState } from "react";
import { CalendarDays, Check, CheckCircle2, FileCheck2, LockKeyhole, MapPin, RefreshCw, RotateCcw, Send, Target, WalletCards, X } from "lucide-react";
import { jsonRequest, workspaceRequest } from "./api";
import { formatCurrency, formatPercent, formatWorkspaceDate } from "./format";
import { StatusPill } from "./status-pill";
import styles from "./workspace.module.css";
import type { MutationRunner, WorkspacePhase, WorkspaceRole, WorkspaceSnapshot, WorkspaceViewer } from "./types";

type Props = { projectId: string; snapshot: WorkspaceSnapshot; runMutation: MutationRunner; canEditProfile: boolean; viewerRole: WorkspaceViewer["role"]; viewerRoles: WorkspaceRole[] };

export function SummaryTab({ projectId, snapshot, runMutation, canEditProfile, viewerRole, viewerRoles }: Props) {
  const { project, workspace, metrics, phases } = snapshot;
  const workspaceLocked = workspace.commercialStatus !== "DRAFT";
  const profileEditable = canEditProfile && !workspaceLocked;
  const [profile, setProfile] = useState({ clientName: workspace.clientName ?? "", location: workspace.location ?? "", dealDate: workspace.dealDate ?? "" });

  const profileDirty = profile.clientName !== (workspace.clientName ?? "") || profile.location !== (workspace.location ?? "") || profile.dealDate !== (workspace.dealDate ?? "");

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    await runMutation(
      () => workspaceRequest(`/api/projects/${projectId}/workspace`, jsonRequest("PATCH", { clientName: profile.clientName.trim() || null, location: profile.location.trim() || null, dealDate: profile.dealDate || null, version: workspace.version })),
      "Profil proyek tersimpan.",
    );
  }

  const stageTotal = snapshot.stages.length;
  const completedStages = metrics.completedStages ?? snapshot.stages.filter((stage) => stage.status === "COMPLETED").length;
  const documentTotal = metrics.requiredDocuments ?? snapshot.documents.filter((document) => document.required).length;
  const acceptedDocuments = metrics.acceptedDocuments ?? snapshot.documents.filter((document) => ["ACCEPTED", "WAIVED"].includes(document.status)).length;

  return <div className={styles.tabStack}>
    <section className={styles.metricGrid} aria-label="KPI ruang proyek">
      {snapshot.financialsVisible ? <>
        <Metric icon={WalletCards} label="Nilai kontrak" value={formatCurrency(workspace.contractValue, workspace.currency ?? "IDR")} note={workspace.commercialStatus ? `Status ${workspace.commercialStatus.toLowerCase()}` : "Belum ditetapkan"} />
        <Metric icon={Target} label="HPP rencana" value={formatCurrency(metrics.plannedHpp, workspace.currency ?? "IDR")} note={`Target margin ${formatPercent(workspace.targetMarginPct)}`} />
      </> : <article className={`${styles.metricCard} ${styles.restrictedMetric}`}><span><LockKeyhole size={19} aria-hidden="true" /></span><div><small>Finansial proyek</small><strong>Data finansial dibatasi</strong><p>Nilai kontrak, HPP, dan margin hanya tersedia untuk role berwenang.</p></div></article>}
      <Metric icon={CheckCircle2} label="Tahap selesai" value={`${completedStages}/${stageTotal}`} note={`${metrics.lateStages ?? 0} tahap terlambat`} />
      <Metric icon={FileCheck2} label="Dokumen diterima" value={`${acceptedDocuments}/${documentTotal}`} note="Status dokumen read-only" />
    </section>

    <div className={styles.twoColumn}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span>PROFIL</span><h2>Informasi proyek</h2></div>
          <StatusPill status={workspace.commercialStatus} />
        </div>
        <form className={styles.formGrid} onSubmit={saveProfile}>
          <label><span>Nama klien</span><input disabled={!profileEditable} value={profile.clientName} onChange={(event) => setProfile((value) => ({ ...value, clientName: event.target.value }))} placeholder={project.brand} /></label>
          <label><span>Lokasi proyek</span><input disabled={!profileEditable} value={profile.location} onChange={(event) => setProfile((value) => ({ ...value, location: event.target.value }))} placeholder="Kota / lokasi instalasi" /></label>
          <label><span>Tanggal deal</span><input disabled={!profileEditable} type="date" value={profile.dealDate} onChange={(event) => setProfile((value) => ({ ...value, dealDate: event.target.value }))} /></label>
          <div className={styles.readOnlyField}><span>Periode proyek</span><strong>{formatWorkspaceDate(project.startDate)} - {formatWorkspaceDate(project.dueDate)}</strong></div>
          <div className={styles.formActions}>{workspaceLocked ? <span className={styles.permissionNote}>Profil dikunci saat status komersial {workspace.commercialStatus.toLowerCase()}.</span> : !canEditProfile ? <span className={styles.permissionNote}>Profil hanya dapat diubah oleh PIC, Project Leader, atau Admin.</span> : null}<button type="submit" className={styles.primaryButton} disabled={!profileEditable || !profileDirty}>Simpan profil</button></div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>KONTEKS</span><h2>Identitas dashboard</h2></div></div>
        <dl className={styles.definitionList}>
          <div><dt>Kode proyek</dt><dd>{project.code}</dd></div>
          <div><dt>Brand</dt><dd>{project.brand}</dd></div>
          <div><dt>Program</dt><dd>{project.program ?? "-"}</dd></div>
          <div><dt>Kategori</dt><dd>{project.category ?? "-"}</dd></div>
          <div><dt>Fase aktif</dt><dd>Fase {workspace.currentPhase}</dd></div>
          <div><dt>Versi sinkronisasi</dt><dd>v{workspace.version}</dd></div>
        </dl>
        <div className={styles.contextNote}><MapPin size={17} aria-hidden="true" /><span>{workspace.location || "Lokasi proyek belum diisi."}</span></div>
        <div className={styles.contextNote}><CalendarDays size={17} aria-hidden="true" /><span>Terakhir diperbarui {formatWorkspaceDate(workspace.updatedAt, true)}</span></div>
      </section>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>GATE PROYEK</span><h2>Enam fase operasional</h2></div><small>Fase bergerak setelah requirement dan persetujuan terpenuhi.</small></div>
      <div className={styles.phaseDetailGrid}>
        {phases.map((phase) => <article key={phase.id} className={phase.phaseNumber === workspace.currentPhase ? styles.currentPhaseCard : undefined}>
          <div><b>{phase.phaseNumber}</b><span>{phase.code}</span></div>
          <h3>{phase.name}</h3>
          <StatusPill status={phase.status} />
          <PhaseActions projectId={projectId} phase={phase} runMutation={runMutation} isAdmin={viewerRole === "ADMIN"} isDecisionOwner={Boolean(phase.decisionOwnerRole && viewerRoles.includes(phase.decisionOwnerRole as WorkspaceRole))} />
        </article>)}
      </div>
    </section>
  </div>;
}

function PhaseActions({ projectId, phase, runMutation, isAdmin, isDecisionOwner }: { projectId: string; phase: WorkspacePhase; runMutation: MutationRunner; isAdmin: boolean; isDecisionOwner: boolean }) {
  const [mode, setMode] = useState<"reject" | "reopen" | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = phase.status === "READY" && (isAdmin || isDecisionOwner);
  const canDecide = phase.status === "APPROVAL_PENDING" && isAdmin;
  const canReopen = phase.status === "PASSED" && isAdmin;

  async function mutate(request: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    const result = await runMutation(request, message);
    if (!result.ok) setError(result.conflict ? "Fase berubah. Muat snapshot terbaru lalu ulangi tindakan." : result.error);
    setBusy(false);
  }

  function submit() {
    void mutate(() => workspaceRequest(`/api/projects/${projectId}/phases/${phase.id}/submit`, jsonRequest("POST", { version: phase.version })), `Fase ${phase.phaseNumber} diajukan untuk persetujuan.`);
  }

  function approve() {
    void mutate(() => workspaceRequest(`/api/projects/${projectId}/phases/${phase.id}/decision`, jsonRequest("POST", { decision: "APPROVED", version: phase.version, note: null })), `Fase ${phase.phaseNumber} disetujui.`);
  }

  function submitReason() {
    if (!reason.trim()) { setError(mode === "reject" ? "Alasan penolakan wajib diisi." : "Alasan membuka kembali fase wajib diisi."); return; }
    if (mode === "reject") {
      void mutate(() => workspaceRequest(`/api/projects/${projectId}/phases/${phase.id}/decision`, jsonRequest("POST", { decision: "REJECTED", version: phase.version, note: reason.trim() })), `Fase ${phase.phaseNumber} ditolak dan dikembalikan ke status siap.`);
    } else {
      void mutate(() => workspaceRequest(`/api/projects/${projectId}/phases/${phase.id}/reopen`, jsonRequest("POST", { version: phase.version, reason: reason.trim() })), `Fase ${phase.phaseNumber} dibuka kembali.`);
    }
  }

  if (!canSubmit && !canDecide && !canReopen) return null;

  return <section className={styles.phaseActions} aria-label={`Tindakan fase ${phase.phaseNumber}`}>
    {canSubmit ? <button type="button" className={styles.primaryButton} disabled={busy} onClick={submit}><Send size={15} aria-hidden="true" />{busy ? "Mengajukan..." : "Ajukan fase"}</button> : null}
    {canDecide && !mode ? <><button type="button" className={styles.primaryButton} disabled={busy} onClick={approve}><Check size={15} aria-hidden="true" />{busy ? "Memproses..." : "Setujui"}</button><button type="button" className={`${styles.secondaryButton} ${styles.dangerText}`} disabled={busy} onClick={() => { setMode("reject"); setReason(""); setError(""); }}><X size={15} aria-hidden="true" />Tolak</button></> : null}
    {canReopen && !mode ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setMode("reopen"); setReason(""); setError(""); }}><RotateCcw size={15} aria-hidden="true" />Buka kembali</button> : null}
    {mode ? <div className={styles.phaseReasonForm}>
      <label htmlFor={`phase-reason-${phase.id}`}>{mode === "reject" ? "Alasan penolakan" : "Alasan membuka kembali"}</label>
      <textarea id={`phase-reason-${phase.id}`} maxLength={2000} value={reason} disabled={busy} aria-describedby={`phase-reason-help-${phase.id}`} onChange={(event) => setReason(event.target.value)} />
      <small id={`phase-reason-help-${phase.id}`}>Wajib diisi untuk audit dan pemberitahuan tim.</small>
      <div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setMode(""); setReason(""); setError(""); }}>Batal</button><button type="button" className={mode === "reject" ? `${styles.primaryButton} ${styles.dangerPrimary}` : styles.primaryButton} disabled={busy || !reason.trim()} onClick={submitReason}>{busy ? <RefreshCw size={15} aria-hidden="true" /> : mode === "reject" ? <X size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}{busy ? "Memproses..." : mode === "reject" ? "Konfirmasi penolakan" : "Konfirmasi buka"}</button></div>
    </div> : null}
    {error ? <p className={styles.phaseActionError} role="alert">{error}</p> : null}
  </section>;
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof WalletCards; label: string; value: string; note: string }) {
  return <article className={styles.metricCard}><span><Icon size={19} aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}
