import { z } from "zod";
import { createAttachmentLink, listAttachmentLinks } from "@/lib/server/attachments";
import { apiError, requireUser } from "@/lib/server/authz";

const httpUrl = z.string().trim().max(2048).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use http or https");

export const createAttachmentLinkSchema = z.object({
  entityType: z.enum(["PROJECT", "TASK"]),
  entityId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  url: httpUrl,
});

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const params = new URL(request.url).searchParams;
    return Response.json({ data: await listAttachmentLinks(actor, params.get("entityType") ?? "", params.get("entityId") ?? "") });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const input = createAttachmentLinkSchema.parse(await request.json());
    return Response.json(await createAttachmentLink(actor, input), { status: 201 });
  } catch (error) { return apiError(error); }
}
