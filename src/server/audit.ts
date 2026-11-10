import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

/** Append-only audit trail of who did what. Never throws into the caller. */
export async function audit(
  userId: number | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  detail?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId === undefined ? undefined : String(entityId),
        detail: detail === undefined ? undefined : (JSON.parse(JSON.stringify(detail)) as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
