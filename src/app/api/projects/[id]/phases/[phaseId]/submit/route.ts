import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { ProjectWorkspaceVersionConflict, submitProjectPhase } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const schema = z.object({ version: z.number().int().positive() }).strict();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, phaseId } = await context.params;
    const { version } = schema.parse(await request.json());
    return Response.json(await submitProjectPhase(actor, idSchema.parse(id), idSchema.parse(phaseId), version));
  } catch (error) { return routeError(error); }
}
