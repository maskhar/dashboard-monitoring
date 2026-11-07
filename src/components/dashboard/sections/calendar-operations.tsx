"use client";

import { CalendarDays, Filter, GanttChart, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { displayStatus, type OperationsData, type User } from "./common";
import "./calendar-operations.css";

type Mode = "calendar" | "gantt";
type ItemType = "week" | "day" | "gate";
type FilterState = { query: string; type: "all" | ItemType; status: string; assigneeId: string };
type SavedFilter = { id: string; name: string; filters: FilterState };
type CalendarItem = { id: string; type: ItemType; title: string; subtitle: string; start: string; end: string; status: string; progress: number; assigneeId: string | null };

const emptyFilters: FilterState = { query: "", type: "all", status: "all", assigneeId: "all" };
const dayMs = 86_400_000;

function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function parseDate(value: string) { return new Date(`${value.slice(0, 10)}T00:00:00Z`); }
function addDays(value: string, days: number) { return dateKey(new Date(parseDate(value).getTime() + days * dayMs)); }
function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }

function buildItems(data: OperationsData): CalendarItem[] {
  if (!data.period) return [];
  const periodStart = data.period.startDate.slice(0, 10);
  const periodEnd = data.period.endDate.slice(0, 10);
  const weeks = data.weeklyPlans.map((week) => {
    const start = addDays(periodStart, (week.week - 1) * 7);
    return { id: week.id, type: "week" as const, title: `Minggu ${week.week}: ${week.focus}`, subtitle: week.deliverable, start, end: week.dueDate?.slice(0, 10) ?? addDays(start, 6), status: week.status, progress: week.progress, assigneeId: week.assigneeId };
  });
  const days = data.dailyMilestones.map((day) => {
    const due = day.dueDate?.slice(0, 10) ?? addDays(periodStart, Math.max(day.day - 1, 0));
    return { id: day.id, type: "day" as const, title: `Hari ${day.day}: ${day.title}`, subtitle: day.deliverable, start: due, end: due, status: day.status, progress: day.progress, assigneeId: day.assigneeId };
  });
  const gates = data.gates.map((gate) => ({ id: gate.id, type: "gate" as const, title: gate.title, subtitle: gate.evidenceRequired ? "Bukti kelulusan wajib" : "Bukti kelulusan opsional", start: periodEnd, end: periodEnd, status: gate.status, progress: gate.status === "COMPLETED" ? 100 : 0, assigneeId: gate.assigneeId }));
  return [...weeks, ...days, ...gates].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function typeLabel(type: ItemType) { return type === "week" ? "Minggu" : type === "day" ? "Milestone" : "Gate"; }

export function OperationsCalendar({ data, users, userId }: { data: OperationsData; users: User[]; userId: string }) {
  const [mode, setMode] = useState<Mode>("calendar");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [filterName, setFilterName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [filterBusy, setFilterBusy] = useState(false);
  const items = useMemo(() => buildItems(data), [data]);
  const staff = useMemo(() => users.filter((user) => user.role === "STAFF"), [users]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/saved-filters", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Failed to load saved filters");
      const result = await response.json() as { data: SavedFilter[] };
      setSavedFilters(result.data);
    }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFilterError("Filter tersimpan gagal dimuat."); });
    return () => controller.abort();
  }, [userId]);

  const statuses = useMemo(() => [...new Set(items.map((item) => item.status))].sort(), [items]);
  const visible = useMemo(() => items.filter((item) => {
    const query = filters.query.trim().toLocaleLowerCase("id-ID");
    return (!query || `${item.title} ${item.subtitle}`.toLocaleLowerCase("id-ID").includes(query))
      && (filters.type === "all" || item.type === filters.type)
      && (filters.status === "all" || item.status === filters.status)
      && (filters.assigneeId === "all" || (filters.assigneeId === "unassigned" ? !item.assigneeId : item.assigneeId === filters.assigneeId));
  }), [items, filters]);

  async function saveFilter() {
    const name = filterName.trim();
    if (!name) return;
    setFilterBusy(true); setFilterError("");
    try {
      const response = await fetch("/api/saved-filters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, filters }) });
      if (!response.ok) throw new Error("Filter gagal disimpan.");
      const saved = await response.json() as SavedFilter;
      setSavedFilters((current) => [...current.filter((item) => item.name.toLocaleLowerCase("id-ID") !== saved.name.toLocaleLowerCase("id-ID")), saved]);
      setFilterName(""); setShowSave(false);
    } catch (error) { setFilterError(error instanceof Error ? error.message : "Filter gagal disimpan."); }
    finally { setFilterBusy(false); }
  }

  async function removeFilter(id: string) {
    setFilterError("");
    try {
      const response = await fetch(`/api/saved-filters?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Filter gagal dihapus.");
      setSavedFilters((current) => current.filter((item) => item.id !== id));
    } catch (error) { setFilterError(error instanceof Error ? error.message : "Filter gagal dihapus."); }
  }

  const periodStart = data.period!.startDate.slice(0, 10);
  const periodEnd = data.period!.endDate.slice(0, 10);
  const totalDays = Math.max(1, Math.round((parseDate(periodEnd).getTime() - parseDate(periodStart).getTime()) / dayMs) + 1);
  const monthGroups = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const item of visible) { const key = item.start.slice(0, 7); groups.set(key, [...(groups.get(key) ?? []), item]); }
    return [...groups.entries()];
  }, [visible]);

  return <section className="ops-calendar data-panel" aria-labelledby="ops-calendar-title">
    <div className="ops-calendar-head">
      <div><p className="eyebrow">JADWAL TERPADU</p><h2 id="ops-calendar-title">Kalender & Gantt</h2><p className="muted">Minggu, milestone, dan gate dalam satu rentang program.</p></div>
      <div className="ops-calendar-modes" aria-label="Mode jadwal"><button type="button" aria-pressed={mode === "calendar"} onClick={() => setMode("calendar")}><CalendarDays size={16} aria-hidden="true" /> Kalender</button><button type="button" aria-pressed={mode === "gantt"} onClick={() => setMode("gantt")}><GanttChart size={16} aria-hidden="true" /> Gantt</button></div>
    </div>

    <div className="ops-calendar-filters">
      <label className="ops-calendar-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Cari jadwal</span><input value={filters.query} placeholder="Cari fokus atau deliverable" onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
      <label><span>Jenis</span><select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value as FilterState["type"] })}><option value="all">Semua jenis</option><option value="week">Minggu</option><option value="day">Milestone</option><option value="gate">Gate</option></select></label>
      <label><span>Status</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">Semua status</option>{statuses.map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}</select></label>
      <label><span>PIC</span><select value={filters.assigneeId} onChange={(event) => setFilters({ ...filters, assigneeId: event.target.value })}><option value="all">Semua PIC</option><option value="unassigned">Belum ditugaskan</option>{staff.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <button type="button" className="secondary-button compact" onClick={() => setShowSave((value) => !value)}><Save size={15} aria-hidden="true" /> Simpan filter</button>
      {JSON.stringify(filters) !== JSON.stringify(emptyFilters) ? <button type="button" className="text-button" onClick={() => setFilters(emptyFilters)}><X size={15} aria-hidden="true" /> Reset</button> : null}
    </div>

    {showSave ? <div className="ops-filter-save"><label>Nama filter<input autoFocus maxLength={50} value={filterName} placeholder="Contoh: Milestone saya" onChange={(event) => setFilterName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveFilter(); } }} /></label><button type="button" className="primary-button compact" disabled={!filterName.trim() || filterBusy} onClick={() => void saveFilter()}>Simpan</button></div> : null}
    {filterError ? <p role="alert">{filterError}</p> : null}
    {savedFilters.length ? <div className="ops-saved-filters" aria-label="Filter tersimpan"><Filter size={15} aria-hidden="true" />{savedFilters.map((saved) => <span key={saved.id}><button type="button" onClick={() => setFilters(saved.filters)}>{saved.name}</button><button type="button" aria-label={`Hapus filter ${saved.name}`} onClick={() => void removeFilter(saved.id)}><Trash2 size={13} aria-hidden="true" /></button></span>)}</div> : null}

    <div className="ops-calendar-result"><strong>{visible.length} item</strong><span>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parseDate(periodStart))} - {new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parseDate(periodEnd))}</span></div>
    {visible.length === 0 ? <div className="ops-calendar-empty"><Filter size={24} aria-hidden="true" /><strong>Tidak ada jadwal cocok</strong><span>Ubah atau reset filter untuk melihat item lain.</span></div> : mode === "calendar" ? <div className="ops-calendar-months">{monthGroups.map(([month, monthItems]) => <section key={month}><h3>{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseDate(`${month}-01`))}</h3><div>{monthItems.map((item) => <article key={`${item.type}-${item.id}`} className={`ops-calendar-card type-${item.type}`}><time dateTime={item.start}><b>{parseDate(item.start).getUTCDate()}</b><span>{new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(parseDate(item.start))}</span></time><div><div className="ops-calendar-card-meta"><span>{typeLabel(item.type)}</span><span>{displayStatus(item.status)}</span></div><strong>{item.title}</strong><p>{item.subtitle}</p><small>{staff.find((user) => user.id === item.assigneeId)?.name ?? "Belum ditugaskan"} · {item.progress}%</small></div></article>)}</div></section>)}</div> : <div className="ops-gantt-scroll"><div className="ops-gantt" style={{ "--gantt-days": totalDays } as React.CSSProperties}><div className="ops-gantt-axis"><span>Item</span><div><i>Mulai</i><i>25%</i><i>50%</i><i>75%</i><i>Selesai</i></div></div>{visible.map((item) => { const start = clamp(Math.round((parseDate(item.start).getTime() - parseDate(periodStart).getTime()) / dayMs), 0, totalDays - 1); const end = clamp(Math.round((parseDate(item.end).getTime() - parseDate(periodStart).getTime()) / dayMs), start, totalDays - 1); return <div className="ops-gantt-row" key={`${item.type}-${item.id}`}><div><strong>{item.title}</strong><small>{staff.find((user) => user.id === item.assigneeId)?.name ?? "Tanpa PIC"} · {displayStatus(item.status)}</small></div><div className="ops-gantt-track"><span className={`type-${item.type}`} style={{ left: `${start / totalDays * 100}%`, width: `${Math.max((end - start + 1) / totalDays * 100, 1.2)}%` }} title={`${item.start} - ${item.end}`}><i style={{ width: `${clamp(item.progress, 0, 100)}%` }} /></span></div></div>; })}</div></div>}
  </section>;
}
