import { z } from "zod";
import { apiError, HttpError, requireUser } from "@/lib/server/authz";
import {
  commitLegacyWorkspaceImport,
  LEGACY_WORKSPACE_IMPORT_MAX_BYTES,
  legacyCommitProjectMappingSchema,
  legacyProjectMappingSchema,
  legacyUserMappingSchema,
  previewLegacyWorkspaceImport,
} from "@/lib/server/legacy-workspace-import";

export const runtime = "nodejs";

const actionSchema = z.enum(["preview", "commit"]);
const ALLOWED_FIELDS = new Set(["action", "file", "projectMapping", "userMapping"]);

function rejectOversizedRequest(request: Request) {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header.trim())) return;
  const contentLength = Number(header);
  if (Number.isSafeInteger(contentLength) && contentLength > LEGACY_WORKSPACE_IMPORT_MAX_BYTES) {
    throw new HttpError(413, `Request body must not exceed ${LEGACY_WORKSPACE_IMPORT_MAX_BYTES} bytes`);
  }
}

function parseJsonField(form: FormData, name: string, required: boolean) {
  const values = form.getAll(name);
  if (values.length > 1) throw new HttpError(400, `${name} must be provided once`);
  const value = values[0];
  if (value === undefined) {
    if (required) throw new HttpError(400, `${name} is required`);
    return {};
  }
  if (typeof value !== "string") throw new HttpError(400, `${name} must be JSON text`);
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, `${name} must contain valid JSON`);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser(["ADMIN"]);
    rejectOversizedRequest(request);
    const form = await request.formData();
    for (const key of form.keys()) if (!ALLOWED_FIELDS.has(key)) throw new HttpError(400, `Unknown multipart field: ${key}`);
    const actionValues = form.getAll("action");
    const fileValues = form.getAll("file");
    if (actionValues.length !== 1 || typeof actionValues[0] !== "string") throw new HttpError(400, "action must be provided once");
    if (fileValues.length !== 1 || !(fileValues[0] instanceof File)) throw new HttpError(400, "file must be provided once");
    const action = actionSchema.parse(actionValues[0]);
    const file = fileValues[0];
    if (!file.size || file.size > LEGACY_WORKSPACE_IMPORT_MAX_BYTES) throw new HttpError(400, `JSON file must be between 1 and ${LEGACY_WORKSPACE_IMPORT_MAX_BYTES} bytes`);
    if (!file.name.toLocaleLowerCase("en-US").endsWith(".json") && !["application/json", "text/json", "text/plain", ""].includes(file.type)) throw new HttpError(400, "file must be a JSON export");
    const buffer = Buffer.from(await file.arrayBuffer());
    const userMapping = legacyUserMappingSchema.parse(parseJsonField(form, "userMapping", action === "commit"));
    if (action === "preview") {
      const projectMapping = legacyProjectMappingSchema.parse(parseJsonField(form, "projectMapping", false));
      return Response.json(await previewLegacyWorkspaceImport(actor.id, buffer, { projectMapping, userMapping }));
    }
    const projectMapping = legacyCommitProjectMappingSchema.parse(parseJsonField(form, "projectMapping", true));
    const result = await commitLegacyWorkspaceImport(actor.id, buffer, projectMapping, userMapping);
    return Response.json(result, { status: result.status === "PARTIALLY_SUCCEEDED" ? 207 : result.status === "FAILED" ? 422 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
