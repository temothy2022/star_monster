import { PlanetKey, Prisma } from "@prisma/client";
import type { DailyTaskStatus } from "@prisma/client";
import { MATH_LEGACY_QUESTION_TYPES, MATH_QUESTION_TYPES } from "@star-monsters/math-practice";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateKey,
  businessMinuteOfDayAt,
} from "../lib/time.js";
import { isScheduledForDate } from "../domain/task-rules.js";
import { clockMastery } from "../domain/clock-learning.js";
import {
  makeTenFactAssessment,
  makeTenMastery,
  makeTenQuestionWeight,
} from "../domain/make-ten-learning.js";
import type { MakeTenFactSnapshot } from "../domain/make-ten-learning.js";
import { requireParent } from "../services/auth-service.js";
import {
  abandonTask,
  generateDailyTasks,
  prepareDailyTasks,
  rollbackCompletedTask,
} from "../services/task-service.js";
import {
  getPlanetSettings,
  PLANET_KEYS,
  updatePlanetSettings,
} from "../services/planet-service.js";
import { updateRedemptionStatus } from "../services/wish-service.js";
import { writeAudit } from "../services/audit-service.js";
import { getGrowthAnalytics } from "../services/growth-analytics-service.js";
import { getMathMasteryForRange } from "../services/math-mastery-service.js";
import {
  getChildLeaderboardSettings,
  getFootprints,
  leaderboardEffectiveMinute,
} from "../services/footprint-service.js";
import { TASK_CATEGORIES, WISH_CATEGORIES } from "../domain/constants.js";
import { generateChallengeLetterIfEligible } from "../services/challenge-conversation-service.js";

const taskCategory = z.enum(TASK_CATEGORIES);
const taskMode = z.enum(["UNTIMED", "TIMED"]);
const taskExperienceKind = z.enum(["STANDARD", "HANZI_LEARNING", "CLOCK_LEARNING", "MAKE_TEN", "MATH_PRACTICE"]);
const scheduleKind = z.enum([
  "DAILY",
  "WORKDAYS",
  "SELECTED_WEEKDAYS",
  "ONE_TIME",
]);
const learningPracticeKind = z.enum([
  "GENERAL",
  "NEW_CONTENT",
  "REVIEW",
  "MIXED",
]);
const petType = z.enum(["DOUYA", "PAOPAO", "TUANTUAN", "MILU", "SHANSHAN"]);
const mathMasteryQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
});
const wishCategory = z.enum(WISH_CATEGORIES);
const presetIcon = z.enum([
  "math",
  "exercise",
  "chores",
  "chinese",
  "english",
  "other",
]);
const planetSettingsSchema = z
  .object({
    planets: z
      .array(
        z.object({
          planet: z.nativeEnum(PlanetKey),
          requiredLifetimeStars: z.number().int().min(0).max(1_000_000),
          bonusStars: z.number().int().min(0).max(10_000),
        }),
      )
      .length(PLANET_KEYS.length),
  })
  .superRefine((input, context) => {
    const uniqueKeys = new Set(input.planets.map((item) => item.planet));
    if (
      uniqueKeys.size !== PLANET_KEYS.length ||
      PLANET_KEYS.some((planet) => !uniqueKeys.has(planet))
    ) {
      context.addIssue({
        code: "custom",
        path: ["planets"],
        message: "必须完整设置八颗星球，且不能重复",
      });
    }

    let previousThreshold = -1;
    for (const planet of PLANET_KEYS) {
      const setting = input.planets.find((item) => item.planet === planet);
      if (!setting) continue;
      if (setting.requiredLifetimeStars < previousThreshold) {
        context.addIssue({
          code: "custom",
          path: ["planets", planet, "requiredLifetimeStars"],
          message: "后续星球的点亮门槛不能低于前一颗星球",
        });
      }
      previousThreshold = setting.requiredLifetimeStars;
    }
  });

const hanziSettingsSchema = z.object({
  newCharactersPerDay: z.number().int().min(1).max(10),
  reviewDailyLimit: z.number().int().min(1).max(50),
  consolidationQuestionCount: z.number().int().min(1).max(10),
  reviewTaskStars: z.number().int().min(1).max(999),
});
const clockSettingsSchema = z.object({
  questionsPerDay: z.number().int().min(1).max(20),
  minuteStep: z.union([z.literal(1), z.literal(5)]),
});
const makeTenSettingsSchema = z.object({
  questionsPerDay: z.number().int().min(1).max(50),
  secondsPerQuestion: z.number().min(2).max(30),
  passAccuracyPercent: z.number().int().min(1).max(100),
});
const mathPracticeSettingsSchema = z.object({
  totalQuestions: z.number().int().min(1).max(100),
  typeCounts: z.record(z.string(), z.number().int().min(0).max(100)),
  arithmeticItemsPerQuestion: z.record(z.string(), z.number().int().min(1).max(20)).default({}),
}).superRefine((input, context) => {
  // Accept legacy IDs on read/write so existing parent settings can be
  // migrated without a validation failure. They are not exposed by the new
  // picker, but old task snapshots may still need their original generator.
  const validIds = new Set<string>([
    ...MATH_QUESTION_TYPES,
    ...MATH_LEGACY_QUESTION_TYPES,
  ].map((item) => item.id));
  const invalidId = Object.keys(input.typeCounts).find((typeId) => !validIds.has(typeId));
  if (invalidId) context.addIssue({ code: "custom", path: ["typeCounts", invalidId], message: "包含未知的数学题型" });
  const allocated = Object.values(input.typeCounts).reduce((sum, count) => sum + count, 0);
  if (allocated !== input.totalQuestions) context.addIssue({ code: "custom", path: ["typeCounts"], message: "各题型数量之和必须等于题目总数" });
}).transform((input) => {
  const typeCounts = { ...input.typeCounts };
  for (const [legacyId, canonicalId] of [["P02", "P01"], ["P04", "P03"]] as const) {
    if (!(legacyId in typeCounts)) continue;
    typeCounts[canonicalId] = (typeCounts[canonicalId] ?? 0) + (typeCounts[legacyId] ?? 0);
    delete typeCounts[legacyId];
  }
  return { ...input, typeCounts };
});
const DEFAULT_MATH_PRACTICE_SETTINGS = {
  totalQuestions: 10,
  typeCounts: { N01: 2, C07: 2, V01: 2, V04: 1, W01: 1, W03: 1, S04: 1 },
  arithmeticItemsPerQuestion: { C02: 5, C03: 5, C04: 5, C05: 5, C06: 5, C07: 5, C08: 5, C09: 5, C10: 5, C11: 5, C12: 5, C13: 5, C14: 5 },
};

