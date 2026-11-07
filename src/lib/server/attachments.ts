import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachmentLinks, auditEvents, users } from "@/db/schema";
import type { Actor } from "./access";
import { canAccessEntity } from "./access";
import { HttpError } from "./authz";

export type AttachmentEntityType = "PROJECT" | "TASK";

function normalizeEntityType(value: string): AttachmentEntityType {
  const type = value.toUpperCase();
  if (type !== "PROJECT" && type !== "TASK") throw new HttpError(400, "entityType must be PROJECT or TASK");
  return type;
}

function assertEntityId(entityId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) throw new HttpError(400, "Valid entityId is required");
}

export async function listAttachmentLinks(actor: Actor, entityType: string, entityId: string) {
  const type = normalizeEntityType(entityType);
  assertEntityId(entityId);
  if (!await canAccessEntity(actor, type, entityId)) throw new HttpError(403, "Forbidden");
  return db.select({ id: attachmentLinks.id, entityType: attachmentLinks.entityType, entityId: attachmentLinks.entityId, label: attachmentLinks.label, url: attachmentLinks.url, createdAt: attachmentLinks.createdAt, createdBy: { id: users.id, name: users.name } })
    .from(attachmentLinks)
    .innerJoin(users, eq(attachmentLinks.createdBy, users.id))
    .where(and(eq(attachmentLinks.entityType, type), eq(attachmentLinks.entityId, entityId), isNull(attachmentLinks.deletedAt)))
    .orderBy(desc(attachmentLinks.createdAt));
}

export async function createAttachmentLink(actor: Actor, input: { entityType: string; entityId: string; label: string; url: string }) {
  const entityType = normalizeEntityType(input.entityType);
  assertEntityId(input.entityId);
  if (!await canAccessEntity(actor, entityType, input.entityId)) throw new HttpError(403, "Forbidden");
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(attachmentLinks).values({ entityType, entityId: input.entityId, label: input.label, url: input.url, createdBy: actor.id }).returning();
    await tx.insert(auditEvents).values({ actorId: actor.id, action: "attachment.link.created", entityType, entityId: input.entityId, metadata: { attachmentLinkId: row.id, url: input.url } });
    return row;
  });
}
