import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { changeOperationLifecycle, updateGate } from "@/lib/server/operations";

const schema = z.object({ status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body === "object" && body !== null && "action" in body;
    return Response.json(action ? await changeOperationLifecycle(actor, "GATE", id, z.object({ action: z.enum(["archive", "restore"]) }).parse(body).action) : await updateGate(actor, id, schema.parse(body)));
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(["ADMIN"]); const { id } = await context.params; return Response.json(await changeOperationLifecycle(actor, "GATE", id, "delete")); } catch (error) { return apiError(error); } }