async function loadMathPracticeSettings(childId: string) {
  const settings = await prisma.mathPracticeSettings.findUnique({ where: { childId } });
  if (settings) {
    return mathPracticeSettingsSchema.parse({
      totalQuestions: settings.totalQuestions,
      typeCounts: settings.typeCounts,
      arithmeticItemsPerQuestion: settings.arithmeticItemsPerQuestion,
    });
  }
  const legacy = await prisma.mathPracticeConfig.findFirst({
    where: { taskTemplate: { childId, experienceKind: "MATH_PRACTICE", archivedAt: null } },
    orderBy: { updatedAt: "desc" },
  });
  return mathPracticeSettingsSchema.parse(legacy
    ? { totalQuestions: legacy.totalQuestions, typeCounts: legacy.typeCounts, arithmeticItemsPerQuestion: legacy.arithmeticItemsPerQuestion }
    : DEFAULT_MATH_PRACTICE_SETTINGS);
}
const leaderboardSettingsSchema = z.object({
  competitorGrowthPercent: z.number().int().min(25).max(200),
  dailyCompetitorStarDelta: z.number().int().min(-50).max(50),
});
const hanziLibraryQuery = z.object({
  q: z.string().trim().max(80).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
const poemSettingsSchema = z
  .object({
    enabled: z.boolean(),
    learningWeekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7),
    learningTaskStars: z.number().int().min(1).max(999),
    reviewTaskStars: z.number().int().min(1).max(999),
  })
  .superRefine((input, context) => {
    if (new Set(input.learningWeekdays).size !== input.learningWeekdays.length) {
      context.addIssue({
        code: "custom",
        path: ["learningWeekdays"],
        message: "不能重复选择同一个古诗学习日",
      });
    }
  });
const poemLibraryQuery = z.object({
  q: z.string().trim().max(80).default(""),
  grade: z.coerce.number().int().min(1).max(6).optional(),
});

const taskTemplateShape = {
  title: z.string().trim().min(1).max(80),
  category: taskCategory,
  iconKey: presetIcon,
  mode: taskMode,
  experienceKind: taskExperienceKind.default("STANDARD"),
  suggestedSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  timeLimitSeconds: z.number().int().min(10).max(86400).nullable().optional(),
  baseStars: z.number().int().min(1).max(999),
  earlyBonusEnabled: z.boolean().default(false),
  earlyThresholdSeconds: z
    .number()
    .int()
    .min(1)
    .max(86400)
    .nullable()
    .optional(),
  earlyBonusStars: z.number().int().min(1).max(999).nullable().optional(),
  repeatableDaily: z.boolean().default(false),
  scheduleKind,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  oneTimeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isEnabled: z.boolean().default(true),
  aiSchedulingEnabled: z.boolean().default(false),
  learningPracticeKind: learningPracticeKind.default("GENERAL"),
  targetSessionsPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  minimumGapDays: z.number().int().min(0).max(6).nullable().optional(),
};

const taskTemplateSchema = z
  .object(taskTemplateShape)
  .superRefine((input, context) => {
    if (input.mode === "TIMED" && !input.timeLimitSeconds) {
      context.addIssue({
        code: "custom",
        path: ["timeLimitSeconds"],
        message: "限时任务必须设置时限",
      });
    }
    if (
      (input.experienceKind === "HANZI_LEARNING" ||
        input.experienceKind === "CLOCK_LEARNING") &&
      (input.mode !== "UNTIMED" || input.repeatableDaily)
    ) {
      context.addIssue({
        code: "custom",
        path: ["experienceKind"],
        message: "学习任务必须是不限时且当天不可重复领取的任务",
      });
    }
    if (input.experienceKind === "MAKE_TEN" && input.mode !== "UNTIMED") {
      context.addIssue({
        code: "custom",
        path: ["experienceKind"],
        message: "凑十训练必须是不限时任务",
      });
    }
    if (input.experienceKind === "MATH_PRACTICE") {
      if (input.mode !== "UNTIMED") {
        context.addIssue({
          code: "custom",
          path: ["experienceKind"],
          message: "数学练习必须是不限时任务",
        });
      }
    }
    if (
      input.earlyBonusEnabled &&
      (input.mode !== "TIMED" ||
        !input.earlyThresholdSeconds ||
        !input.earlyBonusStars)
    ) {
      context.addIssue({
        code: "custom",
        path: ["earlyBonusEnabled"],
        message: "提前奖励需要限时、阈值和奖励星数",
      });
    }
    if (
      input.earlyBonusEnabled &&
      input.timeLimitSeconds &&
      input.earlyThresholdSeconds &&
      input.earlyThresholdSeconds > input.timeLimitSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["earlyThresholdSeconds"],
        message: "提前加奖时间不能大于任务总时限",
      });
    }
    if (
      input.scheduleKind === "SELECTED_WEEKDAYS" &&
      input.weekdays.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["weekdays"],
        message: "至少选择一个星期",
      });
    }
    if (input.scheduleKind === "ONE_TIME" && !input.oneTimeDate) {
      context.addIssue({
        code: "custom",
        path: ["oneTimeDate"],
        message: "一次性任务必须选择日期",
      });
    }
  });

const taskTemplatePatchSchema = z.object(taskTemplateShape).partial();
const childProfileSchema = z.object({
  nickname: z.string().trim().min(2).max(9).optional(),
  dailyStarGoal: z.number().int().min(1).max(999).optional(),
  dailyGoalBonusEnabled: z.boolean().optional(),
  dailyGoalBonusStars: z.number().int().min(0).max(999).optional(),
  petType: petType.optional(),
  resetOnboarding: z.boolean().optional(),
});
const wishShape = {
  category: wishCategory,
  title: z.string().trim().min(1).max(80),
  costStars: z.number().int().min(1).max(99999),
  redemptionType: z
    .enum(["ONE_TIME", "RECURRING", "STOCK"])
    .default("ONE_TIME"),
  recurrenceKind: z
    .enum(["DAILY", "WEEKLY", "INTERVAL"])
    .nullable()
    .default(null),
  recurrenceIntervalDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .nullable()
    .default(null),
  stockRemaining: z.number().int().min(0).max(99999).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isEnabled: z.boolean().default(true),
};
const wishSchema = z.object(wishShape).superRefine((input, context) => {
  if (input.redemptionType === "RECURRING" && !input.recurrenceKind) {
    context.addIssue({
      code: "custom",
      path: ["recurrenceKind"],
      message: "循环兑换必须选择周期",
    });
  }
  if (
    input.redemptionType === "RECURRING" &&
    input.recurrenceKind === "INTERVAL" &&
    !input.recurrenceIntervalDays
  ) {
    context.addIssue({
      code: "custom",
      path: ["recurrenceIntervalDays"],
      message: "请填写间隔天数",
    });
  }
  if (input.redemptionType === "STOCK" && input.stockRemaining === null) {
    context.addIssue({
      code: "custom",
      path: ["stockRemaining"],
      message: "库存兑换必须填写库存数量",
    });
  }
});
const wishPatchSchema = z.object(wishShape).partial();

