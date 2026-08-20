import { Prisma, type AiRecommendationKind } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  growthAdvisorAnswerSchema,
  growthAdvisorQuestionSchema,
  legacyCompactWeeklyGrowthResponseSchema,
  legacyWeeklyGrowthResponseSchema,
  rewardAuditResponseSchema,
  scheduleResponseSchema,
  taskAdviceResponseSchema,
  weeklyGrowthResponseSchema,
} from "../ai/schemas.js";
import {
  AI_PROMPT_VERSION,
  connectionTestPrompt,
  growthAdvisorSystemPrompt,
  rewardAuditSystemPrompt,
  scheduleSystemPrompt,
  taskAdviceSystemPrompt,
} from "../ai/prompts.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { writeAudit } from "../services/audit-service.js";
import { requireParent } from "../services/auth-service.js";
import { callDeepSeekJson, listDeepSeekModels } from "../services/deepseek-service.js";
import { validateSchedulePlan } from "../services/schedule-validation.js";
import { generateDailyTasks } from "../services/task-service.js";
import {
  familyAiAccessEnabled,
  requireFamilyAiAccess,
  systemAiCredentials,
} from "../services/system-ai-service.js";
import { businessDateAt } from "../lib/time.js";
import {
  generateWeeklyGrowthReport,
  latestWeeklyGrowthReport,
} from "../services/weekly-growth-report-service.js";
import { syncRecentTaskSuggestedSeconds } from "../services/task-duration-service.js";

const idParams = z.object({ id: z.string().min(1) });
const recommendationParams = z.object({
  childId: z.string().min(1),
  recommendationId: z.string().min(1),
});
const taskAdviceInputSchema = z.object({
  description: z.string().trim().min(10).max(4000),
  desiredOutcome: z.string().trim().max(1000).optional(),
  constraints: z.string().trim().max(2000).optional(),
});
const availabilitySlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1438),
    endMinute: z.number().int().min(1).max(1439),
  })
  .refine((slot) => slot.endMinute > slot.startMinute, {
    message: "结束时间必须晚于开始时间",
  });
const schedulePreferenceSchema = z.object({
  maxDailyMinutes: z.number().int().min(5).max(180),
  maxConsecutiveMinutes: z.number().int().min(5).max(60),
  minimumBreakMinutes: z.number().int().min(0).max(60),
  slots: z.array(availabilitySlotSchema).max(28),
});
const connectionSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});

async function ownedChild(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  childId: string,
) {
  const { user } = await requireParent(request, reply, config);
  if (!user.familyId) {
    throw new HttpError(403, "FAMILY_REQUIRED", "家长账号尚未绑定家庭");
  }
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, familyId: user.familyId },
  });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
  return { user, child, familyId: user.familyId };
}

async function familyUser(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
) {
  const { user } = await requireParent(request, reply, config);
  if (!user.familyId) {
    throw new HttpError(403, "FAMILY_REQUIRED", "家长账号尚未绑定家庭");
  }
  return { user, familyId: user.familyId };
}

async function storedAiCredentials(
  familyId: string,
  config: AppConfig,
  requireEnabled: boolean,
) {
  await requireFamilyAiAccess(familyId);
  return systemAiCredentials(config, requireEnabled);
}

async function aiCredentials(familyId: string, config: AppConfig) {
  return storedAiCredentials(familyId, config, true);
}

