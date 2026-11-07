import { sql } from "drizzle-orm";
import { db } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await db.execute(sql`select 1`); return Response.json({ status: "ok", version: process.env.APP_VERSION ?? "development", revision: process.env.BUILD_REVISION ?? "local" }); }
  catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
}
