import { db } from "@/db";
import { assignmentOverrides, users, enrollments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getAssignmentForTeacher } from "@/lib/auth/assignment-access";
import { overrideInput } from "@/lib/validators/grading";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

// PUT /api/assignments/:assignmentId/overrides/:userId
// Upsert a per-student override. If all fields are null, delete the row
// (no point storing an all-default override).
//
// Verifies the user is actively enrolled in the assignment's class.
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string; userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId, userId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = overrideInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Confirm target user is enrolled in this class.
  const enroll = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.classId, access.class.id),
      eq(enrollments.userId, userId),
      eq(enrollments.status, "ACTIVE"),
      isNull(enrollments.deletedAt)
    ),
    columns: { id: true },
  });
  if (!enroll) {
    return Response.json({ error: "USER_NOT_ENROLLED" }, { status: 404 });
  }

  const allNull =
    parsed.data.dueAt == null &&
    parsed.data.availableUntil == null &&
    parsed.data.timeLimitSeconds == null &&
    parsed.data.allowedAttempts == null;

  if (allNull) {
    // Treat as "remove override".
    await db
      .delete(assignmentOverrides)
      .where(
        and(
          eq(assignmentOverrides.assignmentId, assignmentId),
          eq(assignmentOverrides.userId, userId)
        )
      );
    await audit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: "override.removed",
      targetType: "override",
      targetId: `${assignmentId}:${userId}`,
    });
    return Response.json({ override: null });
  }

  // Postgres ON CONFLICT upsert via Drizzle's onConflictDoUpdate.
  const [up] = await db
    .insert(assignmentOverrides)
    .values({
      assignmentId,
      userId,
      dueAt: parsed.data.dueAt ?? null,
      availableUntil: parsed.data.availableUntil ?? null,
      timeLimitSeconds: parsed.data.timeLimitSeconds ?? null,
      allowedAttempts: parsed.data.allowedAttempts ?? null,
    })
    .onConflictDoUpdate({
      target: [assignmentOverrides.assignmentId, assignmentOverrides.userId],
      set: {
        dueAt: parsed.data.dueAt ?? null,
        availableUntil: parsed.data.availableUntil ?? null,
        timeLimitSeconds: parsed.data.timeLimitSeconds ?? null,
        allowedAttempts: parsed.data.allowedAttempts ?? null,
      },
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "override.set",
    targetType: "override",
    targetId: up.id,
    metadata: { assignmentId, userId, fields: parsed.data },
  });

  return Response.json({ override: up });
}

// GET: list all overrides for the assignment. Teacher-only.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ assignmentId: string; userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId, userId } = await ctx.params;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const row = await db.query.assignmentOverrides.findFirst({
    where: and(
      eq(assignmentOverrides.assignmentId, assignmentId),
      eq(assignmentOverrides.userId, userId)
    ),
  });

  return Response.json({ override: row ?? null });
}