function enforceAiLimit(familyId: string, userId: string, action: string) {
  enforceRateLimit({
    key: `ai:${familyId}:${userId}:${action}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
    code: "AI_RATE_LIMITED",
    message: "AI 生成次数较多，请稍后再试",
  });
}

function ensureNoSlotOverlap(slots: z.infer<typeof availabilitySlotSchema>[]) {
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const sameDay = slots
      .filter((slot) => slot.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 1; index < sameDay.length; index += 1) {
      if (sameDay[index]!.startMinute < sameDay[index - 1]!.endMinute) {
        throw new HttpError(
          400,
          "AVAILABILITY_OVERLAP",
          "同一天的可用时间不能重叠",
        );
      }
    }
  }
}

function estimatedMinutes(template: {
  mode: string;
  suggestedSeconds: number | null;
  timeLimitSeconds: number | null;
}) {
  return Math.max(
    1,
    Math.round(
      (template.suggestedSeconds ??
        (template.mode === "TIMED" ? template.timeLimitSeconds : null) ??
        600) / 60,
    ),
  );
}

function weeklyReportResponse(
  report: Awaited<ReturnType<typeof latestWeeklyGrowthReport>>,
) {
  if (!report) return null;
  const metrics =
    report.metricsPayload &&
    typeof report.metricsPayload === "object" &&
    !Array.isArray(report.metricsPayload)
      ? report.metricsPayload
      : null;
  const period =
    metrics?.period &&
    typeof metrics.period === "object" &&
    !Array.isArray(metrics.period)
      ? metrics.period
      : null;
  const analysisStart =
    typeof period?.from === "string"
      ? period.from
      : report.weekStart.toISOString().slice(0, 10);
  const analysisEnd =
    typeof period?.to === "string"
      ? period.to
      : report.weekEnd.toISOString().slice(0, 10);
  const parsed = weeklyGrowthResponseSchema.safeParse(report.responsePayload);
  const compactLegacy = parsed.success
    ? null
    : legacyCompactWeeklyGrowthResponseSchema.safeParse(report.responsePayload);
  const legacy = parsed.success || compactLegacy?.success
    ? null
    : legacyWeeklyGrowthResponseSchema.safeParse(report.responsePayload);
  const analysis = parsed.success
    ? parsed.data
    : compactLegacy?.success
      ? {
          summary: compactLegacy.data.summary,
          dataQuality: "LIMITED" as const,
          doingWell: compactLegacy.data.strengths.map((evidence, index) => ({
            templateId: `legacy-compact-strength-${index}`,
            title: `坚持表现 ${index + 1}`,
            evidence,
            nextStep: "继续保持当前安排",
          })),
          needsAdjustment: compactLegacy.data.focus
            ? [{
                templateId: "legacy-compact-focus",
                title: "优先关注",
                evidence: compactLegacy.data.focus,
                nextStep: compactLegacy.data.suggestions[0] ?? "继续观察",
              }]
            : [],
          cadenceChanges: [],
          recommendedSchedule: [],
          parentActions: compactLegacy.data.suggestions,
          dimensions: [],
          riskSignals: [],
          suggestedQuestions: [],
        }
    : legacy?.success
      ? {
          summary: legacy.data.summary,
          dataQuality: "LIMITED" as const,
          doingWell: legacy.data.progressHighlights.slice(0, 3).map((item, index) => ({
            templateId: `legacy-strength-${index}`,
            title: item.title,
            evidence: item.evidence,
            nextStep: "继续保持当前安排",
          })),
          needsAdjustment: legacy.data.focusAreas.slice(0, 3).map((item, index) => ({
            templateId: `legacy-focus-${index}`,
            title: item.title,
            evidence: item.evidence,
            nextStep: item.suggestion,
          })),
          cadenceChanges: [],
          recommendedSchedule: [],
          parentActions: legacy.data.nextWeekSuggestions
            .slice(0, 3)
            .map((item) => item.action),
          dimensions: [],
          riskSignals: [],
          suggestedQuestions: [],
        }
      : null;
  return {
    id: report.id,
    status: report.status,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    analysisStart,
    analysisEnd,
    generatedAt: report.generatedAt,
    model: report.model,
    analysis,
  };
}

async function saveRecommendation(input: {
  kind: AiRecommendationKind;
  familyId: string;
  childId: string;
  createdById: string;
  model: string;
  requestPayload: Prisma.InputJsonValue;
  responsePayload: Prisma.InputJsonValue;
}) {
  return prisma.aiRecommendation.create({
    data: {
      ...input,
      promptVersion: AI_PROMPT_VERSION,
    },
  });
}

export async function registerParentAiRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/parent/ai/config", async (request, reply) => {
    const { familyId } = await familyUser(request, reply, config);
    const [stored, accessEnabled] = await Promise.all([
      prisma.systemAiConfig.findUnique({
        where: { id: "default" },
        select: {
          provider: true,
          model: true,
          enabled: true,
          updatedAt: true,
        },
      }),
      familyAiAccessEnabled(familyId),
    ]);
    return {
      config: stored
        ? {
            ...stored,
            apiKeyLastFour: null,
            configured: true,
            accessEnabled,
          }
        : {
            provider: "DEEPSEEK",
            model: "deepseek-v4-flash",
            apiKeyLastFour: null,
            enabled: false,
            updatedAt: null,
            configured: false,
            accessEnabled,
          },
    };
  });

  app.get(
    "/api/parent/children/:id/ai/weekly-growth",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { familyId } = await ownedChild(request, reply, config, childId);
      const [stored, report, accessEnabled] = await Promise.all([
        prisma.systemAiConfig.findUnique({
          where: { id: "default" },
          select: { enabled: true },
        }),
        latestWeeklyGrowthReport(childId),
        familyAiAccessEnabled(familyId),
      ]);
      return {
        configured: Boolean(stored?.enabled),
        accessEnabled,
        report: accessEnabled ? weeklyReportResponse(report) : null,
      };
    },
  );

  app.post(
    "/api/parent/children/:id/ai/weekly-growth/generate",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      await requireFamilyAiAccess(familyId);
      enforceAiLimit(familyId, user.id, "weekly-growth");
      const report = await generateWeeklyGrowthReport(childId, config, {
        force: true,
      });
      await writeAudit(prisma, {
        actorType: "USER",
        actorId: user.id,
        familyId,
        action: "AI_WEEKLY_GROWTH_GENERATE",
        resourceType: "WeeklyGrowthReport",
        resourceId: report.id,
        metadata: {
          weekStart: report.weekStart.toISOString().slice(0, 10),
          status: report.status,
        },
        ipAddress: request.ip,
      });
      return { report: weeklyReportResponse(report) };
    },
  );

  app.post(
    "/api/parent/children/:id/ai/weekly-growth/ask",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const input = growthAdvisorQuestionSchema.parse(request.body);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      await requireFamilyAiAccess(familyId);
      enforceAiLimit(familyId, user.id, "growth-advisor-question");
      const report = input.reportId
        ? await prisma.weeklyGrowthReport.findFirst({
            where: {
              id: input.reportId,
              childId,
              familyId,
              status: "COMPLETED",
            },
          })
        : await latestWeeklyGrowthReport(childId);
      const response = weeklyReportResponse(report);
      if (!report || !response?.analysis) {
        throw new HttpError(
          409,
          "GROWTH_REPORT_REQUIRED",
          "请先生成一份 AI 成长分析",
        );
      }
      const credentials = await aiCredentials(familyId, config);
      const result = await callDeepSeekJson({
        ...credentials,
        config,
        systemPrompt: growthAdvisorSystemPrompt,
        userPayload: {
          privacy: "匿名聚合数据，不包含姓名、登录码、设备、IP、地址或学校",
          question: input.question,
          report: response.analysis,
          metrics: report.metricsPayload,
        },
        outputSchema: growthAdvisorAnswerSchema,
        maxTokens: 2_800,
      });
      const templates = await prisma.taskTemplate.findMany({
        where: { childId, archivedAt: null },
        select: { id: true, title: true },
      });
      const templateById = new Map(
        templates.map((template) => [template.id, template.title]),
      );
      const answer = {
        ...result.data,
        taskAdjustments: result.data.taskAdjustments.map((item) => ({
          ...item,
          templateId:
            item.templateId && templateById.has(item.templateId)
              ? item.templateId
              : null,
          title:
            item.templateId && templateById.has(item.templateId)
              ? templateById.get(item.templateId)!
              : item.title,
        })),
      };
      await writeAudit(prisma, {
        actorType: "USER",
        actorId: user.id,
        familyId,
        action: "AI_GROWTH_ADVISOR_ASK",
        resourceType: "WeeklyGrowthReport",
        resourceId: report.id,
        metadata: {
          questionLength: input.question.length,
          model: result.model,
        },
        ipAddress: request.ip,
      });
      return { answer, model: result.model };
    },
  );

  app.get("/api/parent/ai/models", async (request, reply) => {
    const { familyId } = await familyUser(request, reply, config);
    const credentials = await storedAiCredentials(familyId, config, false);
    const models = await listDeepSeekModels({
      apiKey: credentials.apiKey,
      config,
    });
    return { models };
  });

  app.put("/api/parent/ai/config", async (request, reply) => {
    await familyUser(request, reply, config);
    throw new HttpError(403, "AI_CONFIG_ADMIN_ONLY", "DeepSeek 密钥由超级管理员统一配置");
  });

  app.post("/api/parent/ai/config/test", async (request, reply) => {
    const { user, familyId } = await familyUser(request, reply, config);
    enforceAiLimit(familyId, user.id, "connection");
    const credentials = await aiCredentials(familyId, config);
    const result = await callDeepSeekJson({
      ...credentials,
      config,
      systemPrompt:
        "你是连接测试助手。只输出 JSON 对象，不要输出任何额外文字。",
      userPayload: connectionTestPrompt,
      outputSchema: connectionSchema,
      maxTokens: 100,
    });
    return { ok: result.data.ok, message: result.data.message, model: result.model };
  });

  app.post(
    "/api/parent/children/:id/ai/task-advice",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      enforceAiLimit(familyId, user.id, "task-advice");
      const input = taskAdviceInputSchema.parse(request.body);
      const credentials = await aiCredentials(familyId, config);
      await syncRecentTaskSuggestedSeconds(childId);
      const [templates, wishes] = await Promise.all([
        prisma.taskTemplate.findMany({
          where: { childId, archivedAt: null, isEnabled: true },
          select: {
            title: true,
            category: true,
            mode: true,
            suggestedSeconds: true,
            timeLimitSeconds: true,
            baseStars: true,
            repeatableDaily: true,
            scheduleKind: true,
            weekdays: true,
          },
        }),
        prisma.wishReward.findMany({
          where: { childId, archivedAt: null, isEnabled: true },
          select: { title: true, category: true, costStars: true },
        }),
      ]);
      const payload = {
        child: { ageYears: 5 },
        parentRequest: input,
        existingTasks: templates.map((item) => ({
          ...item,
          estimatedMinutes: estimatedMinutes(item),
        })),
        currentWishes: wishes,
        privacyNote: "数据已匿名化，不包含孩子身份信息",
      };
      const result = await callDeepSeekJson({
        ...credentials,
        config,
        systemPrompt: taskAdviceSystemPrompt,
        userPayload: payload,
        outputSchema: taskAdviceResponseSchema,
      });
      const recommendation = await saveRecommendation({
        kind: "TASK_ADVICE",
        familyId,
        childId,
        createdById: user.id,
        model: result.model,
        requestPayload: {
          privacy: "PARENT_FREE_TEXT_NOT_RETAINED",
          existingTaskCount: templates.length,
          wishCount: wishes.length,
        },
        responsePayload: result.data as Prisma.InputJsonValue,
      });
      return {
        recommendationId: recommendation.id,
        advice: result.data,
        promptVersion: AI_PROMPT_VERSION,
      };
    },
  );

  app.post(
    "/api/parent/children/:childId/ai/task-advice/:recommendationId/apply",
    async (request, reply) => {
      const { childId, recommendationId } = recommendationParams.parse(
        request.params,
      );
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      await requireFamilyAiAccess(familyId);
      const recommendation = await prisma.aiRecommendation.findFirst({
        where: {
          id: recommendationId,
          childId,
          familyId,
          kind: "TASK_ADVICE",
          status: "DRAFT",
        },
      });
      if (!recommendation) {
        throw new HttpError(404, "AI_RECOMMENDATION_NOT_FOUND", "建议不存在或已应用");
      }
      const advice = taskAdviceResponseSchema.parse(
        recommendation.responsePayload,
      );
      const proposal = advice.proposal;
      const template = await prisma.$transaction(async (tx) => {
        const created = await tx.taskTemplate.create({
          data: {
            childId,
            title: proposal.title,
            category: proposal.category,
            iconKey: proposal.iconKey,
            mode: proposal.mode,
            suggestedSeconds:
              proposal.mode === "UNTIMED"
                ? proposal.estimatedMinutes * 60
                : null,
            timeLimitSeconds:
              proposal.mode === "TIMED"
                ? (proposal.timeLimitMinutes ?? proposal.estimatedMinutes) * 60
                : null,
            baseStars: proposal.baseStars,
            earlyBonusEnabled:
              proposal.mode === "TIMED" && proposal.earlyBonusEnabled,
            earlyThresholdSeconds: proposal.earlyThresholdMinutes
              ? proposal.earlyThresholdMinutes * 60
              : null,
            earlyBonusStars: proposal.earlyBonusStars,
            repeatableDaily: proposal.repeatableDaily,
            scheduleKind: proposal.scheduleKind,
            weekdays:
              proposal.scheduleKind === "SELECTED_WEEKDAYS"
                ? proposal.weekdays
                : [],
            oneTimeDate:
              proposal.scheduleKind === "ONE_TIME" && proposal.oneTimeDate
                ? new Date(`${proposal.oneTimeDate}T00:00:00.000Z`)
                : null,
            sortOrder: 0,
            isEnabled: true,
            aiSchedulingEnabled: proposal.aiSchedulingEnabled,
            learningPracticeKind: proposal.learningPracticeKind,
            targetSessionsPerWeek: proposal.targetSessionsPerWeek,
            minimumGapDays: proposal.minimumGapDays,
          },
        });
        await tx.aiRecommendation.update({
          where: { id: recommendationId },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          familyId,
          action: "AI_TASK_ADVICE_APPLY",
          resourceType: "TaskTemplate",
          resourceId: created.id,
          metadata: {
            recommendationId,
            promptVersion: recommendation.promptVersion,
          },
          ipAddress: request.ip,
        });
        return created;
      });
      await generateDailyTasks(
        childId,
        businessDateAt(new Date(), config.APP_TIME_ZONE),
      );
      reply.status(201);
      return { template };
    },
  );

  app.post(
    "/api/parent/children/:id/ai/reward-audit",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      enforceAiLimit(familyId, user.id, "reward-audit");
      const credentials = await aiCredentials(familyId, config);
      await syncRecentTaskSuggestedSeconds(childId);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [templates, wishes, completed, attempted] = await Promise.all([
        prisma.taskTemplate.findMany({
          where: { childId, archivedAt: null, isEnabled: true },
        }),
        prisma.wishReward.findMany({
          where: { childId, archivedAt: null, isEnabled: true },
        }),
        prisma.taskAttempt.count({
          where: { childId, status: "COMPLETED", endedAt: { gte: since } },
        }),
        prisma.taskAttempt.count({
          where: { childId, createdAt: { gte: since } },
        }),
      ]);
      const payload = {
        child: { ageYears: 5 },
        observedDays: 30,
        completion: { completed, available: attempted },
        tasks: templates.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          mode: item.mode,
          estimatedMinutes: estimatedMinutes(item),
          baseStars: item.baseStars,
          earlyBonusStars: item.earlyBonusStars,
          repeatableDaily: item.repeatableDaily,
          scheduleKind: item.scheduleKind,
          weekdays: item.weekdays,
        })),
        wishes: wishes.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          costStars: item.costStars,
          redemptionType: item.redemptionType,
          recurrenceKind: item.recurrenceKind,
          recurrenceIntervalDays: item.recurrenceIntervalDays,
          stockRemaining: item.stockRemaining,
        })),
      };
      const result = await callDeepSeekJson({
        ...credentials,
        config,
        systemPrompt: rewardAuditSystemPrompt,
        userPayload: payload,
        outputSchema: rewardAuditResponseSchema,
        maxTokens: 12_000,
      });
      const recommendation = await saveRecommendation({
        kind: "REWARD_AUDIT",
        familyId,
        childId,
        createdById: user.id,
        model: result.model,
        requestPayload: payload as Prisma.InputJsonValue,
        responsePayload: result.data as Prisma.InputJsonValue,
      });
      return {
        recommendationId: recommendation.id,
        audit: result.data,
        promptVersion: AI_PROMPT_VERSION,
      };
    },
  );

  app.get(
    "/api/parent/children/:id/schedule-preferences",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      await ownedChild(request, reply, config, childId);
      const [preference, slots] = await Promise.all([
        prisma.childSchedulePreference.findUnique({ where: { childId } }),
        prisma.childAvailabilitySlot.findMany({
          where: { childId },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        }),
      ]);
      return {
        preference: {
          maxDailyMinutes: preference?.maxDailyMinutes ?? 40,
          maxConsecutiveMinutes: preference?.maxConsecutiveMinutes ?? 15,
          minimumBreakMinutes: preference?.minimumBreakMinutes ?? 5,
          slots: slots.map(({ weekday, startMinute, endMinute }) => ({
            weekday,
            startMinute,
            endMinute,
          })),
        },
      };
    },
  );

  app.put(
    "/api/parent/children/:id/schedule-preferences",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      const input = schedulePreferenceSchema.parse(request.body);
      ensureNoSlotOverlap(input.slots);
      await prisma.$transaction(async (tx) => {
        await tx.childSchedulePreference.upsert({
          where: { childId },
          create: {
            childId,
            maxDailyMinutes: input.maxDailyMinutes,
            maxConsecutiveMinutes: input.maxConsecutiveMinutes,
            minimumBreakMinutes: input.minimumBreakMinutes,
          },
          update: {
            maxDailyMinutes: input.maxDailyMinutes,
            maxConsecutiveMinutes: input.maxConsecutiveMinutes,
            minimumBreakMinutes: input.minimumBreakMinutes,
          },
        });
        await tx.childAvailabilitySlot.deleteMany({ where: { childId } });
        if (input.slots.length) {
          await tx.childAvailabilitySlot.createMany({
            data: input.slots.map((slot) => ({ childId, ...slot })),
          });
        }
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          familyId,
          action: "CHILD_SCHEDULE_PREFERENCE_UPDATE",
          resourceType: "ChildProfile",
          resourceId: childId,
          metadata: {
            maxDailyMinutes: input.maxDailyMinutes,
            maxConsecutiveMinutes: input.maxConsecutiveMinutes,
            minimumBreakMinutes: input.minimumBreakMinutes,
            slotCount: input.slots.length,
          },
          ipAddress: request.ip,
        });
      });
      return { ok: true };
    },
  );

  app.post(
    "/api/parent/children/:id/ai/schedule",
    async (request, reply) => {
      const { id: childId } = idParams.parse(request.params);
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      enforceAiLimit(familyId, user.id, "schedule");
      const credentials = await aiCredentials(familyId, config);
      await syncRecentTaskSuggestedSeconds(childId);
      const [preference, slots, templates] = await Promise.all([
        prisma.childSchedulePreference.findUnique({ where: { childId } }),
        prisma.childAvailabilitySlot.findMany({
          where: { childId },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        }),
        prisma.taskTemplate.findMany({
          where: {
            childId,
            archivedAt: null,
            isEnabled: true,
            aiSchedulingEnabled: true,
            scheduleKind: { not: "ONE_TIME" },
          },
          orderBy: { sortOrder: "asc" },
        }),
      ]);
      if (!slots.length) {
        throw new HttpError(400, "AVAILABILITY_REQUIRED", "请先设置孩子每周可用时间");
      }
      if (!templates.length) {
        throw new HttpError(
          400,
          "SCHEDULABLE_TASK_REQUIRED",
          "请先在任务管理中启用至少一个 AI 排班任务",
        );
      }
      const preferences = {
        maxDailyMinutes: preference?.maxDailyMinutes ?? 40,
        maxConsecutiveMinutes: preference?.maxConsecutiveMinutes ?? 15,
        minimumBreakMinutes: preference?.minimumBreakMinutes ?? 5,
      };
      const payload = {
        child: { ageYears: 5 },
        preferences,
        availability: slots.map(
          ({ weekday, startMinute, endMinute }) => ({
            weekday,
            startMinute,
            endMinute,
          }),
        ),
        tasks: templates.map((item) => ({
          templateId: item.id,
          title: item.title,
          category: item.category,
          estimatedMinutes: estimatedMinutes(item),
          learningPracticeKind: item.learningPracticeKind,
          targetSessionsPerWeek: item.targetSessionsPerWeek,
          minimumGapDays: item.minimumGapDays,
          currentScheduleKind: item.scheduleKind,
          currentWeekdays: item.weekdays,
        })),
      };
      const result = await callDeepSeekJson({
        ...credentials,
        config,
        systemPrompt: scheduleSystemPrompt,
        userPayload: payload,
        outputSchema: scheduleResponseSchema,
      });
      const validationErrors = validateSchedulePlan({
        plan: result.data,
        slots,
        templates: templates.map((item) => ({
          id: item.id,
          estimatedMinutes: estimatedMinutes(item),
        })),
        preferences,
      });
      if (validationErrors.length) {
        throw new HttpError(
          502,
          "AI_SCHEDULE_INVALID",
          `AI 排班未通过安全校验：${validationErrors.slice(0, 3).join("；")}`,
        );
      }
      const recommendation = await saveRecommendation({
        kind: "SCHEDULE",
        familyId,
        childId,
        createdById: user.id,
        model: result.model,
        requestPayload: payload as Prisma.InputJsonValue,
        responsePayload: result.data as Prisma.InputJsonValue,
      });
      return {
        recommendationId: recommendation.id,
        schedule: result.data,
        promptVersion: AI_PROMPT_VERSION,
      };
    },
  );

  app.post(
    "/api/parent/children/:childId/ai/schedule/:recommendationId/apply",
    async (request, reply) => {
      const { childId, recommendationId } = recommendationParams.parse(
        request.params,
      );
      const { user, familyId } = await ownedChild(
        request,
        reply,
        config,
        childId,
      );
      await requireFamilyAiAccess(familyId);
      await syncRecentTaskSuggestedSeconds(childId);
      const [recommendation, preference, slots, templates] = await Promise.all([
        prisma.aiRecommendation.findFirst({
          where: {
            id: recommendationId,
            familyId,
            childId,
            kind: "SCHEDULE",
            status: "DRAFT",
          },
        }),
        prisma.childSchedulePreference.findUnique({ where: { childId } }),
        prisma.childAvailabilitySlot.findMany({ where: { childId } }),
        prisma.taskTemplate.findMany({
          where: {
            childId,
            archivedAt: null,
            isEnabled: true,
            aiSchedulingEnabled: true,
          },
        }),
      ]);
      if (!recommendation) {
        throw new HttpError(404, "AI_RECOMMENDATION_NOT_FOUND", "排班不存在或已应用");
      }
      const plan = scheduleResponseSchema.parse(
        recommendation.responsePayload,
      );
      const preferences = {
        maxDailyMinutes: preference?.maxDailyMinutes ?? 40,
        maxConsecutiveMinutes: preference?.maxConsecutiveMinutes ?? 15,
        minimumBreakMinutes: preference?.minimumBreakMinutes ?? 5,
      };
      const validationErrors = validateSchedulePlan({
        plan,
        slots,
        templates: templates.map((item) => ({
          id: item.id,
          estimatedMinutes: estimatedMinutes(item),
        })),
        preferences,
      });
      if (validationErrors.length) {
        throw new HttpError(
          409,
          "SCHEDULE_CHANGED",
          "任务或可用时间已变化，请重新生成排班",
        );
      }
      await prisma.$transaction(async (tx) => {
        for (const [index, cadence] of plan.taskCadence.entries()) {
          await tx.taskTemplate.update({
            where: { id: cadence.templateId },
            data: {
              scheduleKind: "SELECTED_WEEKDAYS",
              weekdays: [...new Set(cadence.weekdays)].sort(),
              sortOrder: index * 10,
            },
          });
        }
        await tx.aiRecommendation.update({
          where: { id: recommendationId },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          familyId,
          action: "AI_SCHEDULE_APPLY",
          resourceType: "ChildProfile",
          resourceId: childId,
          metadata: {
            recommendationId,
            taskCount: plan.taskCadence.length,
            promptVersion: recommendation.promptVersion,
          },
          ipAddress: request.ip,
        });
      });
      await generateDailyTasks(
        childId,
        businessDateAt(new Date(), config.APP_TIME_ZONE),
      );
      return { ok: true };
    },
  );
}
