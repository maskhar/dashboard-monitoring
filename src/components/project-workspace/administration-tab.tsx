"use client";

import { useState } from "react";
import { Ban, Download, FileCheck2, FileClock, FileUp, FileWarning, Files, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { documentUploadRequest, jsonRequest, workspaceRequest } from "./api";
import { formatWorkspaceDate } from "./format";
import { StatusPill } from "./status-pill";
import styles from "./workspace.module.css";
import type { DocumentReviewStatus, MutationRunner, WorkspaceDocument, WorkspaceRole, WorkspaceSnapshot, WorkspaceViewer } from "./types";

type Props = { projectId: string; snapshot: WorkspaceSnapshot; runMutation: MutationRunner; viewerRole: WorkspaceViewer["role"]; viewerRoles: WorkspaceRole[] };
const allowedFileTypes = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const uploadRoles: Record<number, ReadonlySet<WorkspaceRole>> = {
  1: new Set(["PIC", "PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER"]),
  2: new Set(["PIC", "PIC_ASSISTANT", "FINANCE_ADMIN"]),
  3: new Set(["PIC_ASSISTANT", "DESIGNER", "PROJECT_LEADER"]),
  4: new Set(["PIC_ASSISTANT", "PROJECT_LEADER"]),
  5: new Set(["PIC", "PIC_ASSISTANT", "PROJECT_LEADER"]),
  6: new Set(["PIC_ASSISTANT", "PROJECT_LEADER", "FINANCE_ADMIN"]),
};

export function AdministrationTab({ projectId, snapshot, runMutation, viewerRole, viewerRoles }: Props) {
  const required = snapshot.documents.filter((document) => document.required);
  const accepted = required.filter((document) => ["ACCEPTED", "WAIVED"].includes(document.status)).length;
  const waiting = required.filter((document) => ["UPLOADED", "IN_REVIEW"].includes(document.status)).length;
  const attention = required.filter((document) => ["MISSING", "REJECTED"].includes(document.status)).length;

  return <div className={styles.tabStack}>
    <section className={styles.metricGrid} aria-label="Ringkasan administrasi">
      <AdminMetric icon={Files} label="Requirement" value={required.length} />
      <AdminMetric icon={FileCheck2} label="Diterima" value={accepted} />
      <AdminMetric icon={FileClock} label="Dalam proses" value={waiting} />
      <AdminMetric icon={FileWarning} label="Perlu perhatian" value={attention} />
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span>ADMINISTRASI</span><h2>Dokumen dan evidence</h2></div><small>PDF, JPG, PNG, atau XLSX maksimal 10 MB. File dipindai sebelum dapat diterima.</small></div>
      {snapshot.documents.length ? <div className={styles.documentList}>
        {snapshot.documents.map((document) => {
          const phase = snapshot.phases.find((item) => item.phaseNumber === document.phaseNumber);
          const isAdmin = viewerRole === "ADMIN";
          const canUpload = isAdmin || viewerRoles.some((role) => uploadRoles[document.phaseNumber]?.has(role));
          const canReview = isAdmin || Boolean(phase?.decisionOwnerRole && viewerRoles.includes(phase.decisionOwnerRole as WorkspaceRole));
          return <DocumentRequirementCard key={document.id} projectId={projectId} document={document} runMutation={runMutation} canUpload={canUpload} canReview={canReview} canWaive={isAdmin} phasePassed={phase?.status === "PASSED"} />;
        })}
      </div> : <div className={styles.emptyState}><Files size={28} aria-hidden="true" /><h3>Requirement belum tersedia</h3><p>Daftar dokumen akan muncul setelah template workspace diinisialisasi.</p></div>}
    </section>
  </div>;
}

function DocumentRequirementCard({ projectId, document, runMutation, canUpload, canReview, canWaive, phasePassed }: { projectId: string; document: WorkspaceDocument; runMutation: MutationRunner; canUpload: boolean; canReview: boolean; canWaive: boolean; phasePassed: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewStatus, setReviewStatus] = useState<DocumentReviewStatus>(document.status === "WAIVED" && canWaive ? "WAIVED" : document.status === "REJECTED" ? "REJECTED" : "ACCEPTED");
  const [note, setNote] = useState(document.reviewNote ?? "");
  const [busy, setBusy] = useState<"upload" | "review" | "">("");
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<"upload" | "review" | "">("");
  const inputId = `document-${document.id}`;
  const attachmentId = document.attachment?.id ?? document.attachmentId;
  const hasAttachment = Boolean(attachmentId);
  const replacementLocked = document.status === "ACCEPTED" || phasePassed;
  const showUpload = canUpload && !replacementLocked;

  function chooseFile(selected: File | null) {
    setError("");
    setRetryAction("");
    if (!selected) { setFile(null); return; }
    if (!allowedFileTypes.includes(selected.type)) { setFile(null); setError("Format file tidak didukung. Pilih PDF, JPG, PNG, atau XLSX."); return; }
    if (selected.size > 10 * 1024 * 1024) { setFile(null); setError("Ukuran file melebihi 10 MB. Kompres atau pilih file lain."); return; }
    setFile(selected);
  }

  async function upload() {
    if (!file) { setError("Pilih file evidence sebelum mengunggah."); return; }
    setBusy("upload"); setError(""); setRetryAction("");
    const result = await runMutation(
      () => workspaceRequest(`/api/projects/${projectId}/documents/${document.id}/attachment`, documentUploadRequest(file, document.version)),
      `${document.label} berhasil diunggah.`,
    );
    if (!result.ok) { setError(result.conflict ? "Requirement berubah. Muat data terbaru lalu pilih ulang file." : result.error); setRetryAction(result.conflict ? "" : "upload"); }
    setBusy("");
  }

  async function review() {
    if (reviewStatus === "WAIVED" && !note.trim()) { setError("Alasan wajib diisi untuk pengecualian dokumen."); return; }
    if (reviewStatus === "REJECTED" && !note.trim()) { setError("Alasan penolakan wajib diisi agar pengunggah dapat memperbaiki evidence."); return; }
    if (reviewStatus !== "WAIVED" && !hasAttachment) { setError("Unggah evidence sebelum menerima atau menolak dokumen."); return; }
    setBusy("review"); setError(""); setRetryAction("");
    const result = await runMutation(
      () => workspaceRequest(`/api/projects/${projectId}/documents/${document.id}/review`, jsonRequest("POST", { status: reviewStatus, version: document.version, note: note.trim() || null })),
      `Review ${document.label} tersimpan.`,
    );
    if (!result.ok) { setError(result.conflict ? "Status dokumen berubah. Muat snapshot terbaru lalu review kembali." : result.error); setRetryAction(result.conflict ? "" : "review"); }
    setBusy("");
  }

  return <article className={styles.documentCard}>
    <div className={styles.documentSummary}>
      <span className={styles.documentIcon}><Files size={18} aria-hidden="true" /></span>
      <div className={styles.documentBody}><div><small>Fase {document.phaseNumber} - {document.code}</small><h3>{document.label}</h3></div><p>{document.required ? "Dokumen wajib" : "Dokumen opsional"}</p>{document.reviewNote ? <p className={styles.reviewNote}>Catatan review: {document.reviewNote}</p> : null}</div>
      <div className={styles.documentStatus}><StatusPill status={document.status} /><small>{document.reviewedAt ? `Direview ${formatWorkspaceDate(document.reviewedAt, true)}` : "Belum direview"}</small></div>
    </div>

    <div className={styles.evidenceRow}>
      <div className={styles.evidenceInfo}>
        <strong>{document.attachment?.originalName ?? "Belum ada evidence"}</strong>
        <span>{hasAttachment ? `Status pemindaian: ${document.attachment?.scanStatus ?? "PENDING"}` : "Pilih file untuk memenuhi requirement ini."}</span>
      </div>
      {attachmentId ? <a className={styles.secondaryButton} href={`/api/evidence/${attachmentId}`}><Download size={16} aria-hidden="true" />Unduh</a> : null}
    </div>

    {showUpload ? <div className={styles.documentActions}>
      <label className={styles.filePicker} htmlFor={inputId}><FileUp size={17} aria-hidden="true" /><span>{file ? "Ganti file" : hasAttachment ? "Unggah versi baru" : "Pilih evidence"}</span><input id={inputId} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" disabled={Boolean(busy)} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>
      <div className={styles.selectedFile} aria-live="polite">{file ? <><strong>{file.name}</strong><span>{formatFileSize(file.size)}</span></> : <span>Tidak ada file baru dipilih.</span>}</div>
      <button type="button" className={styles.primaryButton} disabled={!file || Boolean(busy)} onClick={() => void upload()}><FileUp size={16} aria-hidden="true" />{busy === "upload" ? "Mengunggah..." : "Unggah"}</button>
    </div> : <p className={styles.documentPermission}>{replacementLocked ? phasePassed ? "Evidence tidak dapat diganti karena fase sudah lolos. Buka kembali fase terlebih dahulu." : "Evidence yang sudah diterima tidak dapat diganti." : "Role aktif Anda tidak memiliki akses unggah untuk fase ini."}</p>}

    {canReview ? <div className={styles.reviewPanel}>
      <div className={styles.reviewFields}>
        <label><span>Keputusan review</span><select value={reviewStatus} disabled={Boolean(busy)} onChange={(event) => setReviewStatus(event.target.value as DocumentReviewStatus)}><option value="ACCEPTED">Terima evidence</option><option value="REJECTED">Tolak / minta revisi</option>{canWaive ? <option value="WAIVED">Kecualikan requirement</option> : null}</select></label>
        <label><span>Catatan {reviewStatus === "WAIVED" || reviewStatus === "REJECTED" ? "(wajib)" : "(opsional)"}</span><textarea aria-describedby={`${inputId}-review-help`} maxLength={2000} value={note} disabled={Boolean(busy)} placeholder={reviewStatus === "REJECTED" ? "Jelaskan bagian yang perlu diperbaiki" : "Tambahkan catatan keputusan"} onChange={(event) => setNote(event.target.value)} /><small id={`${inputId}-review-help`}>{reviewStatus === "REJECTED" ? "Alasan penolakan wajib dan akan terlihat oleh pengunggah." : reviewStatus === "WAIVED" ? "Waiver hanya tersedia untuk Admin dan wajib memiliki alasan." : "Catatan membantu audit keputusan."}</small></label>
      </div>
      <button type="button" className={reviewStatus === "REJECTED" ? `${styles.secondaryButton} ${styles.dangerText}` : styles.primaryButton} disabled={Boolean(busy) || (reviewStatus !== "WAIVED" && !hasAttachment)} onClick={() => void review()}>{reviewStatus === "ACCEPTED" ? <ShieldCheck size={16} aria-hidden="true" /> : reviewStatus === "REJECTED" ? <XCircle size={16} aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}{busy === "review" ? "Menyimpan..." : "Simpan review"}</button>
    </div> : null}

    {error ? <div className={styles.inlineError} role="alert"><span>{error}</span>{retryAction ? <button type="button" disabled={Boolean(busy)} onClick={() => void (retryAction === "upload" ? upload() : review())}><RefreshCw size={15} aria-hidden="true" />Coba lagi</button> : null}</div> : null}
  </article>;
}

function AdminMetric({ icon: Icon, label, value }: { icon: typeof Files; label: string; value: number }) {
  return <article className={styles.metricCard}><span><Icon size={19} aria-hidden="true" /></span><div><small>{label}</small><strong>{value}</strong><p>dokumen</p></div></article>;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
