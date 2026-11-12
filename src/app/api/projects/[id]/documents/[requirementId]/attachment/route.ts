import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { ProjectWorkspaceVersionConflict, uploadProjectDocumentRequirement } from "@/lib/server/project-workspace";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
const versionSchema = z.coerce.number().int().positive();
type Context = { params: Promise<Record<string, string>> };

function routeError(error: unknown) {
  if (error instanceof ProjectWorkspaceVersionConflict) return Response.json({ error: error.message, current: error.current }, { status: 409 });
  return apiError(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > 12 * 1024 * 1024) return Response.json({ error: "Evidence request exceeds size limit" }, { status: 413 });
    const { id, requirementId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
    const version = versionSchema.parse(form.get("version"));
    return Response.json(await uploadProjectDocumentRequirement(actor, idSchema.parse(id), idSchema.parse(requirementId), version, file), { status: 201 });
  } catch (error) { return routeError(error); }
}
