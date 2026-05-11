import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { classInvites, classes, users } from "@/db/schema";
import { hashToken } from "@/lib/invites/tokens";
import { eq } from "drizzle-orm";
import { InviteAcceptForm } from "@/components/forms/invite-accept-form";

// Server component. Resolves the invite, then either:
//   - Anonymous: redirect to /register?token=... (pre-fill email)
//   - Authed with matching email: render an accept button
//   - Authed with different email: show "switch account" message
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/login");

  const invite = await db.query.classInvites.findFirst({
    where: eq(classInvites.tokenHash, hashToken(token)),
  });

  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expires < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-3xl mb-2">Invite unavailable</h1>
          <p className="text-muted text-sm">
            This invitation link is invalid or has expired. Ask your teacher to send a new one.
          </p>
        </div>
      </main>
    );
  }

  const cls = await db.query.classes.findFirst({
    where: eq(classes.id, invite.classId),
    columns: { title: true, term: true },
  });

  const session = await auth();

  if (!session?.user) {
    // Not authed → registration flow (we pass the token + email along).
    redirect(`/register?token=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`);
  }

  // Authed. Email match?
  const me = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true },
  });

  if (!me || me.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-3xl mb-2">Wrong account</h1>
          <p className="text-muted text-sm">
            This invite was sent to <strong className="text-fg">{invite.email}</strong>, but
            you're signed in as <strong className="text-fg">{me?.email}</strong>. Sign out and
            sign in with the right email, then click the invite link again.
          </p>
          <p className="mt-6">
            <a href="/api/auth/signout" className="text-accent hover:underline text-sm">
              Sign out
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-display text-3xl mb-2">Join {cls?.title ?? "this class"}</h1>
        {cls?.term ? <p className="text-muted text-sm mb-6">{cls.term}</p> : null}
        <InviteAcceptForm token={token} />
      </div>
    </main>
  );
}
