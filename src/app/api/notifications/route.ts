import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { createInAppNotification, listNotifications } from "@/lib/server/notifications";

export const createNotificationSchema = z.object({ eventType: z.string().trim().min(1).max(100), recipient: z.string().uuid(), payload: z.record(z.string(), z.unknown()), idempotencyKey: z.string().trim().min(8).max(200) });

export async function GET() { try { const actor = await requireUser(); return Response.json(await listNotifications(actor)); } catch (e) { return apiError(e); } }
export async function POST(request: Request) { try { await requireUser(["ADMIN"]); const result = await createInAppNotification(createNotificationSchema.parse(await request.json())); return Response.json(result.row, { status: result.created ? 201 : 200 }); } catch (e) { return apiError(e); } }
