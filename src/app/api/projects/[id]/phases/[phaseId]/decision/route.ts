import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { decideProjectPhase, ProjectWorkspaceVersionConflict } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  version: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict().superRefine((input, context) => {
  if (input.decision === "REJECTED" && !input.note?.trim()) context.addIssue({ code: "custom", path: ["note"], message: "A rejection note is required" });
});
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id, phaseId } = await context.params;
    return Response.json(await decideProjectPhase(actor, idSchema.parse(id), idSchema.parse(phaseId), schema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}
