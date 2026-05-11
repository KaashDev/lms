import { db } from "@/db";
import { submissionComments, submissionVersions, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { createCommentInput } from "@/lib/validators/grading";
import { audit } from "@/lib/audit";
import { and, asc, eq, isNull } from "drizzle-orm";

// GET /api/submissions/:submissionId/comments
// Returns flat list ordered by createdAt. The client builds the thread
// tree (parentId chain) — easier to render the sidebar that way.
// Visible to teacher always; student sees only after grade is posted
// (matches posting policy: comments are part of feedback).
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId } = await ctx.params;

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Student can only see comments once the submission's grade is posted.
  // Same gate as score visibility — keeps things consistent.
  if (access.kind === "student" && !access.submission.postedAt) {
    return Response.json({ comments: [] });
  }

  const rows = await db
    .select({
      comment: submissionComments,
      author: { id: users.id, name: users.name, email: users.email },
    })
    .from(submissionComments)
    .innerJoin(users, eq(users.id, submissionComments.authorId))
    .where(
      and(
        eq(submissionComments.submissionId, submissionId),
        isNull(submissionComments.deletedAt)
      )
    )
    .orderBy(asc(submissionComments.createdAt));

  return Response.json({
    comments: rows.map((row) => ({ ...row.comment, author: row.author })),
  });
}

// POST /api/submissions/:submissionId/comments
// Teacher OR student (replies). New comments default to unresolved.
//
// Anchored comments must reference a real version of the same submission;
// we validate that before insert so a misbehaving client can't anchor
// to another student's content.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = createCommentInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Students can only reply to existing comments (parentId required) and
  // only once the grade is posted. Original comments are teacher-only.
  if (access.kind === "student") {
    if (!parsed.data.parentId) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (!access.submission.postedAt) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  // If anchored, verify the version belongs to this submission.
  if (parsed.data.anchorVersionId) {
    const v = await db.query.submissionVersions.findFirst({
      where: and(
        eq(submissionVersions.id, parsed.data.anchorVersionId),
        eq(submissionVersions.submissionId, submissionId)
      ),
      columns: { id: true },
    });
    if (!v) {
      return Response.json(
        { error: "BAD_REQUEST", message: "Anchor version doesn't belong to this submission." },
        { status: 400 }
      );
    }
  }

  // If parentId, verify it's a real comment on this submission.
  if (parsed.data.parentId) {
    const p = await db.query.submissionComments.findFirst({
      where: and(
        eq(submissionComments.id, parsed.data.parentId),
        eq(submissionComments.submissionId, submissionId),
        isNull(submissionComments.deletedAt)
      ),
      columns: { id: true },
    });
    if (!p) {
      return Response.json({ error: "BAD_REQUEST", message: "Parent comment not found." }, { status: 400 });
    }
  }

  const [created] = await db
    .insert(submissionComments)
    .values({
      submissionId,
      authorId: session.user.id,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body,
      anchorVersionId: parsed.data.anchorVersionId ?? null,
      anchorStart: parsed.data.anchorStart ?? null,
      anchorEnd: parsed.data.anchorEnd ?? null,
      anchorQuote: parsed.data.anchorQuote ?? null,
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "comment.created",
    targetType: "comment",
    targetId: created.id,
    metadata: { submissionId, anchored: !!parsed.data.anchorVersionId, isReply: !!parsed.data.parentId },
  });

  return Response.json({ comment: created }, { status: 201 });
}
