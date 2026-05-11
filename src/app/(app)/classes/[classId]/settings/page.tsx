import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ClassSettingsForm } from "@/components/classes/class-settings-form";

export default async function ClassSettingsPage({
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
  });
  if (!cls || cls.deletedAt) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/classes/${classId}`} className="text-sm text-muted hover:text-fg">
          ← {cls.title}
        </Link>
        <h1 className="font-display text-4xl mt-1">Settings</h1>
      </header>
      <ClassSettingsForm
        classId={classId}
        initial={{
          title: cls.title,
          term: cls.term ?? "",
          description: cls.description ?? "",
          bannerColor: cls.bannerColor ?? "#0f766e",
          joinCode: cls.joinCode ?? "",
          archived: !!cls.archivedAt,
        }}
      />
    </div>
  );
}
