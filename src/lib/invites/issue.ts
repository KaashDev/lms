import { db } from "@/db";
import { classes, classInvites, enrollments, users, notificationPreferences } from "@/db/schema";
import { generateInviteToken, inviteExpiry, INVITE_TTL_DAYS } from "./tokens";
import { sendEmail } from "@/lib/email/send";
import { inviteEmail } from "@/lib/email/templates";
import { and, eq, isNull } from "drizzle-orm";

interface IssueInviteArgs {
  classId: string;
  email: string;
  name: string | null;
  role: "STUDENT" | "TA";
  invitedById: string;
  organizationId: string;
  teacherName: string;
  classTitle: string;
}

export type IssueInviteResult =
  | { kind: "invited"; email: string; inviteId: string }
  | { kind: "already_enrolled"; email: string }
  | { kind: "already_invited"; email: string; inviteId: string }
  | { kind: "error"; email: string; message: string };

// Issues one invite. Idempotent-ish:
//   - If a user with this email is already enrolled (any non-removed status):
//     skip and report.
//   - If a non-expired pending invite exists: return it (don't duplicate).
//   - If the user already exists in this org as a STUDENT but isn't enrolled
//     here: create an enrollment directly, no email needed. They can sign in
//     and see the class in their dashboard.
//   - Otherwise create a fresh invite row and email it.
export async function issueInvite(args: IssueInviteArgs): Promise<IssueInviteResult> {
  const email = args.email.toLowerCase().trim();

  // 1. Existing user in this org?
  const existing = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.organizationId, args.organizationId)),
  });

  if (existing) {
    // Check current enrollment in this class.
    const enrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.userId, existing.id), eq(enrollments.classId, args.classId)),
    });

    if (enrollment && enrollment.status === "ACTIVE" && !enrollment.deletedAt) {
      return { kind: "already_enrolled", email };
    }
    if (enrollment && enrollment.status === "REMOVED") {
      // Re-activate rather than creating a duplicate row — keeps history.
      await db
        .update(enrollments)
        .set({ status: "ACTIVE", deletedAt: null })
        .where(eq(enrollments.id, enrollment.id));
      return { kind: "invited", email, inviteId: enrollment.id };
    }
    if (!enrollment) {
      // Existing user, fresh enrollment. Skip the email — they're already
      // an account holder and can see the class on next login.
      await db.insert(enrollments).values({
        classId: args.classId,
        userId: existing.id,
        role: args.role,
        status: "ACTIVE",
      });
      return { kind: "invited", email, inviteId: existing.id };
    }
    // DEACTIVATED: leave them; teacher should explicitly reactivate.
    return { kind: "error", email, message: "Student is deactivated in this class" };
  }

  // 2. Pending invite already?
  const pending = await db.query.classInvites.findFirst({
    where: and(
      eq(classInvites.classId, args.classId),
      eq(classInvites.email, email),
      isNull(classInvites.acceptedAt),
      isNull(classInvites.revokedAt)
    ),
  });

  if (pending && pending.expires > new Date()) {
    return { kind: "already_invited", email, inviteId: pending.id };
  }

  // 3. Fresh invite.
  const { raw, hash } = generateInviteToken();

  const [invite] = await db
    .insert(classInvites)
    .values({
      classId: args.classId,
      email,
      role: args.role,
      tokenHash: hash,
      invitedById: args.invitedById,
      expires: inviteExpiry(),
    })
    .returning();

  // Send the email. AUTH_URL is the public origin.
  const acceptUrl = `${process.env.AUTH_URL}/invite?token=${encodeURIComponent(raw)}`;
  const tmpl = inviteEmail({
    classTitle: args.classTitle,
    teacherName: args.teacherName,
    acceptUrl,
    expiresInDays: INVITE_TTL_DAYS,
  });

  try {
    await sendEmail({ to: email, ...tmpl });
  } catch (err) {
    // Email failed — leave the invite in the DB so the teacher can
    // resend or copy the link from the UI later.
    console.error("[invite] email failed for", email, err);
    return { kind: "error", email, message: "Invite saved, but email failed to send" };
  }

  return { kind: "invited", email, inviteId: invite.id };
}

// Accept an invite. Used by both the invite-link landing page and the
// password-registration flow. Returns the newly-created or reactivated
// enrollment.
export async function acceptInviteByToken(
  rawToken: string,
  acceptingUserId: string
): Promise<{ ok: true; enrollment: typeof enrollments.$inferSelect } | { ok: false; reason: string }> {
  const { hashToken } = await import("./tokens");
  const hash = hashToken(rawToken);

  const invite = await db.query.classInvites.findFirst({
    where: eq(classInvites.tokenHash, hash),
  });

  if (!invite) return { ok: false, reason: "Invite not found" };
  if (invite.acceptedAt) return { ok: false, reason: "Invite already used" };
  if (invite.revokedAt) return { ok: false, reason: "Invite was revoked" };
  if (invite.expires < new Date()) return { ok: false, reason: "Invite expired" };

  // Idempotent enrollment: if a row already exists for this user/class
  // (e.g. teacher re-invited), reactivate; else insert.
  const existing = await db.query.enrollments.findFirst({
    where: and(eq(enrollments.classId, invite.classId), eq(enrollments.userId, acceptingUserId)),
  });

  let enrollment: typeof enrollments.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(enrollments)
      .set({ status: "ACTIVE", deletedAt: null, role: invite.role })
      .where(eq(enrollments.id, existing.id))
      .returning();
    enrollment = updated;
  } else {
    const [inserted] = await db
      .insert(enrollments)
      .values({
        classId: invite.classId,
        userId: acceptingUserId,
        role: invite.role,
        status: "ACTIVE",
      })
      .returning();
    enrollment = inserted;
  }

  await db
    .update(classInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(classInvites.id, invite.id));

  return { ok: true, enrollment };
}
