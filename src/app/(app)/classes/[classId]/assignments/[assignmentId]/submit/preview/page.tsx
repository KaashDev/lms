import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import { db } from "@/db";
import { submissions, attachments, submissionComments, users } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
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

  // Only load comments + grade if the submission is posted. The API layer
  // enforces this too, but rendering nothing here is cleaner than fetching
  // and then hiding.
  const isPosted = !!submission.postedAt;
  const commentRows = isPosted
    ? await db
        .select({
          comment: submissionComments,
          author: { id: users.id, name: users.name, email: users.email },
        })
        .from(submissionComments)
        .innerJoin(users, eq(users.id, submissionComments.authorId))
        .where(
          and(
            eq(submissionComments.submissionId, submission.id),
            isNull(submissionComments.deletedAt)
          )
        )
        .orderBy(asc(submissionComments.createdAt))
    : [];

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
          {submission.status === "RETURNED" ? " · Returned" : ""}
        </p>
      </header>

      {isPosted && submission.score != null ? (
        <section className="card p-4 border-success/30">
          <div className="text-xs text-muted uppercase tracking-wider">Score</div>
          <div className="font-display text-3xl mt-1">
            {submission.score}{" "}
            <span className="text-muted text-base">/ {access.assignment.pointsPossible}</span>
          </div>
        </section>
      ) : null}

      {isPosted && submission.feedback ? (
        <section className="card p-6">
          <h2 className="font-display text-lg mb-2">Teacher feedback</h2>
          <RichRenderer content={submission.feedback} />
        </section>
      ) : null}

      {submission.body ? (
        <section className="card p-6">
          <h2 className="font-display text-lg mb-3">Your submission</h2>
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
                <a
                  href={`/api/attachments/${a.id}/download`}
                  className="text-accent hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.filename}
                </a>
                <span className="text-muted text-xs">
                  {(a.sizeBytes / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isPosted && commentRows.length > 0 ? (
        <section className="card p-4">
          <h2 className="font-display text-lg mb-2">Comments</h2>
          <ul className="space-y-2">
            {commentRows.map(({ comment, author }) => (
              <li key={comment.id} className="border border-border rounded p-2 text-sm">
                {comment.anchorQuote ? (
                  <div className="text-xs text-muted italic mb-1 border-l-2 border-accent/40 pl-2">
                    "{comment.anchorQuote.slice(0, 100)}{comment.anchorQuote.length > 100 ? "…" : ""}"
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap">{comment.body}</div>
                <div className="text-xs text-muted mt-1">
                  {author.name ?? author.email} · {new Date(comment.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
