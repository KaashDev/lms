import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { organizations, users } from "./auth";

export const enrollmentRole = pgEnum("enrollment_role", ["STUDENT", "TA"]);
export const enrollmentStatus = pgEnum("enrollment_status", [
  "ACTIVE",
  "DEACTIVATED", // kept in class for history, can't submit
  "REMOVED", // soft-removed, restorable
]);

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    // The teacher of record. Co-teachers/TAs go in enrollments.
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    title: text("title").notNull(),
    term: text("term"), // e.g. "Fall 2026" — free text on purpose
    description: text("description"),
    // Tiptap stores rich text as JSON. Storing the doc directly is cleaner
    // than HTML for editing round-trips and is safe from XSS-by-serialization.
    syllabus: jsonb("syllabus"),

    // Banner: store either a hex color OR a blob URL; the UI picks based on
    // which is set. Two columns beats a discriminated union here.
    bannerColor: text("banner_color"), // e.g. "#4f46e5"
    bannerImageUrl: text("banner_image_url"),

    // Class-level timezone overrides user/org for due date display.
    timezone: text("timezone"),

    // Letter grade scheme — array of {minPercent, letter}. JSON because the
    // scheme is small, never queried server-side, and varies wildly per class.
    // e.g. [{"min":90,"letter":"A"},{"min":80,"letter":"B"}, ...]
    gradeScheme: jsonb("grade_scheme"),

    // Join code: short, human-typable, regenerable. Unique within the org so
    // we don't collide across teachers.
    joinCode: text("join_code"),
    joinCodeEnabled: text("join_code_enabled").notNull().default("true"),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    teacherIdx: index("classes_teacher_idx").on(t.teacherId),
    joinCodeIdx: uniqueIndex("classes_join_code_idx").on(t.organizationId, t.joinCode),
    orgIdx: index("classes_org_idx").on(t.organizationId),
  })
);

// Many-to-many: a student can be in many classes, a class has many students.
// Also where TAs live. Teacher of record stays on classes.teacherId because
// querying "my classes" is far more common than "all roles in this class."
export const enrollments = pgTable(
  "enrollments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: enrollmentRole("role").notNull().default("STUDENT"),
    status: enrollmentStatus("status").notNull().default("ACTIVE"),

    // Teacher-only notes about this student in this class. Not visible to
    // the student under any circumstance. API routes must filter this out
    // before returning to STUDENT-role callers.
    teacherNotes: text("teacher_notes"),

    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    classUserIdx: uniqueIndex("enrollments_class_user_idx").on(t.classId, t.userId),
    userIdx: index("enrollments_user_idx").on(t.userId),
    classIdx: index("enrollments_class_idx").on(t.classId),
  })
);

// Pending invitations sent by email. Once accepted, an enrollment row is
// created and the invite is marked accepted. Separate table because invites
// have lifecycle independent of any user row (invitee may not exist yet).
export const classInvites = pgTable(
  "class_invites",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: enrollmentRole("role").notNull().default("STUDENT"),
    // Hashed token — raw token only ever appears in the email link.
    tokenHash: text("token_hash").notNull(),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("class_invites_token_idx").on(t.tokenHash),
    classEmailIdx: index("class_invites_class_email_idx").on(t.classId, t.email),
  })
);

export const classesRelations = relations(classes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [classes.organizationId],
    references: [organizations.id],
  }),
  teacher: one(users, {
    fields: [classes.teacherId],
    references: [users.id],
  }),
  enrollments: many(enrollments),
  invites: many(classInvites),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  class: one(classes, { fields: [enrollments.classId], references: [classes.id] }),
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
}));
