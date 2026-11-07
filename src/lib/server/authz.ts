import { auth } from "@/auth";
import { and, eq, isNull } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AppRole } from "./domain";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function requireUser(roles?: AppRole[]) { const session = await auth(); const raw = session?.user as ({ id?: string; role?: AppRole; email?: string | null; name?: string | null }) | undefined; if (!raw?.id || !raw.email) throw new HttpError(401, "Authentication required"); let user = { id: raw.id, email: raw.email, name: raw.name ?? raw.email, role: raw.role ?? "STAFF" as AppRole }; if (process.env.DATABASE_URL) { const [stored] = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status }).from(users).where(and(eq(users.id, raw.id), isNull(users.deletedAt))).limit(1); if (stored) { if (stored.status !== "ACTIVE") throw new HttpError(403, "Account is not active"); user = { id: stored.id, email: stored.email, name: stored.name, role: stored.role }; } else if (process.env.AUTH_MODE === "production") throw new HttpError(403, "Account is not active"); } if (roles && !roles.includes(user.role)) throw new HttpError(403, "Forbidden"); return user; }
export function apiError(error: unknown) { const status = error instanceof HttpError ? error.status : error instanceof SyntaxError || error instanceof ZodError ? 400 : 500; if (status === 500) console.error(error); const message = status === 500 ? "Internal server error" : error instanceof Error ? error.message : "Request failed"; return Response.json({ error: message }, { status }); }

