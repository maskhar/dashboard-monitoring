import { apiError, requireUser } from "@/lib/server/authz";
import { downloadEvidence } from "@/lib/server/evidence";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(); const { id } = await context.params; const { row, bytes } = await downloadEvidence(actor, id); return new Response(bytes, { headers: { "content-type": row.mimeType, "content-length": String(row.size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`, "x-content-type-options": "nosniff" } }); } catch (error) { return apiError(error); } }
