import { apiError, requireUser } from "@/lib/server/authz";
import { parseReportFilters, projectsWorkbook } from "@/lib/server/reports";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const actor = await requireUser(); const filters = parseReportFilters(new URL(request.url).searchParams); const body = await projectsWorkbook(actor, filters); return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=utero-projects.xlsx" } }); } catch (e) { return apiError(e); } }
