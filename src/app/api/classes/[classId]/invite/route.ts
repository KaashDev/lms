import { db } from "@/db";
import { classes, classInvites, users } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { inviteOneInput } from "@/lib/validators/invites";
import { issueInvite } from "@/lib/invites/issue";
import { audit } from "@/lib/audit";
import { and, eq, isNull, desc } from "drizzle-orm";

// GET: list pending invites for a class.
export async function GET(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
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
    columns: { id: true },
  });
  if (!cls) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const invites = await db.query.classInvites.findMany({
    where: and(
      eq(classInvites.classId, classId),
      isNull(classInvites.acceptedAt),
      isNull(classInvites.revokedAt)
    ),
    orderBy: [desc(classInvites.createdAt)],
  });

  // Only return non-sensitive fields. Never expose tokenHash.
  return Response.json({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expires: i.expires,
      createdAt: i.createdAt,
    })),
  });
}

// POST: invite one person.
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
  const parsed = inviteOneInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Look up the teacher's display name for the email greeting.
  const teacher = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { name: true, email: true },
  });

  const result = await issueInvite({
    classId,
    email: parsed.data.email,
    name: parsed.data.name ?? null,
    role: parsed.data.role,
    invitedById: session.user.id,
    organizationId: session.user.organizationId,
    teacherName: teacher?.name ?? teacher?.email ?? "Your teacher",
    classTitle: cls.title,
  });

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "invite.issued",
    targetType: "class",
    targetId: classId,
    metadata: { email: parsed.data.email, result: result.kind },
  });

  return Response.json({ result }, { status: 201 });
}
