import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classes, enrollments } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { CreateClassDialog } from "@/components/classes/create-class-dialog";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  // Teacher view: their classes. Student view: enrolled.
  const myClasses =
    session.user.role === "TEACHER"
      ? await db.query.classes.findMany({
          where: and(
            eq(classes.teacherId, session.user.id),
            eq(classes.organizationId, session.user.organizationId),
            isNull(classes.deletedAt),
            showArchived ? undefined : isNull(classes.archivedAt)
          ),
          orderBy: [desc(classes.updatedAt)],
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
                showArchived ? undefined : isNull(classes.archivedAt)
              )
            )
            .orderBy(desc(classes.updatedAt));
          return rows.map((r) => r.class);
        })();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-4xl">Classes</h1>
        {session.user.role === "TEACHER" ? <CreateClassDialog /> : null}
      </header>

      <div className="flex gap-2 text-sm" role="tablist" aria-label="Filter">
        <Link
          href="/classes"
          className={`px-3 py-1 rounded border ${!showArchived ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          Active
        </Link>
        <Link
          href="/classes?archived=1"
          className={`px-3 py-1 rounded border ${showArchived ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          Archived
        </Link>
      </div>

      {myClasses.length === 0 ? (
        <p className="text-muted text-sm">
          {showArchived ? "No archived classes." : "No classes yet."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myClasses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/classes/${c.id}`}
                className="card block hover:border-accent transition-colors overflow-hidden"
              >
                <div
                  aria-hidden="true"
                  className="h-3"
                  style={{ background: c.bannerColor ?? "#0f766e" }}
                />
                <div className="p-4">
                  <h2 className="font-display text-lg leading-tight">{c.title}</h2>
                  {c.term ? <p className="text-xs text-muted mt-1">{c.term}</p> : null}
                  {c.description ? (
                    <p className="text-sm text-muted mt-2 line-clamp-2">{c.description}</p>
                  ) : null}
                  {c.archivedAt ? (
                    <span className="inline-block mt-3 text-xs px-2 py-0.5 rounded bg-surface-2 text-muted">
                      Archived
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
