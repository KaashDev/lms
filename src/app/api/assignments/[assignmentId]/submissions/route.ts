import { db } from "@/db";
import { submissions, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import {
  getAssignmentForTeacher,
  getAssignmentForAnyMember,
} from "@/lib/auth/assignment-access";
import { and, eq } from "drizzle-orm";

// GET /api/assignments/:id/submissions
//   - Teacher: list ALL submissions for the assignment (one per student,
//     the "counted" attempt). Used by the grading queue page.
//   - Student: returns just their own submission (or 404 if none exists yet).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  const access = await getAssignmentForAnyMember(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  if (access.kind === "teacher") {
    // Join with users for display name + email. Returning the counted
    // attempt per student (we mark exactly one per pair as isCountedAttempt).
    const rows = await db
      .select({
        submission: submissions,
        student: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(
        and(
          eq(submissions.assignmentId, assignmentId),
          eq(submissions.isCountedAttempt, true)
        )
      );

    return Response.json({
      submissions: rows.map((row) => ({
        ...row.submission,
        student: row.student,
      })),
    });
  }

  // Student: return their own counted submission if any.
  const mine = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id),
      eq(submissions.isCountedAttempt, true)
    ),
  });

  if (!mine) {
    // Convention: no row = NOT_STARTED. Client renders empty state.
    return Response.json({ submission: null });
  }
  return Response.json({ submission: mine });
}
