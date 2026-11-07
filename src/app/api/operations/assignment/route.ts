import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { assignOperation } from "@/lib/server/operations";

const schema = z.object({
  entityType: z.enum(["KPI_TARGET", "WEEKLY_PLAN", "DAILY_MILESTONE", "GATE", "ONBOARDING_TASK"]),
  entityId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser(["ADMIN"]);
    return Response.json(await assignOperation(actor, schema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
