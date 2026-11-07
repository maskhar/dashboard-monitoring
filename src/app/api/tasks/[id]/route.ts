import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { deleteTask, updateTask } from "@/lib/server/tasks";

const status = z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]);
const patchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(4000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  status: status.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  action: z.enum(["archive", "restore"]).optional(),
  version: z.number().int().positive(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "version"), "At least one change is required").refine((input) => !input.action || Object.keys(input).every((key) => key === "action" || key === "version"), "Lifecycle actions cannot include edits");
const deleteSchema = z.object({ version: z.number().int().positive() }).strict();
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    return Response.json(await updateTask(actor, id, patchSchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    const { version } = deleteSchema.parse(await request.json());
    return Response.json(await deleteTask(actor, id, version));
  } catch (error) { return apiError(error); }
}
