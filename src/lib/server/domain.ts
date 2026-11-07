export type AppRole = "ADMIN" | "STAFF";
export type ProjectState = "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "PUBLISHED" | "CANCELLED";

export function assertProgress(progress: number) { if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new Error("Progress must be an integer from 0 to 100"); }
export function validateProjectState(status: ProjectState, progress: number) { assertProgress(progress); if (status === "PUBLISHED" && progress !== 100) throw new Error("Published projects require 100% progress"); if (status === "BACKLOG" && progress === 100) throw new Error("Backlog projects cannot have 100% progress"); }
export function isOverdue(dueDate: string | Date | null, status: ProjectState, now = new Date()) { if (!dueDate || status === "PUBLISHED" || status === "CANCELLED") return false; const due = typeof dueDate === "string" ? new Date(`${dueDate}T23:59:59.999Z`) : dueDate; return due.getTime() < now.getTime(); }
export function canManage(role: AppRole) { return role === "ADMIN"; }
export function canEditProject(role: AppRole, userId: string, assigneeId?: string | null) { return role === "ADMIN" || userId === assigneeId; }
export function canUpdateAssigned(role: AppRole, userId: string, assigneeId?: string | null) { return role === "ADMIN" || Boolean(assigneeId && userId === assigneeId); }
export function achievement(actual: number | null, target: number) { if (actual === null) return null; if (target === 0) return actual === 0 ? 100 : null; return Math.round((actual / target) * 100); }


