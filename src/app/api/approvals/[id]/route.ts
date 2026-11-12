import { z } from "zod";
import { decideApproval } from "@/lib/server/approvals";
import { apiError, requireUser } from "@/lib/server/authz";
const schema = z.object({ decision: z.enum(["APPROVED", "REJECTED", "REVISION_REQUESTED"]), note: z.string().max(2000).optional() }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(["ADMIN"]); const { id } = await context.params; const input = schema.parse(await request.json()); return Response.json(await decideApproval(actor.id, id, input.decision, input.note)); } catch (e) { return apiError(e); } }
