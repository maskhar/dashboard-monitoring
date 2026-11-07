import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { deleteSavedFilter, listSavedFilters, saveFilter } from "@/lib/server/saved-filters";

export const filterStateSchema = z.object({
  query: z.string().max(200),
  type: z.enum(["all", "week", "day", "gate"]),
  status: z.string().min(1).max(50),
  assigneeId: z.union([z.enum(["all", "unassigned"]), z.string().uuid()]),
}).strict();
export const saveFilterSchema = z.object({ name: z.string().trim().min(1).max(50), filters: filterStateSchema }).strict();
const deleteSchema = z.string().uuid();

export async function GET() {
  try { const actor = await requireUser(); return Response.json({ data: await listSavedFilters(actor) }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { const actor = await requireUser(); const row = await saveFilter(actor, saveFilterSchema.parse(await request.json())); return Response.json(row, { status: 201 }); } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try { const actor = await requireUser(); const id = deleteSchema.parse(new URL(request.url).searchParams.get("id")); return Response.json(await deleteSavedFilter(actor, id)); } catch (error) { return apiError(error); }
}
