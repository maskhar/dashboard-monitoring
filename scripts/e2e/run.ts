import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { Client } from "pg";

try {
  loadEnvFile(resolve(".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function databaseAdminUrl() {
  if (process.env.E2E_ADMIN_DATABASE_URL) return new URL(process.env.E2E_ADMIN_DATABASE_URL);
  if (process.env.DATABASE_URL) return new URL(process.env.DATABASE_URL);

  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;
  if (!user || !password || !database) {
    throw new Error("Set E2E_ADMIN_DATABASE_URL, DATABASE_URL, or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB before running E2E tests.");
  }

  const host = process.env.E2E_DB_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_HOST_PORT ?? "5433";
  return new URL(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`);
}

function databaseUrl(base: URL, database: string) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function availablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Failed to allocate E2E port."));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolveExit, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`${command} exited from signal ${signal}.`));
      resolveExit(code ?? 1);
    });
  });
}

async function createDatabase(adminUrl: URL, name: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${process.env.E2E_ADMIN_DATABASE ?? "postgres"}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function seedUsers(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO users (id, email, name, role, status)
      VALUES
        ('00000000-0000-4000-8000-000000000001', 'admin@utero.local', 'Demo Admin', 'ADMIN', 'ACTIVE'),
        ('00000000-0000-4000-8000-000000000002', 'staff@utero.local', 'Demo Staff', 'STAFF', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        deleted_at = NULL
    `);
  } finally {
    await client.end();
  }
}

async function dropDatabase(adminUrl: URL, name: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${process.env.E2E_ADMIN_DATABASE ?? "postgres"}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

async function main() {
  const adminUrl = databaseAdminUrl();
  const databaseName = `utero_e2e_${Date.now()}_${randomUUID().slice(0, 8).replaceAll("-", "")}`;
  const connectionString = databaseUrl(adminUrl, databaseName);
  const port = await availablePort();
  const uploadDir = await mkdtemp(join(tmpdir(), "utero-e2e-uploads-"));
  const npmCli = process.env.npm_execpath ?? resolve("node_modules/npm/bin/npm-cli.js");
  const playwrightCli = resolve("node_modules/@playwright/test/cli.js");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: connectionString,
    AUTH_MODE: "development",
    AUTH_DEMO_ENABLED: "true",
    AUTH_SECRET: "e2e-only-secret-not-for-production-2026",
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "",
    NEXTAUTH_URL: `http://127.0.0.1:${port}`,
    E2E_BASE_URL: `http://127.0.0.1:${port}`,
    E2E_PORT: String(port),
    UPLOAD_DIR: uploadDir,
  };

  let created = false;
  try {
    await createDatabase(adminUrl, databaseName);
    created = true;
    if (await run(process.execPath, [npmCli, "run", "db:migrate"], env)) process.exitCode = 1;
    else if (await run(process.execPath, [npmCli, "run", "db:seed"], env)) process.exitCode = 1;
    else {
      await seedUsers(connectionString);
      process.exitCode = await run(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], env);
    }
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
    if (created) await dropDatabase(adminUrl, databaseName);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
