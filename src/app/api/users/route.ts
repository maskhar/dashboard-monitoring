import { hash } from "bcryptjs";
import { asc, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { apiError, requireUser } from "@/lib/server/authz";

const schema = z.object({ email: z.email().transform((value) => value.toLowerCase()), name: z.string().min(1).max(200), role: z.enum(["ADMIN", "STAFF"]).default("STAFF"), status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).default("INVITED"), phone: z.string().max(50).nullish(), password: z.string().min(8).max(200).optional() });
const columns = { id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, phone: users.phone };

export async function GET() { try { await requireUser(["ADMIN"]); return Response.json({ data: await db.select(columns).from(users).where(isNull(users.deletedAt)).orderBy(asc(users.name)) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const actor = await requireUser(["ADMIN"]); const input = schema.parse(await request.json()); const [created] = await db.transaction(async (tx) => { const [row] = await tx.insert(users).values({ email: input.email, name: input.name, role: input.role, status: input.status, phone: input.phone, passwordHash: input.password ? await hash(input.password, 12) : null }).returning(columns); await tx.insert(auditEvents).values({ actorId: actor.id, action: "user.created", entityType: "USER", entityId: row.id, changes: { email: row.email, name: row.name, role: row.role, status: row.status, phone: row.phone } }); return [row]; }); return Response.json(created, { status: 201 }); } catch (error) { return apiError(error); } }
