import { db } from "@/db";
import { auditLog } from "@/db/schema";

interface LogArgs {
  organizationId: string;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: { before?: unknown; after?: unknown };
  metadata?: Record<string, unknown>;
}

// Fire-and-forget. Audit failures must not break the user's action — we log
// and continue. If audit reliability becomes a compliance issue we'd swap
// this for a transactional outbox pattern.
export async function audit(args: LogArgs): Promise<void> {
  try {
    await db.insert(auditLog).values({
      organizationId: args.organizationId,
      actorId: args.actorId,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId,
      diff: args.diff,
      metadata: args.metadata,
    });
  } catch (err) {
    console.error("[audit] failed to write:", args.action, err);
  }
}
