import { db } from "@/db";
import { assignments, classes, enrollments } from "@/db/schema";
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
