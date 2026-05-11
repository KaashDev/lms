import { db } from "@/db";
import { classes, classInvites, users, notificationPreferences } from "@/db/schema";
import { registerWithPasswordInput } from "@/lib/validators/invites";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/invites/tokens";
import { acceptInviteByToken } from "@/lib/invites/issue";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { and, eq, isNull } from "drizzle-orm";

// POST /api/auth/register
// Creates a user account + enrolls them. Requires either an invite token
// (preferred — proves the email belongs to them) or a join code.
//
// Note: when registering via join code only, we still need *some* email
// validation. We mark emailVerified=null so the user can't access protected
// features until they complete an email verification (sent on first login).
// Step 6's notification system will reuse that flow.
export async function POST(req: Request) {
  // Aggressive rate limit: 5 attempts per IP per 5 minutes. Account creation
  // is expensive (argon2 hash + email + enrollment) so this is mostly to
  // stop accidental form double-submits, not adversaries.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ok = await checkRateLimit(`register:${ip}`, 5, 300);
  if (!ok) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = registerWithPasswordInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve the target org + (optionally) the invite.
  let organizationId: string;
  let inviteEmail: string | null = null;
  let inviteClassId: string | null = null;
  let inviteRole: "STUDENT" | "TA" = "STUDENT";

  if (parsed.data.inviteToken) {
    const invite = await db.query.classInvites.findFirst({
      where: eq(classInvites.tokenHash, hashToken(parsed.data.inviteToken)),
    });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expires < new Date()) {
      return Response.json({ error: "INVITE_INVALID" }, { status: 400 });
    }
    // Email in body must match the invite's email — prevents an attacker
    // who got hold of a token from registering under a different identity.
    if (parsed.data.email.toLowerCase() !== invite.email.toLowerCase()) {
      return Response.json({ error: "EMAIL_MISMATCH" }, { status: 400 });
    }
    const cls = await db.query.classes.findFirst({
      where: eq(classes.id, invite.classId),
      columns: { organizationId: true, id: true },
    });
    if (!cls) return Response.json({ error: "INVITE_INVALID" }, { status: 400 });
    organizationId = cls.organizationId;
    inviteEmail = invite.email;
    inviteClassId = cls.id;
    inviteRole = invite.role as "STUDENT" | "TA";
  } else if (parsed.data.joinCode) {
    // For join-code path we have to look the class up. There's a small
    // chicken-and-egg here: classes scope by org, but we don't know which
    // org yet. We accept that join codes are unique across the whole DB at
    // registration time (the chance of collision across orgs is ~1 in 32^8).
    const cls = await db.query.classes.findFirst({
      where: and(eq(classes.joinCode, parsed.data.joinCode), isNull(classes.deletedAt)),
      columns: { organizationId: true },
    });
    if (!cls) return Response.json({ error: "INVALID_CODE" }, { status: 400 });
    organizationId = cls.organizationId;
  } else {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  // Reject if email already exists in this org. Magic-link auth would let
  // them sign in instead — point them to the login page.
  const existing = await db.query.users.findFirst({
    where: and(
      eq(users.email, parsed.data.email),
      eq(users.organizationId, organizationId)
    ),
    columns: { id: true },
  });
  if (existing) {
    return Response.json({ error: "EMAIL_TAKEN" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const [created] = await db
    .insert(users)
    .values({
      organizationId,
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: "STUDENT",
      // Email is considered verified only if they came through an invite
      // token (we know we delivered the link to that address).
      emailVerified: inviteEmail ? new Date() : null,
    })
    .returning();

  await db.insert(notificationPreferences).values({ userId: created.id });

  // If invite token: accept it now. If join code only: nothing to accept
  // here, the client will follow up with POST /api/join after sign-in.
  if (parsed.data.inviteToken) {
    await acceptInviteByToken(parsed.data.inviteToken, created.id);
  }

  await audit({
    organizationId,
    actorId: created.id,
    action: "user.registered",
    targetType: "user",
    targetId: created.id,
    metadata: { via: parsed.data.inviteToken ? "invite" : "join_code" },
  });

  return Response.json({ userId: created.id, classId: inviteClassId }, { status: 201 });
}
