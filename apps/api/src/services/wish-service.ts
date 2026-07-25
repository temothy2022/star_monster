import {
  Prisma,
  type RedemptionStatus,
  type WishRecurrenceKind,
} from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  nextRecurringWishDate,
  oneTimeWishHiddenAt,
} from "../domain/wish-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt, businessDateKey } from "../lib/time.js";
import { writeAudit } from "./audit-service.js";

function nextEligibleDate(
  completedAt: Date | null | undefined,
  recurrenceKind: WishRecurrenceKind | null,
  recurrenceIntervalDays: number | null,
  config: AppConfig,
): Date | null {
  if (!completedAt) return null;
  return nextRecurringWishDate(
    businessDateAt(completedAt, config.APP_TIME_ZONE),
    recurrenceKind ?? "DAILY",
    recurrenceIntervalDays,
  );
}

export async function listChildWishes(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const [child, wishes] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({ where: { id: childId } }),
    prisma.wishReward.findMany({
      where: { childId, isEnabled: true, archivedAt: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        activeRedemptionSlot: { include: { redemption: true } },
        redemptions: {
          where: { status: "COMPLETED" },
          select: { id: true, completedAt: true },
          orderBy: { completedAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);
  const today = businessDateAt(now, config.APP_TIME_ZONE);

  return {
    starBalance: child.starBalance,
    wishes: wishes.flatMap((wish) => {
      const latestCompleted = wish.redemptions[0];
      if (
        wish.redemptionType === "ONE_TIME" &&
        latestCompleted?.completedAt &&
        now >= oneTimeWishHiddenAt(latestCompleted.completedAt)
      ) {
        return [];
      }

      const hasCompletedOneTime =
        wish.redemptionType === "ONE_TIME" && Boolean(latestCompleted);
      const activeStatus = wish.activeRedemptionSlot?.redemption.status ?? null;
      const recurringNextDate =
        wish.redemptionType === "RECURRING"
          ? nextEligibleDate(
              latestCompleted?.completedAt,
              wish.recurrenceKind,
              wish.recurrenceIntervalDays,
              config,
            )
          : null;
      let unavailableReason: string | null = null;
      if (activeStatus) unavailableReason = "ALREADY_REQUESTED";
      else if (hasCompletedOneTime) unavailableReason = "ALREADY_COMPLETED";
      else if (recurringNextDate && today < recurringNextDate)
        unavailableReason = "COOLDOWN";
      else if (
        wish.redemptionType === "STOCK" &&
        (wish.stockRemaining ?? 0) <= 0
      )
        unavailableReason = "OUT_OF_STOCK";
      else if (child.starBalance < wish.costStars)
        unavailableReason = "INSUFFICIENT_STARS";

      return [{
        id: wish.id,
        category: wish.category,
        title: wish.title,
        imageKey: wish.imageKey,
        costStars: wish.costStars,
        redemptionType: wish.redemptionType,
        recurrenceKind: wish.recurrenceKind,
        recurrenceIntervalDays: wish.recurrenceIntervalDays,
        stockRemaining: wish.stockRemaining,
        nextEligibleDate: recurringNextDate
          ? businessDateKey(recurringNextDate)
          : null,
        canRedeem: unavailableReason === null,
        unavailableReason,
        activeRedemptionStatus: activeStatus,
      }];
    }),
  };
}

export async function redeemWish(
  childId: string,
  wishRewardId: string,
  idempotencyKey: string,
  config: AppConfig,
  now = new Date(),
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
              select: { id: true, completedAt: true },
              orderBy: { completedAt: "desc" },
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
      const latestCompleted = wish.redemptions[0];
      if (wish.redemptionType === "ONE_TIME" && latestCompleted) {
        throw new HttpError(409, "WISH_ALREADY_COMPLETED", "这个星愿已经兑换过");
      }
      if (wish.redemptionType === "RECURRING") {
        const nextDate = nextEligibleDate(
          latestCompleted?.completedAt,
          wish.recurrenceKind,
          wish.recurrenceIntervalDays,
          config,
        );
        const today = businessDateAt(now, config.APP_TIME_ZONE);
        if (nextDate && today < nextDate) {
          throw new HttpError(
            409,
            "WISH_COOLDOWN",
            `${businessDateKey(nextDate)} 才能再次兑换`,
          );
        }
      }
      if (
        wish.redemptionType === "STOCK" &&
        (wish.stockRemaining ?? 0) <= 0
      ) {
        throw new HttpError(409, "WISH_OUT_OF_STOCK", "这个星愿已经兑完");
      }
      if (child.starBalance < wish.costStars) {
        throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
      }

      if (wish.redemptionType === "STOCK") {
        const reserved = await tx.wishReward.updateMany({
          where: { id: wish.id, stockRemaining: { gt: 0 } },
          data: { stockRemaining: { decrement: 1 } },
        });
        if (!reserved.count) {
          throw new HttpError(409, "WISH_OUT_OF_STOCK", "这个星愿已经兑完");
        }
      }

      const redemption = await tx.wishRedemption.create({
        data: {
          childId,
          wishRewardId: wish.id,
          titleSnapshot: wish.title,
          categorySnapshot: wish.category,
          costStarsSnapshot: wish.costStars,
          redemptionTypeSnapshot: wish.redemptionType,
          recurrenceKindSnapshot: wish.recurrenceKind,
          recurrenceIntervalDaysSnapshot: wish.recurrenceIntervalDays,
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
      if (redemption.redemptionTypeSnapshot === "STOCK") {
        const wish = await tx.wishReward.findUnique({
          where: { id: redemption.wishRewardId },
          select: { stockRemaining: true },
        });
        await tx.wishReward.update({
          where: { id: redemption.wishRewardId },
          data: { stockRemaining: (wish?.stockRemaining ?? 0) + 1 },
        });
      }
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
