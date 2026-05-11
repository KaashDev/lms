import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Lightweight DB ping. If this fails Railway will mark the container
    // unhealthy and roll back the deploy.
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
