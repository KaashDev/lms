import { db } from "@/db";
import { assignments, classes } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { copyAssignmentInput } from "@/lib/validators/assignments";
import { getAssignmentForTeacher } from "@/lib/auth/assignment-access";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = copyAssignmentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify target class belongs to the same teacher in the same org.
  const target = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, parsed.data.targetClassId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId),
      isNull(classes.deletedAt)
    ),
  });
  if (!target) {
    return Response.json({ error: "TARGET_CLASS_NOT_FOUND" }, { status: 404 });
  }

  const src = access.assignment;
  const [created] = await db
    .insert(assignments)
    .values({
      classId: target.id,
      type: src.type,
      title: src.title,
      instructions: src.instructions,
      pointsPossible: src.pointsPossible,
      // Time fields cleared — target class likely has a different schedule.
      availableFrom: null,
      availableUntil: null,
      dueAt: null,
      lateAcceptPolicy: src.lateAcceptPolicy,
      allowFileUpload: src.allowFileUpload,
      allowTextEntry: src.allowTextEntry,
      allowedAttempts: src.allowedAttempts,
      timeLimitSeconds: src.timeLimitSeconds,
      shuffleQuestions: src.shuffleQuestions,
      showCorrectAnswersAfter: src.showCorrectAnswersAfter,
      lockdownMode: src.lockdownMode,
      autoPostGrades: src.autoPostGrades,
      state: "DRAFT",
      // Don't carry category — gradebook categories are class-scoped.
      categoryId: null,
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.copied",
    targetType: "assignment",
    targetId: created.id,
    metadata: { sourceId: src.id, targetClassId: target.id },
  });

  return Response.json({ assignment: created }, { status: 201 });
}
