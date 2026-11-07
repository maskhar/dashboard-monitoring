import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createTask, listTasks } from "@/lib/server/tasks";

const status = z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "BLOCKED", "CANCELLED"]);
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(4000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  status: status.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
}).strict();
const querySchema = z.object({ view: z.enum(["active", "archived", "deleted"]).default("active") });

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ data: await listTasks(actor, query.view) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser(["ADMIN"]);
    return Response.json(await createTask(actor, createTaskSchema.parse(await request.json())), { status: 201 });
  } catch (error) { return apiError(error); }
}
