import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import {
  deactivateProjectWorkspaceAssignment,
  PROJECT_WORKSPACE_ROLES,
  ProjectWorkspaceVersionConflict,
  updateProjectWorkspaceAssignment,
} from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const patchSchema = z.object({ userId: z.string().uuid(), role: z.enum(PROJECT_WORKSPACE_ROLES), version: z.number().int().positive() }).strict();
const deleteSchema = z.object({ version: z.number().int().positive() }).strict();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id, assignmentId } = await context.params;
    return Response.json(await updateProjectWorkspaceAssignment(actor, idSchema.parse(id), idSchema.parse(assignmentId), patchSchema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id, assignmentId } = await context.params;
    const { version } = deleteSchema.parse(await request.json());
    return Response.json(await deactivateProjectWorkspaceAssignment(actor, idSchema.parse(id), idSchema.parse(assignmentId), version));
  } catch (error) { return routeError(error); }
}
