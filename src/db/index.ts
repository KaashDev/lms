import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Singleton pool. Without this, every hot-reload in dev opens a new pool
// and you'll exhaust connections within a minute.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Railway's Postgres is a real server, not pgbouncer — these defaults
    // are fine. Bump if you start seeing "remaining connection slots" errors.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
