import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, enrollments, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { StudentProfileActions } from "@/components/roster/student-profile-actions";

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

      <section className="card p-4">
        <h2 className="font-display text-lg mb-2">Submissions & grades</h2>
        <p className="text-sm text-muted">
          Comes alive in step 3 (assignments) and step 5 (gradebook).
        </p>
      </section>

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
