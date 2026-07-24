import { PlanetKey, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { addBusinessDays, businessDateAt } from "../lib/time.js";
import { requireStaff } from "../services/auth-service.js";
import { generateDailyTasks } from "../services/task-service.js";
import {
  getPlanetSettings,
  PLANET_KEYS,
  updatePlanetSettings,
} from "../services/planet-service.js";
import { updateRedemptionStatus } from "../services/wish-service.js";
import { writeAudit } from "../services/audit-service.js";

const taskCategory = z.enum([
  "READING",
  "MATH",
  "EXERCISE",
  "CHORES",
  "ORGANIZING",
  "MUSIC",
  "CHINESE",
  "ENGLISH",
  "PE",
  "OTHER",
]);
const taskMode = z.enum(["UNTIMED", "TIMED"]);
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
const wishCategory = z.enum(["SPORTS", "GAMES", "TELEVISION", "TOYS"]);
const presetIcon = z.enum([
  "reading",
  "math",
  "exercise",
  "chores",
  "organizing",
  "music",
  "chinese",
  "english",
  "pe",
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

const taskTemplateShape = {
  title: z.string().trim().min(1).max(80),
  category: taskCategory,
  iconKey: presetIcon,
  mode: taskMode,
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
const wishSchema = z.object({
  category: wishCategory,
  title: z.string().trim().min(1).max(80),
  costStars: z.number().int().min(1).max(99999),
  isRepeatable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isEnabled: z.boolean().default(true),
});
const wishPatchSchema = wishSchema.partial();
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
        where: { id, childId, archivedAt: null },
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
      return { template };
    },
  );

  app.delete(
    "/api/parent/children/:childId/task-templates/:id",
    async (request, reply) => {
      const { childId, id } = childResourceParams.parse(request.params);
      await requireOwnedChild(request, reply, config, childId);
      const result = await prisma.taskTemplate.updateMany({
        where: { id, childId, archivedAt: null },
        data: { archivedAt: new Date(), isEnabled: false },
      });
      if (!result.count)
        throw new HttpError(404, "TASK_TEMPLATE_NOT_FOUND", "没有找到任务模板");
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
        where: { childId, id: { in: items.map((item) => item.id) } },
      });
      if (owned !== items.length)
        throw new HttpError(400, "INVALID_TEMPLATE_IDS", "任务排序中包含无效项目");
      await prisma.$transaction(
        items.map((item) =>
          prisma.taskTemplate.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );
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
        ...input,
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
      const input = wishPatchSchema.parse(request.body);
      const result = await prisma.wishReward.updateMany({
        where: { id, childId, archivedAt: null },
        data: {
          ...input,
          ...(input.category
            ? { imageKey: input.category.toLowerCase() }
            : {}),
        },
      });
      if (!result.count)
        throw new HttpError(404, "WISH_NOT_FOUND", "没有找到星愿");
      return { ok: true };
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
            data: { starBalance: { increment: input.amount } },
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

    const [tasks, attempts, ledgers] = await Promise.all([
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
    ]);
    return {
      from,
      to,
      tasks: Object.fromEntries(
        tasks.map((row) => [row.status, row._count._all]),
      ),
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
