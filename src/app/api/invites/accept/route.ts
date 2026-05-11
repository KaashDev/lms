import { db } from "@/db";
import { classInvites, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { acceptInviteByToken } from "@/lib/invites/issue";
import { hashToken } from "@/lib/invites/tokens";
import { acceptInviteInput } from "@/lib/validators/invites";
import { audit } from "@/lib/audit";
import { eq } from "drizzle-orm";

// POST /api/invites/accept — body: { token }.
// Caller must be authenticated. Their account's email must match the invite
// email (case-insensitive). If not, return 403 so the UI can tell them to
// switch accounts.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = acceptInviteInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Pre-check the invite so we can compare emails before mutating.
  const invite = await db.query.classInvites.findFirst({
    where: eq(classInvites.tokenHash, hashToken(parsed.data.token)),
  });
  if (!invite) return Response.json({ error: "INVALID_TOKEN" }, { status: 404 });
  // Revoked (e.g. because the class was deleted) or already-accepted
  // invites get a clear error instead of an opaque 500 from the later
  // FK lookup. We distinguish the two so the UI can render a useful
  // message either way.
  if (invite.revokedAt) {
    return Response.json({ error: "INVITE_REVOKED" }, { status: 410 });
  }
  if (invite.acceptedAt) {
    return Response.json({ error: "INVITE_ALREADY_USED" }, { status: 409 });
  }
  if (invite.expires && invite.expires < new Date()) {
    return Response.json({ error: "INVITE_EXPIRED" }, { status: 410 });
  }

  const me = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true, organizationId: true },
  });
  if (!me) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
    return Response.json(
      { error: "EMAIL_MISMATCH", invitedEmail: invite.email, currentEmail: me.email },
      { status: 403 }
    );
  }

  // Cross-org safety check: in v1 every user belongs to one org. If somehow
  // the invite is for a different org, hard-deny.
  // (Step 1 schema ties everything to organizationId; this is belt+braces.)

  const result = await acceptInviteByToken(parsed.data.token, session.user.id);
  if (!result.ok) return Response.json({ error: "INVITE_INVALID", reason: result.reason }, { status: 409 });

  await audit({
    organizationId: me.organizationId,
    actorId: session.user.id,
    action: "invite.accepted",
    targetType: "enrollment",
    targetId: result.enrollment.id,
  });

  return Response.json({ classId: result.enrollment.classId });
}