function normalizedWishData(input: z.infer<typeof wishSchema>) {
  const recurrenceKind =
    input.redemptionType === "RECURRING"
      ? (input.recurrenceKind ?? "DAILY")
      : null;
  return {
    category: input.category,
    title: input.title,
    costStars: input.costStars,
    redemptionType: input.redemptionType,
    recurrenceKind,
    recurrenceIntervalDays:
      recurrenceKind === "DAILY"
        ? 1
        : recurrenceKind === "WEEKLY"
          ? 7
          : recurrenceKind === "INTERVAL"
            ? input.recurrenceIntervalDays
            : null,
    stockRemaining:
      input.redemptionType === "STOCK" ? input.stockRemaining : null,
    sortOrder: input.sortOrder,
    isEnabled: input.isEnabled,
  };
}
const redemptionStatusSchema = z.object({
  status: z.enum(["ARRANGED", "COMPLETED", "CANCELLED"]),
  cancelReason: z.string().trim().min(2).max(200).optional(),
});
const adjustmentSchema = z.object({
  amount: z.number().int().min(-9999).max(9999).refine((value) => value !== 0),
  reason: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().trim().min(8).max(100),
});
const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0) }))
    .min(1)
    .max(200),
});
const idParams = z.object({ id: z.string().min(1) });
const childResourceParams = z.object({
  childId: z.string().min(1),
  id: z.string().min(1),
});
const statsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const historyQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const growthAnalyticsQuery = z.object({
  days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), {
    message: "统计范围只支持 7、30 或 90 天",
  }).default(30),
});
const historyTaskParams = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
});

async function requireOwnedChild(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  childId: string,
) {
  const { user } = await requireParent(request, reply, config);
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, familyId: user.familyId ?? "__none__" },
  });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
  return { user, child };
}

