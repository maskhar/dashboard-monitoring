"use client";

import { useState } from "react";
import { CalendarClock, Save } from "lucide-react";
import { jsonRequest, workspaceRequest } from "./api";
import { roleLabel } from "./format";
import { StatusPill } from "./status-pill";
import styles from "./workspace.module.css";
import type { MutationRunner, WorkspaceSnapshot, WorkspaceStage } from "./types";

type StageDraft = { plannedStart: string; plannedEnd: string; actualStart: string; actualEnd: string; status: string; progress: number };
const statuses = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"];

function draftFromStage(stage: WorkspaceStage): StageDraft {
  return { plannedStart: stage.plannedStart ?? "", plannedEnd: stage.plannedEnd ?? "", actualStart: stage.actualStart ?? "", actualEnd: stage.actualEnd ?? "", status: stage.status, progress: stage.progress };
}

export function TimelineTab({ projectId, snapshot, runMutation, viewerId, canManageAll }: { projectId: string; snapshot: WorkspaceSnapshot; runMutation: MutationRunner; viewerId: string; canManageAll: boolean }) {
  const grouped = snapshot.phases.map((phase) => ({ phase, stages: snapshot.stages.filter((stage) => stage.phaseNumber === phase.phaseNumber).sort((a, b) => a.stageNumber - b.stageNumber) }));
  return <div className={styles.tabStack}>
    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>TIMELINE</span><h2>Enam belas tahap kerja</h2></div><small>Tanggal, status, dan progres disimpan per tahap.</small></div>
      {snapshot.stages.length ? <div className={styles.timelineGroups}>{grouped.map(({ phase, stages }) => stages.length ? <section key={phase.id} className={styles.timelineGroup}>
        <div className={styles.timelineGroupHeading}><div><b>{phase.phaseNumber}</b><span><small>{phase.code}</small><strong>{phase.name}</strong></span></div><StatusPill status={phase.status} /></div>
        <div className={styles.stageGrid}>{stages.map((stage) => <StageCard key={stage.id} projectId={projectId} stage={stage} runMutation={runMutation} editable={canManageAll || stage.assigneeId === viewerId} />)}</div>
      </section> : null)}</div> : <div className={styles.emptyState}><CalendarClock size={28} aria-hidden="true" /><h3>Tahap belum tersedia</h3><p>Timeline akan muncul setelah template workspace diinisialisasi.</p></div>}
    </section>
  </div>;
}

function StageCard({ projectId, stage, runMutation, editable }: { projectId: string; stage: WorkspaceStage; runMutation: MutationRunner; editable: boolean }) {
  const [draft, setDraft] = useState(() => draftFromStage(stage));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromStage(stage));
  async function save() {
    await runMutation(() => workspaceRequest(`/api/projects/${projectId}/stages/${stage.id}`, jsonRequest("PATCH", { ...draft, plannedStart: draft.plannedStart || null, plannedEnd: draft.plannedEnd || null, actualStart: draft.actualStart || null, actualEnd: draft.actualEnd || null, version: stage.version })), `Tahap ${stage.stageNumber} diperbarui.`);
  }
  return <article className={styles.stageCard}>
    <header><div><span>Tahap {stage.stageNumber}</span><h3>{stage.title}</h3><small>{stage.assignee?.name ?? roleLabel(stage.defaultRole ?? "Belum ditugaskan")}</small></div><StatusPill status={draft.status} /></header>
    <div className={styles.stageDates}>
      <label><span>Rencana mulai</span><input disabled={!editable} type="date" value={draft.plannedStart} onChange={(event) => setDraft((value) => ({ ...value, plannedStart: event.target.value }))} /></label>
      <label><span>Rencana selesai</span><input disabled={!editable} type="date" value={draft.plannedEnd} onChange={(event) => setDraft((value) => ({ ...value, plannedEnd: event.target.value }))} /></label>
      <label><span>Aktual mulai</span><input disabled={!editable} type="date" value={draft.actualStart} onChange={(event) => setDraft((value) => ({ ...value, actualStart: event.target.value }))} /></label>
      <label><span>Aktual selesai</span><input disabled={!editable} type="date" value={draft.actualEnd} onChange={(event) => setDraft((value) => ({ ...value, actualEnd: event.target.value }))} /></label>
    </div>
    <div className={styles.stageControls}>
      <label><span>Status</span><select disabled={!editable} value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      <label className={styles.progressField}><span>Progres <b>{draft.progress}%</b></span><input disabled={!editable} type="range" min="0" max="100" step="5" value={draft.progress} onChange={(event) => setDraft((value) => ({ ...value, progress: Number(event.target.value) }))} /></label>
      <button type="button" className={styles.primaryButton} disabled={!editable || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" />Simpan tahap</button>
    </div>
    {!editable ? <p className={styles.stagePermission}>Tahap ini hanya dapat diubah oleh assignee, Project Leader, atau Admin.</p> : null}
  </article>;
}
