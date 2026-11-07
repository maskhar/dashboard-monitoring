import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createOperation, getOperations } from "@/lib/server/operations";
const base = { periodId: z.string().uuid(), assigneeId: z.string().uuid().optional() };
export const createOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WEEKLY_PLAN"), ...base, week: z.number().int().positive(), focus: z.string().trim().min(1), deliverable: z.string().trim().min(1), dueDate: z.string().date().optional() }),
  z.object({ type: z.literal("DAILY_MILESTONE"), ...base, day: z.number().int().min(1).max(14), title: z.string().trim().min(1), deliverable: z.string().trim().min(1), dueDate: z.string().date().optional() }),
  z.object({ type: z.literal("GATE"), ...base, title: z.string().trim().min(1) }),
  z.object({ type: z.literal("KPI_TARGET"), ...base, code: z.string().trim().min(1), name: z.string().trim().min(1), unit: z.string().trim().min(1), target: z.number().finite().nonnegative() }),
]);
const viewSchema = z.enum(["active", "archived", "deleted", "all"]);
export async function GET(request: Request) { try { const actor = await requireUser(); const query = new URL(request.url).searchParams; return Response.json(await getOperations(actor, query.get("periodId"), viewSchema.parse(query.get("view") ?? "active"))); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const actor = await requireUser(["ADMIN"]); return Response.json(await createOperation(actor, createOperationSchema.parse(await request.json())), { status: 201 }); } catch (error) { return apiError(error); } }

