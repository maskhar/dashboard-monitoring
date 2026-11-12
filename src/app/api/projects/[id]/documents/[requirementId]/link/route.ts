import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { linkProjectDocumentEvidence, ProjectWorkspaceVersionConflict } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const schema = z.object({ evidenceId: z.string().uuid(), version: z.number().int().positive() }).strict();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, requirementId } = await context.params;
    return Response.json(await linkProjectDocumentEvidence(actor, idSchema.parse(id), idSchema.parse(requirementId), schema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}
