import { z } from "zod";

const tiptapJson = z.record(z.any());

// We use coerce.date so ISO strings from JSON bodies parse cleanly.
const isoDate = z.coerce.date();

export const createAssignmentInput = z.object({
  type: z.enum(["ESSAY", "QUIZ"]),
  title: z.string().trim().min(1).max(200),
  instructions: tiptapJson.optional().nullable(),
  pointsPossible: z.number().min(0).max(10000).default(0),
  availableFrom: isoDate.optional().nullable(),
  availableUntil: isoDate.optional().nullable(),
  dueAt: isoDate.optional().nullable(),
  lateAcceptPolicy: z.enum(["ACCEPT", "REJECT"]).default("ACCEPT"),

  // Essay-only options.
  allowFileUpload: z.boolean().default(true),
  allowTextEntry: z.boolean().default(true),

  // Quiz-only — these are accepted now but unused until step 4.
  allowedAttempts: z.number().int().positive().optional().nullable(),
  timeLimitSeconds: z.number().int().positive().optional().nullable(),
  shuffleQuestions: z.boolean().default(false),
  showCorrectAnswersAfter: z.boolean().default(false),
  lockdownMode: z.boolean().default(false),

  autoPostGrades: z.boolean().default(false),

  // Posting state. We accept either DRAFT or PUBLISHED at create time;
  // ARCHIVED happens via a separate route.
  state: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),

  categoryId: z.string().optional().nullable(),
}).refine(
  (data) =>
    // Essays must allow at least one submission mode.
    data.type !== "ESSAY" || data.allowFileUpload || data.allowTextEntry,
  { message: "Essays must allow text entry or file upload (or both)", path: ["allowTextEntry"] }
);

export const updateAssignmentInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: tiptapJson.optional().nullable(),
  pointsPossible: z.number().min(0).max(10000).optional(),
  availableFrom: isoDate.optional().nullable(),
  availableUntil: isoDate.optional().nullable(),
  dueAt: isoDate.optional().nullable(),
  lateAcceptPolicy: z.enum(["ACCEPT", "REJECT"]).optional(),
  allowFileUpload: z.boolean().optional(),
  allowTextEntry: z.boolean().optional(),
  autoPostGrades: z.boolean().optional(),
  state: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  categoryId: z.string().nullable().optional(),
});

export const duplicateAssignmentInput = z.object({
  // Optional overrides — caller can change the title and clear due date
  // when duplicating ("Quiz 1 (Copy)" → "Quiz 2").
  title: z.string().trim().min(1).max(200).optional(),
});

export const copyAssignmentInput = z.object({
  targetClassId: z.string().min(1),
});

// ---------- Submissions ----------

// Save a draft. Either body OR a file upload (or both) per the assignment's
// allowed modes. The fromPaste flag is set by the editor when the most
// recent change came from a > 100-char paste.
export const saveSubmissionInput = z.object({
  body: tiptapJson.optional().nullable(),
  fromPaste: z.boolean().default(false),
  pasteCharCount: z.number().int().positive().optional().nullable(),
});

// Finalize submission. Validates that the student has *something* to submit.
export const submitInput = z.object({
  // Final confirmation — student types "submit" or clicks a button; we don't
  // accept blank body+no-attachments.
  acknowledge: z.literal(true),
});
