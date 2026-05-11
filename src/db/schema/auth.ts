import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Roles are global to the user within an org. A user can teach in one place
// and study in another later, but for v1 a user has one role inside one org.
export const userRole = pgEnum("user_role", ["TEACHER", "TA", "STUDENT"]);

// Single-tenant today, but every domain row carries organizationId so the
// inevitable "can you make one for my colleague" never requires a migration.
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  // Default timezone for classes created in this org. Individual users and
  // classes can override. All timestamps stored UTC; this only affects display.
  defaultTimezone: text("default_timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Auth.js requires specific column names on `users`, `accounts`, `sessions`,
// `verificationTokens`. We extend `users` with our app fields. Adapter docs:
// https://authjs.dev/reference/adapter/drizzle
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),

    // Auth.js standard fields
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),

    // App fields
    role: userRole("role").notNull().default("STUDENT"),
    // Argon2id hash. Null for users who only auth via magic link / OAuth.
    // We never store plaintext, never log this column.
    passwordHash: text("password_hash"),
    // Bumped on password change, force-logout, or compromised-account
    // recovery. Live JWTs whose `tv` claim doesn't match the user's
    // current tokenVersion are rejected by the session callback.
    // Default 0 so existing users don't need a backfill.
    tokenVersion: integer("token_version").notNull().default(0),
    timezone: text("timezone"), // optional override of org default
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    // Soft-deactivate without losing submissions. Different from deletedAt
    // (which is the 30-day-restore-window soft delete).
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Email is unique *within an org*, not globally — a parent might appear
    // under two teachers eventually. The case-insensitive index avoids the
    // classic "Alice@x.com vs alice@x.com" duplicate-account bug.
    emailOrgIdx: uniqueIndex("users_email_org_idx").on(t.organizationId, t.email),
    orgIdx: index("users_org_idx").on(t.organizationId),
  })
);

// Per-user notification preferences. One row per user, created on signup.
// Kept separate from users so the column count there stays sane.
export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailOnNewAssignment: boolean("email_on_new_assignment").notNull().default(true),
  emailOnGradePosted: boolean("email_on_grade_posted").notNull().default(true),
  emailOnNewComment: boolean("email_on_new_comment").notNull().default(true),
  emailOnNewAnnouncement: boolean("email_on_new_announcement").notNull().default(true),
  emailOnNewMessage: boolean("email_on_new_message").notNull().default(true),
});

// ---------- Auth.js adapter tables ----------
// These match the shape the Drizzle adapter expects. Don't rename columns.

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// Password reset tokens. Separate from verificationTokens because Auth.js
// owns that table for magic links and we don't want to fight its cleanup.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    // Hashed token — we never store the raw value. User receives raw in email.
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("password_reset_user_idx").on(t.userId),
  })
);

// ---------- Relations (for Drizzle's query API) ----------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
  notificationPreferences: one(notificationPreferences, {
    fields: [users.id],
    references: [notificationPreferences.userId],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
