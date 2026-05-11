import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  index,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { classes } from "./classes";
import { users } from "./auth";

// ---------- Announcements ----------
export const announcements = pgTable(
  "announcements",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: jsonb("body").notNull(), // Tiptap
    pinned: boolean("pinned").notNull().default(false),
    emailOnPublish: boolean("email_on_publish").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    classIdx: index("announcements_class_idx").on(t.classId),
  })
);

// ---------- Direct messages ----------
// A "conversation" is a thread between 2+ users (1:1 or whole-class).
// Whole-class messages create a conversation with all enrolled students +
// the teacher as participants. Cheap, and means "reply" works the same way.
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  // Null if cross-class (rare). When set, used to scope auth.
  classId: text("class_id").references(() => classes.id, { onDelete: "cascade" }),
  subject: text("subject"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => ({
    pk: uniqueIndex("conversation_participants_pk").on(t.conversationId, t.userId),
    userIdx: index("conversation_participants_user_idx").on(t.userId),
  })
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  })
);

// ---------- Audit log ----------
// Append-only. Never updated, never deleted (except by org-level data-purge).
// Stored as JSON-rich rows because action shapes vary too much for a strict
// schema, but we keep actor/target/action as columns so SQL queries work.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "grade.changed", "submission.deleted"
    targetType: text("target_type"), // "submission", "assignment", "user", ...
    targetId: text("target_id"),
    // Before/after diff for changes. {before: {...}, after: {...}}
    diff: jsonb("diff"),
    // Extra context — IP, user agent, override reason, etc.
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("audit_log_org_idx").on(t.organizationId, t.occurredAt),
    targetIdx: index("audit_log_target_idx").on(t.targetType, t.targetId),
  })
);

// ---------- Background jobs ----------
// Simple polling queue. A separate Railway worker process (or the web process
// on a cron) claims jobs by id with FOR UPDATE SKIP LOCKED. Boring, robust,
// and avoids adding a queue vendor on day one. If volume ever justifies it
// we swap in something fancier without changing call sites.
export const jobStatus = pgEnum("job_status", [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id"),
    // e.g. "qti.import", "imscc.import", "class.export", "submissions.zip"
    kind: text("kind").notNull(),
    status: jobStatus("status").notNull().default("PENDING"),
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Worker query: pending + due, oldest first.
    claimIdx: index("jobs_claim_idx").on(t.status, t.runAfter),
  })
);
