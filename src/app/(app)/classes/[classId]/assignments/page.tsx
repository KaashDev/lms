import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { assignments, classes, enrollments } from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

export default async function ClassAssignmentsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = (await auth())!;
  const { classId } = await params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls || cls.deletedAt) notFound();

  const isTeacher = session.user.role === "TEACHER" && cls.teacherId === session.user.id;
  if (!isTeacher) {
    const enrolled = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.classId, classId),
        eq(enrollments.userId, session.user.id),
        eq(enrollments.status, "ACTIVE"),
        isNull(enrollments.deletedAt)
      ),
      columns: { id: true },
    });
    if (!enrolled) notFound();
  }

  const rows = await db.query.assignments.findMany({
    where: and(eq(assignments.classId, classId), isNull(assignments.deletedAt)),
    orderBy: [desc(assignments.dueAt), asc(assignments.title)],
  });

  const visible = isTeacher
    ? rows
    : rows.filter(
        (a) =>
          a.state === "PUBLISHED" &&
          (!a.availableFrom || a.availableFrom <= new Date())
      );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={`/classes/${classId}`} className="text-sm text-muted hover:text-fg">
            ← {cls.title}
          </Link>
          <h1 className="font-display text-4xl mt-1">Assignments</h1>
        </div>
        {isTeacher ? (
          <Link href={`/classes/${classId}/assignments/new`} className="btn-primary">
            New assignment
          </Link>
        ) : null}
      </header>

      {visible.length === 0 ? (
        <p className="text-muted text-sm">
          {isTeacher
            ? "No assignments yet. Create your first one."
            : "Nothing assigned yet."}
        </p>
      ) : (
        <ul className="card divide-y divide-border">
          {visible.map((a) => (
            <li key={a.id}>
              <Link
                href={`/classes/${classId}/assignments/${a.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-2"
              >
                <div>
                  <div className="text-fg flex items-center gap-2">
                    {a.title}
                    {a.state === "DRAFT" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                        Draft
                      </span>
                    ) : null}
                    {a.state === "ARCHIVED" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {a.dueAt
                      ? `Due ${new Date(a.dueAt).toLocaleString()}`
                      : "No due date"}
                    {" · "}
                    {a.pointsPossible} pts
                  </div>
                </div>
                <span className="text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
