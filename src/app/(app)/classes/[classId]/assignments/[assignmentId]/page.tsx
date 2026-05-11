import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssignmentForAnyMember } from "@/lib/auth/assignment-access";
import { TeacherAssignmentView } from "@/components/assignments/teacher-view";
import { StudentAssignmentView } from "@/components/assignments/student-view";

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const session = (await auth())!;
  const { classId, assignmentId } = await params;

  const access = await getAssignmentForAnyMember(assignmentId, session.user);
  if (!access) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/classes/${classId}/assignments`}
          className="text-sm text-muted hover:text-fg"
        >
          ← Assignments
        </Link>
        <h1 className="font-display text-4xl mt-1">{access.assignment.title}</h1>
      </header>

      {access.kind === "teacher" ? (
        <TeacherAssignmentView classId={classId} assignment={serializeAssignment(access.assignment)} />
      ) : (
        <StudentAssignmentView classId={classId} assignment={serializeAssignment(access.assignment)} />
      )}
    </div>
  );
}

// Helper: serialize Date fields to ISO strings before passing into client
// components. Otherwise Next's RSC layer will throw if any leaf component
// tries to render a Date directly.
function serializeAssignment(a: any) {
  return {
    ...a,
    availableFrom: a.availableFrom ? a.availableFrom.toISOString() : null,
    availableUntil: a.availableUntil ? a.availableUntil.toISOString() : null,
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
    updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
  };
}
