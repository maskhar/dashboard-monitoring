import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { evidence, projects, users } from "../src/db/schema";
import { downloadEvidence, saveEvidence } from "../src/lib/server/evidence";

async function main() {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN")).limit(1);
  assert.ok(admin, "Restored database must contain an admin");
  const [project] = await db.select({ id: projects.id }).from(projects).limit(1);
  assert.ok(project, "Restored database must contain a project");
  const actor = { id: admin.id, role: "ADMIN" as const };
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const file = new File([new Uint8Array(bytes)], "smoke.pdf", { type: "application/pdf" });
  const uploaded = await saveEvidence(actor, file, "PROJECT", project.id);
  assert.equal(uploaded.scanStatus, "CLEAN");
  const downloaded = await downloadEvidence(actor, uploaded.id);
  assert.equal(createHash("sha256").update(downloaded.bytes).digest("hex"), uploaded.checksum);
  await db.delete(evidence).where(eq(evidence.id, uploaded.id));
  console.log("Scanner upload and checksum verified on isolated database");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
