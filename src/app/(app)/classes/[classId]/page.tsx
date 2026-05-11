import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, enrollments } from "@/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

export default async function ClassDetailPage({
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

  // Authorization: teacher of record OR enrolled student/TA.
  const isTeacher = session.user.role === "TEACHER" && cls.teacherId === session.user.id;
  if (!isTeacher) {
    const enrolled = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.classId, classId),
        eq(enrollments.userId, session.user.id),
        isNull(enrollments.deletedAt)
      ),
    });
    if (!enrolled || enrolled.status === "REMOVED") notFound();
  }

  // Student count for the overview tile.
  const [{ value: studentCount }] = await db
    .select({ value: count() })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.classId, classId),
        eq(enrollments.role, "STUDENT"),
        eq(enrollments.status, "ACTIVE"),
        isNull(enrollments.deletedAt)
      )
    );

  return (
    <div className="space-y-8">
      <header>
        <div
          aria-hidden="true"
          className="h-3 rounded mb-4"
          style={{ background: cls.bannerColor ?? "#0f766e" }}
        />
        <h1 className="font-display text-4xl">{cls.title}</h1>
        <div className="flex gap-3 mt-2 text-sm text-muted">
          {cls.term ? <span>{cls.term}</span> : null}
          {cls.archivedAt ? (
            <span className="px-2 py-0.5 rounded bg-surface-2">Archived</span>
          ) : null}
        </div>
        {cls.description ? (
          <p className="mt-4 text-fg max-w-2xl">{cls.description}</p>
        ) : null}
      </header>

      <nav aria-label="Class sections" className="border-b border-border">
        <ul className="flex gap-1 -mb-px">
          <li>
            <Link
              href={`/classes/${classId}`}
              className="inline-block px-4 py-2 border-b-2 border-accent text-fg text-sm"
            >
              Overview
            </Link>
          </li>
          <li>
            <Link
              href={`/classes/${classId}/assignments`}
              className="inline-block px-4 py-2 border-b-2 border-transparent text-muted hover:text-fg text-sm"
            >
              Assignments
            </Link>
          </li>
          {isTeacher ? (
            <>
              <li>
                <Link
                  href={`/classes/${classId}/roster`}
                  className="inline-block px-4 py-2 border-b-2 border-transparent text-muted hover:text-fg text-sm"
                >
                  Roster
                </Link>
              </li>
              <li>
                <Link
                  href={`/classes/${classId}/settings`}
                  className="inline-block px-4 py-2 border-b-2 border-transparent text-muted hover:text-fg text-sm"
                >
                  Settings
                </Link>
              </li>
            </>
          ) : null}
        </ul>
      </nav>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Students</div>
          <div className="font-display text-3xl mt-1">{studentCount}</div>
          {isTeacher ? (
            <Link
              href={`/classes/${classId}/roster`}
              className="text-xs text-accent hover:underline mt-2 inline-block"
            >
              Manage roster
            </Link>
          ) : null}
        </div>
        <Link href={`/classes/${classId}/assignments`} className="card p-4 block hover:border-accent transition-colors">
          <div className="text-xs text-muted uppercase tracking-wider">Assignments</div>
          <div className="font-display text-3xl mt-1">→</div>
          <p className="text-xs text-muted mt-2">View and manage.</p>
        </Link>
        <div className="card p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Announcements</div>
          <div className="font-display text-3xl mt-1 text-muted">—</div>
          <p className="text-xs text-muted mt-2">Coming in step 6.</p>
        </div>
      </section>

      {isTeacher && cls.joinCode ? (
        <section className="card p-4">
          <h2 className="font-display text-lg">Join code</h2>
          <p className="text-sm text-muted mt-1">
            Students can join by entering this code at{" "}
            <code className="bg-surface-2 px-1 rounded">/join</code>.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <code
              className="font-mono text-2xl tracking-widest bg-surface-2 px-4 py-2 rounded"
              aria-label="Join code"
            >
              {cls.joinCode}
            </code>
            <Link
              href={`/classes/${classId}/settings`}
              className="text-sm text-accent hover:underline"
            >
              Regenerate
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
