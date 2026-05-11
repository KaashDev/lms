import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import { applyOverride } from "@/lib/auth/effective-assignment";
import { db } from "@/db";
import { submissions, attachments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SubmissionEditor } from "@/components/submissions/submission-editor";
import Link from "next/link";

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const session = (await auth())!;
  const { classId, assignmentId } = await params;

  const access = await getAssignmentForStudent(assignmentId, session.user);
  if (!access) notFound();

  // Effective assignment (layers per-student override on top).
  const effective = await applyOverride(access.assignment, session.user.id);

  // Hard close: REJECT policy + past availableUntil. Block before we even
  // create a submission row.
  const closed =
    effective.lateAcceptPolicy === "REJECT" &&
    effective.availableUntil &&
    effective.availableUntil < new Date();

  if (closed) {
    return (
      <div className="space-y-4">
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}`}
          className="text-sm text-muted hover:text-fg"
        >
          ← {access.assignment.title}
        </Link>
        <div className="card p-6 text-center">
          <h1 className="font-display text-2xl mb-2">Submissions closed</h1>
          <p className="text-muted text-sm">
            This assignment is no longer accepting submissions.
          </p>
        </div>
      </div>
    );
  }

  // Idempotent fetch-or-create. Returns the counted submission for this
  // student. We do it server-side so the client doesn't need a second
  // round-trip on first load.
  let submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id),
      eq(submissions.isCountedAttempt, true)
    ),
  });

  if (!submission) {
    const [created] = await db
      .insert(submissions)
      .values({
        assignmentId,
        userId: session.user.id,
        attemptNumber: 1,
        status: "NOT_STARTED",
        isCountedAttempt: true,
      })
      .returning();
    submission = created;
  }

  // Already-submitted: redirect to preview (read-only).
  if (
    submission.status === "SUBMITTED" ||
    submission.status === "LATE" ||
    submission.status === "RETURNED"
  ) {
    return (
      <div className="space-y-4">
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}`}
          className="text-sm text-muted hover:text-fg"
        >
          ← {access.assignment.title}
        </Link>
        <div className="card p-6 text-center">
          <h1 className="font-display text-2xl mb-2">Already submitted</h1>
          <p className="text-muted text-sm">
            You can{" "}
            <Link
              href={`/classes/${classId}/assignments/${assignmentId}/submit/preview`}
              className="text-accent hover:underline"
            >
              view your submission
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const attachmentRows = await db.query.attachments.findMany({
    where: eq(attachments.submissionId, submission.id),
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}`}
          className="text-sm text-muted hover:text-fg"
        >
          ← {access.assignment.title}
        </Link>
        <h1 className="font-display text-4xl mt-1">Your submission</h1>
        <p className="text-muted text-sm mt-1">
          Your work autosaves every 30 seconds. You can also press the Save button or Cmd/Ctrl+S.
        </p>
      </header>
      <SubmissionEditor
        classId={classId}
        assignmentId={assignmentId}
        submission={{
          id: submission.id,
          body: submission.body,
          status: submission.status,
          wordCount: submission.wordCount ?? 0,
        }}
        assignment={{
          allowTextEntry: access.assignment.allowTextEntry,
          allowFileUpload: access.assignment.allowFileUpload,
          dueAt: effective.dueAt ? effective.dueAt.toISOString() : null,
        }}
        attachments={attachmentRows.map((a) => ({
          id: a.id,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
        }))}
      />
    </div>
  );
}
