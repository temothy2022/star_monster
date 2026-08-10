import { Prisma, type PetCareKind, type PetTravelTier } from "@prisma/client";
import { randomInt } from "node:crypto";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt, businessMinuteOfDayAt } from "../lib/time.js";

const MAX_STATUS = 100;
const LOW_PET_STATUS = 30;
const WASTE_DAY_START_MINUTE = 8 * 60;
const WASTE_DAY_END_MINUTE = 21 * 60;
const WASTE_AFTER_CLEAN_MIN_MINUTES = 90;
const WASTE_AFTER_CLEAN_MAX_MINUTES = 180;

export type PetRoomAmbience = {
  imageUrl: string;
  motion: "DRIFT" | "FLY" | "FLOAT" | "FALL" | "TWINKLE" | "RISE" | "SWIM" | "COMET" | "ORBIT";
  placement: "TOP" | "UPPER_RIGHT" | "CENTER" | "BOTTOM_LEFT";
};

export type PetDialogueContext =
  | "PET_NEEDS_CARE"
  | "PET_HUNGRY"
  | "PET_THIRSTY"
  | "PET_TASK_START"
  | "PET_TASK_PROGRESS"
  | "PET_TASK_COMPLETE"
  | "PET_RELAX"
  | "PET_GENERAL";

export function petDialogueContext(input: {
  satiety: number;
  hydration: number;
  totalTasks: number;
  completedTasks: number;
}): PetDialogueContext {
  if (input.satiety <= LOW_PET_STATUS && input.hydration <= LOW_PET_STATUS) {
    return "PET_NEEDS_CARE";
  }
  if (input.satiety <= LOW_PET_STATUS) return "PET_HUNGRY";
  if (input.hydration <= LOW_PET_STATUS) return "PET_THIRSTY";
  if (input.totalTasks === 0) return "PET_RELAX";
  if (input.completedTasks >= input.totalTasks) return "PET_TASK_COMPLETE";
  if (input.completedTasks > 0) return "PET_TASK_PROGRESS";
  return "PET_TASK_START";
}

export function petLevelFromExperience(experience: number) {
  return Math.min(30, Math.floor(Math.sqrt(Math.max(0, experience) / 24)) + 1);
}

export function petGrowthStageForLevel(level: number) {
  if (level >= 10) return "MATURE" as const;
  if (level >= 5) return "GROWING" as const;
  return "BABY" as const;
}

export function petExperienceForNextLevel(level: number) {
  return level >= 30 ? null : level * level * 24;
}

export function petRedPacketGrantPlan(input: {
  profileId: string;
  childId: string;
  currentLevel: number;
  nextLevel: number;
  packetsPerLevel: number;
  minStars: number;
  maxStars: number;
}) {
  if (input.nextLevel <= input.currentLevel) return [];
  const packetsPerLevel = Math.max(0, Math.min(10, Math.floor(input.packetsPerLevel)));
  if (packetsPerLevel === 0) return [];
  const minStars = Math.max(1, Math.min(input.minStars, input.maxStars));
  const maxStars = Math.max(minStars, Math.max(input.minStars, input.maxStars));
  return Array.from(
    { length: (input.nextLevel - input.currentLevel) * packetsPerLevel },
    (_, index) => {
      const levelOffset = Math.floor(index / packetsPerLevel);
      const packetIndex = (index % packetsPerLevel) + 1;
      const sourceLevel = input.currentLevel + levelOffset + 1;
      return {
        childId: input.childId,
        profileId: input.profileId,
        sourceLevel,
        minStarsSnapshot: minStars,
        maxStarsSnapshot: maxStars,
        grantKey: `pet-level:${input.profileId}:${sourceLevel}:packet:${packetIndex}`,
      };
    },
  );
}

export function petManualRedPacketGrantPlan(input: {
  profileId: string;
  childId: string;
  sourceLevel: number;
  count: number;
  minStars: number;
  maxStars: number;
  batchKey: string;
}) {
  const count = Math.max(0, Math.min(50, Math.floor(input.count)));
  const minStars = Math.max(1, Math.min(input.minStars, input.maxStars));
  const maxStars = Math.max(minStars, Math.max(input.minStars, input.maxStars));
  return Array.from({ length: count }, (_, index) => ({
    childId: input.childId,
    profileId: input.profileId,
    sourceLevel: input.sourceLevel,
    minStarsSnapshot: minStars,
    maxStarsSnapshot: maxStars,
    grantKey: `pet-manual:${input.profileId}:${input.batchKey}:packet:${index + 1}`,
  }));
}

export function settledPetStatus(value: number, settledAt: Date, now: Date, intervalMinutes: number) {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  const steps = Math.max(0, Math.floor((now.getTime() - settledAt.getTime()) / intervalMs));
  return {
    value: Math.max(0, value - steps),
    settledAt: steps > 0 ? new Date(settledAt.getTime() + steps * intervalMs) : settledAt,
    changed: steps > 0,
  };
}

