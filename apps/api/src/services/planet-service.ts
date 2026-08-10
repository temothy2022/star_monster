import { PlanetKey, Prisma } from "@prisma/client";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export const PLANET_DEFINITIONS = [
  { planet: PlanetKey.MERCURY, requiredLifetimeStars: 0, bonusStars: 5 },
  { planet: PlanetKey.VENUS, requiredLifetimeStars: 60, bonusStars: 8 },
  { planet: PlanetKey.EARTH, requiredLifetimeStars: 120, bonusStars: 10 },
  { planet: PlanetKey.MARS, requiredLifetimeStars: 180, bonusStars: 12 },
  { planet: PlanetKey.JUPITER, requiredLifetimeStars: 360, bonusStars: 15 },
  { planet: PlanetKey.SATURN, requiredLifetimeStars: 520, bonusStars: 18 },
  { planet: PlanetKey.URANUS, requiredLifetimeStars: 720, bonusStars: 20 },
  { planet: PlanetKey.NEPTUNE, requiredLifetimeStars: 960, bonusStars: 25 },
] as const;

export const PLANET_KEYS = PLANET_DEFINITIONS.map(({ planet }) => planet);

type PlanetSettingsInput = Array<{
  planet: PlanetKey;
  requiredLifetimeStars: number;
  bonusStars: number;
}>;

export function resolveLifetimeStarsEarned(input: {
  storedLifetimeStarsEarned: number;
  starBalance: number;
  ledgerLifetimeStars: number;
}) {
  return Math.max(
    input.storedLifetimeStarsEarned,
    input.starBalance,
    input.ledgerLifetimeStars,
  );
}

async function reconcileLifetimeStarsEarned(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
  child: { starBalance: number; lifetimeStarsEarned: number },
) {
  const ledgerTotal = await client.starLedger.aggregate({
    where: {
      childId,
      OR: [
        {
          type: {
            in: [
              "TASK_REWARD",
              "TASK_REWARD_REVERSAL",
              "DAILY_GOAL_BONUS",
              "PLANET_BONUS",
              "PET_RED_PACKET_REWARD",
            ],
          },
        },
        { type: "MANUAL_ADJUSTMENT", amount: { gt: 0 } },
      ],
    },
    _sum: { amount: true },
  });
  const lifetimeStarsEarned = resolveLifetimeStarsEarned({
    storedLifetimeStarsEarned: child.lifetimeStarsEarned,
    starBalance: child.starBalance,
    ledgerLifetimeStars: ledgerTotal._sum.amount ?? 0,
  });

  if (lifetimeStarsEarned > child.lifetimeStarsEarned) {
    await client.childProfile.update({
      where: { id: childId },
      data: { lifetimeStarsEarned },
    });
  }

  return lifetimeStarsEarned;
}

async function ensurePlanetProgress(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
) {
  await client.planetProgress.createMany({
    data: PLANET_DEFINITIONS.map((definition) => ({
      childId,
      ...definition,
    })),
    skipDuplicates: true,
  });
}

function serializeProgress(
  child: { starBalance: number; lifetimeStarsEarned: number },
  planets: Array<{
    id: string;
    planet: PlanetKey;
    requiredLifetimeStars: number;
    bonusStars: number;
    awardedBonusStars: number | null;
    unlockedAt: Date | null;
    notifiedAt: Date | null;
    celebratedAt: Date | null;
  }>,
) {
  const ordered = PLANET_KEYS.map((planet) => {
    const progress = planets.find((item) => item.planet === planet);
    if (!progress) {
      throw new HttpError(500, "PLANET_PROGRESS_INCOMPLETE", "航图数据不完整");
    }
    return {
      id: progress.id,
      planet: progress.planet,
      requiredLifetimeStars: progress.requiredLifetimeStars,
      bonusStars: progress.bonusStars,
      awardedBonusStars: progress.awardedBonusStars,
      unlocked: progress.unlockedAt !== null,
      unlockedAt: progress.unlockedAt,
      notifiedAt: progress.notifiedAt,
      celebratedAt: progress.celebratedAt,
    };
  });

  return {
    starBalance: child.starBalance,
    lifetimeStarsEarned: child.lifetimeStarsEarned,
    planets: ordered,
    pendingNotifications: ordered
      .filter((planet) => planet.unlocked && !planet.notifiedAt)
      .map((planet) => planet.planet),
    pendingCelebrations: ordered
      .filter((planet) => planet.unlocked && !planet.celebratedAt)
      .map((planet) => planet.planet),
  };
}

