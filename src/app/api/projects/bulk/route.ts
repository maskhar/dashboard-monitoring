import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { bulkUpdateProjects } from "@/lib/server/projects";

const ids = z.array(z.string().uuid()).min(1).max(100).refine((items) => new Set(items).size === items.length, "Project IDs must be unique");
export const projectBulkSchema = z.discriminatedUnion("action", [
  z.object({ ids, action: z.literal("assign"), assigneeId: z.string().uuid().nullable() }).strict(),
  z.object({ ids, action: z.enum(["archive", "restore"]) }).strict(),
  z.object({ ids, action: z.literal("status"), status: z.enum(["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"]) }).strict(),
]);

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser(["ADMIN"]);
    return Response.json(await bulkUpdateProjects(actor, projectBulkSchema.parse(await request.json())));
  } catch (error) { return apiError(error); }
}
