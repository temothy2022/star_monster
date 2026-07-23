import type { AuditActorType, Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient;

export async function writeAudit(
  tx: DbClient,
  input: {
    actorType: AuditActorType;
    actorId?: string;
    familyId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
  },
): Promise<void> {
  await tx.auditLog.create({ data: input });
}
