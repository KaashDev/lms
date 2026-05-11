import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getSubmissionForCaller } from "@/lib/auth/assignment-access";
import { signedDownloadUrl } from "@/lib/storage/blob";
import { eq } from "drizzle-orm";

// GET /api/attachments/:attachmentId/download
// Returns a 302 to a short-lived signed URL. Auth gate verifies the
// caller has access to the parent submission (teacher of class, or the
// student who owns it).
//
// We don't proxy the file bytes through the app — that wastes Railway
// egress AND blocks the Next request. R2's signed URL works for 5 minutes
// then expires; that's plenty for a click + download.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ attachmentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { attachmentId } = await ctx.params;

  const att = await db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
  });
  if (!att) return new Response("Not found", { status: 404 });

  // An attachment is either submission-bound or assignment-instructions-bound.
  // Step 3a only creates submission attachments, but the schema supports both.
  if (att.submissionId) {
    const access = await getSubmissionForCaller(att.submissionId, session.user);
    if (!access) return new Response("Not found", { status: 404 });
  } else {
    // Step 3a doesn't create these. Reject for now; step 3c+ may revisit.
    return new Response("Not found", { status: 404 });
  }

  let url: string;
  try {
    url = await signedDownloadUrl(att.storageKey, 300);
  } catch (err) {
    console.error("[attachment download] signing failed:", err);
    return new Response("Storage error", { status: 502 });
  }

  return Response.redirect(url, 302);
}
