import { db } from "@/db";
import { classes, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { inviteBulkInput } from "@/lib/validators/invites";
import { issueInvite, type IssueInviteResult } from "@/lib/invites/issue";
import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

// POST: bulk invite. Accepts up to 200 invites in one request (Zod-enforced).
// We process serially to avoid hammering Resend's rate limit (1 req/s on the
// free tier, 10 req/s on pro). 200 invites at 1/s = 3.3min worst case —
// still well under Railway's no-timeout deploy, but we do return progress
// in the response shape so the UI can show per-row status.
export async function POST(req: Request, ctx: { params: Promise<{ classId: string }> }) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { classId } = await ctx.params;

  const cls = await db.query.classes.findFirst({
    where: and(
      eq(classes.id, classId),
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId)
    ),
  });
  if (!cls) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = inviteBulkInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  const teacher = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { name: true, email: true },
  });
  const teacherName = teacher?.name ?? teacher?.email ?? "Your teacher";

  const results: IssueInviteResult[] = [];

  // Serial processing with small inter-invite delay to respect free-tier
  // Resend limits. If a teacher hits this with 200 students we accept the
  // latency rather than risk getting throttled.
  for (const inv of parsed.data.invites) {
    try {
      const result = await issueInvite({
        classId,
        email: inv.email,
        name: inv.name ?? null,
        role: inv.role,
        invitedById: session.user.id,
        organizationId: session.user.organizationId,
        teacherName,
        classTitle: cls.title,
      });
      results.push(result);
    } catch (err) {
      results.push({ kind: "error", email: inv.email, message: String(err) });
    }
    // Tiny pacing — 100ms between sends. Helps with shared IP reputation too.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const summary = {
    invited: results.filter((r) => r.kind === "invited").length,
    alreadyEnrolled: results.filter((r) => r.kind === "already_enrolled").length,
    alreadyInvited: results.filter((r) => r.kind === "already_invited").length,
    errors: results.filter((r) => r.kind === "error").length,
  };

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "invite.bulk_issued",
    targetType: "class",
    targetId: classId,
    metadata: { count: parsed.data.invites.length, ...summary },
  });

  return Response.json({ results, summary }, { status: 201 });
}
