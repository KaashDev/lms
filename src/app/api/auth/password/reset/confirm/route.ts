import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/invites/tokens";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

const confirmInput = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(10).max(200),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = confirmInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const token = await db.query.passwordResetTokens.findFirst({
    where: and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.consumedAt)),
  });

  if (!token || token.expires < new Date()) {
    return Response.json({ error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Atomic: update password + consume token.
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, token.userId));
  await db
    .update(passwordResetTokens)
    .set({ consumedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, tokenHash));

  const user = await db.query.users.findFirst({
    where: eq(users.id, token.userId),
    columns: { organizationId: true },
  });

  if (user) {
    await audit({
      organizationId: user.organizationId,
      actorId: token.userId,
      action: "password.reset_completed",
      targetType: "user",
      targetId: token.userId,
    });
  }

  return Response.json({ ok: true });
}
