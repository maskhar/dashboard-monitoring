import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import {
  changeProjectCommercialStatus,
  getProjectWorkspace,
  initializeProjectWorkspace,
  ProjectWorkspaceVersionConflict,
  updateProjectWorkspace,
} from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const money = z.string().regex(/^\d{1,17}(?:\.\d{1,2})?$/, "Expected a nonnegative decimal string with at most 2 fraction digits");
const percentage = z.string().regex(/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/, "Expected a percentage from 0 through 100 with at most 4 fraction digits");
const patchSchema = z.object({
  version: z.number().int().positive(),
  clientName: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(1000).nullable().optional(),
  dealDate: z.string().date().nullable().optional(),
  contractValue: money.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  targetMarginPct: percentage.optional(),
  retentionPct: percentage.optional(),
  overheadPct: percentage.optional(),
  contingencyPct: percentage.optional(),
  vatEnabled: z.boolean().optional(),
  vatPct: percentage.optional(),
  withholdingEnabled: z.boolean().optional(),
  withholdingPct: percentage.optional(),
  overrideReason: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "version" && key !== "overrideReason"), "At least one change is required");
const commercialActionSchema = z.object({
  version: z.number().int().positive(),
  commercialAction: z.enum(["SUBMIT", "APPROVE", "LOCK"]),
  note: z.string().trim().max(2000).nullable().optional(),
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
    return Response.json(await getProjectWorkspace(actor, idSchema.parse(id)));
  } catch (error) { return routeError(error); }
}

export async function POST(_request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    return Response.json(await initializeProjectWorkspace(actor, idSchema.parse(id)), { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body === "object" && body !== null && "commercialAction" in body;
    if (action) {
      const { commercialAction, ...input } = commercialActionSchema.parse(body);
      return Response.json(await changeProjectCommercialStatus(actor, idSchema.parse(id), { action: commercialAction, ...input }));
    }
    return Response.json(await updateProjectWorkspace(actor, idSchema.parse(id), patchSchema.parse(body)));
  } catch (error) { return routeError(error); }
}
