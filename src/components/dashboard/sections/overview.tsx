"use client";

import { Activity, AlertTriangle, ChevronRight, Download, FolderKanban, UserCog } from "lucide-react";
import { displayStatus, formatDate, initials, MetricCard, PageHeading, Progress, type Approval, type AuditEvent, type OperationsData, type OverviewData, type Section, type Viewer } from "./common";
import { KpiScore, OperationsSummary } from "./operations-parity";

export function OverviewSection({ viewer, overview, operations, approvals, audit, onNavigate }: { viewer: Viewer; overview: OverviewData | null; operations: OperationsData | null; approvals: Approval[]; audit: AuditEvent[]; onNavigate: (section: Section) => void }) {
  const statuses = Object.fromEntries((overview?.projects.statuses ?? []).map((item) => [item.status, item.count]));
  return <>
    <PageHeading eyebrow={viewer.role === "ADMIN" ? "CONTROL TOWER" : "RUANG KERJA SAYA"} title={`Selamat datang, ${viewer.name?.split(" ")[0] ?? "tim"}`} description={viewer.role === "ADMIN" ? "Satu sumber data untuk proyek, target operasional, bukti, dan keputusan." : "Proyek dan aktivitas yang ditugaskan kepada Anda."} actions={<><a className="secondary-button compact" href="/api/reports/pdf"><Download size={16} /> PDF</a><button className="primary-button compact" onClick={() => onNavigate("projects")}><FolderKanban size={16} /> Buka proyek</button></>} />
    <div className="metrics-grid">
      <MetricCard label="Total proyek" value={overview?.projects.total ?? 0} note={viewer.role === "ADMIN" ? "65 proyek sumber template" : "Dalam assignment Anda"} icon={FolderKanban} />
      <MetricCard label="Sedang berjalan" value={(statuses.IN_PROGRESS ?? 0) + (statuses.REVIEW ?? 0)} note={`${statuses.REVIEW ?? 0} menunggu review`} tone="blue" icon={Activity} />
      <MetricCard label="Terlambat" value={overview?.projects.overdue ?? 0} note="Perlu tindak lanjut" tone="red" icon={AlertTriangle} />
      <MetricCard label="Tanpa PIC" value={overview?.projects.unassigned ?? 0} note="Belum ditugaskan" tone="amber" icon={UserCog} />
    </div>
    {operations?.period ? <OperationsSummary data={operations} /> : null}
    <div className="dashboard-grid">
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">PROGRES PORTOFOLIO</p><h2>Rata-rata proyek</h2></div><strong className="score">{overview?.projects.averageProgress ?? 0}%</strong></div><Progress value={overview?.projects.averageProgress ?? 0} tone={(overview?.projects.averageProgress ?? 0) >= 80 ? "success" : "warning"} /><div className="status-summary">{Object.entries(statuses).map(([status, count]) => <div key={status}><span>{displayStatus(status)}</span><strong>{count}</strong></div>)}</div></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">OPERASIONAL</p><h2>Capaian KPI</h2></div></div><KpiScore rows={operations?.kpis ?? []} /><div className="mini-kpis">{(operations?.kpis ?? []).slice(0, 4).map((row) => <div key={row.target.id}><span>{row.definition.name}</span><strong>{row.actual && Number(row.target.target) > 0 ? `${Math.min(100, Math.round(Number(row.actual.actual) / Number(row.target.target) * 100))}%` : Number(row.target.target) === 0 ? "\u2014" : "Belum ada"}</strong></div>)}</div><button className="secondary-button full" onClick={() => onNavigate("operations")}>Buka operasional</button></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">PERSETUJUAN</p><h2>{viewer.role === "ADMIN" ? "Menunggu keputusan" : "Pengajuan aktif"}</h2></div><span className="count-chip">{approvals.length}</span></div><div className="approval-compact">{approvals.slice(0, 3).map((approval) => <button key={approval.id} onClick={() => onNavigate("approvals")}><span>{approval.entityType.slice(0, 1)}</span><div><strong>{approval.approvalType.replaceAll("_", " ")}</strong><small>{displayStatus(approval.entityType)}</small></div><ChevronRight size={17} /></button>)}</div>{approvals.length === 0 ? <p className="muted">Tidak ada pengajuan aktif.</p> : null}</article>
      <article className="panel wide"><div className="panel-head"><div><p className="eyebrow">AKTIVITAS</p><h2>Pembaruan terbaru</h2></div>{viewer.role === "ADMIN" ? <button className="text-button" onClick={() => onNavigate("audit")}>Riwayat lengkap</button> : null}</div><div className="audit-list compact-list">{audit.slice(0, 5).map((item) => <div key={item.id}><span className="avatar">{initials(item.actorName ?? "System")}</span><p><strong>{item.actorName ?? "System"}</strong> {item.action.replaceAll(".", " ")}<small>{formatDate(item.createdAt, true)}</small></p></div>)}</div></article>
    </div>
  </>;
}
