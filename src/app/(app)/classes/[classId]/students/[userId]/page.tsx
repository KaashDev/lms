import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, enrollments, users, assignments, submissions, assignmentOverrides } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { StudentProfileActions } from "@/components/roster/student-profile-actions";
import { StudentAssignmentsList } from "@/components/roster/student-assignments-list";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ classId: string; userId: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();
  const { classId, userId } = await params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId)
    ),
    columns: { id: true, title: true },
  });
  if (!cls) notFound();

  const enrollment = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.classId, classId), eq(enrollments.userId, userId)),
  });
  if (!enrollment) notFound();

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  // Load this class's published assignments + this student's submission
  // for each + any per-student override.
  const assignmentRows = await db.query.assignments.findMany({
    where: and(eq(assignments.classId, classId), isNull(assignments.deletedAt)),
    orderBy: [asc(assignments.dueAt), asc(assignments.title)],
  });

  const subRows = await db.query.submissions.findMany({
    where: and(
      eq(submissions.userId, userId),
      eq(submissions.isCountedAttempt, true)
    ),
  });
  const subByAssignment = new Map(subRows.map((s) => [s.assignmentId, s]));

  const overrideRows = await db.query.assignmentOverrides.findMany({
    where: eq(assignmentOverrides.userId, userId),
  });
  const overrideByAssignment = new Map(overrideRows.map((o) => [o.assignmentId, o]));

  const composed = assignmentRows.map((a) => {
    const sub = subByAssignment.get(a.id);
    const ov = overrideByAssignment.get(a.id);
    return {
      id: a.id,
      title: a.title,
      state: a.state,
      pointsPossible: a.pointsPossible,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      availableUntil: a.availableUntil ? a.availableUntil.toISOString() : null,
      submission: sub
        ? {
            id: sub.id,
            status: sub.status,
            score: sub.score,
            postedAt: sub.postedAt ? sub.postedAt.toISOString() : null,
          }
        : null,
      override: ov
        ? {
            dueAt: ov.dueAt ? ov.dueAt.toISOString() : null,
            availableUntil: ov.availableUntil ? ov.availableUntil.toISOString() : null,
            timeLimitSeconds: ov.timeLimitSeconds,
            allowedAttempts: ov.allowedAttempts,
          }
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/classes/${classId}/roster`}
          className="text-sm text-muted hover:text-fg"
        >
          ← Roster
        </Link>
        <h1 className="font-display text-4xl mt-1">
          {user.name ?? user.email}
        </h1>
        <p className="text-muted text-sm mt-1">{user.email}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Status" value={enrollment.status} />
        <Stat label="Role" value={enrollment.role} />
        <Stat
          label="Last active"
          value={
            user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : "Never"
          }
        />
      </section>

      <StudentAssignmentsList
        classId={classId}
        userId={userId}
        assignments={composed}
      />

      <StudentProfileActions
        classId={classId}
        userId={userId}
        initialNotes={enrollment.teacherNotes ?? ""}
        initialStatus={enrollment.status}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted uppercase tracking-wider">{label}</div>
      <div className="font-display text-xl mt-1">{value}</div>
    </div>
  );
}
