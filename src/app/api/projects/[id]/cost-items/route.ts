import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createProjectCostItem, listProjectCostItems, PROJECT_COST_CATEGORIES, ProjectWorkspaceVersionConflict } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const quantity = z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/, "Expected a positive decimal string with at most 4 fraction digits").refine((value) => !/^0+(?:\.0+)?$/.test(value), "Quantity must be greater than zero");
const money = z.string().regex(/^\d{1,17}(?:\.\d{1,2})?$/, "Expected a nonnegative decimal string with at most 2 fraction digits");
const createSchema = z.object({
  category: z.enum(PROJECT_COST_CATEGORIES),
  description: z.string().trim().min(1).max(1000),
  quantity,
  unit: z.string().trim().min(1).max(100),
  unitPrice: money,
  actualAmount: money.nullable().optional(),
  position: z.number().int().min(0).optional(),
  overrideReason: z.string().trim().min(1).max(2000).optional(),
}).strict();

type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    return Response.json({ data: await listProjectCostItems(actor, idSchema.parse(id)) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    return Response.json(await createProjectCostItem(actor, idSchema.parse(id), createSchema.parse(await request.json())), { status: 201 });
  } catch (error) { return routeError(error); }
}
