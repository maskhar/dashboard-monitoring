import { apiError, requireUser } from "@/lib/server/authz";
import { markAllNotificationsRead } from "@/lib/server/notifications";

export async function POST() {
  try { return Response.json(await markAllNotificationsRead(await requireUser())); }
  catch (error) { return apiError(error); }
}
