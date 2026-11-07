import { apiError, requireUser } from "@/lib/server/authz";
import { parseReportFilters, projectsPdf } from "@/lib/server/reports";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const actor = await requireUser(); const filters = parseReportFilters(new URL(request.url).searchParams); const body = await projectsPdf(actor, filters); return new Response(new Uint8Array(body), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=utero-projects.pdf" } }); } catch (e) { return apiError(e); } }
