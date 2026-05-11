import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import Link from "next/link";

export default async function NewAssignmentPage({
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

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/classes/${classId}`} className="text-sm text-muted hover:text-fg">
          ← {cls.title}
        </Link>
        <h1 className="font-display text-4xl mt-1">New assignment</h1>
      </header>
      <AssignmentForm classId={classId} mode="create" />
    </div>
  );
}
