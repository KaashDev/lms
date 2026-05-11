import { z } from "zod";

const tiptapJson = z.record(z.any());
const isoDate = z.coerce.date();

// ---------- Grading ----------

// Teacher grade-update. Score must be present; feedback optional.
// `post` toggles visibility (Canvas "posted/muted"). Independent of grade.
export const gradeSubmissionInput = z.object({
  score: z.number().min(0).max(10000).nullable(),
  feedback: tiptapJson.optional().nullable(),
  // If true, mark postedAt = now. If false, clear postedAt.
  // If undefined, leave the current posted state alone.
  post: z.boolean().optional(),
});

// Status transitions teachers can trigger from the grader.
// RETURNED:   give the student back their (possibly graded) work; locks editing.
// MISSING:    teacher marks a non-submission as missing (counts as 0 unless excused).
// EXCUSED:    drops the assignment from the student's gradebook entirely.
// REOPEN:     un-locks for editing (sets back to IN_PROGRESS), clears submittedAt.
export const submissionActionInput = z.object({
  action: z.enum(["RETURN", "MISSING", "EXCUSE", "REOPEN"]),
});

// ---------- Comments ----------

export const createCommentInput = z
  .object({
    body: z.string().trim().min(1).max(5000),
    parentId: z.string().optional().nullable(),
    // Anchoring: all three together, or none. We enforce in .refine.
    anchorVersionId: z.string().optional().nullable(),
    anchorStart: z.number().int().nonnegative().optional().nullable(),
    anchorEnd: z.number().int().nonnegative().optional().nullable(),
    anchorQuote: z.string().max(500).optional().nullable(),
  })
  .refine(
    (d) => {
      const anchored = [d.anchorVersionId, d.anchorStart, d.anchorEnd].filter(
        (v) => v !== null && v !== undefined
      ).length;
      // Either all 3 anchor fields present, or all 3 absent. (Quote is optional fallback.)
      return anchored === 0 || anchored === 3;
    },
    { message: "Anchor must include versionId, start, and end together." }
  )
  .refine(
    (d) =>
      d.anchorStart == null ||
      d.anchorEnd == null ||
      d.anchorStart <= d.anchorEnd,
    { message: "anchorStart must be <= anchorEnd" }
  );

export const updateCommentInput = z.object({
  body: z.string().trim().min(1).max(5000).optional(),
  resolved: z.boolean().optional(),
});

// ---------- Overrides ----------

// Per-student override. Any field null means "use assignment default".
// All four can be null (effectively removing the override; we delete the
// row in that case).
export const overrideInput = z.object({
  dueAt: isoDate.optional().nullable(),
  availableUntil: isoDate.optional().nullable(),
  timeLimitSeconds: z.number().int().positive().optional().nullable(),
  allowedAttempts: z.number().int().positive().optional().nullable(),
});
