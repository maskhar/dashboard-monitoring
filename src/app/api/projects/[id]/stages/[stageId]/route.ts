import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { ProjectWorkspaceVersionConflict, updateProjectStage } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const patchSchema = z.object({
  version: z.number().int().positive(),
  assigneeId: z.string().uuid().nullable().optional(),
  plannedStart: z.string().date().nullable().optional(),
  plannedEnd: z.string().date().nullable().optional(),
  actualStart: z.string().date().nullable().optional(),
  actualEnd: z.string().date().nullable().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  overrideReason: z.string().trim().min(1).max(1000).optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "version" && key !== "overrideReason"), "At least one stage change is required");
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, stageId } = await context.params;
    return Response.json(await updateProjectStage(actor, idSchema.parse(id), idSchema.parse(stageId), patchSchema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}
