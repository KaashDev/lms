import { db } from "@/db";
import { submissions, attachments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { submitInput } from "@/lib/validators/assignments";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import { applyOverride } from "@/lib/auth/effective-assignment";
import { isTiptapDocEmpty } from "@/lib/originality/stats";
import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

// POST /api/assignments/:id/submissions/:sid/submit
// Finalizes a draft. Determines LATE vs SUBMITTED based on dueAt + now.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string; submissionId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId, submissionId } = await ctx.params;

  if (session.user.role === "TEACHER") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = submitInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const access = await getAssignmentForStudent(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const sub = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.id, submissionId),
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id)
    ),
  });
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Already submitted — idempotent return.
  if (sub.status === "SUBMITTED" || sub.status === "LATE" || sub.status === "RETURNED") {
    return Response.json({ submission: sub });
  }

  // Layer per-student override onto the assignment dates.
  const effective = await applyOverride(access.assignment, session.user.id);

  // Hard close after availableUntil + REJECT.
  if (
    effective.lateAcceptPolicy === "REJECT" &&
    effective.availableUntil &&
    effective.availableUntil < new Date()
  ) {
    return Response.json({ error: "SUBMISSION_CLOSED" }, { status: 409 });
  }

  // Must have at least something — either real body text or an attachment.
  // Walker-based check beats the old `JSON.stringify length > 50` heuristic;
  // a doc full of empty paragraphs (which can happen via repeated Enter)
  // wouldn't pass the old check below the threshold either, but a single
  // typed space could squeak by. The walker counts non-whitespace chars.
  const hasBody = !isTiptapDocEmpty(sub.body);
  const attachmentRow = await db.query.attachments.findFirst({
    where: eq(attachments.submissionId, submissionId),
    columns: { id: true },
  });
  if (!hasBody && !attachmentRow) {
    return Response.json({ error: "EMPTY_SUBMISSION" }, { status: 400 });
  }

  // LATE if past due. Past due + REJECT was already blocked above.
  const now = new Date();
  const status: "SUBMITTED" | "LATE" =
    effective.dueAt && effective.dueAt < now ? "LATE" : "SUBMITTED";

  const [updated] = await db
    .update(submissions)
    .set({
      status,
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "submission.submitted",
    targetType: "submission",
    targetId: submissionId,
    metadata: { assignmentId, status },
  });

  return Response.json({ submission: updated });
}
