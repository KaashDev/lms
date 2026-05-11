import { db } from "@/db";
import { users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { and, eq, sql } from "drizzle-orm";

// POST /api/users/:userId/force-logout
// Teacher-only. Bumps the user's tokenVersion, invalidating any active
// JWT for that user on their next request. Used when a student loses a
// device, or after a suspected account compromise.
//
// Only works on users in the same organization.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { userId } = await ctx.params;

  const target = await db.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.organizationId, session.user.organizationId)
    ),
    columns: { id: true },
  });
  if (!target) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  await db
    .update(users)
    .set({
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "user.force_logout",
    targetType: "user",
    targetId: userId,
  });

  return Response.json({ ok: true });
}
