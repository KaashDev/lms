import { db } from "@/db";
import { submissions, submissionVersions, assignments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { saveSubmissionInput } from "@/lib/validators/assignments";
import { getAssignmentForAnyMember } from "@/lib/auth/assignment-access";
import { applyOverride } from "@/lib/auth/effective-assignment";
import { tiptapToPlainText, computeStaticStats } from "@/lib/originality/stats";
import { and, eq, desc } from "drizzle-orm";

// Shared loader. Returns submission + assignment + role.
async function loadSubmissionForAccess(
  assignmentId: string,
  submissionId: string,
  user: { id: string; role: "TEACHER" | "TA" | "STUDENT"; organizationId: string }
) {
  const access = await getAssignmentForAnyMember(assignmentId, user);
  if (!access) return null;

  const submission = await db.query.submissions.findFirst({
    where: and(eq(submissions.id, submissionId), eq(submissions.assignmentId, assignmentId)),
  });
  if (!submission) return null;

  // Student can only see their own submission. Teacher can see all in their class.
  if (access.kind === "student" && submission.userId !== user.id) return null;

  return { ...access, submission };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ assignmentId: string; submissionId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId, submissionId } = await ctx.params;

  const access = await loadSubmissionForAccess(assignmentId, submissionId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Posting-policy gate. If grades aren't posted, students see no score/feedback.
  const visible = { ...access.submission };
  if (access.kind === "student" && !visible.postedAt) {
    visible.score = null;
    visible.feedback = null;
  }

  return Response.json({ submission: visible });
}

// PATCH: save (autosave or manual). Student-only — teachers grade through
// a different endpoint in step 3b. Creates a submission row on first call
// if one doesn't exist yet.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string; submissionId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId, submissionId } = await ctx.params;

  // Auto-grading path (TEACHER) is handled elsewhere. Here we only let the
  // owning student save their own draft.
  if (session.user.role === "TEACHER") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = saveSubmissionInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const access = await loadSubmissionForAccess(assignmentId, submissionId, session.user);
  if (!access || access.kind !== "student") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Layer per-student override onto the assignment dates.
  const effective = await applyOverride(access.assignment, session.user.id);

  // Cannot edit after final submission. Teachers reopen via a different
  // endpoint in step 3b.
  if (
    access.submission.status === "SUBMITTED" ||
    access.submission.status === "LATE" ||
    access.submission.status === "RETURNED"
  ) {
    return Response.json({ error: "SUBMISSION_LOCKED" }, { status: 409 });
  }

  // Reject if availableUntil has passed and policy is REJECT.
  if (
    effective.lateAcceptPolicy === "REJECT" &&
    effective.availableUntil &&
    effective.availableUntil < new Date()
  ) {
    return Response.json({ error: "SUBMISSION_CLOSED" }, { status: 409 });
  }

  // Compute word count from the new body for the submissions table and
  // for the version row. Done server-side so the client can't fake it.
  const plainText = parsed.data.body ? tiptapToPlainText(parsed.data.body) : "";
  const stats = computeStaticStats(plainText);

  // Update the canonical submission row.
  const [updated] = await db
    .update(submissions)
    .set({
      body: parsed.data.body ?? null,
      wordCount: stats.wordCount,
      status:
        access.submission.status === "NOT_STARTED"
          ? "IN_PROGRESS"
          : access.submission.status,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId))
    .returning();

  // Versioning policy: insert a new version if EITHER:
  //   (a) this came from a paste > 100 chars (always record), OR
  //   (b) the latest version is older than 30s, OR
  //   (c) there are no versions yet.
  //
  // Effectively this lines up with the 30s autosave cadence without
  // duplicating versions if the client autosaves faster than expected.
  const latest = await db.query.submissionVersions.findFirst({
    where: eq(submissionVersions.submissionId, submissionId),
    orderBy: [desc(submissionVersions.createdAt)],
  });

  const now = new Date();
  const shouldVersion =
    parsed.data.fromPaste ||
    !latest ||
    now.getTime() - latest.createdAt.getTime() > 30_000;

  if (shouldVersion) {
    await db.insert(submissionVersions).values({
      submissionId,
      body: parsed.data.body ?? {},
      wordCount: stats.wordCount,
      fromPaste: parsed.data.fromPaste,
      pasteCharCount: parsed.data.pasteCharCount ?? null,
    });
  }

  return Response.json({ submission: updated, versioned: shouldVersion });
}
