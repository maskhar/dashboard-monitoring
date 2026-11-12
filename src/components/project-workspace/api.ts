import type { WorkspaceSnapshot, WorkspaceUser } from "./types";

export class WorkspaceApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "WorkspaceApiError";
    this.status = status;
    this.payload = payload;
  }
}

function messageFromPayload(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return `Request gagal (${status}).`;
}

export async function workspaceRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new WorkspaceApiError(messageFromPayload(payload, response.status), response.status, payload);
  return payload as T;
}

export function normalizeWorkspaceSnapshot(payload: unknown): WorkspaceSnapshot {
  const envelope = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const source = envelope.data && typeof envelope.data === "object" ? envelope.data as Record<string, unknown> : envelope;
  const project = source.project && typeof source.project === "object" ? source.project as WorkspaceSnapshot["project"] : null;
  const workspace = source.workspace && typeof source.workspace === "object" ? source.workspace as WorkspaceSnapshot["workspace"] : null;
  if (!project?.id || !workspace) throw new WorkspaceApiError("Snapshot ruang proyek tidak lengkap.", 500, payload);
  const metrics = source.metrics && typeof source.metrics === "object" ? source.metrics as WorkspaceSnapshot["metrics"] : {};
  const permissions = source.permissions && typeof source.permissions === "object" ? source.permissions as Record<string, unknown> : {};
  const explicitFinancialAccess = typeof source.financialsVisible === "boolean" ? source.financialsVisible : typeof permissions.canViewFinancials === "boolean" ? permissions.canViewFinancials : undefined;
  const financialsVisible = explicitFinancialAccess ?? (workspace.contractValue !== null && workspace.contractValue !== undefined && workspace.currency !== null && workspace.currency !== undefined && Object.prototype.hasOwnProperty.call(metrics, "plannedHpp"));

  return {
    project,
    workspace: {
      ...workspace,
      version: Number(workspace.version ?? 1),
      currentPhase: Number(workspace.currentPhase ?? 1),
      commercialStatus: workspace.commercialStatus ?? "DRAFT",
      currency: workspace.currency ?? "IDR",
    },
    metrics,
    assignments: Array.isArray(source.assignments) ? source.assignments as WorkspaceSnapshot["assignments"] : [],
    phases: Array.isArray(source.phases) ? source.phases as WorkspaceSnapshot["phases"] : [],
    stages: Array.isArray(source.stages) ? source.stages as WorkspaceSnapshot["stages"] : [],
    costItems: Array.isArray(source.costItems) ? source.costItems as WorkspaceSnapshot["costItems"] : [],
    documents: Array.isArray(source.documents) ? source.documents as WorkspaceSnapshot["documents"] : [],
    financialsVisible,
  };
}

export function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export async function loadActiveWorkspaceUsers() {
  const payload = await workspaceRequest<{ data: WorkspaceUser[] }>("/api/users");
  return payload.data.filter((user) => user.role === "STAFF" && user.status === "ACTIVE");
}

export function documentUploadRequest(file: File, version: number): RequestInit {
  const body = new FormData();
  body.set("file", file);
  body.set("version", String(version));
  return { method: "POST", body };
}
