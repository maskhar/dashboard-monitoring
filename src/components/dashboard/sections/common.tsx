"use client";

import { Activity, CheckCircle2 } from "lucide-react";

export type Viewer = { id: string; role: "ADMIN" | "STAFF"; name?: string | null; email?: string | null };
export type Section = "overview" | "projects" | "tasks" | "operations" | "approvals" | "audit" | "users";
export type User = { id: string; name: string; email: string; role: "ADMIN" | "STAFF"; status: "INVITED" | "ACTIVE" | "SUSPENDED"; phone: string | null };
export type Project = { id: string; code: string; brand: string; program: string | null; category: string | null; startDate?: string | null; dueDate: string | null; progress: number; status: string; notes?: string | null; version: number; archivedAt?: string | null; deletedAt?: string | null; assignee: { id: string; name: string } | null };
export type Task = { id: string; title: string; description: string | null; dueDate: string | null; projectId: string | null; assigneeId: string | null; status: string; progress: number; version: number; archivedAt?: string | null; deletedAt?: string | null; project?: { id: string; code: string; brand: string } | null; assignee?: { id: string; name: string } | null };
export type AuditEvent = { id: string; actorName: string | null; action: string; entityType: string; entityId: string | null; result: string; createdAt: string };
export type Approval = { id: string; entityType: string; entityId: string; approvalType: string; status: string; requestedBy: string; requester?: { id: string; name: string } | null; submittedSnapshot: Record<string, unknown>; baseVersion: number; submittedAt: string };
export type KpiRow = { target: { id: string; target: string; assigneeId: string | null; archivedAt?: string | null; deletedAt?: string | null }; definition: { code: string; name: string; unit: string }; actual: { id: string; actual: string | null; evaluation: string | null; version: number } | null };
export type WeeklyPlan = { id: string; week: number; focus: string; deliverable: string; reviewNote: string | null; nextAction: string | null; dueDate: string | null; status: string; progress: number; assigneeId: string | null; version: number; archivedAt?: string | null; deletedAt?: string | null };
export type DailyMilestone = { id: string; day: number; dueDate: string | null; title: string; deliverable: string; status: string; progress: number; evidenceNote: string | null; mentorNote: string | null; assigneeId: string | null; archivedAt?: string | null; deletedAt?: string | null };
export type Gate = { id: string; title: string; evidenceRequired: boolean; status: string; assigneeId: string | null; archivedAt?: string | null; deletedAt?: string | null };
export type OperationsData = { period: { id: string; name: string; startDate: string; endDate: string; status: string } | null; kpis: KpiRow[]; weeklyPlans: WeeklyPlan[]; dailyMilestones: DailyMilestone[]; gates: Gate[] };
export type OverviewData = { projects: { total: number; overdue: number; unassigned: number; averageProgress: number; statuses: Array<{ status: string; count: number }> }; pendingApprovals: number; activity: AuditEvent[] };

export const statusLabel: Record<string, string> = {
  BACKLOG: "Backlog", IN_PROGRESS: "In Progress", IN_REVIEW: "In Review", REVIEW: "Review", BLOCKED: "Blocked",
  PUBLISHED: "Published", COMPLETED: "Completed", NOT_STARTED: "Not Started", CANCELLED: "Cancelled", PENDING: "Pending",
  APPROVED: "Approved", REJECTED: "Rejected", REVISION_REQUESTED: "Revision Requested", ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended",
};
export const projectApiStatus: Record<string, string> = { Backlog: "BACKLOG", "In Progress": "IN_PROGRESS", Review: "REVIEW", Blocked: "BLOCKED", Published: "PUBLISHED", Cancelled: "CANCELLED" };
export const workApiStatus: Record<string, string> = { "Not Started": "NOT_STARTED", "In Progress": "IN_PROGRESS", "In Review": "IN_REVIEW", Completed: "COMPLETED", Blocked: "BLOCKED", Cancelled: "CANCELLED" };

export function displayStatus(status: string) { return statusLabel[status] ?? status.replaceAll("_", " "); }
export function formatDate(value: string | null, withTime = false) { if (!value) return "-"; return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Jakarta" }).format(new Date(value)); }
export function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
export function formatCurrency(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }
export async function readJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: "no-store", ...init }); const payload = await response.json().catch(() => ({})); if (!response.ok) { const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `Request gagal (${response.status})`; throw new Error(message); } return payload as T; }

export function StatusBadge({ status }: { status: string }) { const label = displayStatus(status); return <span className={`status status-${label.toLowerCase().replaceAll(" ", "-")}`}><span />{label}</span>; }
export function Progress({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "warning" }) { const normalized = Math.min(Math.max(value, 0), 100); return <div className="progress-track" role="progressbar" aria-label={`Progres ${normalized}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}><i className={`progress-fill ${tone}`} style={{ width: `${normalized}%` }} /></div>; }
export function MetricCard({ label, value, note, tone, icon: Icon }: { label: string; value: string | number; note: string; tone?: string; icon: typeof Activity }) { return <article className="metric-card"><div className={`metric-icon ${tone ?? ""}`}><Icon size={18} /></div><div><p>{label}</p><strong>{value}</strong><span>{note}</span></div></article>; }
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="heading-actions">{actions}</div> : null}</div>; }
export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><CheckCircle2 size={28} /><h2>{title}</h2><p>{description}</p></div>; }




