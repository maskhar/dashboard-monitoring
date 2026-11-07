"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, AlertTriangle, Flag } from "lucide-react";
import { formatDate, MetricCard, Progress, readJson, type KpiRow, type OperationsData } from "./common";
import "./operations-parity.css";

export type Period = NonNullable<OperationsData["period"]>;
export type ParityData = OperationsData & { periods?: Period[]; timelinePeriod?: Period | null; programPeriod?: { startDate: string; endDate: string } };
export const dash = "\u2014";
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function overdue(item: { dueDate: string | null; status: string }, today = todayKey()) {
  return Boolean(item.dueDate && item.dueDate.slice(0, 10) < today && !["COMPLETED", "CANCELLED"].includes(item.status));
}
export function weekStart(dueDate: string | null, startDate?: string | null) {
  if (startDate) return startDate;
  if (!dueDate) return null;
  const date = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 4);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
export function isCurrency(row: KpiRow) { return ["IDR", "CURRENCY"].includes(row.definition.unit.toUpperCase()); }
export function attainment(row: KpiRow) {
  const target = Number(row.target.target);
  if (!row.actual || (row.actual.actual === null || row.actual.actual === "") || target <= 0) return null;
  const actual = Number(row.actual.actual);
  return Number.isFinite(actual) && Number.isFinite(target) ? Math.min(100, Math.max(0, actual / target * 100)) : null;
}
export function kpiSummary(rows: KpiRow[]) {
  // Revenue is shared with Founder/Manager, never part of the eight admin KPIs.
  const admin = rows.filter((row) => !isCurrency(row)).sort((a, b) => a.definition.code.localeCompare(b.definition.code, undefined, { numeric: true })).slice(0, 8);
  const scores = admin.map(attainment).filter((score): score is number => score !== null);
  return { average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, reported: scores.length };
}
export function useKpiPeriod(data: ParityData | null) {
  const [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState<ParityData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const periods = data?.periods?.length ? data.periods : data?.period ? [data.period] : [];
  const periodId = periods.some((period) => period.id === selected) ? selected : data?.period?.id ?? "";
  useEffect(() => {
    if (!periodId || periodId === data?.period?.id) return;
    let active = true;
    readJson<ParityData>(`/api/operations?periodId=${encodeURIComponent(periodId)}`).then((value) => { if (active) { setLoaded(value); setError(""); } }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Gagal memuat KPI bulan."); });
    return () => { active = false; };
  }, [periodId, data, revision]);
  const current = periodId === data?.period?.id ? data : loaded?.period?.id === periodId ? loaded : null;
  return { periods, periodId, current, error, loading: !current && !error, select: (id: string) => { setSelected(id); setLoaded(null); setError(""); }, refresh: () => { setLoaded(null); setError(""); setRevision((value) => value + 1); } };
}
export function MonthSelector({ periods, value, onChange }: { periods: Period[]; value: string; onChange: (id: string) => void }) {
  return <label className="ops-month">Bulan KPI <select value={value} onChange={(event) => onChange(event.target.value)}>{periods.map((period) => <option key={period.id} value={period.id}>{new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(period.startDate))}</option>)}</select></label>;
}
export function OperationsSummary({ data }: { data: ParityData }) {
  const period = data.programPeriod ?? data.timelinePeriod ?? data.period;
  if (!period) return null;
  const today = todayKey();
  const start = period.startDate.slice(0, 10);
  const end = period.endDate.slice(0, 10);
  const dayOffset = Math.floor((Date.parse(today) - Date.parse(start)) / 86400000);
  const position = today < start ? `Mulai ${formatDate(start)} (H-${-dayOffset})` : today > end ? "Periode selesai" : `Minggu ke-${Math.min(13, Math.floor(dayOffset / 7) + 1)} dari 13`;
  const weeks = data.weeklyPlans.filter((item) => item.status === "COMPLETED").length;
  const onboarding = data.dailyMilestones.filter((item) => item.day <= 14);
  const days = onboarding.filter((item) => item.status === "COMPLETED").length;
  const gates = data.gates.filter((item) => item.status === "COMPLETED").length;
  const late = data.weeklyPlans.filter((item) => overdue(item, today)).length;
  const lateDays = onboarding.filter((item) => overdue(item, today)).length;
  return <section className="ops-summary-panel" aria-labelledby="ops-summary-title"><div className="ops-summary-head"><div><p className="eyebrow">RINGKASAN PROGRAM</p><h2 id="ops-summary-title">Kondisi operasional saat ini</h2></div><p>{formatDate(start)} - {formatDate(end)}</p></div><div className="metrics-grid ops-summary">
    <MetricCard label="Posisi program" value={position} note="Program 3 Bulan" icon={CalendarDays} />
    <MetricCard label="Rencana mingguan" value={`${weeks}/${data.weeklyPlans.length}`} note={late ? `${late} terlambat dan perlu tindak lanjut` : "Semua tenggat terkendali"} tone={late ? "red" : undefined} icon={late ? AlertTriangle : CheckCircle2} />
    <MetricCard label="14 Hari Pertama" value={`${days}/${onboarding.length}`} note={lateDays ? `${lateDays} aktivitas terlambat` : "Onboarding sesuai jadwal"} tone={lateDays ? "red" : undefined} icon={CalendarDays} />
    <MetricCard label="Gate kelulusan" value={`${gates}/${data.gates.length}`} note="Syarat fase penjualan" icon={Flag} />
  </div></section>;
}
export function KpiScore({ rows }: { rows: KpiRow[] }) {
  const score = kpiSummary(rows);
  return <><strong className="score">{score.average === null ? dash : `${score.average}%`}</strong><Progress value={score.average ?? 0} tone={(score.average ?? 0) >= 80 ? "success" : "warning"} /><p className="muted small-copy">{score.reported}/8 indikator terisi. Capaian maksimal 100%; omzet bersama tidak masuk rata-rata.</p></>;
}



