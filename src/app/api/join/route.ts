import { db } from "@/db";
import { classes, enrollments, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { joinByCodeInput } from "@/lib/validators/invites";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

// POST /api/join — body: { code }.
// Authed user joins a class via join code. Rate-limited by user id to
// prevent brute-force code guessing (~1 trillion codes but discipline > odds).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const ok = await checkRateLimit(`join:${session.user.id}`, 10, 60);
  if (!ok) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = joinByCodeInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  const me = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organizationId: true },
  });
  if (!me) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  // Join code is unique within an organization.
  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.joinCode, parsed.data.code),
      eq(classes.organizationId, me.organizationId),
      isNull(classes.deletedAt),
      isNull(classes.archivedAt)
    ),
  });

  if (!cls || cls.joinCodeEnabled !== "true") {
    return Response.json({ error: "INVALID_CODE" }, { status: 404 });
  }

  // Idempotent enroll.
  const existing = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.classId, cls.id), eq(enrollments.userId, session.user.id)),
  });

  if (existing && existing.status === "ACTIVE" && !existing.deletedAt) {
    return Response.json({ classId: cls.id, alreadyEnrolled: true });
  }

  if (existing) {
    await db
      .update(enrollments)
      .set({ status: "ACTIVE", deletedAt: null })
      .where(eq(enrollments.id, existing.id));
  } else {
    await db.insert(enrollments).values({
      classId: cls.id,
      userId: session.user.id,
      role: "STUDENT",
      status: "ACTIVE",
    });
  }

  await audit({
    organizationId: me.organizationId,
    actorId: session.user.id,
    action: "enrollment.joined_by_code",
    targetType: "class",
    targetId: cls.id,
  });

  return Response.json({ classId: cls.id });
}
