import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createProjectComment, listProjectComments } from "@/lib/server/project-comments";

export const createProjectCommentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    return Response.json({ data: await listProjectComments(actor, id) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const input = createProjectCommentSchema.parse(await request.json());
    return Response.json(await createProjectComment(actor, id, input.body), { status: 201 });
  } catch (error) { return apiError(error); }
}
