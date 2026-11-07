import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationJobs, notificationReads } from "@/db/schema";
import { HttpError } from "./authz";
import type { Actor } from "./access";

const recipientFilter = (actor: Actor) => or(eq(notificationJobs.recipient, actor.id), eq(notificationJobs.recipient, actor.role));

export async function listNotifications(actor: Actor, limit = 30) {
  const rows = await db.select({
    id: notificationJobs.id,
    eventType: notificationJobs.eventType,
    payload: notificationJobs.payload,
    createdAt: notificationJobs.createdAt,
    readAt: notificationReads.readAt,
  }).from(notificationJobs)
    .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationJobs.id), eq(notificationReads.userId, actor.id)))
    .where(and(eq(notificationJobs.channel, "IN_APP"), recipientFilter(actor)))
    .orderBy(desc(notificationJobs.createdAt))
    .limit(limit);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(notificationJobs)
    .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationJobs.id), eq(notificationReads.userId, actor.id)))
    .where(and(eq(notificationJobs.channel, "IN_APP"), recipientFilter(actor), sql`${notificationReads.readAt} is null`));

  return { data: rows, unreadCount: count ?? 0 };
}

export async function markNotificationRead(actor: Actor, notificationId: string) {
  const [notification] = await db.select({ id: notificationJobs.id }).from(notificationJobs)
    .where(and(eq(notificationJobs.id, notificationId), eq(notificationJobs.channel, "IN_APP"), recipientFilter(actor))).limit(1);
  if (!notification) throw new HttpError(404, "Notification not found");
  const [receipt] = await db.insert(notificationReads).values({ notificationId, userId: actor.id })
    .onConflictDoUpdate({ target: [notificationReads.notificationId, notificationReads.userId], set: { readAt: new Date() } }).returning();
  return receipt;
}

export async function markAllNotificationsRead(actor: Actor) {
  const rows = await db.select({ id: notificationJobs.id }).from(notificationJobs)
    .where(and(eq(notificationJobs.channel, "IN_APP"), recipientFilter(actor)));
  if (!rows.length) return { updated: 0 };
  await db.insert(notificationReads).values(rows.map(({ id }) => ({ notificationId: id, userId: actor.id })))
    .onConflictDoUpdate({ target: [notificationReads.notificationId, notificationReads.userId], set: { readAt: new Date() } });
  return { updated: rows.length };
}

export async function createInAppNotification(input: { eventType: string; recipient: string; payload: Record<string, unknown>; idempotencyKey: string }) {
  const [row] = await db.insert(notificationJobs).values({ ...input, channel: "IN_APP" }).onConflictDoNothing({ target: notificationJobs.idempotencyKey }).returning();
  if (row) return { row, created: true };
  const [existing] = await db.select().from(notificationJobs).where(and(eq(notificationJobs.idempotencyKey, input.idempotencyKey), inArray(notificationJobs.channel, ["IN_APP"]))).limit(1);
  if (!existing) throw new HttpError(409, "Idempotency key already belongs to another notification");
  return { row: existing, created: false };
}
