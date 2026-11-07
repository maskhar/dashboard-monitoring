import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { apiError, HttpError, requireUser } from "@/lib/server/authz";

const schema = z.object({ email: z.email().transform((value) => value.toLowerCase()).optional(), name: z.string().min(1).max(200).optional(), role: z.enum(["ADMIN", "STAFF"]).optional(), status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).optional(), phone: z.string().max(50).nullable().optional(), password: z.string().min(8).max(200).optional() }).refine((value) => Object.keys(value).length > 0, "At least one field is required");
const columns = { id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, phone: users.phone };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const actor = await requireUser(["ADMIN"]); const { id } = await context.params; const input = schema.parse(await request.json()); const [updated] = await db.transaction(async (tx) => { const [before] = await tx.select(columns).from(users).where(eq(users.id, id)).limit(1); if (!before) throw new HttpError(404, "User not found"); const { password, ...values } = input; const [row] = await tx.update(users).set({ ...values, ...(password ? { passwordHash: await hash(password, 12) } : {}), updatedAt: new Date() }).where(eq(users.id, id)).returning(columns); await tx.insert(auditEvents).values({ actorId: actor.id, action: "user.updated", entityType: "USER", entityId: id, changes: { from: before, to: row } }); return [row]; }); return Response.json(updated); } catch (error) { return apiError(error); } }
