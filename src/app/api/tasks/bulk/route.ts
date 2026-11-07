import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { bulkUpdateTasks } from "@/lib/server/tasks";

const ids = z.array(z.string().uuid()).min(1).max(100).refine((items) => new Set(items).size === items.length, "Task IDs must be unique");
export const taskBulkSchema = z.discriminatedUnion("action", [
  z.object({ ids, action: z.literal("assign"), assigneeId: z.string().uuid().nullable() }).strict(),
  z.object({ ids, action: z.enum(["archive", "restore"]) }).strict(),
  z.object({ ids, action: z.literal("status"), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]) }).strict(),
]);

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser(["ADMIN"]);
    return Response.json(await bulkUpdateTasks(actor, taskBulkSchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
