import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  boolean,
  real,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { classes, enrollments } from "./classes";
import { users } from "./auth";

export const assignmentType = pgEnum("assignment_type", ["ESSAY", "QUIZ"]);
export const assignmentState = pgEnum("assignment_state", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const lateAcceptPolicy = pgEnum("late_accept_policy", [
  "ACCEPT", // accept late, no penalty (we agreed: no auto-penalty math)
  "REJECT", // hard cutoff
]);
export const submissionStatus = pgEnum("submission_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "LATE", // submitted after due
  "MISSING", // teacher marked missing after deadline
  "EXCUSED",
  "RETURNED", // graded and posted
]);
export const questionType = pgEnum("question_type", [
  "MULTIPLE_CHOICE",
  "MULTIPLE_ANSWER",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "FILL_IN_BLANK",
  "MATCHING",
  "ESSAY",
]);

// One assignment row covers both essay and quiz types. Type-specific config
// goes into JSON blobs because the alternative (separate tables joined via
// nullable FKs) is harder to query and harder to keep consistent.
export const assignments = pgTable(
  "assignments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => gradebookCategories.id, {
      onDelete: "set null",
    }),

    type: assignmentType("type").notNull(),
    state: assignmentState("state").notNull().default("DRAFT"),

    title: text("title").notNull(),
    // Tiptap JSON. Same reasoning as syllabus.
    instructions: jsonb("instructions"),
    pointsPossible: real("points_possible").notNull().default(0),

    // Time windows. All UTC; display layer converts.
    availableFrom: timestamp("available_from", { withTimezone: true }),
    availableUntil: timestamp("available_until", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),

    lateAcceptPolicy: lateAcceptPolicy("late_accept_policy").notNull().default("ACCEPT"),

    // Quiz-only settings — null for essays.
    allowedAttempts: integer("allowed_attempts"), // null = unlimited
    timeLimitSeconds: integer("time_limit_seconds"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    showCorrectAnswersAfter: boolean("show_correct_answers_after").notNull().default(false),
    // Lockdown mode logs tab-switch events. We don't actually lock the
    // browser — that's impossible on a web app and security theater anyway.
    // We just record signals for the teacher to review.
    lockdownMode: boolean("lockdown_mode").notNull().default(false),

    // Essay-only settings.
    allowFileUpload: boolean("allow_file_upload").notNull().default(true),
    allowTextEntry: boolean("allow_text_entry").notNull().default(true),

    // Posting policy (Canvas-style "muted" grades). When false, students
    // can't see scores or feedback even if a submission is graded.
    autoPostGrades: boolean("auto_post_grades").notNull().default(false),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    classIdx: index("assignments_class_idx").on(t.classId),
    dueIdx: index("assignments_due_idx").on(t.dueAt),
  })
);

// Quiz questions. Order matters; we store position. Question-type-specific
// fields (choices, correct answers, blanks, match pairs) live in JSON because
// the shape varies too much per type to justify five sub-tables.
// Concretely:
//   MULTIPLE_CHOICE/MULTIPLE_ANSWER: { choices: [{id, text, correct}] }
//   TRUE_FALSE: { correct: boolean }
//   SHORT_ANSWER: { acceptedAnswers: [string], caseSensitive: bool }
//   FILL_IN_BLANK: { blanks: [{id, acceptedAnswers}] }
//   MATCHING: { left: [{id, text}], right: [{id, text}], pairs: [{leftId, rightId}] }
//   ESSAY: {} (graded manually)
export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: questionType("type").notNull(),
    prompt: jsonb("prompt").notNull(), // Tiptap JSON
    points: real("points").notNull().default(1),
    config: jsonb("config").notNull().default({}),
    // Optional teacher rationale shown after attempt (if showCorrectAnswersAfter)
    explanation: jsonb("explanation"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    assignmentIdx: index("questions_assignment_idx").on(t.assignmentId),
  })
);

// Per-student per-assignment overrides (IEPs, 504s, makeups). Null fields
// mean "no override — use assignment default."
export const assignmentOverrides = pgTable(
  "assignment_overrides",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    availableUntil: timestamp("available_until", { withTimezone: true }),
    timeLimitSeconds: integer("time_limit_seconds"),
    allowedAttempts: integer("allowed_attempts"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("overrides_assignment_user_idx").on(t.assignmentId, t.userId),
  })
);

// One row per attempt. Essays usually have one. Quizzes can have many.
// Final score is whichever attempt the teacher decides (we'll store the
// "kept" attempt as a flag rather than computing min/max/latest — gives
// the teacher freedom and avoids surprise grading rules).
export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: submissionStatus("status").notNull().default("NOT_STARTED"),

    // Essay body (Tiptap JSON). Null for quiz submissions.
    body: jsonb("body"),
    wordCount: integer("word_count"),

    // Quiz answers, keyed by questionId. Null for essays.
    // { [questionId]: { value: ..., autoScore: number | null } }
    answers: jsonb("answers"),

    // Numeric score (raw points). Letter grade derived from class scheme.
    score: real("score"),
    // Whether the score has been "posted" (visible to student).
    postedAt: timestamp("posted_at", { withTimezone: true }),

    // General feedback (rich text). Anchored/inline comments live in
    // submissionComments below.
    feedback: jsonb("feedback"),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    gradedById: text("graded_by_id").references(() => users.id, { onDelete: "set null" }),

    // Which attempt counts. Exactly one per (assignment, user) should be true.
    // Enforced in app code, not DB constraint, because partial unique indexes
    // get awkward across migrations.
    isCountedAttempt: boolean("is_counted_attempt").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assignmentUserIdx: index("submissions_assignment_user_idx").on(t.assignmentId, t.userId),
    userIdx: index("submissions_user_idx").on(t.userId),
  })
);