export async function syncPlanetProgress(childId: string) {
  await ensurePlanetProgress(prisma, childId);

  return prisma.$transaction(async (tx) => {
    const child = await tx.childProfile.findUnique({
      where: { id: childId },
      select: { starBalance: true, lifetimeStarsEarned: true },
    });
    if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");

    const initialProgress = await tx.planetProgress.findMany({
      where: { childId },
    });
    let starBalance = child.starBalance;
    let lifetimeStarsEarned = await reconcileLifetimeStarsEarned(tx, childId, child);

    for (const planet of PLANET_KEYS) {
      const progress = initialProgress.find((item) => item.planet === planet);
      if (
        !progress ||
        progress.unlockedAt ||
        progress.requiredLifetimeStars > lifetimeStarsEarned
      ) {
        continue;
      }

      const claimed = await tx.planetProgress.updateMany({
        where: { id: progress.id, unlockedAt: null },
        data: {
          unlockedAt: new Date(),
          awardedBonusStars: progress.bonusStars,
        },
      });
      if (claimed.count === 0) continue;

      starBalance += progress.bonusStars;
      lifetimeStarsEarned += progress.bonusStars;
      await tx.childProfile.update({
        where: { id: childId },
        data: {
          starBalance: { increment: progress.bonusStars },
          lifetimeStarsEarned: { increment: progress.bonusStars },
        },
      });
      await tx.starLedger.create({
        data: {
          childId,
          type: "PLANET_BONUS",
          amount: progress.bonusStars,
          balanceAfter: starBalance,
          reason: `点亮${planet}星球奖励`,
          referenceId: progress.id,
          idempotencyKey: `planet-bonus:${childId}:${planet}`,
        },
      });
    }

    const [finalChild, planets] = await Promise.all([
      tx.childProfile.findUniqueOrThrow({
        where: { id: childId },
        select: { starBalance: true, lifetimeStarsEarned: true },
      }),
      tx.planetProgress.findMany({ where: { childId } }),
    ]);
    return serializeProgress(finalChild, planets);
  });
}

export async function markPlanetCelebrated(childId: string, planet: PlanetKey) {
  await ensurePlanetProgress(prisma, childId);
  const progress = await prisma.planetProgress.findUnique({
    where: { childId_planet: { childId, planet } },
  });
  if (!progress?.unlockedAt) {
    throw new HttpError(409, "PLANET_LOCKED", "这颗星球还没有点亮");
  }

  const updated = await prisma.planetProgress.update({
    where: { id: progress.id },
    data: { celebratedAt: progress.celebratedAt ?? new Date() },
  });
  return { planet: updated.planet, celebratedAt: updated.celebratedAt };
}

export async function markPlanetNotified(childId: string, planet: PlanetKey) {
  await ensurePlanetProgress(prisma, childId);
  const progress = await prisma.planetProgress.findUnique({
    where: { childId_planet: { childId, planet } },
  });
  if (!progress?.unlockedAt) {
    throw new HttpError(409, "PLANET_LOCKED", "这颗星球还没有点亮");
  }

  const updated = await prisma.planetProgress.update({
    where: { id: progress.id },
    data: { notifiedAt: progress.notifiedAt ?? new Date() },
  });
  return { planet: updated.planet, notifiedAt: updated.notifiedAt };
}

export async function getPlanetSettings(childId: string) {
  await ensurePlanetProgress(prisma, childId);
  return prisma.$transaction(async (tx) => {
    const child = await tx.childProfile.findUnique({
      where: { id: childId },
      select: { starBalance: true, lifetimeStarsEarned: true },
    });
    if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
    const lifetimeStarsEarned = await reconcileLifetimeStarsEarned(tx, childId, child);
    const planets = await tx.planetProgress.findMany({ where: { childId } });
    return serializeProgress({ ...child, lifetimeStarsEarned }, planets);
  });
}

export async function updatePlanetSettings(
  childId: string,
  settings: PlanetSettingsInput,
) {
  await ensurePlanetProgress(prisma, childId);
  await prisma.$transaction(
    settings.map((setting) =>
      prisma.planetProgress.update({
        where: {
          childId_planet: { childId, planet: setting.planet },
        },
        data: {
          requiredLifetimeStars: setting.requiredLifetimeStars,
          bonusStars: setting.bonusStars,
        },
      }),
    ),
  );
  return syncPlanetProgress(childId);
}
