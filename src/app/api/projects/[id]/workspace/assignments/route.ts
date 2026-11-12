import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import {
  createProjectWorkspaceAssignment,
  listProjectWorkspaceAssignments,
  PROJECT_WORKSPACE_ROLES,
  ProjectWorkspaceVersionConflict,
  setProjectWorkspaceRoleAssignments,
} from "@/lib/server/project-workspace";

const idSchema = z.string().uuid();
const createSchema = z.object({ userId: z.string().uuid(), role: z.enum(PROJECT_WORKSPACE_ROLES), version: z.number().int().positive() }).strict();
const setSchema = z.object({ role: z.enum(PROJECT_WORKSPACE_ROLES), userIds: z.array(z.string().uuid()).max(100), version: z.number().int().positive() }).strict();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    return Response.json({ data: await listProjectWorkspaceAssignments(actor, idSchema.parse(id), !includeInactive) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    return Response.json(await createProjectWorkspaceAssignment(actor, idSchema.parse(id), createSchema.parse(await request.json())), { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const actor = await requireUser(["ADMIN"]);
    const { id } = await context.params;
    return Response.json({ data: await setProjectWorkspaceRoleAssignments(actor, idSchema.parse(id), setSchema.parse(await request.json())) });
  } catch (error) { return routeError(error); }
}
