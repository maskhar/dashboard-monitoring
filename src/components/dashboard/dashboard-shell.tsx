"use client";

import { Activity, Bell, ChevronRight, ClipboardCheck, FolderKanban, History, LayoutDashboard, ListChecks, Menu, Users, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ApprovalsSection, AuditSection, UserManagementSection } from "./sections/admin";
import { initials, readJson, type Approval, type AuditEvent, type OperationsData, type OverviewData, type Project, type Section, type User, type Viewer } from "./sections/common";
import { OperationsSection } from "./sections/operations";
import { OverviewSection } from "./sections/overview";
import { ProjectsSection } from "./sections/projects";
import { TasksSection } from "./sections/tasks";

async function loadProjects() {
  const data: Project[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await readJson<{ data: Project[] }>(`/api/projects?limit=100&offset=${offset}`);
    data.push(...page.data);
    if (page.data.length < 100) return { data };
  }
}

type NotificationItem = { id: string; eventType: string; payload: Record<string, unknown>; createdAt: string; readAt: string | null };
type NotificationPayload = { data: NotificationItem[]; unreadCount: number };

function notificationCopy(item: NotificationItem) {
  const title = typeof item.payload.title === "string" ? item.payload.title : item.eventType.replaceAll("_", " ");
  const detail = typeof item.payload.message === "string" ? item.payload.message : typeof item.payload.description === "string" ? item.payload.description : "Ada pembaruan baru untuk akun Anda.";
  return { title, detail };
}

