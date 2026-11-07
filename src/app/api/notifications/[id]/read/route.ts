import { z } from "zod";
import { apiError, requireUser } from "@/lib/server/authz";
import { markNotificationRead } from "@/lib/server/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = z.object({ id: z.string().uuid() }).parse(await params);
    return Response.json(await markNotificationRead(actor, id));
  } catch (error) { return apiError(error); }
}
