import { access, readdir, stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { Client } from "pg";

type Check = { name: string; ok: boolean; latencyMs: number; detail: string };

const pollMs = positiveNumber("MONITOR_POLL_MS", 60_000);
const timeoutMs = positiveNumber("MONITOR_TIMEOUT_MS", 10_000);
const backupMaxAgeMs = positiveNumber("BACKUP_MAX_AGE_SECONDS", 90_000) * 1000;
const heartbeatMs = positiveNumber("MONITOR_HEARTBEAT_MS", 3_600_000);
const appHealthUrl = process.env.APP_HEALTH_URL ?? "http://app:3000/api/health";
const clamavHost = process.env.CLAMAV_HOST ?? "clamav";
const clamavPort = positiveNumber("CLAMAV_PORT", 3310);
const backupDir = process.env.BACKUP_DIR ?? "/backups";
const webhookUrl = process.env.MONITOR_WEBHOOK_URL;
const serviceName = process.env.MONITOR_SERVICE_NAME ?? "utero-dashboard";
const notificationMaxStaleSeconds = positiveNumber("NOTIFICATION_MAX_STALE_SECONDS", 900);
let stopping = false;
let previousHealthy: boolean | undefined;
let lastWebhookAt = 0;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

async function timed(name: string, work: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    const detail = await work();
    return { name, ok: true, latencyMs: Date.now() - started, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
}

async function checkApp() {
  return timed("app", async () => {
    const response = await fetch(appHealthUrl, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null) as { status?: string } | null;
    if (!response.ok || body?.status !== "ok") throw new Error(`HTTP ${response.status}, status=${body?.status ?? "invalid"}`);
    return `HTTP ${response.status}`;
  });
}

async function checkDatabase() {
  return timed("db", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    const client = new Client({ connectionString, connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs });
    try {
      await client.connect();
      await client.query("select 1");
      return "query ok";
    } finally {
      await client.end().catch(() => undefined);
    }
  });
}

async function checkNotificationQueue() {
  return timed("notifications", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    const client = new Client({ connectionString, connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs });
    try {
      await client.connect();
      const result = await client.query<{ failed: string; stale: string }>(`
        select
          count(*) filter (where status = 'FAILED')::text as failed,
          count(*) filter (
            where (status = 'PROCESSING' and updated_at < now() - ($1 * interval '1 second'))
               or (status = 'QUEUED' and scheduled_at < now() - ($1 * interval '1 second'))
          )::text as stale
        from notification_jobs
      `, [notificationMaxStaleSeconds]);
      const failed = Number(result.rows[0]?.failed ?? 0);
      const stale = Number(result.rows[0]?.stale ?? 0);
      if (failed || stale) throw new Error(`failed=${failed}, stale=${stale}`);
      return "failed=0, stale=0";
    } finally {
      await client.end().catch(() => undefined);
    }
  });
}

async function checkClamav() {
  return timed("clamav", () => new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: clamavHost, port: clamavPort });
    const timer = setTimeout(() => socket.destroy(new Error("timeout")), timeoutMs);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write("PING\n"));
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.includes("PONG")) socket.end();
    });
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      if (response.includes("PONG")) resolve("PONG");
      else reject(new Error(`unexpected response: ${response.trim() || "empty"}`));
    });
  }));
}

async function checkBackup() {
  return timed("backup", async () => {
    await access(backupDir);
    const entries = await readdir(backupDir, { withFileTypes: true });
    const completed = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const directory = `${backupDir}/${entry.name}`;
        await Promise.all([access(`${directory}/database.dump`), access(`${directory}/uploads.tar.gz`), access(`${directory}/SHA256SUMS`)]);
        return { name: entry.name, modifiedAt: (await stat(`${directory}/SHA256SUMS`)).mtimeMs };
      }));
    const newest = completed.sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
    if (!newest) throw new Error("no completed backup found");
    const ageMs = Date.now() - newest.modifiedAt;
    if (ageMs > backupMaxAgeMs) throw new Error(`latest ${newest.name} is ${Math.floor(ageMs / 1000)}s old`);
    return `latest=${newest.name}, age=${Math.floor(ageMs / 1000)}s`;
  });
}

async function publish(status: "healthy" | "alert" | "recovered", checks: Check[]) {
  const failed = checks.filter((check) => !check.ok);
  const message = failed.length
    ? `${serviceName} ALERT: ${failed.map((check) => `${check.name}=${check.detail}`).join("; ")}`
    : `${serviceName} ${status.toUpperCase()}: ${checks.map((check) => `${check.name}=${check.detail}`).join("; ")}`;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: serviceName, status, message, checks }));
  if (!webhookUrl) return;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ service: serviceName, status, message, timestamp: new Date().toISOString(), checks }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`monitor webhook returned HTTP ${response.status}`);
}

async function poll() {
  const checks = await Promise.all([checkApp(), checkDatabase(), checkNotificationQueue(), checkClamav(), checkBackup()]);
  const healthy = checks.every((check) => check.ok);
  const now = Date.now();
  const changed = previousHealthy !== undefined && previousHealthy !== healthy;
  const heartbeatDue = now - lastWebhookAt >= heartbeatMs;
  const status = healthy ? (changed ? "recovered" : "healthy") : "alert";
  if (previousHealthy === undefined || changed || heartbeatDue) {
    await publish(status, checks).catch((error) => console.error("Monitor publish failed", error));
    lastWebhookAt = now;
  } else {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: serviceName, status, checks }));
  }
  previousHealthy = healthy;
}

async function main() {
  console.log(`Monitor started; polling every ${pollMs}ms.`);
  while (!stopping) {
    await poll();
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

void main().catch((error) => {
  console.error("Monitor stopped", error);
  process.exitCode = 1;
});
