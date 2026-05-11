import { db } from "@/db";
import { submissions } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import { and, eq } from "drizzle-orm";

// POST /api/assignments/:id/submissions
// Used by students to start a submission. Idempotent: if the student
// already has a counted submission, returns it instead of creating a
// duplicate. This is the "open the assignment for the first time" call.
//
// We split this from PATCH to avoid the awkward "PATCH with no submission
// id yet" UX. Client flow:
//   1) POST /submissions -> { submission } (created or existing)
//   2) PATCH /submissions/:id -> autosave
//   3) POST /submissions/:id/submit -> finalize
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ assignmentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  // Only students can start a submission.
  if (session.user.role === "TEACHER") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const access = await getAssignmentForStudent(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Existing counted submission? Return it.
  const existing = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id),
      eq(submissions.isCountedAttempt, true)
    ),
  });
  if (existing) {
    return Response.json({ submission: existing, created: false });
  }

  const [created] = await db
    .insert(submissions)
    .values({
      assignmentId,
      userId: session.user.id,
      attemptNumber: 1,
      status: "NOT_STARTED",
      isCountedAttempt: true,
    })
    .returning();

  return Response.json({ submission: created, created: true }, { status: 201 });
}
