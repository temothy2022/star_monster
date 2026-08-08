import { Prisma, type PetCareKind, type PetTravelTier } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";

const MAX_STATUS = 100;
const LOW_PET_STATUS = 30;

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
    config.satietyDecayMinutes,
  );
  const hydration = settledPetStatus(
    profile.hydration,
    profile.hydrationSettledAt,
    now,
    config.hydrationDecayMinutes,
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
  await prisma.$transaction(async (tx) => {
    await settleProfile(tx, childId, now);
    await refreshTripStatus(tx, childId, now);
  });
  const [child, profile, config, currentTrip, postcards, tasks, mascotAssets, roomThemes, roomThemeUnlocks] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      select: { nickname: true, petType: true, starBalance: true },
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
      where: { slot: { in: ["CELEBRATE", "SLEEPING"] } },
      select: { petType: true, slot: true, mediaUrl: true, updatedAt: true },
    }),
    prisma.petRoomTheme.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.petRoomThemeUnlock.findMany({
      where: { childId },
      select: { themeId: true },
    }),
  ]);
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
  const equippedRoomTheme = roomThemes.find((theme) => theme.id === profile.equippedRoomThemeId)
    ?? roomThemes.find((theme) => theme.priceStars === 0)
    ?? roomThemes[0];
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
    mascotAssets: mascotAssets
      .filter((asset) => asset.petType === petType)
      .map((asset) => ({
        slot: asset.slot as "CELEBRATE" | "SLEEPING",
        mediaUrl: asset.mediaUrl,
        updatedAt: asset.updatedAt,
      })),
    roomThemes: roomThemes.map((theme) => ({
      key: theme.key,
      name: theme.name,
      description: theme.description,
      priceStars: theme.priceStars,
      backgroundLandscapeUrl: theme.backgroundLandscapeUrl,
      backgroundTabletUrl: theme.backgroundTabletUrl,
      backgroundPhoneUrl: theme.backgroundPhoneUrl,
      previewUrl: theme.previewUrl,
      ambience: parsePetRoomAmbience(theme.ambience),
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
    const theme = await tx.petRoomTheme.findFirst({
      where: { key: input.themeKey, isEnabled: true },
    });
    if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "这个小屋背景暂时不可用");
    const profile = await ensureProfile(tx, input.childId);
    if (theme.priceStars === 0) {
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
    const child = await tx.childProfile.findUniqueOrThrow({
      where: { id: input.childId },
      select: { starBalance: true },
    });
    if (child.starBalance < theme.priceStars) {
      throw new HttpError(409, "INSUFFICIENT_STARS", "星星余额不足");
    }
    await assertSpendAllowed({
      client: tx,
      childId: input.childId,
      limit: profile.dailySpendLimitStars,
      cost: theme.priceStars,
      now,
      config: input.appConfig,
    });
    const unlock = await tx.petRoomThemeUnlock.create({
      data: {
        childId: input.childId,
        themeId: theme.id,
        priceStarsSnapshot: theme.priceStars,
        idempotencyKey: input.idempotencyKey,
      },
    });
    const updatedChild = await tx.childProfile.update({
      where: { id: input.childId },
      data: { starBalance: { decrement: theme.priceStars } },
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
        amount: -theme.priceStars,
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
    await refreshTripStatus(tx, input.childId, new Date());
    const activeTrip = await tx.petTrip.findFirst({
      where: { childId: input.childId, status: { in: ["TRAVELING", "RETURNED"] } },
      select: { id: true },
    });
    if (activeTrip) throw new HttpError(409, "PET_AWAY", "星宠旅行回来后再布置小屋吧");
    const theme = await tx.petRoomTheme.findFirst({
      where: { key: input.themeKey, isEnabled: true },
    });
    if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "这个小屋背景暂时不可用");
    if (theme.priceStars > 0) {
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
