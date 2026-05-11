import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  submissions,
  submissionVersions,
  submissionComments,
  attachments,
  users,
} from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { computeVersionSignals, computeStaticStats, tiptapToPlainText } from "@/lib/originality/stats";
import { Grader } from "@/components/grading/grader";

export default async function GraderPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string; submissionId: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();
  const { classId, assignmentId, submissionId } = await params;

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access || access.kind !== "teacher") notFound();
  if (access.submission.assignmentId !== assignmentId) notFound();

  const [studentRow] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, access.submission.userId))
    .limit(1);
  if (!studentRow) notFound();

  const versions = await db.query.submissionVersions.findMany({
    where: eq(submissionVersions.submissionId, submissionId),
    orderBy: [asc(submissionVersions.createdAt)],
  });

  const attachmentRows = await db.query.attachments.findMany({
    where: eq(attachments.submissionId, submissionId),
  });

  const comments = await db
    .select({
      comment: submissionComments,
      author: { id: users.id, name: users.name, email: users.email },
    })
    .from(submissionComments)
    .innerJoin(users, eq(users.id, submissionComments.authorId))
    .where(
      and(
        eq(submissionComments.submissionId, submissionId),
        isNull(submissionComments.deletedAt)
      )
    )
    .orderBy(asc(submissionComments.createdAt));

  // Stats computed server-side so the grader doesn't have to redo this
  // in the browser. Cheap (few hundred microseconds) but still pointless
  // to recompute on every keystroke client-side.
  const plainText = tiptapToPlainText(access.submission.body);
  const staticStats = computeStaticStats(plainText);
  const versionSignals = computeVersionSignals(
    versions.map((v) => ({
      createdAt: v.createdAt,
      wordCount: v.wordCount,
      fromPaste: v.fromPaste,
      pasteCharCount: v.pasteCharCount,
    }))
  );

  // Latest version id — comments anchor to whichever version was current
  // when the comment was made. The grader anchors NEW comments to the
  // latest version (so highlights line up with what we see now).
  const latestVersionId = versions[versions.length - 1]?.id ?? null;

  return (
    <div className="space-y-4">
      <header>
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}/submissions`}
          className="text-sm text-muted hover:text-fg"
        >
          ← Submissions
        </Link>
        <h1 className="font-display text-3xl mt-1">
          {studentRow.name ?? studentRow.email}
        </h1>
        <p className="text-muted text-sm">
          {access.assignment.title} · {access.assignment.pointsPossible} pts possible
        </p>
      </header>

      <Grader
        classId={classId}
        student={studentRow}
        assignment={{
          id: access.assignment.id,
          pointsPossible: access.assignment.pointsPossible,
          autoPostGrades: access.assignment.autoPostGrades,
        }}
        submission={{
          id: access.submission.id,
          status: access.submission.status,
          body: access.submission.body,
          score: access.submission.score,
          feedback: access.submission.feedback,
          submittedAt: access.submission.submittedAt
            ? access.submission.submittedAt.toISOString()
            : null,
          gradedAt: access.submission.gradedAt
            ? access.submission.gradedAt.toISOString()
            : null,
          postedAt: access.submission.postedAt
            ? access.submission.postedAt.toISOString()
            : null,
        }}
        attachments={attachmentRows.map((a) => ({
          id: a.id,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
          contentType: a.contentType,
        }))}
        comments={comments.map((c) => ({
          ...c.comment,
          author: c.author,
          createdAt: c.comment.createdAt.toISOString(),
          resolvedAt: c.comment.resolvedAt ? c.comment.resolvedAt.toISOString() : null,
        }))}
        latestVersionId={latestVersionId}
        stats={{
          static: staticStats,
          versions: versionSignals,
          versionCount: versions.length,
        }}
      />
    </div>
  );
}