export function parsePetRoomAmbience(value: Prisma.JsonValue): PetRoomAmbience[] {
  if (!Array.isArray(value)) return [];
  const motions = new Set<PetRoomAmbience["motion"]>(["DRIFT", "FLY", "FLOAT", "FALL", "TWINKLE", "RISE", "SWIM", "COMET", "ORBIT"]);
  const placements = new Set<PetRoomAmbience["placement"]>(["TOP", "UPPER_RIGHT", "CENTER", "BOTTOM_LEFT"]);
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const imageUrl = "imageUrl" in item ? item.imageUrl : undefined;
    const motion = "motion" in item ? item.motion : undefined;
    const placement = "placement" in item ? item.placement : undefined;
    if (
      typeof imageUrl !== "string"
      || typeof motion !== "string"
      || typeof placement !== "string"
      || !motions.has(motion as PetRoomAmbience["motion"])
      || !placements.has(placement as PetRoomAmbience["placement"])
    ) return [];
    return [{
      imageUrl,
      motion: motion as PetRoomAmbience["motion"],
      placement: placement as PetRoomAmbience["placement"],
    }];
  });
}

function tierConfig(config: Awaited<ReturnType<typeof getPetConfig>>, tier: PetTravelTier) {
  if (tier === "NEARBY") {
    return {
      costStars: config.nearbyCostStars,
      durationMinutes: config.nearbyDurationMinutes,
      experience: config.nearbyExperience,
    };
  }
  if (tier === "CHINA") {
    return {
      costStars: config.chinaCostStars,
      durationMinutes: config.chinaDurationMinutes,
      experience: config.chinaExperience,
    };
  }
  return {
    costStars: config.worldCostStars,
    durationMinutes: config.worldDurationMinutes,
    experience: config.worldExperience,
  };
}

async function getPetConfig(client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.petGrowthConfig.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
}

async function getFamilyRoomThemePrices(
  client: Prisma.TransactionClient | typeof prisma,
  familyId: string,
) {
  const settings = await client.familyPetRoomThemeSetting.findMany({
    where: { familyId },
    select: { themeId: true, priceStars: true },
  });
  return new Map(settings.map((setting) => [setting.themeId, setting.priceStars]));
}

async function getRoomThemePrice(
  client: Prisma.TransactionClient | typeof prisma,
  familyId: string,
  themeId: string,
  fallback: number,
) {
  const setting = await client.familyPetRoomThemeSetting.findUnique({
    where: { familyId_themeId: { familyId, themeId } },
    select: { priceStars: true },
  });
  return setting?.priceStars ?? fallback;
}

async function ensureProfile(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
) {
  return client.petGrowthProfile.upsert({
    where: { childId },
    update: {},
    create: { childId },
  });
}

async function grantLevelUpRedPackets(
  client: Prisma.TransactionClient,
  profile: {
    id: string;
    childId: string;
    level: number;
    redPacketsPerLevel: number;
    redPacketMinStars: number;
    redPacketMaxStars: number;
  },
  nextLevel: number,
) {
  const packets = petRedPacketGrantPlan({
    profileId: profile.id,
    childId: profile.childId,
    currentLevel: profile.level,
    nextLevel,
    packetsPerLevel: profile.redPacketsPerLevel,
    minStars: profile.redPacketMinStars,
    maxStars: profile.redPacketMaxStars,
  }).map((packet) => ({ ...packet, updatedAt: new Date() }));
  if (packets.length === 0) return;
  await client.petRedPacket.createMany({ data: packets, skipDuplicates: true });
}

export function petWasteSchedulePlan(input: {
  childId: string;
  profileId: string;
  wasteDate: Date;
  count: number;
  costStars: number;
  randomValue?: (maxExclusive: number) => number;
}) {
  const count = Math.max(0, Math.min(8, Math.floor(input.count)));
  if (count === 0) return [];
  const randomValue = input.randomValue ?? ((maxExclusive: number) => randomInt(maxExclusive));
  const windowSize = Math.floor((WASTE_DAY_END_MINUTE - WASTE_DAY_START_MINUTE) / count);
  return Array.from({ length: count }, (_, index) => {
    const offset = randomValue(Math.max(1, windowSize));
    return {
      childId: input.childId,
      profileId: input.profileId,
      wasteDate: input.wasteDate,
      sequence: index + 1,
      appearsMinute: WASTE_DAY_START_MINUTE + index * windowSize + offset,
      positionSeed: randomValue(4),
      costStarsSnapshot: Math.max(0, Math.min(100, Math.floor(input.costStars))),
    };
  });
}

export function petWasteCooldownUntil(
  now: Date,
  randomValue: (maxExclusive: number) => number = (maxExclusive) => randomInt(maxExclusive),
) {
  const spread = WASTE_AFTER_CLEAN_MAX_MINUTES - WASTE_AFTER_CLEAN_MIN_MINUTES + 1;
  const minutes = WASTE_AFTER_CLEAN_MIN_MINUTES + randomValue(spread);
  return new Date(now.getTime() + minutes * 60_000);
}

