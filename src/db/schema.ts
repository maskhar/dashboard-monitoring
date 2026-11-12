import { sql } from "drizzle-orm";
import { boolean, char, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "STAFF"]);
export const userStatus = pgEnum("user_status", ["INVITED", "ACTIVE", "SUSPENDED"]);
export const projectStatus = pgEnum("project_status", ["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"]);
export const workStatus = pgEnum("work_status", ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]);
export const approvalStatus = pgEnum("approval_status", ["PENDING", "APPROVED", "REJECTED", "REVISION_REQUESTED", "CANCELLED"]);
export const jobStatus = pgEnum("job_status", ["QUEUED", "PROCESSING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"]);
export const notificationStatus = pgEnum("notification_status", ["QUEUED", "PROCESSING", "SENT", "DELIVERED", "FAILED", "CANCELLED"]);

const timestamps = { createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() };

export const users = pgTable("users", { id: uuid("id").primaryKey().defaultRandom(), email: text("email").notNull(), name: text("name").notNull(), role: userRole("role").notNull().default("STAFF"), status: userStatus("status").notNull().default("INVITED"), passwordHash: text("password_hash"), googleSubject: text("google_subject"), phone: text("phone"), preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_google_subject_uq").on(t.googleSubject)]);
export const projects = pgTable("projects", { id: uuid("id").primaryKey().defaultRandom(), code: text("code").notNull(), brand: text("brand").notNull(), program: text("program"), category: text("category"), status: projectStatus("status").notNull().default("BACKLOG"), progress: integer("progress").notNull().default(0), startDate: date("start_date"), dueDate: date("due_date"), publishedAt: timestamp("published_at", { withTimezone: true }), notes: text("notes"), version: integer("version").notNull().default(1), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("projects_code_uq").on(t.code), index("projects_dashboard_idx").on(t.status, t.dueDate)]);
export const projectAssignments = pgTable("project_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("PIC"),
  active: boolean("active").notNull().default(true),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("project_active_pic_uq").on(t.projectId).where(sql`${t.active} = true and ${t.role} = 'PIC'`),
  uniqueIndex("project_active_singleton_role_uq").on(t.projectId, t.role).where(sql`${t.active} = true and ${t.role} in ('PIC', 'PIC_ASSISTANT', 'DESIGNER', 'PROJECT_LEADER', 'FINANCE_ADMIN')`),
  uniqueIndex("project_assignment_active_role_user_uq").on(t.projectId, t.role, t.userId).where(sql`${t.active} = true`),
  check("project_assignment_role", sql`${t.role} in ('PIC', 'PIC_ASSISTANT', 'DESIGNER', 'PROJECT_LEADER', 'PRODUCTION_TEAM', 'FINANCE_ADMIN', 'INSTALLATION_SUPPORT')`),
  check("project_assignment_lifecycle", sql`(${t.active} and ${t.endedAt} is null) or (not ${t.active} and ${t.endedAt} is not null)`),
]);
export const projectProgress = pgTable("project_progress", { id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), progress: integer("progress").notNull(), status: projectStatus("status").notNull(), note: text("note"), recordedBy: uuid("recorded_by").notNull().references(() => users.id), recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("project_progress_history_idx").on(t.projectId, t.recordedAt)]);
export const projectComments = pgTable("project_comments", { id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), authorId: uuid("author_id").notNull().references(() => users.id), body: text("body").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("project_comments_timeline_idx").on(t.projectId, t.createdAt)]);
export const projectWorkspaces = pgTable("project_workspaces", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  clientName: text("client_name"),
  location: text("location"),
  dealDate: date("deal_date"),
  contractValue: numeric("contract_value", { precision: 19, scale: 2 }).notNull().default("0"),
  currency: char("currency", { length: 3 }).notNull().default("IDR"),
  targetMarginPct: numeric("target_margin_pct", { precision: 7, scale: 4 }).notNull().default("25"),
  retentionPct: numeric("retention_pct", { precision: 7, scale: 4 }).notNull().default("5"),
  overheadPct: numeric("overhead_pct", { precision: 7, scale: 4 }).notNull().default("0"),
  contingencyPct: numeric("contingency_pct", { precision: 7, scale: 4 }).notNull().default("0"),
  vatEnabled: boolean("vat_enabled").notNull().default(false),
  vatPct: numeric("vat_pct", { precision: 7, scale: 4 }).notNull().default("11"),
  withholdingEnabled: boolean("withholding_enabled").notNull().default(false),
  withholdingPct: numeric("withholding_pct", { precision: 7, scale: 4 }).notNull().default("2"),
  commercialStatus: text("commercial_status").notNull().default("DRAFT"),
  currentPhase: smallint("current_phase").notNull().default(1),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (t) => [
  check("project_workspaces_contract_nonnegative", sql`${t.contractValue} >= 0`),
  check("project_workspaces_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check("project_workspaces_percentage_bounds", sql`${t.targetMarginPct} between 0 and 100 and ${t.retentionPct} between 0 and 100 and ${t.overheadPct} between 0 and 100 and ${t.contingencyPct} between 0 and 100 and ${t.vatPct} between 0 and 100 and ${t.withholdingPct} between 0 and 100`),
  check("project_workspaces_margin_retention_limit", sql`${t.targetMarginPct} + ${t.retentionPct} < 100`),
  check("project_workspaces_commercial_status", sql`${t.commercialStatus} in ('DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED')`),
  check("project_workspaces_current_phase", sql`${t.currentPhase} between 1 and 6`),
  check("project_workspaces_version_positive", sql`${t.version} > 0`),
]);
export const projectCostItems = pgTable("project_cost_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 19, scale: 2 }).notNull(),
  actualAmount: numeric("actual_amount", { precision: 19, scale: 2 }),
  position: integer("position").notNull().default(0),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("project_cost_items_project_idx").on(t.projectId, t.position),
  check("project_cost_items_quantity_positive", sql`${t.quantity} > 0`),
  check("project_cost_items_category", sql`${t.category} in ('FRAME_PANEL_MATERIAL', 'FINISHING', 'ELECTRICAL', 'PRINTING_BRANDING', 'SUPPORTING_MATERIAL', 'LABOR', 'OPERATIONS', 'SHIPPING')`),
  check("project_cost_items_amounts_nonnegative", sql`${t.unitPrice} >= 0 and (${t.actualAmount} is null or ${t.actualAmount} >= 0)`),
  check("project_cost_items_position_nonnegative", sql`${t.position} >= 0`),
  check("project_cost_items_version_positive", sql`${t.version} > 0`),
]);
export const projectPhaseInstances = pgTable("project_phase_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  phaseNumber: smallint("phase_number").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  decisionOwnerRole: text("decision_owner_role").notNull(),
  status: text("status").notNull().default("WAITING"),
  passedAt: timestamp("passed_at", { withTimezone: true }),
  passedBy: uuid("passed_by").references(() => users.id),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (t) => [
  uniqueIndex("project_phase_number_uq").on(t.projectId, t.phaseNumber),
  uniqueIndex("project_phase_code_uq").on(t.projectId, t.code),
  check("project_phase_number_bounds", sql`${t.phaseNumber} between 1 and 6`),
  check("project_phase_decision_owner_role", sql`${t.decisionOwnerRole} in ('PIC', 'PROJECT_LEADER', 'FINANCE_ADMIN')`),
  check("project_phase_status", sql`${t.status} in ('WAITING', 'ACTIVE', 'READY', 'APPROVAL_PENDING', 'PASSED', 'REOPENED')`),
  check("project_phase_pass_metadata_pair", sql`(${t.passedAt} is null and ${t.passedBy} is null) or (${t.passedAt} is not null and ${t.passedBy} is not null)`),
  check("project_phase_pass_status_coherence", sql`(${t.status} <> 'PASSED' or ${t.passedAt} is not null) and (${t.passedAt} is null or ${t.status} in ('PASSED', 'REOPENED'))`),
  check("project_phase_version_positive", sql`${t.version} > 0`),
]);
export const projectStageInstances = pgTable("project_stage_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  phaseNumber: smallint("phase_number").notNull(),
  stageNumber: smallint("stage_number").notNull(),
  title: text("title").notNull(),
  defaultRole: text("default_role").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id),
  plannedStart: date("planned_start"),
  plannedEnd: date("planned_end"),
  actualStart: date("actual_start"),
  actualEnd: date("actual_end"),
  status: workStatus("status").notNull().default("NOT_STARTED"),
  progress: integer("progress").notNull().default(0),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (t) => [
  uniqueIndex("project_stage_number_uq").on(t.projectId, t.stageNumber),
  index("project_stage_assignee_idx").on(t.assigneeId, t.status),
  check("project_stage_number_bounds", sql`${t.stageNumber} between 1 and 16 and ${t.phaseNumber} between 1 and 6`),
  check("project_stage_progress_bounds", sql`${t.progress} between 0 and 100`),
  check("project_stage_planned_dates", sql`${t.plannedEnd} is null or ${t.plannedStart} is null or ${t.plannedEnd} >= ${t.plannedStart}`),
  check("project_stage_actual_dates", sql`${t.actualEnd} is null or ${t.actualStart} is null or ${t.actualEnd} >= ${t.actualStart}`),
  check("project_stage_completed_has_end", sql`${t.status} <> 'COMPLETED' or ${t.actualEnd} is not null`),
  check("project_stage_version_positive", sql`${t.version} > 0`),
]);
export const monitoringPeriods = pgTable("monitoring_periods", { id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), startDate: date("start_date").notNull(), endDate: date("end_date").notNull(), status: text("status").notNull().default("DRAFT"), ...timestamps }, (t) => [uniqueIndex("period_name_uq").on(t.name)]);
export const kpiDefinitions = pgTable("kpi_definitions", { id: uuid("id").primaryKey().defaultRandom(), code: text("code").notNull(), name: text("name").notNull(), unit: text("unit").notNull().default("COUNT"), active: boolean("active").notNull().default(true), ...timestamps }, (t) => [uniqueIndex("kpi_code_uq").on(t.code)]);
export const kpiTargets = pgTable("kpi_targets", { id: uuid("id").primaryKey().defaultRandom(), periodId: uuid("period_id").notNull().references(() => monitoringPeriods.id, { onDelete: "cascade" }), kpiId: uuid("kpi_id").notNull().references(() => kpiDefinitions.id), target: numeric("target", { precision: 18, scale: 2 }).notNull(), assigneeId: uuid("assignee_id").references(() => users.id), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("kpi_target_uq").on(t.periodId, t.kpiId, t.assigneeId)]);
export const kpiActuals = pgTable("kpi_actuals", { id: uuid("id").primaryKey().defaultRandom(), targetId: uuid("target_id").notNull().references(() => kpiTargets.id, { onDelete: "cascade" }), actual: numeric("actual", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("DRAFT"), evaluation: text("evaluation"), reportedBy: uuid("reported_by").notNull().references(() => users.id), reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(), version: integer("version").notNull().default(1) });
export const weeklyPlans = pgTable("weekly_plans", { id: uuid("id").primaryKey().defaultRandom(), periodId: uuid("period_id").notNull().references(() => monitoringPeriods.id, { onDelete: "cascade" }), week: integer("week").notNull(), focus: text("focus").notNull(), deliverable: text("deliverable").notNull(), reviewNote: text("review_note"), nextAction: text("next_action"), dueDate: date("due_date"), status: workStatus("status").notNull().default("NOT_STARTED"), progress: integer("progress").notNull().default(0), assigneeId: uuid("assignee_id").references(() => users.id), version: integer("version").notNull().default(1), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("weekly_period_week_uq").on(t.periodId, t.week)]);
export const dailyMilestones = pgTable("daily_milestones", { id: uuid("id").primaryKey().defaultRandom(), periodId: uuid("period_id").notNull().references(() => monitoringPeriods.id, { onDelete: "cascade" }), day: integer("day").notNull(), dueDate: date("due_date"), title: text("title").notNull(), deliverable: text("deliverable").notNull(), status: workStatus("status").notNull().default("NOT_STARTED"), progress: integer("progress").notNull().default(0), evidenceNote: text("evidence_note"), mentorNote: text("mentor_note"), assigneeId: uuid("assignee_id").references(() => users.id), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("daily_period_day_uq").on(t.periodId, t.day)]);
export const onboardingTasks = pgTable("onboarding_tasks", { id: uuid("id").primaryKey().defaultRandom(), periodId: uuid("period_id").notNull().references(() => monitoringPeriods.id, { onDelete: "cascade" }), day: integer("day").notNull(), title: text("title").notNull(), description: text("description"), status: workStatus("status").notNull().default("NOT_STARTED"), completedAt: timestamp("completed_at", { withTimezone: true }), assigneeId: uuid("assignee_id").references(() => users.id), version: integer("version").notNull().default(1), ...timestamps }, (t) => [uniqueIndex("onboarding_period_day_assignee_uq").on(t.periodId, t.day, t.assigneeId), index("onboarding_assignee_idx").on(t.assigneeId, t.status)]);
export const gates = pgTable("gates", { id: uuid("id").primaryKey().defaultRandom(), periodId: uuid("period_id").notNull().references(() => monitoringPeriods.id, { onDelete: "cascade" }), title: text("title").notNull(), evidenceRequired: boolean("evidence_required").notNull().default(true), status: text("status").notNull().default("NOT_STARTED"), assigneeId: uuid("assignee_id").references(() => users.id), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), ...timestamps });
export const evidence = pgTable("evidence", { id: uuid("id").primaryKey().defaultRandom(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(), storageKey: text("storage_key").notNull(), originalName: text("original_name").notNull(), mimeType: text("mime_type").notNull(), size: integer("size").notNull(), checksum: text("checksum").notNull(), uploadedBy: uuid("uploaded_by").notNull().references(() => users.id), scanStatus: text("scan_status").notNull().default("PENDING"), deletedAt: timestamp("deleted_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("evidence_entity_idx").on(t.entityType, t.entityId)]);
export const projectDocumentRequirements = pgTable("project_document_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  phaseNumber: smallint("phase_number").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  required: boolean("required").notNull().default(true),
  status: text("status").notNull().default("MISSING"),
  attachmentId: uuid("attachment_id").references(() => evidence.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (t) => [
  uniqueIndex("project_document_code_uq").on(t.projectId, t.code),
  index("project_document_phase_idx").on(t.projectId, t.phaseNumber),
  check("project_document_phase_bounds", sql`${t.phaseNumber} between 1 and 6`),
  check("project_document_status", sql`${t.status} in ('MISSING', 'UPLOADED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'WAIVED', 'LEGACY_CONFIRMED')`),
  check("project_document_version_positive", sql`${t.version} > 0`),
]);
export const attachmentLinks = pgTable("attachment_links", { id: uuid("id").primaryKey().defaultRandom(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(), label: text("label").notNull(), url: text("url").notNull(), createdBy: uuid("created_by").notNull().references(() => users.id), deletedAt: timestamp("deleted_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("attachment_links_entity_idx").on(t.entityType, t.entityId)]);
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  approvalType: text("approval_type").notNull(),
  status: approvalStatus("status").notNull().default("PENDING"),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  submittedSnapshot: jsonb("submitted_snapshot").$type<Record<string, unknown>>().notNull(),
  baseVersion: integer("base_version").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
}, (t) => [
  uniqueIndex("approval_pending_uq").on(t.entityType, t.entityId, t.approvalType).where(sql`${t.status} = 'PENDING'`),
  index("approval_queue_idx").on(t.status, t.submittedAt),
  check("approvals_base_version_positive", sql`${t.baseVersion} > 0`),
  check("approvals_project_phase_type_coherence", sql`(${t.entityType} = 'PROJECT_PHASE') = (${t.approvalType} = 'PROJECT_GATE_APPROVAL')`),
  check("approvals_decision_coherence", sql`
    (${t.status} = 'PENDING' and ${t.decidedBy} is null and ${t.decidedAt} is null and ${t.decisionNote} is null)
    or (${t.status} = 'APPROVED' and ${t.decidedBy} is not null and ${t.decidedAt} is not null)
    or (${t.status} in ('REJECTED', 'REVISION_REQUESTED') and ${t.decidedBy} is not null and ${t.decidedAt} is not null and nullif(btrim(${t.decisionNote}), '') is not null)
    or (${t.status} = 'CANCELLED' and ${t.decidedAt} is not null and nullif(btrim(${t.decisionNote}), '') is not null)
  `),
]);
export const approvalActions = pgTable("approval_actions", { id: uuid("id").primaryKey().defaultRandom(), approvalId: uuid("approval_id").notNull().references(() => approvals.id, { onDelete: "cascade" }), action: text("action").notNull(), actorId: uuid("actor_id").notNull().references(() => users.id), note: text("note"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const auditEvents = pgTable("audit_events", { id: uuid("id").primaryKey().defaultRandom(), actorId: uuid("actor_id").references(() => users.id), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id"), result: text("result").notNull().default("SUCCESS"), correlationId: text("correlation_id"), changes: jsonb("changes").$type<Record<string, unknown>>(), metadata: jsonb("metadata").$type<Record<string, unknown>>(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)]);
export const notificationJobs = pgTable("notification_jobs", { id: uuid("id").primaryKey().defaultRandom(), eventType: text("event_type").notNull(), channel: text("channel").notNull(), recipient: text("recipient").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), status: notificationStatus("status").notNull().default("QUEUED"), attempts: integer("attempts").notNull().default(0), idempotencyKey: text("idempotency_key").notNull(), providerId: text("provider_id"), lastError: text("last_error"), scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(), sentAt: timestamp("sent_at", { withTimezone: true }), ...timestamps }, (t) => [uniqueIndex("notification_idempotency_uq").on(t.idempotencyKey), index("notification_queue_idx").on(t.status, t.scheduledAt)]);
export const notificationReads = pgTable("notification_reads", { notificationId: uuid("notification_id").notNull().references(() => notificationJobs.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [uniqueIndex("notification_reads_recipient_uq").on(t.notificationId, t.userId), index("notification_reads_user_idx").on(t.userId, t.readAt)]);
export const savedFilters = pgTable("saved_filters", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), name: text("name").notNull(), nameKey: text("name_key").notNull(), filters: jsonb("filters").$type<{ query: string; type: "all" | "week" | "day" | "gate"; status: string; assigneeId: string }>().notNull(), ...timestamps }, (t) => [uniqueIndex("saved_filters_user_name_uq").on(t.userId, t.nameKey), index("saved_filters_user_updated_idx").on(t.userId, t.updatedAt)]);
export const dataJobs = pgTable("data_jobs", { id: uuid("id").primaryKey().defaultRandom(), kind: text("kind").notNull(), resourceType: text("resource_type").notNull(), status: jobStatus("status").notNull().default("QUEUED"), inputStorageKey: text("input_storage_key"), outputStorageKey: text("output_storage_key"), filters: jsonb("filters").$type<Record<string, unknown>>(), summary: jsonb("summary").$type<Record<string, unknown>>(), error: text("error"), createdBy: uuid("created_by").notNull().references(() => users.id), ...timestamps, completedAt: timestamp("completed_at", { withTimezone: true }) }, (t) => [index("data_jobs_queue_idx").on(t.status, t.createdAt)]);
export const projectWorkspaceImports = pgTable("project_workspace_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull(),
  sourceHash: char("source_hash", { length: 64 }).notNull(),
  legacyId: text("legacy_id").notNull(),
  status: text("status").notNull().default("PREVIEWED"),
  mappingHash: char("mapping_hash", { length: 64 }).notNull(),
  targetProjectId: uuid("target_project_id").references(() => projects.id),
  targetProjectVersion: integer("target_project_version"),
  targetWorkspaceVersion: integer("target_workspace_version"),
  previewExpiresAt: timestamp("preview_expires_at", { withTimezone: true }).notNull(),
  dataJobId: uuid("data_job_id").references(() => dataJobs.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  summary: jsonb("summary").$type<Record<string, unknown>>(),
  error: text("error"),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("project_workspace_import_idempotency_uq").on(t.idempotencyKey),
  index("project_workspace_import_source_idx").on(t.sourceHash, t.legacyId),
  check("project_workspace_import_hashes", sql`${t.sourceHash} ~ '^[0-9a-f]{64}$' and ${t.mappingHash} ~ '^[0-9a-f]{64}$'`),
  check("project_workspace_import_status", sql`${t.status} in ('PREVIEWED', 'PROCESSING', 'SUCCEEDED', 'FAILED')`),
  check("project_workspace_import_versions", sql`(${t.targetProjectVersion} is null or ${t.targetProjectVersion} > 0) and (${t.targetWorkspaceVersion} is null or ${t.targetWorkspaceVersion} > 0)`),
]);



export const tasks = pgTable("tasks", { id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").references(() => projects.id), title: text("title").notNull(), description: text("description"), dueDate: date("due_date"), status: workStatus("status").notNull().default("NOT_STARTED"), progress: integer("progress").notNull().default(0), assigneeId: uuid("assignee_id").references(() => users.id), archivedAt: timestamp("archived_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }), version: integer("version").notNull().default(1), ...timestamps }, (t) => [index("tasks_project_idx").on(t.projectId), index("tasks_assignee_idx").on(t.assigneeId, t.dueDate)]);
