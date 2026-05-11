import { escapeHtml } from "./send";

interface InviteEmailArgs {
  classTitle: string;
  teacherName: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function inviteEmail(args: InviteEmailArgs) {
  const { classTitle, teacherName, acceptUrl, expiresInDays } = args;
  const t = escapeHtml(classTitle);
  const n = escapeHtml(teacherName);

  const text =
    `${teacherName} invited you to join ${classTitle}.\n\n` +
    `Accept here: ${acceptUrl}\n\n` +
    `This link expires in ${expiresInDays} days.\n\n` +
    `If you weren't expecting this, ignore the email.`;

  // Plain, readable HTML. Inline styles only — most email clients ignore
  // <style> tags. Keep it under ~10kb for Gmail's clipping threshold.
  const html = `<!doctype html>
<html lang="en"><body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.55; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">You're invited to ${t}</h1>
  <p>${n} added you to a class on their learning platform.</p>
  <p style="margin: 24px 0;">
    <a href="${acceptUrl}" style="display: inline-block; background: #0f766e; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Accept invitation</a>
  </p>
  <p style="color: #64646a; font-size: 14px;">Or paste this link into your browser:<br>${acceptUrl}</p>
  <p style="color: #64646a; font-size: 14px;">This invitation expires in ${expiresInDays} days. If you weren't expecting this email, you can safely ignore it.</p>
</body></html>`;

  return {
    subject: `You're invited to ${classTitle}`,
    text,
    html,
  };
}

interface PasswordResetEmailArgs {
  resetUrl: string;
  expiresInMinutes: number;
}

export function passwordResetEmail(args: PasswordResetEmailArgs) {
  const text =
    `Reset your password using this link:\n\n${args.resetUrl}\n\n` +
    `This link expires in ${args.expiresInMinutes} minutes.\n\n` +
    `If you didn't request a reset, ignore this email — your password is unchanged.`;

  const html = `<!doctype html>
<html lang="en"><body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.55; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Reset your password</h1>
  <p>Click the link below to choose a new password.</p>
  <p style="margin: 24px 0;">
    <a href="${args.resetUrl}" style="display: inline-block; background: #0f766e; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Reset password</a>
  </p>
  <p style="color: #64646a; font-size: 14px;">Or paste this link into your browser:<br>${args.resetUrl}</p>
  <p style="color: #64646a; font-size: 14px;">This link expires in ${args.expiresInMinutes} minutes. If you didn't ask to reset your password, you can ignore this email.</p>
</body></html>`;

  return {
    subject: "Reset your password",
    text,
    html,
  };
}
