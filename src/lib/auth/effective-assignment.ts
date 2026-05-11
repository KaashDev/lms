import { db } from "@/db";
import { assignmentOverrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Apply a per-student override (if any) to an assignment row. Returns a
 * shallow-copied assignment with effective values.
 *
 * Only fields the override can replace: dueAt, availableUntil,
 * timeLimitSeconds, allowedAttempts. Everything else passes through.
 *
 * An override with a null field means "no override on this field" — use
 * the assignment default. The override row itself only exists if at least
 * one field is set (we delete empty overrides in the PUT route).
 */
export async function applyOverride<
  A extends {
    id: string;
    dueAt: Date | null;
    availableUntil: Date | null;
    timeLimitSeconds: number | null;
    allowedAttempts: number | null;
  }
>(assignment: A, userId: string): Promise<A> {
  const ov = await db.query.assignmentOverrides.findFirst({
    where: and(
      eq(assignmentOverrides.assignmentId, assignment.id),
      eq(assignmentOverrides.userId, userId)
    ),
  });
  if (!ov) return assignment;
  return {
    ...assignment,
    dueAt: ov.dueAt ?? assignment.dueAt,
    availableUntil: ov.availableUntil ?? assignment.availableUntil,
    timeLimitSeconds: ov.timeLimitSeconds ?? assignment.timeLimitSeconds,
    allowedAttempts: ov.allowedAttempts ?? assignment.allowedAttempts,
  };
}