async function ensureDailyWasteSchedule(
  client: Prisma.TransactionClient,
  profile: {
    id: string;
    childId: string;
    dailyWasteCount: number;
    wasteCleanCostStars: number;
  },
  wasteDate: Date,
) {
  if (profile.dailyWasteCount <= 0) return;
  const existingCount = await client.petWasteOccurrence.count({
    where: { childId: profile.childId, wasteDate },
  });
  if (existingCount > 0) return;

  const schedule = petWasteSchedulePlan({
    childId: profile.childId,
    profileId: profile.id,
    wasteDate,
    count: profile.dailyWasteCount,
    costStars: profile.wasteCleanCostStars,
  });
  if (schedule.length === 0) return;
  await client.petWasteOccurrence.createMany({ data: schedule, skipDuplicates: true });
}

async function settleProfile(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
  now: Date,
) {
  const [profile, config] = await Promise.all([
    ensureProfile(client, childId),
    getPetConfig(client),
  ]);
  const satiety = settledPetStatus(
    profile.satiety,
    profile.satietySettledAt,
    now,
    profile.satietyDecayMinutes ?? config.satietyDecayMinutes,
  );
  const hydration = settledPetStatus(
    profile.hydration,
    profile.hydrationSettledAt,
    now,
    profile.hydrationDecayMinutes ?? config.hydrationDecayMinutes,
  );
  if (satiety.changed || hydration.changed) {
    return {
      profile: await client.petGrowthProfile.update({
        where: { id: profile.id },
        data: {
          satiety: satiety.value,
          hydration: hydration.value,
          satietySettledAt: satiety.settledAt,
          hydrationSettledAt: hydration.settledAt,
        },
      }),
      config,
    };
  }
  return { profile, config };
}

async function refreshTripStatus(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
  now: Date,
) {
  await client.petTrip.updateMany({
    where: { childId, status: "TRAVELING", returnsAt: { lte: now } },
    data: { status: "RETURNED", returnedAt: now },
  });
}

async function petSpentToday(
  client: Prisma.TransactionClient,
  childId: string,
  now: Date,
  config: AppConfig,
) {
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const today = businessDateAt(now, config.APP_TIME_ZONE).getTime();
  const ledgers = await client.starLedger.findMany({
    where: {
      childId,
      createdAt: { gte: since },
      type: { in: ["PET_CARE_SPEND", "PET_TRAVEL_SPEND", "PET_ROOM_THEME_SPEND"] },
    },
    select: { amount: true, createdAt: true },
  });
  return ledgers.reduce((total, ledger) => {
    if (businessDateAt(ledger.createdAt, config.APP_TIME_ZONE).getTime() !== today) return total;
    return total + Math.abs(ledger.amount);
  }, 0);
}

async function assertSpendAllowed(input: {
  client: Prisma.TransactionClient;
  childId: string;
  limit: number | null;
  cost: number;
  now: Date;
  config: AppConfig;
}) {
  if (input.limit === null) return;
  const spent = await petSpentToday(input.client, input.childId, input.now, input.config);
  if (spent + input.cost > input.limit) {
    throw new HttpError(409, "PET_DAILY_LIMIT_REACHED", "今天的星宠消费已经达到家长设置的上限");
  }
}

function serializeTrip(trip: {
  id: string;
  status: string;
  tierSnapshot: PetTravelTier;
  destinationNameSnapshot: string;
  citySnapshot: string;
  countrySnapshot: string;
  introductionSnapshot: string;
  funFactSnapshot: string;
  imageUrlSnapshot: string;
  audioUrlSnapshot: string | null;
  costStars: number;
  departedAt: Date;
  returnsAt: Date;
  returnedAt: Date | null;
  revealedAt: Date | null;
}) {
  return {
    id: trip.id,
    status: trip.status,
    tier: trip.tierSnapshot,
    destinationName: trip.destinationNameSnapshot,
    city: trip.citySnapshot,
    country: trip.countrySnapshot,
    introduction: trip.introductionSnapshot,
    funFact: trip.funFactSnapshot,
    imageUrl: trip.imageUrlSnapshot,
    audioUrl: trip.audioUrlSnapshot,
    costStars: trip.costStars,
    departedAt: trip.departedAt,
    returnsAt: trip.returnsAt,
    returnedAt: trip.returnedAt,
    revealedAt: trip.revealedAt,
  };
}

