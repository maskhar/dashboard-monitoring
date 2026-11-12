export type WorkspaceViewer = {
  id: string;
  role: "ADMIN" | "STAFF";
  name?: string | null;
  email?: string | null;
};

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  phone?: string | null;
};

export type WorkspaceRole = "PIC" | "PIC_ASSISTANT" | "DESIGNER" | "PROJECT_LEADER" | "PRODUCTION_TEAM" | "FINANCE_ADMIN" | "INSTALLATION_SUPPORT";

export type WorkspaceProject = {
  id: string;
  code: string;
  brand: string;
  program?: string | null;
  category?: string | null;
  status?: string;
  progress?: number;
  startDate?: string | null;
  dueDate?: string | null;
};

export type WorkspaceRecord = {
  version: number;
  currentPhase: number;
  commercialStatus: string;
  clientName?: string | null;
  location?: string | null;
  dealDate?: string | null;
  contractValue?: string | number | null;
  currency?: string | null;
  targetMarginPct?: string | number | null;
  retentionPct?: string | number | null;
  overheadPct?: string | number | null;
  contingencyPct?: string | number | null;
  vatEnabled?: boolean;
  vatPct?: string | number | null;
  withholdingEnabled?: boolean;
  withholdingPct?: string | number | null;
  updatedAt?: string | null;
};

export type WorkspaceMetrics = {
  plannedHpp?: string | number | null;
  actualHpp?: string | number | null;
  plannedCost?: string | number | null;
  minimumPrice?: string | number | null;
  plannedMargin?: string | number | null;
  plannedMarginPct?: string | number | null;
  completedStages?: number;
  lateStages?: number;
  acceptedDocuments?: number;
  requiredDocuments?: number;
};

export type WorkspaceAssignment = {
  id: string;
  role: WorkspaceRole;
  active?: boolean;
  userId?: string;
  user?: { id: string; name: string; email?: string | null } | null;
  name?: string | null;
  email?: string | null;
};

export type WorkspacePhase = {
  id: string;
  phaseNumber: number;
  code: string;
  name: string;
  decisionOwnerRole?: string | null;
  status: string;
  passedAt?: string | null;
  version: number;
};

export type WorkspaceStage = {
  id: string;
  phaseNumber: number;
  stageNumber: number;
  title: string;
  defaultRole?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  status: string;
  progress: number;
  version: number;
};

export type WorkspaceCostItem = {
  id: string;
  category: string;
  description: string;
  quantity: string | number;
  unit: string;
  unitPrice: string | number;
  plannedAmount?: string | number | null;
  actualAmount?: string | number | null;
  position?: number;
  version: number;
};

export type WorkspaceDocument = {
  id: string;
  phaseNumber: number;
  code: string;
  label: string;
  required: boolean;
  status: string;
  attachmentId?: string | null;
  attachment?: { id: string; originalName?: string | null; scanStatus?: string | null; mimeType?: string | null; size?: number | null } | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  version: number;
};

export type DocumentReviewStatus = "ACCEPTED" | "REJECTED" | "WAIVED";

export type WorkspaceSnapshot = {
  project: WorkspaceProject;
  workspace: WorkspaceRecord;
  metrics: WorkspaceMetrics;
  assignments: WorkspaceAssignment[];
  phases: WorkspacePhase[];
  stages: WorkspaceStage[];
  costItems: WorkspaceCostItem[];
  documents: WorkspaceDocument[];
  financialsVisible: boolean;
};

export type MutationResult = { ok: true } | { ok: false; error: string; conflict?: boolean };
export type MutationRunner = (request: () => Promise<unknown>, successMessage: string) => Promise<MutationResult>;
export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";
