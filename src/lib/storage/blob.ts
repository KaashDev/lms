import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getClient, bucketName } from "./client";

// Allowed MIME types for essay submissions. Used by upload validation.
// We also check magic bytes server-side because extensions lie.
export const ALLOWED_SUBMISSION_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const;
export type AllowedSubmissionType = (typeof ALLOWED_SUBMISSION_TYPES)[number];

export const MAX_SUBMISSION_BYTES = 25 * 1024 * 1024; // 25 MB per file

// Magic byte signatures. Verified before storing the row in attachments.
// PDF: "%PDF-" at offset 0
// DOCX: PK zip magic at offset 0 (DOCX is a zip; we double-check with the
// MIME type because all Office files are PK-magic).
const MAGIC = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), // "%PDF-"
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK..
};

export function detectFileType(buf: Buffer): "pdf" | "docx" | "unknown" {
  if (buf.length >= 5 && buf.slice(0, 5).equals(MAGIC.pdf)) return "pdf";
  if (buf.length >= 4 && buf.slice(0, 4).equals(MAGIC.zip)) return "docx";
  return "unknown";
}

/**
 * Upload a file to storage. Returns the storage key.
 *
 * We name objects under `submissions/{submissionId}/{uuid}-{filename}` so
 * (a) auth checks can scope by prefix later, (b) human-readable filenames
 * survive into the URL when signed.
 */
export async function putObject(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  );
}

/**
 * Generate a short-lived signed URL for downloading a stored object.
 *
 * Default TTL is 5 minutes — enough to click + download, not long enough
 * for the URL to leak somewhere bad. The teacher's "view submission"
 * page will re-sign on every render.
 */
export async function signedDownloadUrl(key: string, ttlSeconds = 300): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }),
    { expiresIn: ttlSeconds }
  );
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName(),
      Key: key,
    })
  );
}

/**
 * Build a storage key for a submission attachment. Filename is sanitized
 * to prevent path traversal and weird-character issues in signed URLs.
 */
export function submissionAttachmentKey(submissionId: string, filename: string): string {
  // Allow letters, numbers, dots, dashes, underscores. Replace everything else
  // with `_`. Truncate to 100 chars to stay under any reasonable URL length.
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
  // crypto.randomUUID is in Node 19+ — Railway and our local Docker both
  // run 20+, so this is fine.
  return `submissions/${submissionId}/${crypto.randomUUID()}-${safe}`;
}
