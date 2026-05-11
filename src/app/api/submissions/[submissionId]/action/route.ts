import { db } from "@/db";
import { submissions } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { submissionActionInput } from "@/lib/validators/grading";
import { audit } from "@/lib/audit";
import { eq } from "drizzle-orm";

// POST /api/submissions/:submissionId/action
// Teacher-only state transitions on a submission.
//
//   RETURN   → status = RETURNED. Posts grade (if any). Locks editing.
//   MISSING  → status = MISSING. Used for un-submitted assignments.
//   EXCUSE   → status = EXCUSED. Excluded from gradebook math.
//   REOPEN   → status = IN_PROGRESS. Clears submittedAt + postedAt. Unlocks.
//
// We don't do partial transitions ("RETURN but don't post"). RETURN is the
// teacher saying "I'm done with this and the student should see it."
export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> }
) {
  const r = await requireSessionApi({ role: "TEACHER" });
  if (r instanceof Response) return r;
  const { session } = r;
  const { submissionId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = submissionActionInput.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const access = await getSubmissionForCaller(submissionId, session.user);
  if (!access || access.kind !== "teacher") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const sub = access.submission;
  const update: Record<string, unknown> = { updatedAt: now };

  switch (parsed.data.action) {
    case "RETURN": {
      // RETURN before any submission exists is weird. Allow it anyway —
      // teachers sometimes "return" a missing assignment with feedback
      // "please complete this".
      update.status = "RETURNED";
      update.postedAt = now;
      break;
    }
    case "MISSING": {
      // Don't overwrite a real submission. If the student submitted (and
      // potentially LATE), MISSING doesn't apply — refuse.
      if (
        sub.status === "SUBMITTED" ||
        sub.status === "LATE" ||
        sub.status === "RETURNED"
      ) {
        return Response.json(
          { error: "INVALID_TRANSITION", message: "Cannot mark a submitted assignment as missing." },
          { status: 409 }
        );
      }
      update.status = "MISSING";
      // No submittedAt — student didn't submit.
      break;
    }
    case "EXCUSE": {
      update.status = "EXCUSED";
      // Excused doesn't clear an existing score; teacher might want to keep
      // it for the record. Gradebook math (step 5) will exclude EXCUSED.
      break;
    }
    case "REOPEN": {
      // Reset to IN_PROGRESS (or NOT_STARTED if there's no body/attachments).
      // For simplicity we always send back to IN_PROGRESS — student picks up
      // where they left off. They can blank everything if they want.
      update.status = "IN_PROGRESS";
      update.submittedAt = null;
      update.postedAt = null;
      break;
    }
  }

  const [updated] = await db
    .update(submissions)
    .set(update)
    .where(eq(submissions.id, submissionId))
    .returning();

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: `submission.${parsed.data.action.toLowerCase()}`,
    targetType: "submission",
    targetId: submissionId,
    diff: { before: { status: sub.status }, after: { status: updated.status } },
  });

  return Response.json({ submission: updated });
}
