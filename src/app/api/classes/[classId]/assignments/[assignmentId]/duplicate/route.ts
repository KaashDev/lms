import { db } from "@/db";
import { assignments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { duplicateAssignmentInput } from "@/lib/validators/assignments";
import { getAssignmentForTeacher } from "@/lib/auth/assignment-access";
import { audit } from "@/lib/audit";

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
  const parsed = duplicateAssignmentInput.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const src = access.assignment;
  // Copy everything but identity + lifecycle fields. New assignment goes
  // straight to DRAFT regardless of source state — duplicating a published
  // assignment shouldn't accidentally re-publish it under a new id.
  const [created] = await db
    .insert(assignments)
    .values({
      classId: src.classId,
      type: src.type,
      title: parsed.data.title ?? `${src.title} (copy)`,
      instructions: src.instructions,
      pointsPossible: src.pointsPossible,
      // Clear time fields on duplicate — teacher will set new ones.
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
      categoryId: src.categoryId,
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.duplicated",
    targetType: "assignment",
    targetId: created.id,
    metadata: { sourceId: src.id },
  });

  return Response.json({ assignment: created }, { status: 201 });
}
