import { db } from "@/db";
import { classes, enrollments, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { updateEnrollmentInput } from "@/lib/validators/invites";
import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

async function loadEnrollmentForTeacher(
  classId: string,
  userId: string,
  teacherId: string,
  orgId: string
) {
  const cls = await db.query.classes.findFirst({
    where: and(eq(classes.id, classId), eq(classes.teacherId, teacherId), eq(classes.organizationId, orgId)),
    columns: { id: true },
  });
  if (!cls) return null;
  const enrollment = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.classId, classId), eq(enrollments.userId, userId)),
  });
  return enrollment;
}

// GET: student profile — full enrollment + user info. Teacher-only view,
// includes teacherNotes which the student must never see.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ classId: string; userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId, userId } = await ctx.params;

  const enrollment = await loadEnrollmentForTeacher(
    classId,
    userId,
    session.user.id,
    session.user.organizationId
  );
  if (!enrollment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
  if (!user) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  return Response.json({ user, enrollment });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ classId: string; userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId, userId } = await ctx.params;

  const enrollment = await loadEnrollmentForTeacher(
    classId,
    userId,
    session.user.id,
    session.user.organizationId
  );
  if (!enrollment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateEnrollmentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(enrollments)
    .set({ ...parsed.data })
    .where(eq(enrollments.id, enrollment.id))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "enrollment.updated",
    targetType: "enrollment",
    targetId: enrollment.id,
    diff: { before: enrollment, after: updated },
  });

  return Response.json({ enrollment: updated });
}

// Soft-remove from class. Submissions remain intact (the user row is the FK
// target, not the enrollment row, for submissions).
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ classId: string; userId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId, userId } = await ctx.params;

  const enrollment = await loadEnrollmentForTeacher(
    classId,
    userId,
    session.user.id,
    session.user.organizationId
  );
  if (!enrollment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  await db
    .update(enrollments)
    .set({ status: "REMOVED", deletedAt: new Date() })
    .where(eq(enrollments.id, enrollment.id));

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "enrollment.removed",
    targetType: "enrollment",
    targetId: enrollment.id,
    metadata: { classId, userId },
  });

  return Response.json({ ok: true });
}