function dateOrNull(value?: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function templateData(input: z.infer<typeof taskTemplateSchema>) {
  return {
    title: input.title,
    category: input.category,
    iconKey: input.iconKey,
    mode: input.mode,
    experienceKind: input.experienceKind,
    suggestedSeconds:
      input.mode === "UNTIMED" ? (input.suggestedSeconds ?? null) : null,
    timeLimitSeconds:
      input.mode === "TIMED" ? (input.timeLimitSeconds ?? null) : null,
    baseStars: input.baseStars,
    earlyBonusEnabled: input.mode === "TIMED" && input.earlyBonusEnabled,
    earlyThresholdSeconds:
      input.mode === "TIMED" && input.earlyBonusEnabled
        ? (input.earlyThresholdSeconds ?? null)
        : null,
    earlyBonusStars:
      input.mode === "TIMED" && input.earlyBonusEnabled
        ? (input.earlyBonusStars ?? null)
        : null,
    repeatableDaily: input.repeatableDaily,
    scheduleKind: input.scheduleKind,
    weekdays:
      input.scheduleKind === "SELECTED_WEEKDAYS"
        ? [...new Set(input.weekdays)]
        : [],
    oneTimeDate:
      input.scheduleKind === "ONE_TIME"
        ? dateOrNull(input.oneTimeDate)
        : null,
    sortOrder: input.sortOrder,
    isEnabled: input.isEnabled,
    aiSchedulingEnabled:
      input.scheduleKind !== "ONE_TIME" && input.aiSchedulingEnabled,
    learningPracticeKind: input.learningPracticeKind,
    targetSessionsPerWeek:
      input.scheduleKind !== "ONE_TIME" && input.aiSchedulingEnabled
      ? (input.targetSessionsPerWeek ?? null)
      : null,
    minimumGapDays:
      input.scheduleKind !== "ONE_TIME" && input.aiSchedulingEnabled
      ? (input.minimumGapDays ?? null)
      : null,
  };
}

type PoemSettingsInput = z.infer<typeof poemSettingsSchema>;

async function ensurePoemTaskTemplates(
  tx: Prisma.TransactionClient,
  childId: string,
  settings: PoemSettingsInput,
) {
  const common = {
    childId,
    category: "CHINESE" as const,
    iconKey: "chinese",
    mode: "UNTIMED" as const,
    suggestedSeconds: 600,
    timeLimitSeconds: null,
    earlyBonusEnabled: false,
    earlyThresholdSeconds: null,
    earlyBonusStars: null,
    repeatableDaily: false,
    archivedAt: null,
    aiSchedulingEnabled: false,
    targetSessionsPerWeek: null,
    minimumGapDays: null,
    systemManaged: true,
    isEnabled: settings.enabled,
  };

  await Promise.all([
    tx.taskTemplate.upsert({
      where: { systemKey: `poem-learning:${childId}` },
      create: {
        ...common,
        systemKey: `poem-learning:${childId}`,
        title: "学习新古诗",
        experienceKind: "POEM_LEARNING",
        baseStars: settings.learningTaskStars,
        scheduleKind: "SELECTED_WEEKDAYS",
        weekdays: [...new Set(settings.learningWeekdays)].sort(),
        oneTimeDate: null,
        sortOrder: 5,
        learningPracticeKind: "NEW_CONTENT",
      },
      update: {
        ...common,
        title: "学习新古诗",
        experienceKind: "POEM_LEARNING",
        baseStars: settings.learningTaskStars,
        scheduleKind: "SELECTED_WEEKDAYS",
        weekdays: [...new Set(settings.learningWeekdays)].sort(),
        oneTimeDate: null,
        sortOrder: 5,
        learningPracticeKind: "NEW_CONTENT",
      },
    }),
    tx.taskTemplate.upsert({
      where: { systemKey: `poem-review:${childId}` },
      create: {
        ...common,
        systemKey: `poem-review:${childId}`,
        title: "复习古诗",
        experienceKind: "POEM_REVIEW",
        baseStars: settings.reviewTaskStars,
        scheduleKind: "DAILY",
        weekdays: [],
        oneTimeDate: null,
        sortOrder: 6,
        learningPracticeKind: "REVIEW",
      },
      update: {
        ...common,
        title: "复习古诗",
        experienceKind: "POEM_REVIEW",
        baseStars: settings.reviewTaskStars,
        scheduleKind: "DAILY",
        weekdays: [],
        oneTimeDate: null,
        sortOrder: 6,
        learningPracticeKind: "REVIEW",
      },
    }),
  ]);
}

async function ensureHanziTaskTemplates(
  tx: Prisma.TransactionClient,
  childId: string,
  settings: z.infer<typeof hanziSettingsSchema>,
) {
  const common = {
    childId,
    category: "CHINESE" as const,
    iconKey: "chinese",
    mode: "UNTIMED" as const,
    suggestedSeconds: 600,
    timeLimitSeconds: null,
    earlyBonusEnabled: false,
    earlyThresholdSeconds: null,
    earlyBonusStars: null,
    repeatableDaily: false,
    archivedAt: null,
    aiSchedulingEnabled: false,
    targetSessionsPerWeek: null,
    minimumGapDays: null,
    systemManaged: true,
    isEnabled: true,
  };

  await tx.taskTemplate.upsert({
      where: { systemKey: `hanzi-review:${childId}` },
      create: {
        ...common,
        systemKey: `hanzi-review:${childId}`,
        title: "复习汉字",
        experienceKind: "HANZI_REVIEW",
        baseStars: settings.reviewTaskStars,
        scheduleKind: "DAILY",
        weekdays: [],
        oneTimeDate: null,
        sortOrder: 6,
        learningPracticeKind: "REVIEW",
      },
      update: {
        ...common,
        title: "复习汉字",
        experienceKind: "HANZI_REVIEW",
        baseStars: settings.reviewTaskStars,
        scheduleKind: "DAILY",
        weekdays: [],
        oneTimeDate: null,
        sortOrder: 6,
        learningPracticeKind: "REVIEW",
      },
    });
}

export async function registerParentRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/parent/children", async (request, reply) => {
  const { user } = await requireParent(request, reply, config);
    return {
      children: await prisma.childProfile.findMany({
        where: { familyId: user.familyId ?? "__none__" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nickname: true,
          avatarUrl: true,
          petType: true,
          status: true,
          onboardingCompletedAt: true,
          dailyStarGoal: true,
          dailyGoalBonusEnabled: true,
          dailyGoalBonusStars: true,
          starBalance: true,
          lifetimeStarsEarned: true,
          loginCodeLastFour: true,
          lastLoginAt: true,
        },
      }),
    };
  });

  app.patch("/api/parent/children/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { user, child: existingChild } = await requireOwnedChild(request, reply, config, id);
    const input = childProfileSchema.parse(request.body);
    const child = await prisma.$transaction(async (tx) => {
      const updated = await tx.childProfile.update({
        where: { id },
        data: {
          ...(input.nickname ? { nickname: input.nickname } : {}),
          ...(input.dailyStarGoal
            ? { dailyStarGoal: input.dailyStarGoal }
            : {}),
          ...(input.dailyGoalBonusEnabled !== undefined
            ? { dailyGoalBonusEnabled: input.dailyGoalBonusEnabled }
            : {}),
          ...(input.dailyGoalBonusStars !== undefined
            ? { dailyGoalBonusStars: input.dailyGoalBonusStars }
            : {}),
          ...(input.petType ? { petType: input.petType } : {}),
          ...(input.resetOnboarding
            ? { onboardingCompletedAt: null }
            : {}),
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: existingChild.familyId,
        action: "CHILD_PROFILE_UPDATE",
        resourceType: "ChildProfile",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { child };
  });

  app.get("/api/parent/children/:id/leaderboard/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const [settings, footprints] = await Promise.all([
      getChildLeaderboardSettings(id, today),
      getFootprints(id, config),
    ]);
    return { settings, preview: footprints.leaderboards.daily };
  });

  app.patch("/api/parent/children/:id/leaderboard/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const input = leaderboardSettingsSchema.parse(request.body);
    const now = new Date();
    const today = businessDateAt(now, config.APP_TIME_ZONE);
    const todayKey = businessDateKey(today);
    const currentMinute = businessMinuteOfDayAt(now, config.APP_TIME_ZONE);
    const previousSettings = await getChildLeaderboardSettings(id, today);
    const effectiveMinute = leaderboardEffectiveMinute(
      previousSettings,
      todayKey,
      currentMinute,
    );
    await prisma.$transaction(async (tx) => {
      await tx.childLeaderboardSettings.upsert({
        where: { childId: id },
        create: {
          childId: id,
          competitorGrowthPercent: input.competitorGrowthPercent,
          dailyCompetitorStarDelta: input.dailyCompetitorStarDelta,
          dailyAdjustmentDate: today,
          speedAnchorDate: today,
          speedAnchorMinute: currentMinute,
          speedAnchorEffectiveMinute: effectiveMinute,
        },
        update: {
          competitorGrowthPercent: input.competitorGrowthPercent,
          dailyCompetitorStarDelta: input.dailyCompetitorStarDelta,
          dailyAdjustmentDate: today,
          speedAnchorDate: today,
          speedAnchorMinute: currentMinute,
          speedAnchorEffectiveMinute: effectiveMinute,
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "CHILD_LEADERBOARD_SETTINGS_UPDATE",
        resourceType: "ChildLeaderboardSettings",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
    });
    const [settings, footprints] = await Promise.all([
      getChildLeaderboardSettings(id, today),
      getFootprints(id, config),
    ]);
    return { settings, preview: footprints.leaderboards.daily };
  });

  app.get("/api/parent/children/:id/devices", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return {
      devices: await prisma.childSession.findMany({
        where: { childId: id, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          deviceName: true,
          userAgent: true,
          ipAddress: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
    };
  });

  app.post("/api/parent/children/:id/logout-all", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const count = await prisma.$transaction(async (tx) => {
      const result = await tx.childSession.deleteMany({ where: { childId: id } });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "CHILD_LOGOUT_ALL",
        resourceType: "ChildProfile",
        resourceId: id,
        ipAddress: request.ip,
      });
      return result.count;
    });
    return { ok: true, sessionsRemoved: count };
  });

  app.get("/api/parent/children/:id/task-templates", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return {
      templates: await prisma.taskTemplate.findMany({
        where: { childId: id, archivedAt: null },
        include: { mathPracticeConfig: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    };
  });

  app.post("/api/parent/children/:id/task-templates", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = taskTemplateSchema.parse(request.body);
    const mathPracticeConfig = input.experienceKind === "MATH_PRACTICE"
      ? await loadMathPracticeSettings(id)
      : null;
    const template = await prisma.taskTemplate.create({
      data: {
        childId: id,
        ...templateData(input),
        ...(input.experienceKind === "MATH_PRACTICE" && mathPracticeConfig
          ? {
              mathPracticeConfig: {
                create: {
                  totalQuestions: mathPracticeConfig.totalQuestions,
                  typeCounts: mathPracticeConfig.typeCounts,
                  arithmeticItemsPerQuestion: mathPracticeConfig.arithmeticItemsPerQuestion,
                },
              },
            }
          : {}),
      },
      include: { mathPracticeConfig: true },
    });
    await generateDailyTasks(
      id,
      businessDateAt(new Date(), config.APP_TIME_ZONE),
    );
    reply.status(201);
    return { template };
  });

  app.get("/api/parent/children/:id/math/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return { settings: await loadMathPracticeSettings(id) };
  });

  app.patch("/api/parent/children/:id/math/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = mathPracticeSettingsSchema.parse(request.body);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const settings = await prisma.$transaction(async (tx) => {
      const saved = await tx.mathPracticeSettings.upsert({ where: { childId: id }, update: input, create: { childId: id, ...input } });
      const templates = await tx.taskTemplate.findMany({ where: { childId: id, experienceKind: "MATH_PRACTICE", archivedAt: null }, select: { id: true, repeatableDaily: true } });
      for (const template of templates) {
        await tx.mathPracticeConfig.upsert({ where: { taskTemplateId: template.id }, update: input, create: { taskTemplateId: template.id, ...input } });
      }
      const templateIds = templates.map((template) => template.id);
      const repeatableTemplateIds = templates.filter((template) => template.repeatableDaily).map((template) => template.id);
      if (templateIds.length) {
        await tx.dailyTask.updateMany({
          where: {
            childId: id,
            taskDate: today,
            OR: [
              { templateId: { in: templateIds }, status: { in: ["PENDING", "EXPIRED"] } },
              ...(repeatableTemplateIds.length
                ? [{ templateId: { in: repeatableTemplateIds }, status: "COMPLETED" as const }]
                : []),
            ],
          },
          data: { mathPracticeConfigSnapshot: input },
        });
      }
      return saved;
    });
    return { settings: { totalQuestions: settings.totalQuestions, typeCounts: settings.typeCounts, arithmeticItemsPerQuestion: settings.arithmeticItemsPerQuestion } };
  });

  app.patch(
    "/api/parent/children/:childId/task-templates/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const patch = taskTemplatePatchSchema.parse(request.body);
      const existing = await prisma.taskTemplate.findFirst({
        where: { id, childId, archivedAt: null, systemManaged: false },
        include: { mathPracticeConfig: true },
      });
      if (!existing)
        throw new HttpError(404, "TASK_TEMPLATE_NOT_FOUND", "没有找到任务模板");

      const merged = taskTemplateSchema.parse({
        ...existing,
        ...patch,
        oneTimeDate:
          patch.oneTimeDate !== undefined
            ? patch.oneTimeDate
            : existing.oneTimeDate?.toISOString().slice(0, 10),
      });
      const mathPracticeConfig = merged.experienceKind === "MATH_PRACTICE"
        ? await loadMathPracticeSettings(childId)
        : null;
      const template = await prisma.taskTemplate.update({
        where: { id },
        data: {
          ...templateData(merged),
          mathPracticeConfig:
            merged.experienceKind === "MATH_PRACTICE" && mathPracticeConfig
              ? {
                  upsert: {
                    create: {
                      totalQuestions: mathPracticeConfig.totalQuestions,
                      typeCounts: mathPracticeConfig.typeCounts,
                      arithmeticItemsPerQuestion: mathPracticeConfig.arithmeticItemsPerQuestion,
                    },
                    update: {
                      totalQuestions: mathPracticeConfig.totalQuestions,
                      typeCounts: mathPracticeConfig.typeCounts,
                      arithmeticItemsPerQuestion: mathPracticeConfig.arithmeticItemsPerQuestion,
                    },
                  },
                }
              : existing.mathPracticeConfig
                ? { delete: true }
                : undefined,
        },
        include: { mathPracticeConfig: true },
      });
      const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
      const remainsScheduledToday =
        template.isEnabled && isScheduledForDate(template, today);
      const todaySnapshotStatuses: DailyTaskStatus[] = template.repeatableDaily
        ? ["PENDING", "EXPIRED", "COMPLETED"]
        : ["PENDING", "EXPIRED"];
      await prisma.dailyTask.updateMany({
        where: {
          childId,
          templateId: id,
          taskDate: today,
          status: { in: todaySnapshotStatuses },
        },
        data: remainsScheduledToday
          ? {
              status: "PENDING",
              expiredAt: null,
              sortOrder: template.sortOrder,
              titleSnapshot: template.title,
              categorySnapshot: template.category,
              iconKeySnapshot: template.iconKey,
              modeSnapshot: template.mode,
              experienceKindSnapshot: template.experienceKind,
              suggestedSecondsSnapshot: template.suggestedSeconds,
              timeLimitSecondsSnapshot: template.timeLimitSeconds,
              baseStarsSnapshot: template.baseStars,
              earlyBonusEnabledSnapshot: template.earlyBonusEnabled,
              earlyThresholdSecsSnapshot: template.earlyThresholdSeconds,
              earlyBonusStarsSnapshot: template.earlyBonusStars,
              repeatableDailySnapshot: template.repeatableDaily,
              mathPracticeConfigSnapshot: template.mathPracticeConfig
                ? {
                    totalQuestions: template.mathPracticeConfig.totalQuestions,
                    typeCounts: template.mathPracticeConfig.typeCounts,
                    arithmeticItemsPerQuestion: template.mathPracticeConfig.arithmeticItemsPerQuestion,
                  }
                : Prisma.JsonNull,
            }
          : { status: "EXPIRED", expiredAt: new Date() },
      });
      if (!template.repeatableDaily) {
        await prisma.dailyTask.updateMany({
          where: {
            childId,
            templateId: id,
            taskDate: today,
            status: "PENDING",
            attempts: { some: { status: "COMPLETED" } },
          },
          data: { status: "COMPLETED" },
        });
      }
      return { template };
    },
  );

  app.delete(
    "/api/parent/children/:childId/task-templates/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const activeSlot = await prisma.activeTaskSlot.findUnique({
        where: { childId },
        include: { attempt: { include: { dailyTask: true } } },
      });
      if (activeSlot?.attempt.dailyTask.templateId === id) {
        await abandonTask(childId, activeSlot.attempt.id);
      }
      const result = await prisma.taskTemplate.updateMany({
        where: { id, childId, archivedAt: null, systemManaged: false },
        data: { archivedAt: new Date(), isEnabled: false },
      });
      if (!result.count)
        throw new HttpError(404, "TASK_TEMPLATE_NOT_FOUND", "没有找到任务模板");
      const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
      await prisma.dailyTask.updateMany({
        where: {
          childId,
          templateId: id,
          taskDate: today,
          status: { in: ["PENDING", "EXPIRED"] },
        },
        data: { status: "EXPIRED", expiredAt: new Date() },
      });
      return { ok: true };
    },
  );

  app.put(
    "/api/parent/children/:id/task-templates/order",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const { items } = reorderSchema.parse(request.body);
      const owned = await prisma.taskTemplate.count({
        where: {
          childId,
          archivedAt: null,
          systemManaged: false,
          id: { in: items.map((item) => item.id) },
        },
      });
      if (owned !== items.length)
        throw new HttpError(400, "INVALID_TEMPLATE_IDS", "任务排序中包含无效项目");
      const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
      await prisma.$transaction(
        items.flatMap((item) => [
          prisma.taskTemplate.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          }),
          prisma.dailyTask.updateMany({
            where: {
              childId,
              templateId: item.id,
              taskDate: today,
            },
            data: { sortOrder: item.sortOrder },
          }),
        ]),
      );
      return { ok: true };
    },
  );

  app.get("/api/parent/children/:id/poems/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const settings = await prisma.poemLearningSettings.upsert({
      where: { childId: id },
      update: {},
      create: { childId: id },
    });
    await prisma.$transaction((tx) =>
      ensurePoemTaskTemplates(tx, id, settings),
    );

    const [progress, poemCount, dueCount] = await Promise.all([
      prisma.poemLearningProgress.groupBy({
        by: ["status"],
        where: { childId: id },
        _count: { _all: true },
      }),
      prisma.poem.count({ where: { isEnabled: true } }),
      prisma.poemLearningProgress.count({
        where: {
          childId: id,
          status: "LEARNING",
          nextReviewDate: {
            lte: businessDateAt(new Date(), config.APP_TIME_ZONE),
          },
          poem: { isEnabled: true },
        },
      }),
    ]);

    return {
      settings,
      progress: Object.fromEntries(
        progress.map((item) => [item.status, item._count._all]),
      ),
      poemCount,
      dueCount,
    };
  });

  app.patch("/api/parent/children/:id/poems/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = poemSettingsSchema.parse(request.body);
    const settings = await prisma.$transaction(async (tx) => {
      const updated = await tx.poemLearningSettings.upsert({
        where: { childId: id },
        create: { childId: id, ...input },
        update: input,
      });
      await ensurePoemTaskTemplates(tx, id, input);
      return updated;
    });
    await prepareDailyTasks(id, config);
    return { settings };
  });

  app.get("/api/parent/children/:id/poems", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const { q, grade } = poemLibraryQuery.parse(request.query);
    const poems = await prisma.poem.findMany({
      where: {
        isEnabled: true,
        ...(grade ? { grade } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { author: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        progress: {
          where: { childId: id },
          select: {
            status: true,
            reviewStage: true,
            nextReviewDate: true,
          },
        },
      },
      orderBy: [
        { grade: "asc" },
        { sortOrder: "asc" },
      ],
    });

    return {
      poems: poems.map(({ progress, ...poem }) => ({
        ...poem,
        progress: progress[0] ?? null,
      })),
    };
  });

  app.get("/api/parent/children/:id/hanzi/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const settings = await prisma.hanziLearningSettings.upsert({
        where: { childId: id },
        update: {},
        create: { childId: id },
      });
    await prisma.$transaction((tx) => ensureHanziTaskTemplates(tx, id, settings));
    const [progress, characterCount] = await Promise.all([
      prisma.hanziLearningProgress.groupBy({
        by: ["status"],
        where: { childId: id },
        _count: { _all: true },
      }),
      prisma.hanziCharacter.count({ where: { isEnabled: true } }),
    ]);
    return {
      settings,
      progress: Object.fromEntries(
        progress.map((item) => [item.status, item._count._all]),
      ),
      characterCount,
    };
  });

  app.patch("/api/parent/children/:id/hanzi/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = hanziSettingsSchema.parse(request.body);
    const settings = await prisma.$transaction(async (tx) => {
      const updated = await tx.hanziLearningSettings.upsert({
        where: { childId: id },
        update: input,
        create: { childId: id, ...input },
      });
      await ensureHanziTaskTemplates(tx, id, updated);
      return updated;
    });
    await prepareDailyTasks(id, config);
    return { settings };
  });

  app.get("/api/parent/children/:id/clock/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const recentFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [settings, allTime, recent] = await Promise.all([
      prisma.clockLearningSettings.upsert({
        where: { childId: id },
        update: {},
        create: { childId: id },
      }),
      prisma.clockLearningSession.aggregate({
        where: {
          childId: id,
          completedAt: { not: null },
        },
        _count: { _all: true },
        _sum: { correctCount: true, totalQuestions: true },
      }),
      prisma.clockLearningSession.aggregate({
        where: {
          childId: id,
          completedAt: { gte: recentFrom },
        },
        _count: { _all: true },
        _sum: { correctCount: true, totalQuestions: true },
      }),
    ]);
    const totalQuestions = allTime._sum.totalQuestions ?? 0;
    const correctAnswers = allTime._sum.correctCount ?? 0;
    const recentQuestions = recent._sum.totalQuestions ?? 0;
    const recentCorrect = recent._sum.correctCount ?? 0;
    const accuracy = totalQuestions ? correctAnswers / totalQuestions : null;
    return {
      settings,
      stats: {
        completedSessions: allTime._count._all,
        totalQuestions,
        correctAnswers,
        accuracy,
        recentAccuracy: recentQuestions ? recentCorrect / recentQuestions : null,
        mastery: clockMastery(accuracy),
      },
    };
  });

  app.patch("/api/parent/children/:id/clock/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = clockSettingsSchema.parse(request.body);
    const settings = await prisma.clockLearningSettings.upsert({
      where: { childId: id },
      update: input,
      create: { childId: id, ...input },
    });
    return { settings };
  });

  app.get("/api/parent/children/:id/make-ten/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const recentFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [settings, allTime, recent, factProgress, responseTimes] = await Promise.all([
      prisma.makeTenLearningSettings.upsert({
        where: { childId: id },
        update: {},
        create: { childId: id },
      }),
      prisma.makeTenLearningSession.aggregate({
        where: { childId: id, completedAt: { not: null } },
        _count: { _all: true },
        _sum: { correctCount: true, totalQuestions: true },
      }),
      prisma.makeTenLearningSession.aggregate({
        where: { childId: id, completedAt: { gte: recentFrom } },
        _count: { _all: true },
        _sum: { correctCount: true, totalQuestions: true },
      }),
      prisma.makeTenFactProgress.findMany({
        where: { childId: id },
        orderBy: { target: "asc" },
      }),
      prisma.makeTenQuestionAttempt.aggregate({
        where: {
          childId: id,
          session: { completedAt: { not: null } },
        },
        _avg: { responseMs: true },
      }),
    ]);
    const totalQuestions = allTime._sum.totalQuestions ?? 0;
    const correctAnswers = allTime._sum.correctCount ?? 0;
    const recentQuestions = recent._sum.totalQuestions ?? 0;
    const recentCorrect = recent._sum.correctCount ?? 0;
    const accuracy = totalQuestions ? correctAnswers / totalQuestions : null;
    const progressByTarget = new Map<number, MakeTenFactSnapshot>(
      factProgress.map((progress) => [progress.target, progress]),
    );
    return {
      settings,
      stats: {
        completedSessions: allTime._count._all,
        totalQuestions,
        correctAnswers,
        accuracy,
        recentAccuracy: recentQuestions ? recentCorrect / recentQuestions : null,
        averageResponseMs:
          responseTimes._avg.responseMs === null
            ? null
            : Math.round(responseTimes._avg.responseMs),
        mastery: makeTenMastery(accuracy),
        facts: Array.from({ length: 9 }, (_, index) => index + 1).map(
          (target) => {
            const progress = progressByTarget.get(target);
            const attemptCount = progress?.attemptCount ?? 0;
            return {
              target,
              answer: 10 - target,
              attemptCount,
              correctCount: progress?.correctCount ?? 0,
              accuracy:
                progress && attemptCount > 0
                  ? progress.correctCount / attemptCount
                  : null,
              averageResponseMs:
                progress && attemptCount > 0
                  ? Math.round(progress.totalResponseMs / attemptCount)
                  : null,
              recentAccuracy: progress?.recentAccuracy ?? null,
              recentResponseMs: progress?.recentResponseMs != null
                ? Math.round(progress.recentResponseMs)
                : null,
              consecutiveWrong: progress?.consecutiveWrong ?? 0,
              priority: makeTenFactAssessment(
                progress,
                settings.secondsPerQuestion,
              ),
              questionWeight: makeTenQuestionWeight(
                progress,
                settings.secondsPerQuestion,
              ),
            };
          },
        ),
      },
    };
  });

  app.patch("/api/parent/children/:id/make-ten/settings", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = makeTenSettingsSchema.parse(request.body);
    const settings = await prisma.makeTenLearningSettings.upsert({
      where: { childId: id },
      update: input,
      create: { childId: id, ...input },
    });
    return { settings };
  });

  app.get(
    "/api/parent/children/:id/hanzi/characters",
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      await requireOwnedChild(request, reply, config, id);
      const { q, page, pageSize } = hanziLibraryQuery.parse(request.query);
      const where: Prisma.HanziCharacterWhereInput = {
        isEnabled: true,
        ...(q
          ? {
              OR: [
                { character: { contains: q, mode: "insensitive" } },
                { internalPinyin: { contains: q, mode: "insensitive" } },
                { meaning: { contains: q, mode: "insensitive" } },
                { shapeHint: { contains: q, mode: "insensitive" } },
                { sentence: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [characters, total] = await Promise.all([
        prisma.hanziCharacter.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.hanziCharacter.count({ where }),
      ]);
      return { characters, total, page, pageSize };
    },
  );

  app.get("/api/parent/children/:id/wishes", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return {
      wishes: await prisma.wishReward.findMany({
        where: { childId: id, archivedAt: null },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      }),
    };
  });

  app.post("/api/parent/children/:id/wishes", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = wishSchema.parse(request.body);
    const wish = await prisma.wishReward.create({
      data: {
        childId: id,
        ...normalizedWishData(input),
        imageKey: input.category.toLowerCase(),
      },
    });
    reply.status(201);
    return { wish };
  });

  app.patch(
    "/api/parent/children/:childId/wishes/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const patch = wishPatchSchema.parse(request.body);
      const existing = await prisma.wishReward.findFirst({
        where: { id, childId, archivedAt: null },
        include: { activeRedemptionSlot: true },
      });
      if (!existing) {
        throw new HttpError(404, "WISH_NOT_FOUND", "没有找到星愿");
      }
      const input = wishSchema.parse({ ...existing, ...patch });
      if (
        existing.activeRedemptionSlot &&
        input.redemptionType !== existing.redemptionType
      ) {
        throw new HttpError(
          409,
          "WISH_HAS_ACTIVE_REDEMPTION",
          "这个星愿正在兑换处理中，结束后才能修改兑换类型",
        );
      }
      const wish = await prisma.wishReward.update({
        where: { id: existing.id },
        data: {
          ...normalizedWishData(input),
          imageKey: input.category.toLowerCase(),
        },
      });
      return { wish };
    },
  );

  app.delete(
    "/api/parent/children/:childId/wishes/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const result = await prisma.wishReward.updateMany({
        where: { id, childId, archivedAt: null },
        data: { archivedAt: new Date(), isEnabled: false },
      });
      if (!result.count)
        throw new HttpError(404, "WISH_NOT_FOUND", "没有找到星愿");
      return { ok: true };
    },
  );

  app.get("/api/parent/children/:id/redemptions", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return {
      redemptions: await prisma.wishRedemption.findMany({
        where: { childId: id },
        orderBy: { requestedAt: "desc" },
      }),
    };
  });

  app.patch(
    "/api/parent/children/:childId/redemptions/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      const { user, child } = await requireOwnedChild(
        request,
        reply,
        config,
        childId,
      );
      const input = redemptionStatusSchema.parse(request.body);
      if (input.status === "CANCELLED" && !input.cancelReason) {
        throw new HttpError(400, "CANCEL_REASON_REQUIRED", "取消时需要填写原因");
      }
      return {
        redemption: await updateRedemptionStatus({
          redemptionId: id,
          childId,
          status: input.status,
          cancelReason: input.cancelReason,
          actorId: user.id,
          familyId: child.familyId,
          ipAddress: request.ip,
        }),
      };
    },
  );

  app.post(
    "/api/parent/children/:id/stars/adjust",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, child: ownedChild } = await requireOwnedChild(request, reply, config, childId);
      const input = adjustmentSchema.parse(request.body);
      const result = await prisma.$transaction(
        async (tx) => {
          const ledgerKey = `manual:${childId}:${input.idempotencyKey}`;
          const existing = await tx.starLedger.findUnique({
            where: { idempotencyKey: ledgerKey },
          });
          if (existing) return existing;

          const child = await tx.childProfile.findUniqueOrThrow({
            where: { id: childId },
          });
          if (child.starBalance + input.amount < 0) {
            throw new HttpError(409, "NEGATIVE_BALANCE", "调整后余额不能小于零");
          }
          const updated = await tx.childProfile.update({
            where: { id: childId },
            data: {
              starBalance: { increment: input.amount },
              ...(input.amount > 0
                ? { lifetimeStarsEarned: { increment: input.amount } }
                : {}),
            },
          });
          const ledger = await tx.starLedger.create({
            data: {
              childId,
              type: "MANUAL_ADJUSTMENT",
              amount: input.amount,
              balanceAfter: updated.starBalance,
              reason: input.reason,
              idempotencyKey: ledgerKey,
            },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            familyId: ownedChild.familyId,
            action: "STAR_MANUAL_ADJUST",
            resourceType: "ChildProfile",
            resourceId: childId,
            metadata: { amount: input.amount, reason: input.reason },
            ipAddress: request.ip,
          });
          return ledger;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { ledger: result };
    },
  );

  app.get("/api/parent/children/:id/star-ledger", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return {
      entries: await prisma.starLedger.findMany({
        where: { childId: id },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    };
  });

  app.get("/api/parent/children/:id/stats", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const query = statsQuery.parse(request.query);
    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to
      ? new Date(`${query.to}T00:00:00.000Z`)
      : businessDateAt(new Date(), config.APP_TIME_ZONE);

    const [tasks, attempts, ledgers, totalTaskInstances, completedTaskInstances] = await Promise.all([
      prisma.dailyTask.groupBy({
        by: ["status"],
        where: { childId: id, taskDate: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.taskAttempt.groupBy({
        by: ["status"],
        where: { childId: id, dailyTask: { taskDate: { gte: from, lte: to } } },
        _count: { _all: true },
        _sum: {
          elapsedSeconds: true,
          baseStarsAwarded: true,
          bonusStarsAwarded: true,
        },
      }),
      prisma.starLedger.groupBy({
        by: ["type"],
        where: { childId: id, createdAt: { gte: from } },
        _sum: { amount: true },
      }),
      prisma.dailyTask.count({
        where: { childId: id, taskDate: { gte: from, lte: to } },
      }),
      prisma.dailyTask.count({
        where: {
          childId: id,
          taskDate: { gte: from, lte: to },
          attempts: { some: { status: "COMPLETED" } },
        },
      }),
    ]);
    return {
      from,
      to,
      tasks: Object.fromEntries(
        tasks.map((row) => [row.status, row._count._all]),
      ),
      taskInstances: {
        total: totalTaskInstances,
        completed: completedTaskInstances,
      },
      attempts: attempts.map((row) => ({
        status: row.status,
        count: row._count._all,
        elapsedSeconds: row._sum.elapsedSeconds ?? 0,
        baseStars: row._sum.baseStarsAwarded ?? 0,
        bonusStars: row._sum.bonusStarsAwarded ?? 0,
      })),
      stars: Object.fromEntries(
        ledgers.map((row) => [row.type, row._sum.amount ?? 0]),
      ),
    };
  });

  app.get(
    "/api/parent/children/:id/growth-analytics",
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      await requireOwnedChild(request, reply, config, id);
      const { days } = growthAnalyticsQuery.parse(request.query);
      return getGrowthAnalytics(
        id,
        days,
        new Date(),
        config.APP_TIME_ZONE,
      );
    },
  );

  app.get(
    "/api/parent/children/:id/math-mastery",
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      await requireOwnedChild(request, reply, config, id);
      const { days } = mathMasteryQuery.parse(request.query);
      const to = new Date();
      const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1_000);
      return getMathMasteryForRange(id, { from, to });
    },
  );

  app.get("/api/parent/children/:id/task-history", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const { days } = historyQuery.parse(request.query);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const from = addBusinessDays(today, -(days - 1));
    const tasks = await prisma.dailyTask.findMany({
      where: { childId: id, taskDate: { gte: from, lte: today } },
      orderBy: [{ taskDate: "desc" }, { sortOrder: "asc" }],
      take: 1000,
      select: {
        id: true,
        taskDate: true,
        titleSnapshot: true,
        categorySnapshot: true,
        modeSnapshot: true,
        repeatableDailySnapshot: true,
        status: true,
        baseStarsSnapshot: true,
        completedAt: true,
        completionDurationSeconds: true,
        attempts: {
          orderBy: { attemptNumber: "asc" },
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            startedAt: true,
            endedAt: true,
            elapsedSeconds: true,
            baseStarsAwarded: true,
            bonusStarsAwarded: true,
          },
        },
      },
    });
    return { from, to: today, days, tasks };
  });

  app.post(
    "/api/parent/children/:id/task-history/:taskId/rollback",
    async (request, reply) => {
      const { id: childId, taskId } = historyTaskParams.parse(request.params);
      const { user, child } = await requireOwnedChild(request, reply, config, childId);
      const result = await rollbackCompletedTask(childId, taskId);
      await writeAudit(prisma, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "TASK_REWARD_ROLLBACK",
        resourceType: "DailyTask",
        resourceId: taskId,
        metadata: result,
        ipAddress: request.ip,
      });
      return { ok: true, ...result };
    },
  );

  app.get("/api/parent/children/:id/planets", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return getPlanetSettings(id);
  });

  app.post("/api/parent/children/:id/challenge-letter", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    try {
      const conversation = await generateChallengeLetterIfEligible(id, config, new Date(), { force: true });
      if (!conversation) {
        throw new HttpError(409, "CHALLENGE_LETTER_UNAVAILABLE", "当前没有可用的你的挑战伙伴");
      }
      return { conversation };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "CHALLENGE_LETTER_GENERATION_FAILED", error instanceof Error ? error.message : "DeepSeek 暂时无法生成来信");
    }
  });

  app.put("/api/parent/children/:id/planets", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const input = planetSettingsSchema.parse(request.body);
    const result = await updatePlanetSettings(id, input.planets);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "PLANET_SETTINGS_UPDATE",
        resourceType: "ChildProfile",
        resourceId: id,
        metadata: { planets: input.planets },
        ipAddress: request.ip,
      });
    });
    return result;
  });
}
