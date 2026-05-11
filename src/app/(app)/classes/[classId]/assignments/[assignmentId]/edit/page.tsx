import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssignmentForTeacher } from "@/lib/auth/assignment-access";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import Link from "next/link";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();
  const { classId, assignmentId } = await params;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) notFound();

  const a = access.assignment;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/classes/${classId}/assignments/${assignmentId}`}
          className="text-sm text-muted hover:text-fg"
        >
          ← {a.title}
        </Link>
        <h1 className="font-display text-4xl mt-1">Edit assignment</h1>
      </header>
      <AssignmentForm
        classId={classId}
        mode="edit"
        initial={{
          id: a.id,
          type: a.type,
          title: a.title,
          instructions: a.instructions,
          pointsPossible: a.pointsPossible,
          availableFrom: a.availableFrom ? a.availableFrom.toISOString() : null,
          availableUntil: a.availableUntil ? a.availableUntil.toISOString() : null,
          dueAt: a.dueAt ? a.dueAt.toISOString() : null,
          lateAcceptPolicy: a.lateAcceptPolicy,
          allowFileUpload: a.allowFileUpload,
          allowTextEntry: a.allowTextEntry,
          autoPostGrades: a.autoPostGrades,
          state: a.state,
        }}
      />
    </div>
  );
}
