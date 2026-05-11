import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { submissions, users, enrollments } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getAssignmentForTeacher } from "@/lib/auth/assignment-access";

// Status badge styling — kept in this file because it's used twice and a
// generic component would mostly be a switch over the same strings.
function statusBadge(status: string) {
  const map: Record<string, string> = {
    NOT_STARTED: "bg-surface-2 text-muted",
    IN_PROGRESS: "bg-surface-2 text-fg",
    SUBMITTED: "bg-success/10 text-success",
    LATE: "bg-warning/10 text-warning",
    MISSING: "bg-danger/10 text-danger",
    EXCUSED: "bg-surface-2 text-muted",
    RETURNED: "bg-accent/10 text-accent",
  };
  return map[status] ?? "bg-surface-2 text-muted";
}

export default async function AssignmentSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();
  const { classId, assignmentId } = await params;
  const { filter } = await searchParams;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) notFound();

  // We list one row per ACTIVE student in the class. If the student hasn't
  // started, they appear with status NOT_STARTED and no submission id.
  // This mirrors Canvas: roster-driven, not submissions-driven.
  const roster = await db
    .select({
      enrollment: enrollments,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(
      and(
        eq(enrollments.classId, classId),
        eq(enrollments.status, "ACTIVE"),
        eq(enrollments.role, "STUDENT"),
        isNull(enrollments.deletedAt)
      )
    );

  // One query to load all counted submissions, then join in memory. Cheaper
  // than a per-student lookup, and the roster is bounded.
  const subs = await db.query.submissions.findMany({
    where: and(
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.isCountedAttempt, true)
    ),
  });
  const subByUser = new Map(subs.map((s) => [s.userId, s]));

  // Compose rows + apply filter.
  type Row = {
    userId: string;
    name: string | null;
    email: string;
    status: string;
    submittedAt: Date | null;
    score: number | null;
    postedAt: Date | null;
    submissionId: string | null;
    needsGrading: boolean;
  };

  let rows: Row[] = roster.map((r) => {
    const sub = subByUser.get(r.user.id);
    const status = sub?.status ?? "NOT_STARTED";
    return {
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      status,
      submittedAt: sub?.submittedAt ?? null,
      score: sub?.score ?? null,
      postedAt: sub?.postedAt ?? null,
      submissionId: sub?.id ?? null,
      // "Needs grading": submitted/late, no grade yet.
      needsGrading:
        (status === "SUBMITTED" || status === "LATE") && !sub?.gradedAt,
    };
  });

  // Stable sort: needs-grading first, then submittedAt desc, then name asc.
  rows.sort((a, b) => {
    if (a.needsGrading !== b.needsGrading) return a.needsGrading ? -1 : 1;
    if (a.submittedAt && b.submittedAt)
      return b.submittedAt.getTime() - a.submittedAt.getTime();
    if (a.submittedAt) return -1;
    if (b.submittedAt) return 1;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  if (filter === "needs_grading") rows = rows.filter((r) => r.needsGrading);
  if (filter === "graded") rows = rows.filter((r) => r.score != null);
  if (filter === "missing") rows = rows.filter((r) => r.status === "MISSING" || r.status === "NOT_STARTED");

  const needsGradingCount = roster.filter((r) => {
    const sub = subByUser.get(r.user.id);
    return (sub?.status === "SUBMITTED" || sub?.status === "LATE") && !sub?.gradedAt;
  }).length;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}`}
          className="text-sm text-muted hover:text-fg"
        >
          ← {access.assignment.title}
        </Link>
        <h1 className="font-display text-4xl mt-1">Submissions</h1>
        <p className="text-muted text-sm mt-1">
          {roster.length} student{roster.length === 1 ? "" : "s"} ·{" "}
          {needsGradingCount} awaiting grade
        </p>
      </header>

      <nav aria-label="Filter" className="flex gap-1 text-sm border-b border-border">
        <FilterTab
          href={`/classes/${classId}/assignments/${assignmentId}/submissions`}
          active={!filter}
        >
          All
        </FilterTab>
        <FilterTab
          href={`/classes/${classId}/assignments/${assignmentId}/submissions?filter=needs_grading`}
          active={filter === "needs_grading"}
        >
          Needs grading
        </FilterTab>
        <FilterTab
          href={`/classes/${classId}/assignments/${assignmentId}/submissions?filter=graded`}
          active={filter === "graded"}
        >
          Graded
        </FilterTab>
        <FilterTab
          href={`/classes/${classId}/assignments/${assignmentId}/submissions?filter=missing`}
          active={filter === "missing"}
        >
          Missing / not started
        </FilterTab>
      </nav>

      {rows.length === 0 ? (
        <p className="text-muted text-sm">No matching students.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td className="px-3 py-2">
                    <div>{row.name ?? row.email}</div>
                    {row.name ? (
                      <div className="text-xs text-muted">{row.email}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusBadge(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted text-xs">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.score != null
                      ? `${row.score} / ${access.assignment.pointsPossible}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.postedAt ? (
                      <span className="text-success">Posted</span>
                    ) : row.score != null ? (
                      <span className="text-muted">Hidden</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.submissionId ? (
                      <Link
                        href={`/classes/${classId}/assignments/${assignmentId}/submissions/${row.submissionId}`}
                        className="text-accent hover:underline text-sm"
                      >
                        Open
                      </Link>
                    ) : (
                      <span className="text-muted text-xs">No submission</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-block px-3 py-2 border-b-2 ${
        active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}
