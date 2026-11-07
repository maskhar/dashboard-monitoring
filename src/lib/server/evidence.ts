import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, evidence, users } from "@/db/schema";
import type { Actor } from "./access";
import { canAccessEntity } from "./access";
import { HttpError } from "./authz";
import { scanForMalware } from "./clamav";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
function matchesSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return bytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex"));
}
function storageRoot() { return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), ".data", "evidence"); }

export async function listEvidence(actor: Actor, entityType: string, entityId: string) {
  if (!entityType || !/^[0-9a-f-]{36}$/i.test(entityId)) throw new HttpError(400, "entityType and valid entityId are required");
  if (!await canAccessEntity(actor, entityType, entityId)) throw new HttpError(403, "Forbidden");
  return db.select({ id: evidence.id, entityType: evidence.entityType, entityId: evidence.entityId, originalName: evidence.originalName, mimeType: evidence.mimeType, size: evidence.size, checksum: evidence.checksum, scanStatus: evidence.scanStatus, createdAt: evidence.createdAt, uploadedBy: { id: users.id, name: users.name } }).from(evidence).innerJoin(users, eq(evidence.uploadedBy, users.id)).where(and(eq(evidence.entityType, entityType), eq(evidence.entityId, entityId), isNull(evidence.deletedAt))).orderBy(desc(evidence.createdAt));
}

export async function saveEvidence(actor: Actor, file: File, entityType: string, entityId: string) {
  const maxBytes = Number(process.env.EVIDENCE_MAX_BYTES ?? 10 * 1024 * 1024);
  if (!allowedTypes.has(file.type)) throw new HttpError(415, "Unsupported evidence type");
  if (file.size < 1 || file.size > maxBytes) throw new HttpError(413, "Evidence exceeds size limit");
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) throw new HttpError(400, "Invalid entity ID");
  if (!await canAccessEntity(actor, entityType, entityId)) throw new HttpError(403, "Forbidden");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) throw new HttpError(415, "Evidence content does not match its file type");
  const scanStatus = await scanForMalware(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const extension = file.type === "application/pdf" ? ".pdf" : file.type === "image/png" ? ".png" : file.type === "image/jpeg" ? ".jpg" : ".xlsx";
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
  const destination = path.join(storageRoot(), ...storageKey.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(evidence).values({ entityType, entityId, storageKey, originalName: path.basename(file.name), mimeType: file.type, size: file.size, checksum, uploadedBy: actor.id, scanStatus }).returning();
      await tx.insert(auditEvents).values({ actorId: actor.id, action: "evidence.uploaded", entityType, entityId, metadata: { evidenceId: row.id, size: file.size, checksum } });
      return row;
    });
  } catch (error) { await unlink(destination).catch(() => undefined); throw error; }
}

export async function downloadEvidence(actor: Actor, id: string) {
  const [row] = await db.select().from(evidence).where(and(eq(evidence.id, id), isNull(evidence.deletedAt))).limit(1);
  if (!row) throw new HttpError(404, "Evidence not found");
  if (!await canAccessEntity(actor, row.entityType, row.entityId)) throw new HttpError(403, "Forbidden");
  const root = storageRoot();
  const filePath = path.resolve(root, ...row.storageKey.split("/"));
  if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`)) throw new HttpError(500, "Invalid evidence storage key");
  const bytes = await readFile(filePath);
  if (process.env.AUTH_MODE === "production" && row.scanStatus !== "CLEAN") {
    const scanStatus = await scanForMalware(bytes);
    if (scanStatus !== "CLEAN") throw new HttpError(503, "Evidence is pending malware scan");
    await db.update(evidence).set({ scanStatus }).where(eq(evidence.id, id));
  }
  return { row, bytes };
}
