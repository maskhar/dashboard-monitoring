import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { assignProject } from "@/lib/server/projects";

const schema = z.object({ userId: z.string().uuid().nullable() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(["ADMIN"]); const { id } = await context.params; return Response.json(await assignProject(actor.id, id, schema.parse(await request.json()).userId)); } catch (error) { return apiError(error); } }
