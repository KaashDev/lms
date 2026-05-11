import { db } from "@/db";
import { classes, enrollments, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { and, eq, isNull, desc } from "drizzle-orm";

// GET /api/classes/:id/students — returns the roster with the columns the
// spec asks for: name, email, last active, current grade, missing count.
//
// Grade + missing count are placeholders for step 5 (gradebook) — for now we
// return null for both so the UI can render the column shape correctly.
// Doing it this way means step 5 just fills in the values, no UI change.
export async function GET(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId)
    ),
    columns: { id: true },
  });
  if (!cls) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Join via Drizzle's query API. Returns ACTIVE + DEACTIVATED — REMOVED
  // rows are hidden from default roster but recoverable in the trash view.
  const rows = await db
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

  // Filter out REMOVED — those go to the trash view.
  const active = rows.filter((r) => r.status !== "REMOVED");

  return Response.json({
    students: active.map((r) => ({
      ...r,
      currentGrade: null as number | null, // filled in step 5
      missingCount: null as number | null, // filled in step 5
    })),
  });
}
