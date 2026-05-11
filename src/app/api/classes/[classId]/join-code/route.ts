import { db } from "@/db";
import { classes } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { generateJoinCode } from "@/lib/invites/tokens";
import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

export async function POST(_req: Request, ctx: { params: Promise<{ classId: string }> }) {
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

  let joinCode = generateJoinCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.query.classes.findFirst({
      where: and(
        eq(classes.organizationId, session.user.organizationId),
        eq(classes.joinCode, joinCode)
      ),
      columns: { id: true },
    });
    if (!clash) break;
    joinCode = generateJoinCode();
  }

  const [updated] = await db
    .update(classes)
    .set({ joinCode, updatedAt: new Date() })
    .where(eq(classes.id, classId))
    .returning({ id: classes.id, joinCode: classes.joinCode });

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "class.join_code_regenerated",
    targetType: "class",
    targetId: classId,
  });

  return Response.json({ joinCode: updated.joinCode });
}
