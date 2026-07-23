import { Prisma, type RedemptionStatus } from "@prisma/client";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "./audit-service.js";

export async function listChildWishes(childId: string) {
  const [child, wishes] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({ where: { id: childId } }),
    prisma.wishReward.findMany({
      where: { childId, isEnabled: true, archivedAt: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        activeRedemptionSlot: { include: { redemption: true } },
        redemptions: {
          where: { status: "COMPLETED" },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  return {
    starBalance: child.starBalance,
    wishes: wishes.map((wish) => {
      const hasCompletedOneTime =
        !wish.isRepeatable && wish.redemptions.length > 0;
      const activeStatus = wish.activeRedemptionSlot?.redemption.status ?? null;
      let unavailableReason: string | null = null;
      if (hasCompletedOneTime) unavailableReason = "ALREADY_COMPLETED";
      else if (activeStatus) unavailableReason = "ALREADY_REQUESTED";
      else if (child.starBalance < wish.costStars)
        unavailableReason = "INSUFFICIENT_STARS";

      return {
        id: wish.id,
        category: wish.category,
        title: wish.title,
        imageKey: wish.imageKey,
        costStars: wish.costStars,
        isRepeatable: wish.isRepeatable,
        canRedeem: unavailableReason === null,
        unavailableReason,
        activeRedemptionStatus: activeStatus,
      };
    }),
  };
}

export async function redeemWish(
  childId: string,
  wishRewardId: string,
  idempotencyKey: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const ledgerKey = `wish:${childId}:${idempotencyKey}:spend`;
      const existingLedger = await tx.starLedger.findUnique({
        where: { idempotencyKey: ledgerKey },
      });
      if (existingLedger?.referenceId) {
        const existingRedemption = await tx.wishRedemption.findUnique({
          where: { id: existingLedger.referenceId },
        });
        if (existingRedemption) {
          return { redemption: existingRedemption, alreadyProcessed: true };
        }
      }

      const [child, wish] = await Promise.all([
        tx.childProfile.findUnique({ where: { id: childId } }),
        tx.wishReward.findFirst({
          where: { id: wishRewardId, childId, isEnabled: true, archivedAt: null },
          include: {
            activeRedemptionSlot: true,
            redemptions: {
              where: { status: "COMPLETED" },
              select: { id: true },
              take: 1,
            },
          },
        }),
      ]);
      if (!child || !wish) {
        throw new HttpError(404, "WISH_NOT_FOUND", "没有找到这个星愿");
      }
      if (wish.activeRedemptionSlot) {
        throw new HttpError(409, "WISH_ALREADY_REQUESTED", "这个星愿正在处理中");
      }
      if (!wish.isRepeatable && wish.redemptions.length > 0) {
        throw new HttpError(409, "WISH_ALREADY_COMPLETED", "这个星愿已经兑换过");
      }
      if (child.starBalance < wish.costStars) {
        throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
      }

      const redemption = await tx.wishRedemption.create({
        data: {
          childId,
          wishRewardId: wish.id,
          titleSnapshot: wish.title,
          categorySnapshot: wish.category,
          costStarsSnapshot: wish.costStars,
        },
      });
      await tx.activeWishRedemptionSlot.create({
        data: { wishRewardId: wish.id, redemptionId: redemption.id },
      });
      const updatedChild = await tx.childProfile.update({
        where: { id: childId },
        data: { starBalance: { decrement: wish.costStars } },
      });
      await tx.starLedger.create({
        data: {
          childId,
          type: "WISH_SPEND",
          amount: -wish.costStars,
          balanceAfter: updatedChild.starBalance,
          reason: `兑换星愿：${wish.title}`,
          referenceId: redemption.id,
          idempotencyKey: ledgerKey,
        },
      });

      return { redemption, alreadyProcessed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateRedemptionStatus(input: {
  redemptionId: string;
  childId: string;
  status: Exclude<RedemptionStatus, "PENDING">;
  cancelReason?: string;
  actorId: string;
  familyId: string;
  ipAddress?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const redemption = await tx.wishRedemption.findFirst({
        where: { id: input.redemptionId, childId: input.childId },
      });
      if (!redemption) {
        throw new HttpError(404, "REDEMPTION_NOT_FOUND", "没有找到兑换记录");
      }
      if (redemption.status === input.status) return redemption;
      if (redemption.status === "COMPLETED" || redemption.status === "CANCELLED") {
        throw new HttpError(409, "REDEMPTION_FINAL", "兑换记录已经结束");
      }

      const now = new Date();
      if (input.status === "ARRANGED") {
        const updated = await tx.wishRedemption.update({
          where: { id: redemption.id },
          data: { status: "ARRANGED", arrangedAt: now },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: input.actorId,
          familyId: input.familyId,
          action: "REDEMPTION_ARRANGE",
          resourceType: "WishRedemption",
          resourceId: redemption.id,
          ipAddress: input.ipAddress,
        });
        return updated;
      }
      if (input.status === "COMPLETED") {
        const updated = await tx.wishRedemption.update({
          where: { id: redemption.id },
          data: { status: "COMPLETED", completedAt: now },
        });
        await tx.activeWishRedemptionSlot.deleteMany({
          where: { redemptionId: redemption.id },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: input.actorId,
          familyId: input.familyId,
          action: "REDEMPTION_COMPLETE",
          resourceType: "WishRedemption",
          resourceId: redemption.id,
          ipAddress: input.ipAddress,
        });
        return updated;
      }

      const updated = await tx.wishRedemption.update({
        where: { id: redemption.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: input.cancelReason,
        },
      });
      const child = await tx.childProfile.update({
        where: { id: redemption.childId },
        data: { starBalance: { increment: redemption.costStarsSnapshot } },
      });
      await tx.starLedger.create({
        data: {
          childId: redemption.childId,
          type: "WISH_REFUND",
          amount: redemption.costStarsSnapshot,
          balanceAfter: child.starBalance,
          reason: `取消兑换：${redemption.titleSnapshot}`,
          referenceId: redemption.id,
          idempotencyKey: `wish:${redemption.id}:refund`,
        },
      });
      await tx.activeWishRedemptionSlot.deleteMany({
        where: { redemptionId: redemption.id },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: input.actorId,
        familyId: input.familyId,
        action: "REDEMPTION_CANCEL_REFUND",
        resourceType: "WishRedemption",
        resourceId: redemption.id,
        metadata: { cancelReason: input.cancelReason ?? null },
        ipAddress: input.ipAddress,
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
