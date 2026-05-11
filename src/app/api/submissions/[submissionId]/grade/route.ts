import { db } from "@/db";
import { submissions } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { gradeSubmissionInput } from "@/lib/validators/grading";
import { audit } from "@/lib/audit";
import { eq } from "drizzle-orm";

// PATCH /api/submissions/:submissionId/grade
// Teacher-only. Sets score and/or feedback. Optionally posts/unposts.
//
// Why this is its own route instead of generic PATCH on the submission:
// the student-facing PATCH (autosave) lives at a different path with
// different auth semantics. Splitting them is clearer than one endpoint
// that does two things based on caller role.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = gradeSubmissionInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access || access.kind !== "teacher") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // EXCUSED submissions can still receive a score (some teachers do this
  // for the record) but score won't count toward gradebook math.
  // MISSING submissions also accept a grade — flipping to 0/whatever
  // marks the canonical "missing → 0" workflow.

  const now = new Date();
  const update: Record<string, unknown> = {
    score: parsed.data.score,
    feedback: parsed.data.feedback ?? access.submission.feedback,
    gradedAt: now,
    gradedById: session.user.id,
    updatedAt: now,
  };

  // Posting policy. autoPostGrades=true on the assignment means we always
  // post; otherwise we honor the explicit `post` flag, leaving alone if
  // unspecified. This lets teachers iterate on a grade without making it
  // visible to the student until ready.
  if (access.assignment.autoPostGrades) {
    update.postedAt = now;
  } else if (parsed.data.post === true) {
    update.postedAt = now;
  } else if (parsed.data.post === false) {
    update.postedAt = null;
  }

  const [updated] = await db
    .update(submissions)
    .set(update)
    .where(eq(submissions.id, submissionId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "submission.graded",
    targetType: "submission",
    targetId: submissionId,
    diff: {
      before: { score: access.submission.score, postedAt: access.submission.postedAt },
      after: { score: updated.score, postedAt: updated.postedAt },
    },
  });

  return Response.json({ submission: updated });
}