export async function getPetGrowthState(childId: string, appConfig: AppConfig) {
  const now = new Date();
  const today = businessDateAt(now, appConfig.APP_TIME_ZONE);
  const currentMinute = businessMinuteOfDayAt(now, appConfig.APP_TIME_ZONE);
  await prisma.$transaction(async (tx) => {
    const { profile } = await settleProfile(tx, childId, now);
    await ensureDailyWasteSchedule(tx, profile, today);
    await refreshTripStatus(tx, childId, now);
  });
  const [child, profile, config, currentTrip, postcards, tasks, mascotAssets, roomThemes, roomThemeUnlocks, availableRedPackets, activeWaste, pendingWasteCount] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      select: { nickname: true, petType: true, starBalance: true, familyId: true },
    }),
    prisma.petGrowthProfile.findUniqueOrThrow({ where: { childId } }),
    getPetConfig(),
    prisma.petTrip.findFirst({
      where: { childId, status: { in: ["TRAVELING", "RETURNED"] } },
      orderBy: { departedAt: "desc" },
    }),
    prisma.petTrip.findMany({
      where: { childId, status: "REVEALED" },
      orderBy: { revealedAt: "desc" },
      take: 40,
    }),
    prisma.dailyTask.findMany({
      where: { childId, taskDate: today },
      select: {
        status: true,
        _count: {
          select: { attempts: { where: { status: "COMPLETED" } } },
        },
      },
    }),
    prisma.mascotAsset.findMany({
      select: { petType: true, slot: true, mediaUrl: true, updatedAt: true },
    }),
    prisma.petRoomTheme.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { mascotAnimations: true },
    }),
    prisma.petRoomThemeUnlock.findMany({
      where: { childId },
      select: { themeId: true },
    }),
    prisma.petRedPacket.count({ where: { childId, openedAt: null } }),
    prisma.petWasteOccurrence.findFirst({
      where: {
        childId,
        cleanedAt: null,
        AND: [
          {
            OR: [
              { wasteDate: { lt: today } },
              { wasteDate: today, appearsMinute: { lte: currentMinute } },
            ],
          },
          {
            OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
          },
        ],
      },
      orderBy: [{ wasteDate: "asc" }, { appearsMinute: "asc" }, { sequence: "asc" }],
    }),
    prisma.petWasteOccurrence.count({
      where: {
        childId,
        cleanedAt: null,
        AND: [
          {
            OR: [
              { wasteDate: { lt: today } },
              { wasteDate: today, appearsMinute: { lte: currentMinute } },
            ],
          },
          {
            OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
          },
        ],
      },
    }),
  ]);
  const familyRoomThemePrices = await getFamilyRoomThemePrices(prisma, child.familyId);
  const petType = child.petType ?? "TUANTUAN";
  const completedTasks = tasks.filter(
    (task) => task.status === "COMPLETED" || task._count.attempts > 0,
  ).length;
  const dialogueContext = petDialogueContext({
    satiety: profile.satiety,
    hydration: profile.hydration,
    totalTasks: tasks.length,
    completedTasks,
  });
  const availableDialogues = await prisma.mascotDialogue.findMany({
    where: {
      isEnabled: true,
      context: { in: [dialogueContext, "PET_GENERAL"] },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, key: true, context: true, text: true, audioUrl: true },
  });
  const contextualDialogues = availableDialogues.filter(
    (dialogue) => dialogue.context === dialogueContext,
  );
  const nextLevelExperience = petExperienceForNextLevel(profile.level);
  const currentLevelStart = profile.level <= 1 ? 0 : (profile.level - 1) ** 2 * 24;
  const dailySpent = await prisma.$transaction((tx) =>
    petSpentToday(tx, childId, now, appConfig),
  );
  const unlockedRoomThemeIds = new Set(roomThemeUnlocks.map((unlock) => unlock.themeId));
  const serializedRoomThemes = roomThemes
    .filter((theme) => theme.ownerFamilyId === null)
    .map((theme) => ({
      ...theme,
      priceStars: familyRoomThemePrices.get(theme.id) ?? theme.priceStars,
    }));
  const equippedRoomTheme = serializedRoomThemes.find((theme) => theme.id === profile.equippedRoomThemeId)
    ?? serializedRoomThemes.find((theme) => theme.priceStars === 0)
    ?? serializedRoomThemes[0];
  return {
    pet: {
      petType,
      nickname: child.nickname,
      level: profile.level,
      experience: profile.experience,
      growthStage: profile.growthStage,
      satiety: profile.satiety,
      hydration: profile.hydration,
      currentLevelStart,
      nextLevelExperience,
    },
    wallet: {
      starBalance: child.starBalance,
      dailySpent,
      dailySpendLimitStars: profile.dailySpendLimitStars,
    },
    redPackets: {
      availableCount: availableRedPackets,
      packetsPerLevel: profile.redPacketsPerLevel,
      minStars: profile.redPacketMinStars,
      maxStars: profile.redPacketMaxStars,
    },
    travelEnabled: profile.travelEnabled,
    travelOptions: (["NEARBY", "CHINA", "WORLD"] as const).map((tier) => ({
      tier,
      ...tierConfig(config, tier),
    })),
    careOptions: {
      feed: {
        costStars: config.feedCostStars,
        restore: config.feedRestore,
        experience: config.feedExperience,
      },
      drink: {
        costStars: config.drinkCostStars,
        restore: config.drinkRestore,
        experience: config.drinkExperience,
      },
    },
    statusDecay: {
      satietyMinutes: profile.satietyDecayMinutes ?? config.satietyDecayMinutes,
      hydrationMinutes: profile.hydrationDecayMinutes ?? config.hydrationDecayMinutes,
    },
    waste: {
      active: activeWaste ? {
        id: activeWaste.id,
        appearsMinute: activeWaste.appearsMinute,
        positionSeed: activeWaste.positionSeed,
        costStars: activeWaste.costStarsSnapshot,
      } : null,
      pendingCount: pendingWasteCount,
      dailyCount: profile.dailyWasteCount,
      cleanCostStars: profile.wasteCleanCostStars,
    },
    mascotAssets: mascotAssets
      .filter((asset) => asset.petType === petType)
      .map((asset) => ({
        slot: asset.slot,
        mediaUrl: asset.mediaUrl,
        updatedAt: asset.updatedAt,
      })),
    roomThemes: serializedRoomThemes.map((theme) => ({
      key: theme.key,
      name: theme.name,
      description: theme.description,
      priceStars: theme.priceStars,
      backgroundLandscapeUrl: theme.backgroundLandscapeUrl,
      backgroundTabletUrl: theme.backgroundTabletUrl,
      backgroundPhoneUrl: theme.backgroundPhoneUrl,
      previewUrl: theme.previewUrl,
      ambience: parsePetRoomAmbience(theme.ambience),
      mascotMotion: theme.mascotMotion,
      mascotAnimationUrl: theme.mascotAnimations.find((animation) => animation.petType === petType)?.mediaUrl ?? null,
      isOwned: theme.priceStars === 0 || unlockedRoomThemeIds.has(theme.id),
      isEquipped: theme.id === equippedRoomTheme?.id,
    })),
    equippedRoomThemeKey: equippedRoomTheme?.key ?? null,
    dialogueContext,
    dialogues: contextualDialogues.length > 0
      ? contextualDialogues
      : availableDialogues.filter((dialogue) => dialogue.context === "PET_GENERAL"),
    taskProgress: {
      total: tasks.length,
      completed: completedTasks,
    },
    currentTrip: currentTrip ? serializeTrip(currentTrip) : null,
    postcards: postcards.map(serializeTrip),
  };
}

