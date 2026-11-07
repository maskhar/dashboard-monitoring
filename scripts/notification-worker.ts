import { createHmac } from "node:crypto";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import { db } from "../src/db";
import { notificationJobs, users } from "../src/db/schema";

const intervalMs = Number(process.env.NOTIFICATION_POLL_MS ?? 5000);
let stopping = false;

function validateConfiguration() {
  const externalEnabled = Boolean(process.env.EMAIL_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL);
  if (externalEnabled && !process.env.NOTIFICATION_WEBHOOK_TOKEN) {
    throw new Error("NOTIFICATION_WEBHOOK_TOKEN is required when notification webhooks are enabled");
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function deliver(job: typeof notificationJobs.$inferSelect) {
  if (job.channel === "IN_APP") return { providerId: `in-app:${job.id}` };
  let recipient = job.recipient;
  if (/^[0-9a-f-]{36}$/i.test(recipient)) {
    const [user] = await db.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, recipient)).limit(1);
    recipient = job.channel === "EMAIL" ? user?.email ?? "" : user?.phone ?? "";
    if (!recipient) throw new Error(`${job.channel} recipient is not configured`);
  }
  const webhook = job.channel === "EMAIL" ? process.env.EMAIL_WEBHOOK_URL : process.env.WHATSAPP_WEBHOOK_URL;
  if (!webhook) throw new Error(`${job.channel} webhook is not configured`);
  const body = JSON.stringify({ eventId: job.id, eventType: job.eventType, recipient, payload: job.payload });
  const token = process.env.NOTIFICATION_WEBHOOK_TOKEN;
  if (!token) throw new Error("NOTIFICATION_WEBHOOK_TOKEN is not configured");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", token).update(`${timestamp}.${job.id}.${body}`).digest("hex");
  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-utero-event-id": job.id,
      "x-utero-timestamp": timestamp,
      "x-utero-signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${job.channel} webhook returned ${response.status}`);
  const result = await response.json().catch(() => ({})) as { id?: string };
  return { providerId: result.id ?? `${job.channel.toLowerCase()}:${job.id}` };
}

async function poll() {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  await db.update(notificationJobs).set({ status: "QUEUED", lastError: "Recovered stale processing job", scheduledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notificationJobs.status, "PROCESSING"), lt(notificationJobs.updatedAt, staleBefore), lt(notificationJobs.attempts, 5)));
  await db.update(notificationJobs).set({ status: "FAILED", lastError: "Processing lease expired", updatedAt: new Date() })
    .where(and(eq(notificationJobs.status, "PROCESSING"), lt(notificationJobs.updatedAt, staleBefore)));

  const jobs = await db.select().from(notificationJobs)
    .where(and(eq(notificationJobs.status, "QUEUED"), lte(notificationJobs.scheduledAt, new Date())))
    .orderBy(asc(notificationJobs.scheduledAt)).limit(20);

  for (const job of jobs) {
    const [claimed] = await db.update(notificationJobs)
      .set({ status: "PROCESSING", attempts: job.attempts + 1, updatedAt: new Date() })
      .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, "QUEUED"))).returning();
    if (!claimed) continue;
    try {
      const delivered = await deliver(claimed);
      await db.update(notificationJobs).set({ status: "SENT", providerId: delivered.providerId, sentAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(notificationJobs.id, claimed.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown notification error";
      const retry = claimed.attempts < 5;
      await db.update(notificationJobs).set({ status: retry ? "QUEUED" : "FAILED", lastError: message, scheduledAt: new Date(Date.now() + claimed.attempts * 60_000), updatedAt: new Date() }).where(eq(notificationJobs.id, claimed.id));
    }
  }
}

async function main() {
  validateConfiguration();
  console.log(`Notification worker started; polling every ${intervalMs}ms.`);
  while (!stopping) {
    await poll().catch((error) => console.error("Notification poll failed", error));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

void main();
