import { S3Client } from "@aws-sdk/client-s3";

// R2 (or any S3-compatible service) is reached via the standard SDK with
// a custom endpoint. Cloudflare R2's region is always "auto" — putting
// anything else there silently fails on signed URL verification.
//
// Singleton pattern same as the DB client.
const globalForS3 = globalThis as unknown as { s3?: S3Client };

function getClient(): S3Client {
  if (globalForS3.s3) return globalForS3.s3;

  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 storage not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in env."
    );
  }

  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Force path-style addressing. R2 supports both but path-style is more
    // forgiving across SDK versions and avoids DNS surprises.
    forcePathStyle: true,
  });

  if (process.env.NODE_ENV !== "production") globalForS3.s3 = client;
  return client;
}

export { getClient };

export function bucketName(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET not configured.");
  return b;
}
