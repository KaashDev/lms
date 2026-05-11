import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, enrollments, users, assignments, submissions } from "@/db/schema";
import { and, eq, isNull, desc, asc, gt, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

export default async function DashboardPage() {
  const session = (await auth())!;

  const myClasses =
    session.user.role === "TEACHER"
      ? await db.query.classes.findMany({
          where: and(
            eq(classes.teacherId, session.user.id),
            eq(classes.organizationId, session.user.organizationId),
            isNull(classes.deletedAt),
            isNull(classes.archivedAt)
          ),
          orderBy: [desc(classes.updatedAt)],
          limit: 6,
        })
      : await (async () => {
          const rows = await db
            .select({ class: classes })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .where(
              and(
                eq(enrollments.userId, session.user.id),
                eq(enrollments.status, "ACTIVE"),
                isNull(enrollments.deletedAt),
                isNull(classes.deletedAt),
                isNull(classes.archivedAt)
              )
            )
            .orderBy(desc(classes.updatedAt))
            .limit(6);
          return rows.map((r) => r.class);
        })();

  const classIds = myClasses.map((c) => c.id);

  // Step 3a: surface real assignments in the side panel.
  // Teacher: count of submissions awaiting grading (SUBMITTED + LATE
  // statuses, no postedAt). Cheap aggregate per class — we accept N+1
  // because N is the count of teacher's classes (small).
  // Student: assignments due in the next 7 days, sorted by due date.
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let upcomingForStudent: Array<{
    id: string;
    title: string;
    classTitle: string;
    classId: string;
    dueAt: Date | null;
  }> = [];

  let needsGradingForTeacher: Array<{
    classId: string;
    classTitle: string;
    count: number;
  }> = [];

  if (classIds.length > 0) {
    if (session.user.role === "TEACHER") {
      // Submissions awaiting grading, grouped by class.
      const rows = await db
        .select({
          classId: assignments.classId,
          count: sql<number>`count(*)::int`,
        })
        .from(submissions)
        .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
        .where(
          and(
            inArray(assignments.classId, classIds),
            isNull(submissions.gradedAt),
            or(eq(submissions.status, "SUBMITTED"), eq(submissions.status, "LATE"))
          )
        )
        .groupBy(assignments.classId);

      needsGradingForTeacher = rows
        .map((r) => ({
          classId: r.classId,
          classTitle: myClasses.find((c) => c.id === r.classId)?.title ?? "",
          count: r.count,
        }))
        .filter((r) => r.count > 0);
    } else {
      const rows = await db
        .select({
          id: assignments.id,
          title: assignments.title,
          dueAt: assignments.dueAt,
          classId: assignments.classId,
        })
        .from(assignments)
        .where(
          and(
            inArray(assignments.classId, classIds),
            eq(assignments.state, "PUBLISHED"),
            isNull(assignments.deletedAt),
            isNotNull(assignments.dueAt),
            gt(assignments.dueAt, now),
            lt(assignments.dueAt, weekFromNow)
          )
        )
        .orderBy(asc(assignments.dueAt))
        .limit(8);
      upcomingForStudent = rows.map((r) => ({
        ...r,
        classTitle: myClasses.find((c) => c.id === r.classId)?.title ?? "",
      }));
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">
          {session.user.role === "TEACHER" ? "Your classroom" : "Your classes"}
        </h1>
        <p className="text-muted mt-1 text-sm">
          {session.user.role === "TEACHER"
            ? "Manage classes, students, and assignments."
            : "Pick a class to see assignments and feedback."}
        </p>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl">Classes</h2>
          {session.user.role === "TEACHER" ? (
            <Link href="/classes" className="text-sm text-accent hover:underline">
              See all
            </Link>
          ) : null}
        </div>

        {myClasses.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-muted text-sm">
              {session.user.role === "TEACHER"
                ? "No classes yet."
                : "You're not enrolled in any classes yet."}
            </p>
            <div className="mt-4">
              {session.user.role === "TEACHER" ? (
                <Link href="/classes" className="btn-primary inline-block">
                  Create a class
                </Link>
              ) : (
                <Link href="/join" className="btn-primary inline-block">
                  Join with a code
                </Link>
              )}
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myClasses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/classes/${c.id}`}
                  className="card p-4 block hover:border-accent transition-colors"
                >
                  <div
                    aria-hidden="true"
                    className="h-2 rounded mb-3 -mx-4 -mt-4 rounded-b-none"
                    style={{ background: c.bannerColor ?? "#0f766e" }}
                  />
                  <h3 className="font-display text-lg leading-tight">{c.title}</h3>
                  {c.term ? <p className="text-xs text-muted mt-1">{c.term}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={session.user.role === "TEACHER" ? "Needs grading" : "Upcoming"}>
        <h2 className="font-display text-xl mb-3">
          {session.user.role === "TEACHER" ? "Needs grading" : "Upcoming this week"}
        </h2>
        {session.user.role === "TEACHER" ? (
          needsGradingForTeacher.length === 0 ? (
            <div className="card p-6 text-center text-muted text-sm">
              Nothing waiting. The grading interface lands in step 3b.
            </div>
          ) : (
            <ul className="card divide-y divide-border">
              {needsGradingForTeacher.map((g) => (
                <li key={g.classId} className="px-4 py-3 flex justify-between items-center">
                  <Link
                    href={`/classes/${g.classId}/assignments`}
                    className="text-fg hover:text-accent"
                  >
                    {g.classTitle}
                  </Link>
                  <span className="text-sm text-muted">
                    {g.count} submission{g.count === 1 ? "" : "s"} to grade
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : upcomingForStudent.length === 0 ? (
          <div className="card p-6 text-center text-muted text-sm">
            Nothing due in the next 7 days.
          </div>
        ) : (
          <ul className="card divide-y divide-border">
            {upcomingForStudent.map((a) => (
              <li key={a.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <Link
                    href={`/classes/${a.classId}/assignments/${a.id}`}
                    className="text-fg hover:text-accent"
                  >
                    {a.title}
                  </Link>
                  <div className="text-xs text-muted">{a.classTitle}</div>
                </div>
                <span className="text-sm text-muted">
                  {a.dueAt ? new Date(a.dueAt).toLocaleString() : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
