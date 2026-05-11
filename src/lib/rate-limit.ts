import { db } from "@/db";
import { sql } from "drizzle-orm";

// Postgres-backed sliding-window rate limit. Not as fast as Redis, but fine
// for auth endpoints (a few requests per user per minute) and avoids adding
// another service. Swap for Upstash if we ever need >1k req/s.
//
// Strategy: a single table `rate_limits(key, window_start, count)` with an
// upsert that resets the window when expired. We create the table inline
// with raw SQL on first call to keep migrations focused on app schema.
//
// Usage:
//   const ok = await checkRateLimit(`login:${ip}`, 5, 60);
//   if (!ok) return 429;

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0
    )
  `);
  initialized = true;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  await ensureTable();
  // Atomic upsert: if window expired, reset; else increment. Return new count.
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, NOW(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - (${windowSeconds} || ' seconds')::INTERVAL
        THEN NOW()
        ELSE rate_limits.window_start
      END,
      count = CASE
        WHEN rate_limits.window_start < NOW() - (${windowSeconds} || ' seconds')::INTERVAL
        THEN 1
        ELSE rate_limits.count + 1
      END
    RETURNING count
  `);
  const row = result.rows[0];
  return (row?.count ?? 0) <= limit;
}
