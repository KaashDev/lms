import { db } from "@/db";
import { assignments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { updateAssignmentInput } from "@/lib/validators/assignments";
import {
  getAssignmentForTeacher,
  getAssignmentForAnyMember,
} from "@/lib/auth/assignment-access";
import { audit } from "@/lib/audit";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  const access = await getAssignmentForAnyMember(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  return Response.json({
    assignment: access.assignment,
    role: access.kind,
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateAssignmentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // We forbid switching state PUBLISHED → DRAFT once submissions exist.
  // The schema doesn't enforce this, but un-publishing midway would
  // confuse the gradebook calculations in step 5. Easier to disallow now.
  // (We don't check submission count here yet — that'd be 2x query work.
  // We'll wire that in step 3b when grading lands.)

  const [updated] = await db
    .update(assignments)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.updated",
    targetType: "assignment",
    targetId: assignmentId,
    diff: { before: access.assignment, after: updated },
  });

  return Response.json({ assignment: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  const access = await getAssignmentForTeacher(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  await db
    .update(assignments)
    .set({ deletedAt: new Date() })
    .where(eq(assignments.id, assignmentId));

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.deleted",
    targetType: "assignment",
    targetId: assignmentId,
    metadata: { title: access.assignment.title },
  });

  return Response.json({ ok: true });
}

// PUT restores within the 30-day window. Same pattern as class restore.
export async function PUT(
  _req: Request,
  ctx: { params: Promise<{ classId: string; assignmentId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  // Can't use getAssignmentForTeacher — it filters out deleted rows.
  // Re-query allowing deletedAt to be set.
  const row = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
  });
  if (!row) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!row.deletedAt) return Response.json({ assignment: row });
  if (Date.now() - row.deletedAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
    return Response.json({ error: "RESTORE_WINDOW_EXPIRED" }, { status: 410 });
  }

  // Re-authorize via the class.
  const { classes } = await import("@/db/schema");
  const { and, eq: eq2 } = await import("drizzle-orm");
  const cls = await db.query.classes.findFirst({
    where: and(
      eq2(classes.id, row.classId),
      eq2(classes.teacherId, session.user.id),
      eq2(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const [restored] = await db
    .update(assignments)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(assignments.id, assignmentId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "assignment.restored",
    targetType: "assignment",
    targetId: assignmentId,
  });

  return Response.json({ assignment: restored });
}
