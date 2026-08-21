import { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/**
 * Deletes one tenant and the records that cannot be removed by the database's
 * cascade rules because they intentionally preserve references to global data.
 */
export async function deleteFamilyData(
  tx: TransactionClient,
  familyId: string,
) {
  const children = await tx.childProfile.findMany({
    where: { familyId },
    select: { id: true },
  });
  const childIds = children.map((child) => child.id);

  if (childIds.length > 0) {
    // These relations use Restrict because their parent records are global or
    // shared. Remove the tenant-owned records before deleting the children.
    await tx.hanziLearningProgress.deleteMany({ where: { childId: { in: childIds } } });
    await tx.poemLearningProgress.deleteMany({ where: { childId: { in: childIds } } });
    await tx.starLedger.deleteMany({ where: { childId: { in: childIds } } });
    await tx.dailyTask.deleteMany({ where: { childId: { in: childIds } } });
    await tx.wishRedemption.deleteMany({ where: { childId: { in: childIds } } });
    await tx.petRoomThemeUnlock.deleteMany({ where: { childId: { in: childIds } } });
    await tx.petTrip.deleteMany({ where: { childId: { in: childIds } } });
  }

  // UserSession and all child-owned records that use Cascade are removed by
  // these two deletes. Deleting users also releases their unique phone number.
  const parentAccounts = await tx.user.findMany({
    where: { familyId },
    select: { phoneNumber: true },
  });
  const deletedChildren = await tx.childProfile.deleteMany({ where: { familyId } });
  const deletedParents = await tx.user.deleteMany({ where: { familyId } });
  await tx.family.delete({ where: { id: familyId } });

  return {
    parentAccounts: deletedParents.count,
    children: deletedChildren.count,
    releasedPhoneNumbers: new Set(
      parentAccounts
        .map((parent) => parent.phoneNumber)
        .filter((phoneNumber): phoneNumber is string => Boolean(phoneNumber)),
    ).size,
  };
}
