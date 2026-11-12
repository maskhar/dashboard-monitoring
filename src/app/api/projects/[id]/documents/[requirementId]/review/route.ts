import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { ProjectWorkspaceVersionConflict, reviewProjectDocumentRequirement } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const schema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "WAIVED"]),
  version: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict().superRefine((input, context) => {
  if ((input.status === "REJECTED" || input.status === "WAIVED") && !input.note?.trim()) context.addIssue({ code: "custom", path: ["note"], message: "A review note is required" });
});
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, requirementId } = await context.params;
    return Response.json(await reviewProjectDocumentRequirement(actor, idSchema.parse(id), idSchema.parse(requirementId), schema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}