export function DashboardShell({ viewer }: { viewer: Viewer }) {
  const isAdmin = viewer.role === "ADMIN";
  const [section, setSection] = useState<Section>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [operations, setOperations] = useState<OperationsData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const notificationPanel = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    const payload = await readJson<NotificationPayload>("/api/notifications");
    setNotifications(payload.data); setUnreadCount(payload.unreadCount);
  }, []);

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const [projectPayload, overviewPayload, operationPayload, approvalPayload, userPayload, auditPayload, notificationPayload] = await Promise.all([
        loadProjects(), readJson<OverviewData>("/api/overview"), readJson<OperationsData>("/api/operations"), readJson<{ data: Approval[] }>("/api/approvals?status=PENDING"),
        isAdmin ? readJson<{ data: User[] }>("/api/users") : Promise.resolve({ data: [] as User[] }), isAdmin ? readJson<{ data: AuditEvent[] }>("/api/audit?limit=50") : Promise.resolve({ data: [] as AuditEvent[] }), readJson<NotificationPayload>("/api/notifications"),
      ]);
      setProjects(projectPayload.data); setOverview(overviewPayload); setOperations(operationPayload); setApprovals(approvalPayload.data); setUsers(userPayload.data); setAudit(isAdmin ? auditPayload.data : overviewPayload.activity);
      setNotifications(notificationPayload.data); setUnreadCount(notificationPayload.unreadCount);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Data dashboard gagal dimuat."); } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { const timer = window.setTimeout(() => { void loadAll(); }, 0); return () => window.clearTimeout(timer); }, [loadAll]);
  useEffect(() => {
    if (!notificationsOpen) return;
    const close = (event: MouseEvent) => { if (!notificationPanel.current?.contains(event.target as Node)) setNotificationsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationsOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [notificationsOpen]);

  async function markRead(id: string) {
    if (notifications.find((item) => item.id === id)?.readAt) return;
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try { await readJson(`/api/notifications/${id}/read`, { method: "POST" }); }
    catch (readError) { await loadNotifications(); setError(readError instanceof Error ? readError.message : "Notifikasi gagal diperbarui."); }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    setNotificationsBusy(true);
    try { await readJson("/api/notifications/read-all", { method: "POST" }); await loadNotifications(); }
    catch (readError) { setError(readError instanceof Error ? readError.message : "Notifikasi gagal diperbarui."); }
    finally { setNotificationsBusy(false); }
  }
  const navItems = useMemo(() => [
    { id: "overview" as const, label: "Ringkasan", icon: LayoutDashboard }, { id: "projects" as const, label: "Proyek Desain", icon: FolderKanban }, { id: "tasks" as const, label: "Tugas", icon: ListChecks }, { id: "operations" as const, label: "Operasional", icon: Activity },
    { id: "approvals" as const, label: isAdmin ? "Persetujuan" : "Pengajuan Saya", icon: ClipboardCheck, count: approvals.length },
    ...(isAdmin ? [{ id: "users" as const, label: "Pengguna", icon: Users }, { id: "audit" as const, label: "Riwayat", icon: History }] : []),
  ], [approvals.length, isAdmin]);
  function navigate(next: Section) { setSection(next); setMobileOpen(false); setMessage(""); setError(""); }
  const title = navItems.find((item) => item.id === section)?.label ?? "Dashboard";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-head"><div className="brand-mark small">UT</div><div><strong>Utero Monitor</strong><span>Operations workspace</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup navigasi"><X size={20} /></button></div>
      <nav aria-label="Navigasi utama">{navItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.count ? <em>{item.count}</em> : null}</button>)}</nav>
      <div className="sidebar-foot"><div className="system-status"><span className="pulse-dot" /><div><strong>PostgreSQL aktif</strong><span>Data template tersinkron</span></div></div><button className="profile" onClick={() => signOut({ callbackUrl: "/login" })}><span>{initials(viewer.name ?? viewer.email ?? "User")}</span><div><strong>{viewer.name ?? viewer.email}</strong><small>{isAdmin ? "Administrator" : "Staff"}</small></div><ChevronRight size={17} /></button></div>
    </aside>
    {mobileOpen ? <button className="backdrop" onClick={() => setMobileOpen(false)} aria-label="Tutup navigasi" /> : null}
    <main className="main-area"><header className="topbar"><div className="topbar-leading"><button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Buka navigasi"><Menu size={20} /></button><div className="topbar-context"><span>Utero Monitor</span><strong>{title}</strong></div></div><div className="topbar-actions"><span className="sync-status"><i aria-hidden="true" /> Tersinkron</span><div className="notification-center" ref={notificationPanel}><button className="icon-button notification-button" aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ""}`} aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} />{unreadCount ? <i>{unreadCount > 99 ? "99+" : unreadCount}</i> : null}</button>{notificationsOpen ? <section id="notification-panel" className="notification-panel" aria-label="Pusat notifikasi"><div className="notification-head"><div><strong>Notifikasi</strong><span>{unreadCount ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</span></div><button onClick={() => void markAllRead()} disabled={!unreadCount || notificationsBusy}>{notificationsBusy ? "Memproses..." : "Tandai semua dibaca"}</button></div><div className="notification-list">{notifications.length ? notifications.map((item) => { const copy = notificationCopy(item); return <button key={item.id} className={item.readAt ? "read" : "unread"} onClick={() => void markRead(item.id)}><span className="notification-dot" aria-hidden="true" /><span><strong>{copy.title}</strong><small>{copy.detail}</small><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(item.createdAt))}</time></span></button>; }) : <p className="notification-empty">Belum ada notifikasi.</p>}</div></section> : null}</div><ThemeToggle /></div></header>
      <div className="content-wrap">{error ? <p className="error-notice" role="alert">{error}</p> : null}{message ? <p className="save-message" role="status">{message}</p> : null}{loading ? <div className="loading-state">Memuat data PostgreSQL...</div> : null}
        {!loading && section === "overview" ? <OverviewSection viewer={viewer} overview={overview} operations={operations} approvals={approvals} audit={audit} onNavigate={navigate} /> : null}
        {!loading && section === "projects" ? <ProjectsSection viewer={viewer} projects={projects} users={users} reload={loadAll} setMessage={setMessage} setError={setError} /> : null}
        {!loading && section === "tasks" ? <TasksSection viewer={viewer} projects={projects} users={users} setMessage={setMessage} setError={setError} /> : null}
        {!loading && section === "operations" ? <OperationsSection viewer={viewer} data={operations} users={users} reload={loadAll} setMessage={setMessage} setError={setError} /> : null}
        {!loading && section === "approvals" ? <ApprovalsSection viewer={viewer} items={approvals} reload={loadAll} setMessage={setMessage} setError={setError} /> : null}
        {!loading && section === "users" && isAdmin ? <UserManagementSection users={users} reload={loadAll} setMessage={setMessage} setError={setError} /> : null}
        {!loading && section === "audit" && isAdmin ? <AuditSection items={audit} /> : null}
      </div>
    </main>
    <style jsx>{`
      .notification-center { position: relative; }
      .notification-button { position: relative; }
      .notification-button i { min-width: 17px; height: 17px; padding: 0 4px; position: absolute; right: -7px; top: -7px; border: 2px solid var(--surface); border-radius: 9px; display: grid; place-items: center; color: #fff; background: var(--primary); font-size: 9px; font-style: normal; font-weight: 800; }
      .notification-panel { width: min(390px, calc(100vw - 28px)); max-height: min(520px, calc(100vh - 84px)); position: absolute; z-index: 50; top: 48px; right: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow); }
      .notification-head { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .notification-head strong, .notification-head span { display: block; }
      .notification-head span { margin-top: 3px; color: var(--muted); font-size: 11px; }
      .notification-head button { min-height: 40px; border: 0; padding: 0 4px; color: var(--primary); background: transparent; font-size: 11px; font-weight: 800; }
      .notification-head button:disabled { color: var(--muted); cursor: default; }
      .notification-list { max-height: 430px; overflow-y: auto; }
      .notification-list > button { width: 100%; min-height: 88px; padding: 14px 16px; border: 0; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 9px 1fr; gap: 11px; color: var(--text); background: var(--surface); text-align: left; }
      .notification-list > button:hover, .notification-list > button:focus-visible { background: color-mix(in srgb, var(--primary) 7%, var(--surface)); }
      .notification-list > button.unread { background: color-mix(in srgb, var(--primary) 5%, var(--surface)); }
      .notification-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: transparent; }
      .unread .notification-dot { background: var(--primary); }
      .notification-list strong, .notification-list small, .notification-list time { display: block; }
      .notification-list strong { margin-bottom: 5px; font-size: 12px; text-transform: capitalize; }
      .notification-list small { color: var(--muted); font-size: 11px; line-height: 1.45; }
      .notification-list time { margin-top: 7px; color: var(--muted); font-size: 9px; }
      .notification-empty { margin: 0; padding: 42px 20px; color: var(--muted); text-align: center; }
      @media (max-width: 560px) { .notification-panel { position: fixed; top: 70px; right: 14px; left: 14px; width: auto; } }
    `}</style>
  </div>;
}



