import { PlanetKey, Prisma } from "@prisma/client";
import { unlink } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { addBusinessDays, businessDateAt } from "../lib/time.js";
import { buildPerformanceDashboard } from "../domain/performance-metrics.js";
import { isScheduledForDate } from "../domain/task-rules.js";
import { requireStaff } from "../services/auth-service.js";
import {
  abandonTask,
  generateDailyTasks,
  prepareDailyTasks,
} from "../services/task-service.js";
import {
  getPlanetSettings,
  PLANET_KEYS,
  updatePlanetSettings,
} from "../services/planet-service.js";
import { updateRedemptionStatus } from "../services/wish-service.js";
import { writeAudit } from "../services/audit-service.js";
import { TASK_CATEGORIES, WISH_CATEGORIES } from "../domain/constants.js";
import {
  HANZI_MEDIA_BODY_LIMIT,
  storeHanziMedia,
} from "../services/hanzi-media-service.js";

const taskCategory = z.enum(TASK_CATEGORIES);
const taskMode = z.enum(["UNTIMED", "TIMED"]);
const taskExperienceKind = z.enum(["STANDARD", "HANZI_LEARNING"]);
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
});
const hanziCharacterShape = {
  character: z.string().trim().min(1).max(2),
  internalPinyin: z.string().trim().min(1).max(50),
  meaning: z.string().trim().min(1).max(120),
  shapeHint: z.string().trim().min(1).max(240),
  sentence: z.string().trim().min(3).max(300),
  words: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
  wordAudioUrls: z.array(z.string().trim().max(2048)).max(10).default([]),
  imageKey: z.string().trim().min(1).max(2048).default("default-hanzi"),
  characterAudioUrl: z.string().trim().max(2048).nullable().optional(),
  sentenceAudioUrl: z.string().trim().max(2048).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  isEnabled: z.boolean().default(true),
};
const hanziCharacterSchema = z
  .object(hanziCharacterShape)
  .superRefine((input, context) => {
    if (!input.sentence.includes("__")) {
      context.addIssue({
        code: "custom",
        path: ["sentence"],
        message: "例句必须用 __ 标记汉字所在的位置",
      });
    }
  });
