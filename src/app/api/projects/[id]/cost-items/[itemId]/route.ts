import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { deleteProjectCostItem, PROJECT_COST_CATEGORIES, ProjectWorkspaceVersionConflict, updateProjectCostItem } from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const quantity = z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/, "Expected a positive decimal string with at most 4 fraction digits").refine((value) => !/^0+(?:\.0+)?$/.test(value), "Quantity must be greater than zero");
const money = z.string().regex(/^\d{1,17}(?:\.\d{1,2})?$/, "Expected a nonnegative decimal string with at most 2 fraction digits");
const patchSchema = z.object({
  version: z.number().int().positive(),
  category: z.enum(PROJECT_COST_CATEGORIES).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  quantity: quantity.optional(),
  unit: z.string().trim().min(1).max(100).optional(),
  unitPrice: money.optional(),
  actualAmount: money.nullable().optional(),
  position: z.number().int().min(0).optional(),
  overrideReason: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "version" && key !== "overrideReason"), "At least one change is required");
const deleteSchema = z.object({ version: z.number().int().positive(), overrideReason: z.string().trim().min(1).max(2000).optional() }).strict();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, itemId } = await context.params;
    return Response.json(await updateProjectCostItem(actor, idSchema.parse(id), idSchema.parse(itemId), patchSchema.parse(await request.json())));
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id, itemId } = await context.params;
    const { version, overrideReason } = deleteSchema.parse(await request.json());
    return Response.json(await deleteProjectCostItem(actor, idSchema.parse(id), idSchema.parse(itemId), version, overrideReason));
  } catch (error) { return routeError(error); }
}
