import { db } from "@/db";
import { submissions, attachments } from "@/db/schema";
import { requireSessionApi } from "@/lib/auth/guards";
import { getAssignmentForStudent } from "@/lib/auth/assignment-access";
import {
  putObject,
  submissionAttachmentKey,
  detectFileType,
  ALLOWED_SUBMISSION_TYPES,
  MAX_SUBMISSION_BYTES,
} from "@/lib/storage/blob";
import { audit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

// POST /api/assignments/:id/uploads
// Multipart form upload from the student's submission page.
// Body: { submissionId: string, file: File }
//
// We validate type by BOTH the MIME header and the magic-byte sniff.
// Reject anything that isn't PDF or DOCX, per the agreed spec.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ assignmentId: string }> }
) {
  const r = await requireSessionApi();
  if (r instanceof Response) return r;
  const { session } = r;
  const { assignmentId } = await ctx.params;

  if (session.user.role === "TEACHER") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const access = await getAssignmentForStudent(assignmentId, session.user);
  if (!access) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!access.assignment.allowFileUpload) {
    return Response.json({ error: "FILE_UPLOAD_DISABLED" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const submissionId = form.get("submissionId");
  const file = form.get("file");

  if (typeof submissionId !== "string" || !(file instanceof File)) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (file.size > MAX_SUBMISSION_BYTES) {
    return Response.json(
      { error: "FILE_TOO_LARGE", maxBytes: MAX_SUBMISSION_BYTES },
      { status: 413 }
    );
  }

  if (!ALLOWED_SUBMISSION_TYPES.includes(file.type as any)) {
    return Response.json(
      { error: "BAD_TYPE", reason: `Got ${file.type || "unknown"}. Only PDF or DOCX accepted.` },
      { status: 415 }
    );
  }

  const submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.id, submissionId),
      eq(submissions.assignmentId, assignmentId),
      eq(submissions.userId, session.user.id)
    ),
  });
  if (!submission) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Cannot upload after final submission.
  if (
    submission.status === "SUBMITTED" ||
    submission.status === "LATE" ||
    submission.status === "RETURNED"
  ) {
    return Response.json({ error: "SUBMISSION_LOCKED" }, { status: 409 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const magic = detectFileType(buf);
  // PDF magic must match PDF MIME; DOCX is a zip so its magic is "PK" which
  // we accept for the .docx MIME type only.
  const ok =
    (file.type === "application/pdf" && magic === "pdf") ||
    (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      magic === "docx");

  if (!ok) {
    return Response.json(
      { error: "BAD_TYPE", reason: "File contents don't match the declared type." },
      { status: 415 }
    );
  }

  const storageKey = submissionAttachmentKey(submissionId, file.name);
  try {
    await putObject({
      key: storageKey,
      body: buf,
      contentType: file.type,
    });
  } catch (err) {
    console.error("[upload] storage error:", err);
    return Response.json({ error: "STORAGE_FAILED" }, { status: 502 });
  }

  const [att] = await db
    .insert(attachments)
    .values({
      submissionId,
      uploadedById: session.user.id,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      storageKey,
    })
    .returning();

  // First upload also flips the submission to IN_PROGRESS if not already.
  if (submission.status === "NOT_STARTED") {
    await db
      .update(submissions)
      .set({ status: "IN_PROGRESS", updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
  }

  await audit({
    organizationId: session.user.organizationId,
    actorId: session.user.id,
    action: "submission.attachment_uploaded",
    targetType: "submission",
    targetId: submissionId,
    metadata: { filename: file.name, size: file.size },
  });

  return Response.json({ attachment: att }, { status: 201 });
}