const hanziCharacterPatchSchema = z.object(hanziCharacterShape).partial();
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
      input.experienceKind === "HANZI_LEARNING" &&
      (input.mode !== "UNTIMED" || input.repeatableDaily)
    ) {
      context.addIssue({
        code: "custom",
        path: ["experienceKind"],
        message: "汉字学习必须是不限时且当天不可重复领取的任务",
      });
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
const hanziMediaParams = childResourceParams.extend({
  kind: z.enum([
    "image",
    "character-audio",
    "sentence-audio",
    "word-audio",
  ]),
});
const hanziMediaQuery = z.object({
  wordIndex: z.coerce.number().int().min(0).max(9).optional(),
});
const statsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const historyQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const performanceQuery = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

async function requireOwnedChild(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  childId: string,
) {
  const { user } = await requireStaff(request, reply, config, ["PARENT"]);
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

export async function registerParentRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/parent/children", async (request, reply) => {
    const { user } = await requireStaff(request, reply, config, ["PARENT"]);
    return {
      children: await prisma.childProfile.findMany({
        where: { familyId: user.familyId ?? "__none__" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nickname: true,
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
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    };
  });

  app.post("/api/parent/children/:id/task-templates", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const input = taskTemplateSchema.parse(request.body);
    const template = await prisma.taskTemplate.create({
      data: { childId: id, ...templateData(input) },
    });
    await generateDailyTasks(
      id,
      businessDateAt(new Date(), config.APP_TIME_ZONE),
    );
    reply.status(201);
    return { template };
  });

  app.patch(
    "/api/parent/children/:childId/task-templates/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const patch = taskTemplatePatchSchema.parse(request.body);
      const existing = await prisma.taskTemplate.findFirst({
        where: { id, childId, archivedAt: null, systemManaged: false },
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
      const template = await prisma.taskTemplate.update({
        where: { id },
        data: templateData(merged),
      });
      const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
      const remainsScheduledToday =
        template.isEnabled && isScheduledForDate(template, today);
      await prisma.dailyTask.updateMany({
        where: {
          childId,
          templateId: id,
          taskDate: today,
          status: { in: ["PENDING", "EXPIRED"] },
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
            }
          : { status: "EXPIRED", expiredAt: new Date() },
      });
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
    const [settings, progress, characterCount] = await Promise.all([
      prisma.hanziLearningSettings.upsert({
        where: { childId: id },
        update: {},
        create: { childId: id },
      }),
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
    const settings = await prisma.hanziLearningSettings.upsert({
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

  app.post(
    "/api/parent/children/:id/hanzi/characters",
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      await requireOwnedChild(request, reply, config, id);
      const input = hanziCharacterSchema.parse(request.body);
      try {
        const character = await prisma.hanziCharacter.create({
          data: {
            ...input,
            wordAudioUrls: input.words.map(
              (_, index) => input.wordAudioUrls[index] || "",
            ),
            characterAudioUrl: input.characterAudioUrl || null,
            sentenceAudioUrl: input.sentenceAudioUrl || null,
          },
        });
        reply.status(201);
        return { character };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new HttpError(409, "HANZI_ALREADY_EXISTS", "这个汉字已经在基础字库中");
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/parent/children/:childId/hanzi/characters/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const patch = hanziCharacterPatchSchema.parse(request.body);
      const existing = await prisma.hanziCharacter.findUnique({ where: { id } });
      if (!existing || !existing.isEnabled) {
        throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
      }
      const input = hanziCharacterSchema.parse({ ...existing, ...patch });
      try {
        const character = await prisma.hanziCharacter.update({
          where: { id },
          data: {
            ...input,
            wordAudioUrls: input.words.map(
              (_, index) => input.wordAudioUrls[index] || "",
            ),
            characterAudioUrl: input.characterAudioUrl || null,
            sentenceAudioUrl: input.sentenceAudioUrl || null,
          },
        });
        return { character };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new HttpError(409, "HANZI_ALREADY_EXISTS", "这个汉字已经在基础字库中");
        }
        throw error;
      }
    },
  );

  app.put(
    "/api/parent/children/:childId/hanzi/characters/:id/media/:kind",
    { bodyLimit: HANZI_MEDIA_BODY_LIMIT },
    async (request, reply) => {
      const { childId, id, kind } = hanziMediaParams.parse(request.params);
      const { wordIndex } = hanziMediaQuery.parse(request.query);
      const { user, child } = await requireOwnedChild(
        request,
        reply,
        config,
        childId,
      );
      const existing = await prisma.hanziCharacter.findUnique({ where: { id } });
      if (!existing || !existing.isEnabled) {
        throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
      }
      if (
        kind === "word-audio" &&
        (wordIndex === undefined || wordIndex >= existing.words.length)
      ) {
        throw new HttpError(
          400,
          "HANZI_WORD_INDEX_INVALID",
          "没有找到要替换读音的词语",
        );
      }
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(
          400,
          "HANZI_MEDIA_INVALID_BODY",
          "请选择要上传的媒体文件",
        );
      }

      const stored = await storeHanziMedia({
        uploadDir: config.HANZI_ASSET_UPLOAD_DIR,
        characterId: existing.id,
        kind,
        wordIndex,
        contentType: request.headers["content-type"] ?? "",
        data: request.body,
      });

      try {
        const character = await prisma.$transaction(async (tx) => {
          const data: Prisma.HanziCharacterUpdateInput =
            kind === "image"
              ? { imageKey: stored.publicUrl }
              : kind === "character-audio"
                ? { characterAudioUrl: stored.publicUrl }
                : kind === "sentence-audio"
                  ? { sentenceAudioUrl: stored.publicUrl }
                  : {
                      wordAudioUrls: existing.words.map((_, index) =>
                        index === wordIndex
                          ? stored.publicUrl
                          : existing.wordAudioUrls[index] || "",
                      ),
                    };
          const updated = await tx.hanziCharacter.update({
            where: { id },
            data,
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            familyId: child.familyId,
            action: "HANZI_MEDIA_REPLACED",
            resourceType: "HanziCharacter",
            resourceId: id,
            metadata: {
              character: existing.character,
              kind,
              wordIndex: wordIndex ?? null,
              fileName: stored.fileName,
            },
            ipAddress: request.ip,
          });
          return updated;
        });
        return { character };
      } catch (error) {
        if (stored.created) {
          await unlink(stored.filePath).catch(() => undefined);
        }
        throw error;
      }
    },
  );

  app.delete(
    "/api/parent/children/:childId/hanzi/characters/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const enabledCount = await prisma.hanziCharacter.count({
        where: { isEnabled: true },
      });
      if (enabledCount <= 3) {
        throw new HttpError(
          409,
          "HANZI_LIBRARY_MINIMUM",
          "基础字库至少需要保留 3 个汉字，才能生成听句挑战选项",
        );
      }
      const result = await prisma.hanziCharacter.updateMany({
        where: { id, isEnabled: true },
        data: { isEnabled: false },
      });
      if (!result.count) {
        throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
      }
      return { ok: true };
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

  app.get("/api/parent/children/:id/performance", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const { days } = performanceQuery.parse(request.query);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const metrics = await prisma.childPerformanceMetric.findMany({
      where: { childId: id, createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        id: true,
        kind: true,
        operation: true,
        path: true,
        status: true,
        requestId: true,
        totalMs: true,
        serverMs: true,
        clientOverheadMs: true,
        apiTotalMs: true,
        nonApiMs: true,
        effectiveType: true,
        connectionRttMs: true,
        downlinkMbps: true,
        createdAt: true,
      },
    });
    return buildPerformanceDashboard(metrics, days, config.APP_TIME_ZONE);
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

  app.get("/api/parent/children/:id/planets", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return getPlanetSettings(id);
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
