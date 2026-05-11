import { db } from "@/db";
import { assignments, classes, enrollments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { createAssignmentInput } from "@/lib/validators/assignments";
import { audit } from "@/lib/audit";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

export async function GET(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  // Authorize: teacher of record OR enrolled student.
  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls || cls.deletedAt) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const isTeacher = session.user.role === "TEACHER" && cls.teacherId === session.user.id;
  if (!isTeacher) {
    const enrolled = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.classId, classId),
        eq(enrollments.userId, session.user.id),
        eq(enrollments.status, "ACTIVE"),
        isNull(enrollments.deletedAt)
      ),
      columns: { id: true },
    });
    if (!enrolled) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Teachers see drafts + published + archived. Students see published
  // assignments whose availableFrom has passed (or is null).
  const rows = await db.query.assignments.findMany({
    where: and(
      eq(assignments.classId, classId),
      isNull(assignments.deletedAt)
    ),
    orderBy: [desc(assignments.dueAt), asc(assignments.title)],
  });

  const visible = isTeacher
    ? rows
    : rows.filter(
        (a) =>
          a.state === "PUBLISHED" &&
          (!a.availableFrom || a.availableFrom <= new Date())
      );

  return Response.json({ assignments: visible });
}

export async function POST(req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls || cls.deletedAt) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createAssignmentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(assignments)
    .values({
      classId,
      type: parsed.data.type,
      title: parsed.data.title,
      instructions: parsed.data.instructions ?? null,
      pointsPossible: parsed.data.pointsPossible,
      availableFrom: parsed.data.availableFrom ?? null,
      availableUntil: parsed.data.availableUntil ?? null,
      dueAt: parsed.data.dueAt ?? null,
      lateAcceptPolicy: parsed.data.lateAcceptPolicy,
      allowFileUpload: parsed.data.allowFileUpload,
      allowTextEntry: parsed.data.allowTextEntry,
      allowedAttempts: parsed.data.allowedAttempts ?? null,
      timeLimitSeconds: parsed.data.timeLimitSeconds ?? null,
      shuffleQuestions: parsed.data.shuffleQuestions,
      showCorrectAnswersAfter: parsed.data.showCorrectAnswersAfter,
      lockdownMode: parsed.data.lockdownMode,
      autoPostGrades: parsed.data.autoPostGrades,
      state: parsed.data.state,
      categoryId: parsed.data.categoryId ?? null,
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.created",
    targetType: "assignment",
    targetId: created.id,
    metadata: { classId, title: created.title, state: created.state },
  });

  return Response.json({ assignment: created }, { status: 201 });
}
