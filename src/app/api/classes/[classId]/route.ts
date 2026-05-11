import { db } from "@/db";
import { classes } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { updateClassInput, archiveClassInput } from "@/lib/validators/classes";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

// Helper: load a class and authorize the caller. Returns the row or a Response.
async function loadClassForTeacher(classId: string, session: { user: { id: string; organizationId: string; role: string } }) {
  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (cls.teacherId !== session.user.id) {
    // Even an admin teacher in the same org shouldn't be able to touch
    // another teacher's class without explicit collab permissions (not
    // built yet). For step 2 we hard-deny.
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return cls;
}

export async function GET(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await db.query.classes.findFirst({
    where: and(eq(classes.id, classId), eq(classes.organizationId, session.user.organizationId)),
  });
  if (!cls || cls.deletedAt) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Teacher owns class → full read. Otherwise must be enrolled.
  if (session.user.role !== "TEACHER" || cls.teacherId !== session.user.id) {
    const enrolled = await db.query.enrollments.findFirst({
      where: (e, { and, eq, isNull }) =>
        and(eq(e.classId, classId), eq(e.userId, session.user.id), isNull(e.deletedAt)),
      columns: { id: true, status: true },
    });
    if (!enrolled || enrolled.status === "REMOVED") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
  }

  return Response.json({ class: cls });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await loadClassForTeacher(classId, session);
  if (cls instanceof Response) return cls;

  const body = await req.json().catch(() => null);

  // Two PATCH shapes share this route: regular update, and archive toggle.
  // The archive shape has the single field `archived`, so we route on that.
  if (body && typeof body === "object" && "archived" in body) {
    const parsed = archiveClassInput.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
    }
    const [updated] = await db
      .update(classes)
      .set({
        archivedAt: parsed.data.archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();
    await audit({
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      action: parsed.data.archived ? "class.archived" : "class.unarchived",
      targetType: "class",
      targetId: classId,
    });
    return Response.json({ class: updated });
  }

  // Regular update.
  const parsed = updateClassInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }
  const [updated] = await db
    .update(classes)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(classes.id, classId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "class.updated",
    targetType: "class",
    targetId: classId,
    diff: { before: cls, after: updated },
  });

  return Response.json({ class: updated });
}

// Soft delete. Restore happens via PATCH ?restore=1 or by setting deletedAt=null.
// We pick a dedicated route shape: DELETE soft-deletes; PUT restores. Less ambiguous.
export async function DELETE(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await loadClassForTeacher(classId, session);
  if (cls instanceof Response) return cls;
  if (cls.deletedAt) return Response.json({ class: cls });

  await db.update(classes).set({ deletedAt: new Date() }).where(eq(classes.id, classId));
  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "class.deleted",
    targetType: "class",
    targetId: classId,
    metadata: { title: cls.title },
  });
  return Response.json({ ok: true });
}

// PUT restores a soft-deleted class. We accept it only if deletedAt is set
// AND within the 30-day window.
export async function PUT(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await loadClassForTeacher(classId, session);
  if (cls instanceof Response) return cls;
  if (!cls.deletedAt) return Response.json({ class: cls });

  const ageMs = Date.now() - cls.deletedAt.getTime();
  if (ageMs > 30 * 24 * 60 * 60 * 1000) {
    return Response.json({ error: "RESTORE_WINDOW_EXPIRED" }, { status: 410 });
  }

  const [restored] = await db
    .update(classes)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(classes.id, classId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "class.restored",
    targetType: "class",
    targetId: classId,
  });

  return Response.json({ class: restored });
}
