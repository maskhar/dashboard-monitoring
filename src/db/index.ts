import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { pool?: Pool };
const pool = globalDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") globalDb.pool = pool;
export const db = drizzle(pool, { schema });
export type Database = typeof db;
