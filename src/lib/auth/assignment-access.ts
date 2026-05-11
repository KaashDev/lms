import { db } from "@/db";
import { assignments, classes, enrollments, submissions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

interface SessionUser {
  id: string;
  role: "TEACHER" | "TA" | "STUDENT";
  organizationId: string;
}

/**
 * Returns the assignment if the user is the teacher of record for the
 * class, else null. Used for create/edit/grade operations.
 */
export async function getAssignmentForTeacher(
  assignmentId: string,
  user: SessionUser
) {
  if (user.role !== "TEACHER") return null;
  const row = await db
    .select({
      assignment: assignments,
      class: classes,
    })
    .from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(classes.teacherId, user.id),
        eq(classes.organizationId, user.organizationId),
        isNull(assignments.deletedAt)
      )
    )
    .limit(1);
  return row[0] ?? null;
}

/**
 * Returns the assignment if the user is an enrolled student (or TA) in
 * the class AND the assignment is published. Used for student-facing reads.
 */
export async function getAssignmentForStudent(
  assignmentId: string,
  user: SessionUser
) {
  const row = await db
    .select({
      assignment: assignments,
      class: classes,
      enrollment: enrollments,
    })
    .from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.classId, classes.id),
        eq(enrollments.userId, user.id)
      )
    )
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(classes.organizationId, user.organizationId),
        isNull(assignments.deletedAt),
        isNull(enrollments.deletedAt)
      )
    )
    .limit(1);

  const result = row[0];
  if (!result) return null;
  // Drafts and archived assignments aren't visible to students.
  if (result.assignment.state !== "PUBLISHED") return null;
  // Deactivated/removed enrollments can't see assignments.
  if (result.enrollment.status !== "ACTIVE") return null;
  // Honor availability window: hide entirely until availableFrom.
  if (
    result.assignment.availableFrom &&
    result.assignment.availableFrom > new Date()
  ) {
    return null;
  }
  return result;
}

/**
 * Either teacher OR student view. Used for read endpoints that serve both.
 * Returns which role the caller has.
 */
export async function getAssignmentForAnyMember(
  assignmentId: string,
  user: SessionUser
): Promise<
  | { kind: "teacher"; assignment: typeof assignments.$inferSelect; class: typeof classes.$inferSelect }
  | { kind: "student"; assignment: typeof assignments.$inferSelect; class: typeof classes.$inferSelect; enrollment: typeof enrollments.$inferSelect }
  | null
> {
  if (user.role === "TEACHER") {
    const r = await getAssignmentForTeacher(assignmentId, user);
    if (r) return { kind: "teacher", assignment: r.assignment, class: r.class };
  }
  const s = await getAssignmentForStudent(assignmentId, user);
  if (s) return { kind: "student", ...s };
  return null;
}

/**
 * Load a submission by id, authorizing the caller. Returns the submission
 * row along with the assignment and class, plus the caller's role.
 *
 * Teacher: any submission in their class. Student: only their own.
 * Returns null when not visible (either nonexistent or not authorized).
 */
export async function getSubmissionForCaller(
  submissionId: string,
  user: SessionUser
) {
  const rows = await db
    .select({
      submission: submissions,
      assignment: assignments,
      class: classes,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(classes.organizationId, user.organizationId),
        isNull(assignments.deletedAt)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  if (user.role === "TEACHER") {
    if (row.class.teacherId !== user.id) return null;
    return { kind: "teacher" as const, ...row };
  }

  // Student: must own the submission AND be actively enrolled.
  if (row.submission.userId !== user.id) return null;
  const enrolled = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.classId, row.class.id),
      eq(enrollments.userId, user.id),
      eq(enrollments.status, "ACTIVE"),
      isNull(enrollments.deletedAt)
    ),
    columns: { id: true },
  });
  if (!enrolled) return null;
  return { kind: "student" as const, ...row };
}
