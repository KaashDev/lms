import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import { db } from "@/db";
import { submissions, attachments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { RichRenderer } from "@/components/editor/rich-renderer";
import Link from "next/link";

export default async function SubmissionPreviewPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const session = (await auth())!;
  const { classId, assignmentId } = await params;

  const access = await getAssignmentForStudent(assignmentId, session.user);
  if (!access) notFound();

  const submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id),
      eq(submissions.isCountedAttempt, true)
    ),
  });
  if (!submission) notFound();

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
          {submission.submittedAt
            ? `Submitted ${new Date(submission.submittedAt).toLocaleString()}`
            : "Draft"}
          {submission.status === "LATE" ? " · LATE" : ""}
        </p>
      </header>

      {submission.body ? (
        <section className="card p-6">
          <RichRenderer content={submission.body} />
          <p className="text-xs text-muted mt-4 border-t border-border pt-3">
            {submission.wordCount ?? 0} word{submission.wordCount === 1 ? "" : "s"}
          </p>
        </section>
      ) : null}

      {attachmentRows.length > 0 ? (
        <section className="card p-4">
          <h2 className="font-display text-lg mb-2">Attached files</h2>
          <ul className="text-sm divide-y divide-border">
            {attachmentRows.map((a) => (
              <li key={a.id} className="py-2 flex justify-between">
                <span>{a.filename}</span>
                <span className="text-muted text-xs">
                  {(a.sizeBytes / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
