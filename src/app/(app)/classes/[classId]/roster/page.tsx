import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, classInvites, enrollments, users } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { RosterTable } from "@/components/roster/roster-table";
import { InvitePanel } from "@/components/roster/invite-panel";
import { PendingInvitesList } from "@/components/roster/pending-invites";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();
  const { classId } = await params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId)
    ),
    columns: { id: true, title: true },
  });
  if (!cls) notFound();

  // Pull students and pending invites server-side. The table is interactive
  // but the data is server-fetched — no client-side data loading for
  // first-render perf.
  const studentRows = await db
    .select({
      enrollmentId: enrollments.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: enrollments.role,
      status: enrollments.status,
      lastActiveAt: users.lastActiveAt,
      enrolledAt: enrollments.enrolledAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(
      and(
        eq(enrollments.classId, classId),
        isNull(enrollments.deletedAt)
      )
    )
    .orderBy(desc(enrollments.enrolledAt));

  const students = studentRows
    .filter((r) => r.status !== "REMOVED")
    .map((r) => ({
      enrollmentId: r.enrollmentId,
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
      // Serialize Date → string. Client component would receive Date through
      // Next's RSC layer fine, but explicit ISO is more predictable.
      lastActiveAt: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
      enrolledAt: r.enrolledAt.toISOString(),
      currentGrade: null,
      missingCount: null,
    }));

  const invites = await db.query.classInvites.findMany({
    where: and(
      eq(classInvites.classId, classId),
      isNull(classInvites.acceptedAt),
      isNull(classInvites.revokedAt)
    ),
    orderBy: [desc(classInvites.createdAt)],
  });
  const pendingInvites = invites
    .filter((i) => i.expires > new Date())
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expires: i.expires.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link
            href={`/classes/${classId}`}
            className="text-sm text-muted hover:text-fg"
          >
            ← {cls.title}
          </Link>
          <h1 className="font-display text-4xl mt-1">Roster</h1>
        </div>
      </header>

      <InvitePanel classId={classId} />

      {pendingInvites.length > 0 ? (
        <PendingInvitesList classId={classId} invites={pendingInvites} />
      ) : null}

      <section>
        <h2 className="font-display text-xl mb-3">Enrolled</h2>
        <RosterTable students={students} classId={classId} />
      </section>
    </div>
  );
}