// Every save of an essay submission. This is the academic-integrity log.
// Quiz submissions don't get versions — answers are append-only via answers JSON.
export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    body: jsonb("body").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    // Whether this version came from a paste event > 100 chars. Useful signal.
    fromPaste: boolean("from_paste").notNull().default(false),
    pasteCharCount: integer("paste_char_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx: index("submission_versions_submission_idx").on(t.submissionId),
  })
);

// Lockdown / integrity events on a quiz submission.
export const submissionEvents = pgTable(
  "submission_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    // "tab_blur" | "tab_focus" | "fullscreen_exit" | "paste" | etc.
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx: index("submission_events_submission_idx").on(t.submissionId),
  })
);

// File attachments on submissions OR assignment instructions.
// Single table because the upload UX is identical; ownership distinguished by
// the nullable parent FKs.
export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id").references(() => submissions.id, {
      onDelete: "cascade",
    }),
    assignmentId: text("assignment_id").references(() => assignments.id, {
      onDelete: "cascade",
    }),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Storage key in our blob bucket. We sign URLs at fetch time, never
    // store public URLs.
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx: index("attachments_submission_idx").on(t.submissionId),
    assignmentIdx: index("attachments_assignment_idx").on(t.assignmentId),
  })
);

// Threaded comments on a submission. Supports two cases:
//   1) General reply (anchorStart/anchorEnd null) — the conversation thread.
//   2) Anchored highlight ("this paragraph") — anchor* set, points into the
//      Tiptap doc by character offset. We store offsets, not positions, because
//      Tiptap node positions change as the doc edits but character offsets in
//      a snapshot are stable for review.
export const submissionComments = pgTable(
  "submission_comments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    // Optional anchor — character offsets into the submission body snapshot
    // identified by anchorVersionId.
    anchorVersionId: text("anchor_version_id").references(() => submissionVersions.id, {
      onDelete: "set null",
    }),
    anchorStart: integer("anchor_start"),
    anchorEnd: integer("anchor_end"),
    anchorQuote: text("anchor_quote"), // fallback for display if version deleted
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx: index("submission_comments_submission_idx").on(t.submissionId),
  })
);

// ---------- Rubrics ----------
// Rubric is reusable across assignments (teacher writes once, attaches many).
// criteria + levels live as JSON because rubric structure is small, queried
// only when grading, and the alternative (criteria/levels/cells tables) is
// 3 joins for every render.
export const rubrics = pgTable("rubrics", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // [{ id, description, points, levels: [{id, label, points, description}] }]
  criteria: jsonb("criteria").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignmentRubrics = pgTable(
  "assignment_rubrics",
  {
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    rubricId: text("rubric_id")
      .notNull()
      .references(() => rubrics.id, { onDelete: "restrict" }),
    // If true, score is computed from rubric selections and overrides manual.
    usedForScoring: boolean("used_for_scoring").notNull().default(true),
  },
  (t) => ({
    pk: uniqueIndex("assignment_rubrics_pk").on(t.assignmentId, t.rubricId),
  })
);

// Teacher's rubric selections for a submission.
// { criterionId: { levelId, points, comment? } }
export const rubricAssessments = pgTable(
  "rubric_assessments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    rubricId: text("rubric_id")
      .notNull()
      .references(() => rubrics.id, { onDelete: "restrict" }),
    selections: jsonb("selections").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionRubricIdx: uniqueIndex("rubric_assessments_pair_idx").on(
      t.submissionId,
      t.rubricId
    ),
  })
);

// ---------- Gradebook categories (weights) ----------
// Belongs in this file because assignments.categoryId references it and
// circular imports between schema files are a pain.
export const gradebookCategories = pgTable(
  "gradebook_categories",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    weightPercent: real("weight_percent").notNull().default(0),
    // Drop-N-lowest, common ask. Null = drop none.
    dropLowestN: integer("drop_lowest_n"),
    position: integer("position").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    classIdx: index("gradebook_categories_class_idx").on(t.classId),
  })
);

// ---------- Relations ----------

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  class: one(classes, { fields: [assignments.classId], references: [classes.id] }),
  category: one(gradebookCategories, {
    fields: [assignments.categoryId],
    references: [gradebookCategories.id],
  }),
  questions: many(questions),
  submissions: many(submissions),
  overrides: many(assignmentOverrides),
  rubrics: many(assignmentRubrics),
  attachments: many(attachments),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  user: one(users, { fields: [submissions.userId], references: [users.id] }),
  gradedBy: one(users, { fields: [submissions.gradedById], references: [users.id] }),
  versions: many(submissionVersions),
  comments: many(submissionComments),
  events: many(submissionEvents),
  attachments: many(attachments),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  assignment: one(assignments, {
    fields: [questions.assignmentId],
    references: [assignments.id],
  }),
}));
