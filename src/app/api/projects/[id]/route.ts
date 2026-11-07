import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { changeProjectLifecycle, updateProject } from "@/lib/server/projects";
const schema = z.object({ status: z.enum(["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"]), progress: z.number().int().min(0).max(100), note: z.string().max(2000).optional(), version: z.number().int().positive() });
const actionSchema = z.object({ action: z.enum(["archive", "restore"]) });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(); const { id } = await context.params; const body = await request.json(); const action = typeof body === "object" && body !== null && "action" in body; return Response.json(action ? await changeProjectLifecycle(actor, id, actionSchema.parse(body).action) : await updateProject(actor, id, schema.parse(body))); } catch (e) { return apiError(e); } }
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(["ADMIN"]); const { id } = await context.params; return Response.json(await changeProjectLifecycle(actor, id, "delete")); } catch (e) { return apiError(e); } }

