import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { TrashList } from "@/components/classes/trash-list";

export default async function TrashPage() {
  const session = (await auth())!;
  if (session.user.role !== "TEACHER") notFound();

  const rows = await db.query.classes.findMany({
    where: and(
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId),
      isNotNull(classes.deletedAt)
    ),
    orderBy: [desc(classes.deletedAt)],
  });

  const items = rows.map((c) => {
    const deletedAt = c.deletedAt!;
    const ageMs = Date.now() - deletedAt.getTime();
    const daysLeft = Math.max(0, Math.ceil(30 - ageMs / (24 * 60 * 60 * 1000)));
    return {
      id: c.id,
      title: c.title,
      term: c.term,
      deletedAt: deletedAt.toISOString(),
      daysLeft,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Trash</h1>
        <p className="text-muted text-sm mt-1">
          Deleted classes are kept for 30 days, then permanently removed.
        </p>
      </header>
      <TrashList items={items} />
    </div>
  );
}
