import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createProject, listProjects } from "@/lib/server/projects";
export const createProjectSchema = z.object({ code: z.string().trim().regex(/^DP-\d{3,}$/), brand: z.string().trim().min(1), startDate: z.string().date().optional(), dueDate: z.string().date().optional(), program: z.string().trim().min(1).optional(), category: z.string().trim().min(1).optional(), notes: z.string().max(4000).optional(), status: z.enum(["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"]).optional(), progress: z.number().int().min(0).max(100).optional(), assigneeId: z.string().uuid().optional() });
const querySchema = z.object({ archived: z.enum(["active", "archived", "deleted", "all"]).default("active"), status: z.enum(["BACKLOG", "IN_PROGRESS", "REVIEW", "BLOCKED", "PUBLISHED", "CANCELLED"]).optional(), limit: z.coerce.number().int().optional(), offset: z.coerce.number().int().optional(), q: z.string().optional() });
export async function GET(request: Request) { try { const actor = await requireUser(); const url = new URL(request.url); const input = querySchema.parse(Object.fromEntries(url.searchParams)); return Response.json({ data: await listProjects(actor, { ...input, view: input.archived }) }); } catch (e) { return apiError(e); } }
export async function POST(request: Request) { try { const actor = await requireUser(["ADMIN"]); return Response.json(await createProject(actor, createProjectSchema.parse(await request.json())), { status: 201 }); } catch (e) { return apiError(e); } }