export async function purchasePetRoomTheme(input: {
  childId: string;
  themeKey: string;
  idempotencyKey: string;
  appConfig: AppConfig;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${input.childId} FOR UPDATE`;
    const existingRequest = await tx.petRoomThemeUnlock.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { theme: { select: { key: true } } },
    });
    if (existingRequest) {
      if (existingRequest.childId !== input.childId || existingRequest.theme.key !== input.themeKey) {
        throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "这次操作无法重复使用");
      }
      await tx.petGrowthProfile.update({
        where: { childId: input.childId },
        data: { equippedRoomThemeId: existingRequest.themeId },
      });
      return;
    }
    await refreshTripStatus(tx, input.childId, now);
    const activeTrip = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
      select: { id: true },
    });
    if (activeTrip) throw new HttpError(409, "PET_AWAY", "星宠旅行回来后再布置小屋吧");
    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { familyId: true, starBalance: true },
    });
    const theme = await tx.petRoomTheme.findFirst({
      where: {
        key: input.themeKey,
        isEnabled: true,
        ownerFamilyId: null,
      },
    });
    if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "这个小屋背景暂时不可用");
    const priceStars = await getRoomThemePrice(tx, child.familyId, theme.id, theme.priceStars);
    const profile = await ensureProfile(tx, input.childId);
    if (priceStars === 0) {
      await tx.petGrowthProfile.update({
        where: { id: profile.id },
        data: { equippedRoomThemeId: theme.id },
      });
      return;
    }
    const existingUnlock = await tx.petRoomThemeUnlock.findUnique({
      where: { childId_themeId: { childId: input.childId, themeId: theme.id } },
    });
    if (existingUnlock) {
      await tx.petGrowthProfile.update({
        where: { id: profile.id },
        data: { equippedRoomThemeId: theme.id },
      });
      return;
    }
    if (child.starBalance < priceStars) {
      throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
    }
    await assertSpendAllowed({
      client: tx,
      childId: input.childId,
      limit: profile.dailySpendLimitStars,
      cost: priceStars,
      now,
      config: input.appConfig,
    });
    const unlock = await tx.petRoomThemeUnlock.create({
      data: {
        childId: input.childId,
        themeId: theme.id,
        priceStarsSnapshot: priceStars,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updatedChild = await tx.childProfile.update({
      where: { id: input.childId },
      data: { starBalance: { decrement: priceStars } },
      select: { starBalance: true },
    });
    await tx.petGrowthProfile.update({
      where: { id: profile.id },
      data: { equippedRoomThemeId: theme.id },
    });
    await tx.starLedger.create({
      data: {
        childId: input.childId,
        type: "PET_ROOM_THEME_SPEND",
        amount: -priceStars,
        balanceAfter: updatedChild.starBalance,
        reason: `购买小屋背景：${theme.name}`,
        referenceId: unlock.id,
        idempotencyKey: `pet-room-theme:${unlock.id}:spend`,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(input.childId, input.appConfig);
}

export async function selectPetRoomTheme(input: {
  childId: string;
  themeKey: string;
  appConfig: AppConfig;
}) {
  await prisma.$transaction(async (tx) => {
    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { familyId: true },
    });
    await refreshTripStatus(tx, input.childId, new Date());
    const activeTrip = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
      select: { id: true },
    });
    if (activeTrip) throw new HttpError(409, "PET_AWAY", "星宠旅行回来后再布置小屋吧");
    const theme = await tx.petRoomTheme.findFirst({
      where: {
        key: input.themeKey,
        isEnabled: true,
        ownerFamilyId: null,
      },
    });
    if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "这个小屋背景暂时不可用");
    const priceStars = await getRoomThemePrice(tx, child.familyId, theme.id, theme.priceStars);
    if (priceStars > 0) {
      const owned = await tx.petRoomThemeUnlock.findUnique({
        where: { childId_themeId: { childId: input.childId, themeId: theme.id } },
        select: { id: true },
      });
      if (!owned) throw new HttpError(403, "PET_ROOM_THEME_LOCKED", "先解锁这个小屋背景吧");
    }
    await ensureProfile(tx, input.childId);
    await tx.petGrowthProfile.update({
      where: { childId: input.childId },
      data: { equippedRoomThemeId: theme.id },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(input.childId, input.appConfig);
}

export async function careForPet(input: {
  childId: string;
  kind: PetCareKind;
  idempotencyKey: string;
  appConfig: AppConfig;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${input.childId} FOR UPDATE`;
    const existing = await tx.petCareAction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return;
    await refreshTripStatus(tx, input.childId, now);
    const activeTrip = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
      select: { id: true },
    });
    if (activeTrip) throw new HttpError(409, "PET_AWAY", "星宠旅行回来后才能照顾它");
    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { starBalance: true },
    });
    const { profile, config } = await settleProfile(tx, input.childId, now);
    const isFeed = input.kind === "FEED";
    const cost = isFeed ? config.feedCostStars : config.drinkCostStars;
    const restore = isFeed ? config.feedRestore : config.drinkRestore;
    const experienceAdded = isFeed ? config.feedExperience : config.drinkExperience;
    const before = isFeed ? profile.satiety : profile.hydration;
    if (before >= MAX_STATUS) {
      throw new HttpError(409, "PET_STATUS_FULL", isFeed ? "星宠现在吃得很饱" : "星宠现在不渴");
    }
    if (child.starBalance < cost) throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
    await assertSpendAllowed({
      client: tx,
      childId: input.childId,
      limit: profile.dailySpendLimitStars,
      cost,
      now,
      config: input.appConfig,
    });
    const after = Math.min(MAX_STATUS, before + restore);
    const experience = profile.experience + experienceAdded;
    const level = petLevelFromExperience(experience);
    await grantLevelUpRedPackets(tx, profile, level);
    const updatedProfile = await tx.petGrowthProfile.update({
      where: { id: profile.id },
      data: {
        ...(isFeed
          ? { satiety: after, satietySettledAt: now }
          : { hydration: after, hydrationSettledAt: now }),
        experience,
        level,
        growthStage: petGrowthStageForLevel(level),
      },
    });
    const action = await tx.petCareAction.create({
      data: {
        childId: input.childId,
        profileId: profile.id,
        kind: input.kind,
        itemKey: isFeed ? "PICNIC_MEAL" : "SPRING_WATER",
        starsSpent: cost,
        statusBefore: before,
        statusAfter: after,
        experienceAdded,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updatedChild = await tx.childProfile.update({
      where: { id: input.childId },
      data: { starBalance: { decrement: cost } },
      select: { starBalance: true },
    });
    await tx.starLedger.create({
      data: {
        childId: input.childId,
        type: "PET_CARE_SPEND",
        amount: -cost,
        balanceAfter: updatedChild.starBalance,
        reason: isFeed ? "给星宠准备点心" : "给星宠补充饮水",
        referenceId: action.id,
        idempotencyKey: `pet-care:${action.id}:spend`,
      },
    });
    return updatedProfile;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(input.childId, input.appConfig);
}

export async function cleanPetWaste(input: {
  childId: string;
  wasteId: string;
  idempotencyKey: string;
  appConfig: AppConfig;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${input.childId} FOR UPDATE`;
    const repeated = await tx.petWasteOccurrence.findUnique({
      where: { cleanIdempotencyKey: input.idempotencyKey },
      select: { childId: true },
    });
    if (repeated) {
      if (repeated.childId === input.childId) return;
      throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "这次清理操作无法重复使用");
    }

    await refreshTripStatus(tx, input.childId, now);
    const activeTrip = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
      select: { id: true },
    });
    if (activeTrip) throw new HttpError(409, "PET_AWAY", "星宠旅行回来后再清理小屋吧");

    const occurrence = await tx.petWasteOccurrence.findFirst({
      where: { id: input.wasteId, childId: input.childId },
    });
    if (!occurrence) throw new HttpError(404, "PET_WASTE_NOT_FOUND", "这个粑粑已经不在小屋里了");
    if (occurrence.cleanedAt) throw new HttpError(409, "PET_WASTE_ALREADY_CLEANED", "这个粑粑已经清理干净了");

    const currentMinute = businessMinuteOfDayAt(now, input.appConfig.APP_TIME_ZONE);
    const today = businessDateAt(now, input.appConfig.APP_TIME_ZONE);
    if (
      occurrence.wasteDate.getTime() > today.getTime()
      || (occurrence.wasteDate.getTime() === today.getTime() && occurrence.appearsMinute > currentMinute)
      || (occurrence.snoozedUntil !== null && occurrence.snoozedUntil > now)
    ) {
      throw new HttpError(409, "PET_WASTE_NOT_READY", "小屋现在很干净");
    }

    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { starBalance: true },
    });
    const profile = await ensureProfile(tx, input.childId);
    const cost = occurrence.costStarsSnapshot;
    if (child.starBalance < cost) throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
    await assertSpendAllowed({
      client: tx,
      childId: input.childId,
      limit: profile.dailySpendLimitStars,
      cost,
      now,
      config: input.appConfig,
    });

    await tx.petWasteOccurrence.update({
      where: { id: occurrence.id },
      data: { cleanedAt: now, cleanIdempotencyKey: input.idempotencyKey },
    });
    await tx.petWasteOccurrence.updateMany({
      where: {
        childId: input.childId,
        id: { not: occurrence.id },
        cleanedAt: null,
        wasteDate: { lte: today },
      },
      data: { snoozedUntil: petWasteCooldownUntil(now) },
    });
    if (cost > 0) {
      const updatedChild = await tx.childProfile.update({
        where: { id: input.childId },
        data: { starBalance: { decrement: cost } },
        select: { starBalance: true },
      });
      await tx.starLedger.create({
        data: {
          childId: input.childId,
          type: "PET_CARE_SPEND",
          amount: -cost,
          balanceAfter: updatedChild.starBalance,
          reason: "给星宠清理小屋",
          referenceId: occurrence.id,
          idempotencyKey: `pet-waste:${occurrence.id}:spend`,
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(input.childId, input.appConfig);
}

function weightedDestination<T extends { weight: number }>(items: T[]) {
  const total = items.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Math.max(1, item.weight);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

export async function startPetTrip(input: {
  childId: string;
  tier: PetTravelTier;
  idempotencyKey: string;
  appConfig: AppConfig;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${input.childId} FOR UPDATE`;
    const existing = await tx.petTrip.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return;
    await refreshTripStatus(tx, input.childId, now);
    const ongoing = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
    });
    if (ongoing) throw new HttpError(409, "PET_TRIP_ACTIVE", "星宠已经在旅行中，或者正在等你拆开明信片");
    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { starBalance: true },
    });
    const { profile, config } = await settleProfile(tx, input.childId, now);
    if (!profile.travelEnabled) throw new HttpError(403, "PET_TRAVEL_DISABLED", "家长暂时关闭了旅行功能");
    if (profile.satiety < 20 || profile.hydration < 20) {
      throw new HttpError(409, "PET_NEEDS_CARE", "先让星宠吃饱、喝足再出发吧");
    }
    const tripConfig = tierConfig(config, input.tier);
    if (child.starBalance < tripConfig.costStars) throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
    await assertSpendAllowed({
      client: tx,
      childId: input.childId,
      limit: profile.dailySpendLimitStars,
      cost: tripConfig.costStars,
      now,
      config: input.appConfig,
    });
    const destinations = await tx.petTravelDestination.findMany({
      where: { tier: input.tier, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (!destinations.length) throw new HttpError(409, "PET_DESTINATION_EMPTY", "这条旅行路线还没有开放景点");
    const visited = await tx.petTrip.findMany({
      where: { childId: input.childId, tierSnapshot: input.tier, status: "REVEALED" },
      select: { destinationId: true },
    });
    const visitedIds = new Set(visited.map((item) => item.destinationId));
    const unvisited = destinations.filter((item) => !visitedIds.has(item.id));
    const destination = weightedDestination(unvisited.length ? unvisited : destinations);
    const returnsAt = new Date(now.getTime() + tripConfig.durationMinutes * 60_000);
    const trip = await tx.petTrip.create({
      data: {
        childId: input.childId,
        profileId: profile.id,
        destinationId: destination.id,
        tierSnapshot: input.tier,
        destinationNameSnapshot: destination.name,
        citySnapshot: destination.city,
        countrySnapshot: destination.country,
        introductionSnapshot: destination.introduction,
        funFactSnapshot: destination.funFact,
        imageUrlSnapshot: destination.imageUrl,
        audioUrlSnapshot: destination.audioUrl,
        costStars: tripConfig.costStars,
        experienceRewardSnapshot: tripConfig.experience,
        departedAt: now,
        returnsAt,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updatedChild = await tx.childProfile.update({
      where: { id: input.childId },
      data: { starBalance: { decrement: tripConfig.costStars } },
      select: { starBalance: true },
    });
    await tx.starLedger.create({
      data: {
        childId: input.childId,
        type: "PET_TRAVEL_SPEND",
        amount: -tripConfig.costStars,
        balanceAfter: updatedChild.starBalance,
        reason: `星宠${input.tier === "NEARBY" ? "附近散步" : input.tier === "CHINA" ? "中国旅行" : "世界旅行"}`,
        referenceId: trip.id,
        idempotencyKey: `pet-trip:${trip.id}:spend`,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(input.childId, input.appConfig);
}

export async function revealPetTrip(childId: string, tripId: string, appConfig: AppConfig) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PetTrip" WHERE "id" = ${tripId} FOR UPDATE`;
    let trip = await tx.petTrip.findFirst({ where: { id: tripId, childId } });
    if (!trip) throw new HttpError(404, "PET_TRIP_NOT_FOUND", "没有找到这次旅行");
    if (trip.status === "REVEALED") return;
    if (trip.status === "TRAVELING" && trip.returnsAt <= now) {
      trip = await tx.petTrip.update({
        where: { id: trip.id },
        data: { status: "RETURNED", returnedAt: now },
      });
    }
    if (trip.status === "TRAVELING") throw new HttpError(409, "PET_TRIP_NOT_RETURNED", "星宠还在旅行中");
    if (trip.status !== "RETURNED") throw new HttpError(409, "PET_TRIP_UNAVAILABLE", "这次旅行不能领取");
    const profile = await ensureProfile(tx, childId);
    const experienceAdded = trip.experienceRewardSnapshot;
    const experience = profile.experience + experienceAdded;
    const level = petLevelFromExperience(experience);
    await grantLevelUpRedPackets(tx, profile, level);
    await tx.petGrowthProfile.update({
      where: { id: profile.id },
      data: { experience, level, growthStage: petGrowthStageForLevel(level) },
    });
    await tx.petTrip.update({
      where: { id: trip.id },
      data: {
        status: "REVEALED",
        revealedAt: now,
        experienceAwarded: experienceAdded,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getPetGrowthState(childId, appConfig);
}

export async function openPetRedPacket(input: {
  childId: string;
  idempotencyKey: string;
  appConfig: AppConfig;
}) {
  let reward: { packetId: string; stars: number; sourceLevel: number } | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${input.childId} FOR UPDATE`;
    const existing = await tx.petRedPacket.findUnique({
      where: { claimKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.childId !== input.childId || existing.rewardStars === null || existing.openedAt === null) {
        throw new HttpError(409, "IDEMPOTENCY_KEY_REUSED", "这次开红包操作无法重复使用");
      }
      reward = { packetId: existing.id, stars: existing.rewardStars, sourceLevel: existing.sourceLevel };
      return;
    }
    const packet = await tx.petRedPacket.findFirst({
      where: { childId: input.childId, openedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!packet) throw new HttpError(409, "PET_RED_PACKET_EMPTY", "现在还没有可以打开的星宠红包");
    const minStars = Math.max(1, Math.min(packet.minStarsSnapshot, packet.maxStarsSnapshot));
    const maxStars = Math.max(minStars, Math.max(packet.minStarsSnapshot, packet.maxStarsSnapshot));
    const stars = randomInt(minStars, maxStars + 1);
    const updatedChild = await tx.childProfile.update({
      where: { id: input.childId },
      data: {
        starBalance: { increment: stars },
        lifetimeStarsEarned: { increment: stars },
      },
      select: { starBalance: true },
    });
    await tx.petRedPacket.update({
      where: { id: packet.id },
      data: { rewardStars: stars, claimKey: input.idempotencyKey, openedAt: new Date() },
    });
    await tx.starLedger.create({
      data: {
        childId: input.childId,
        type: "PET_RED_PACKET_REWARD",
        amount: stars,
        balanceAfter: updatedChild.starBalance,
        reason: packet.grantKey.startsWith("pet-manual:")
          ? "家长赠送的星宠红包"
          : `星宠升级红包（Lv.${packet.sourceLevel}）`,
        referenceId: packet.id,
        idempotencyKey: `pet-red-packet:${packet.id}:reward`,
      },
    });
    reward = { packetId: packet.id, stars, sourceLevel: packet.sourceLevel };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!reward) throw new HttpError(500, "PET_RED_PACKET_OPEN_FAILED", "红包暂时没有打开，请再试一次");
  const state = await getPetGrowthState(input.childId, input.appConfig);
  return { state, reward };
}

export async function listPetDestinations() {
  const [config, destinations] = await Promise.all([
    getPetConfig(),
    prisma.petTravelDestination.findMany({
      orderBy: [{ tier: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { config, destinations };
}

export async function updatePetConfig(data: Partial<Awaited<ReturnType<typeof getPetConfig>>>) {
  const { id: _id, updatedAt: _updatedAt, ...allowed } = data;
  return prisma.petGrowthConfig.upsert({
    where: { id: "global" },
    update: allowed,
    create: { id: "global", ...allowed },
  });
}
