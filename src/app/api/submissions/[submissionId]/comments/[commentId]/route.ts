import { db } from "@/db";
import { submissionComments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { updateCommentInput } from "@/lib/validators/grading";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

// PATCH /api/submissions/:submissionId/comments/:commentId
// Author can edit body. Teacher can resolve/unresolve any comment in
// their class.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ submissionId: string; commentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId, commentId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = updateCommentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const comment = await db.query.submissionComments.findFirst({
    where: and(
      eq(submissionComments.id, commentId),
      eq(submissionComments.submissionId, submissionId),
      isNull(submissionComments.deletedAt)
    ),
  });
  if (!comment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const isAuthor = comment.authorId === session.user.id;
  const isTeacher = access.kind === "teacher";

  const update: Record<string, unknown> = {};
  if (parsed.data.body !== undefined) {
    if (!isAuthor) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    update.body = parsed.data.body;
  }
  if (parsed.data.resolved !== undefined) {
    if (!isTeacher) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    update.resolvedAt = parsed.data.resolved ? new Date() : null;
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ comment });
  }

  const [updated] = await db
    .update(submissionComments)
    .set(update)
    .where(eq(submissionComments.id, commentId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "comment.updated",
    targetType: "comment",
    targetId: commentId,
    metadata: { fields: Object.keys(update) },
  });

  return Response.json({ comment: updated });
}

// DELETE: soft-delete. Author only (teachers must use the resolve flow
// for student comments, not delete them).
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string; commentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId, commentId } = await ctx.params;

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const comment = await db.query.submissionComments.findFirst({
    where: and(
      eq(submissionComments.id, commentId),
      eq(submissionComments.submissionId, submissionId),
      isNull(submissionComments.deletedAt)
    ),
  });
  if (!comment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  if (comment.authorId !== session.user.id) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await db
    .update(submissionComments)
    .set({ deletedAt: new Date() })
    .where(eq(submissionComments.id, commentId));

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "comment.deleted",
    targetType: "comment",
    targetId: commentId,
  });

  return Response.json({ ok: true });
}
