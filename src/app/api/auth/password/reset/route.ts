import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { generateInviteToken } from "@/lib/invites/tokens";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { eq } from "drizzle-orm";

const requestResetInput = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const RESET_TTL_MINUTES = 30;

// POST /api/auth/password/reset — request a reset email.
// Always returns 200 to prevent email enumeration. The actual sending only
// happens if the email is on file. Heavily rate-limited.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ok = await checkRateLimit(`pwreset:${ip}`, 5, 300);
  if (!ok) {
    // Still respond 200 — telling attackers "rate limited" leaks signal.
    return Response.json({ ok: true });
  }

  const body = await req.json().catch(() => null);
  const parsed = requestResetInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: true });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
    columns: { id: true, email: true, organizationId: true },
  });

  if (user) {
    const { raw, hash } = generateInviteToken();
    await db.insert(passwordResetTokens).values({
      tokenHash: hash,
      userId: user.id,
      expires: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    });

    const resetUrl = `${process.env.AUTH_URL}/login/reset/confirm?token=${encodeURIComponent(raw)}`;
    const tmpl = passwordResetEmail({ resetUrl, expiresInMinutes: RESET_TTL_MINUTES });
    try {
      await sendEmail({ to: user.email, ...tmpl });
    } catch (err) {
      console.error("[pwreset] email failed:", err);
    }

    await audit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "password.reset_requested",
      targetType: "user",
      targetId: user.id,
    });
  }

  return Response.json({ ok: true });
}
