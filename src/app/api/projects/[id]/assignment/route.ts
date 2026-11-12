import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { assignProject, ProjectAssignmentVersionConflict } from "@/lib/server/projects";

const idSchema = z.string().uuid();
export const projectAssignmentSchema = z.object({
  userId: z.string().uuid().nullable(),
  version: z.number().int().positive(),
}).strict();

function routeError(error: unknown) {
  if (error instanceof ProjectAssignmentVersionConflict) {
    return Response.json({ error: error.message, current: error.current }, { status: 409 });
  }
  return apiError(error);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    return Response.json(await assignProject(actor, idSchema.parse(id), projectAssignmentSchema.parse(await request.json())));
  } catch (error) {
    return routeError(error);
  }
}
