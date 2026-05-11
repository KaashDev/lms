import { db } from "@/db";
import { classes, enrollments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { createClassInput, listClassesInput } from "@/lib/validators/classes";
import { generateJoinCode } from "@/lib/invites/tokens";
import { audit } from "@/lib/audit";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

// GET /api/classes — list classes the caller can see.
// Teachers see their own classes; students see classes they're enrolled in.
export async function GET(req: Request) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;

  const url = new URL(req.url);
  const params = listClassesInput.safeParse({
    includeArchived: url.searchParams.get("includeArchived") ?? "false",
    includeDeleted: url.searchParams.get("includeDeleted") ?? "false",
  });
  if (!params.success) {
    return Response.json({ error: "BAD_REQUEST", issues: params.error.flatten() }, { status: 400 });
  }

  const showDeleted = params.data.includeDeleted && session.user.role === "TEACHER";

  if (session.user.role === "TEACHER") {
    const where = and(
      eq(classes.teacherId, session.user.id),
      eq(classes.organizationId, session.user.organizationId),
      showDeleted ? undefined : isNull(classes.deletedAt),
      params.data.includeArchived ? undefined : isNull(classes.archivedAt)
    );
    const rows = await db.query.classes.findMany({
      where,
      orderBy: [desc(classes.updatedAt)],
    });
    return Response.json({ classes: rows });
  }

  // Student/TA: classes they're enrolled in (active enrollments only).
  const enrolled = await db
    .select({ classId: enrollments.classId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, session.user.id),
        eq(enrollments.status, "ACTIVE"),
        isNull(enrollments.deletedAt)
      )
    );
  const classIds = enrolled.map((e) => e.classId);
  if (classIds.length === 0) return Response.json({ classes: [] });

  const rows = await db.query.classes.findMany({
    where: and(
      inArray(classes.id, classIds),
      isNull(classes.deletedAt),
      params.data.includeArchived ? undefined : isNull(classes.archivedAt)
    ),
    orderBy: [desc(classes.updatedAt)],
  });
  return Response.json({ classes: rows });
}

// POST /api/classes — create a class. Teachers only.
export async function POST(req: Request) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;

  const body = await req.json().catch(() => null);
  const parsed = createClassInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Generate a unique join code. Collisions are astronomically unlikely
  // (~32^8) but we retry a few times just in case.
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

  const [created] = await db
    .insert(classes)
    .values({
      organizationId: session.user.organizationId,
      teacherId: session.user.id,
      title: parsed.data.title,
      term: parsed.data.term ?? null,
      description: parsed.data.description ?? null,
      bannerColor: parsed.data.bannerColor ?? "#0f766e",
      timezone: parsed.data.timezone ?? null,
      joinCode,
    })
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "class.created",
    targetType: "class",
    targetId: created.id,
    metadata: { title: created.title },
  });

  return Response.json({ class: created }, { status: 201 });
}
