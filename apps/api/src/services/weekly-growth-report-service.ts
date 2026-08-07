import { Prisma, type WeeklyGrowthReport } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { weeklyGrowthResponseSchema } from "../ai/schemas.js";
import {
  WEEKLY_GROWTH_PROMPT_VERSION,
  weeklyGrowthSystemPrompt,
} from "../ai/prompts.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/secret-encryption.js";
import {
  addBusinessDays,
  businessDateAt,
  startOfBusinessWeek,
} from "../lib/time.js";
import { callDeepSeekJson } from "./deepseek-service.js";
import { getGrowthAnalyticsForRange } from "./growth-analytics-service.js";

const GENERATING_STALE_MS = 15 * 60 * 1_000;

export function previousCompletedGrowthWeek(
  now: Date,
  timeZone: string,
) {
  const today = businessDateAt(now, timeZone);
  const currentWeekStart = startOfBusinessWeek(today);
  const weekStart = addBusinessDays(currentWeekStart, -7);
  return {
    weekStart,
    weekEnd: addBusinessDays(weekStart, 6),
  };
}

async function childAiCredentials(childId: string, config: AppConfig) {
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      status: "ACTIVE",
      family: { status: "ACTIVE" },
    },
    select: {
      familyId: true,
      family: { select: { aiConfig: true } },
    },
  });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
  const stored = child.family.aiConfig;
  if (!stored?.enabled) {
    throw new HttpError(
      409,
      "AI_NOT_CONFIGURED",
      "请先在 AI 育儿助手中保存并启用 DeepSeek 密钥",
    );
  }
  return {
    familyId: child.familyId,
    model: stored.model,
    apiKey: decryptSecret(
      {
        ciphertext: stored.encryptedApiKey,
        iv: stored.encryptionIv,
        tag: stored.encryptionTag,
      },
      config.AI_CONFIG_ENCRYPTION_KEY,
    ),
  };
}

function isFreshGeneration(report: WeeklyGrowthReport, now: Date) {
  return (
    report.status === "GENERATING" &&
    now.getTime() - report.updatedAt.getTime() < GENERATING_STALE_MS
  );
}

export async function generateWeeklyGrowthReport(
  childId: string,
  config: AppConfig,
  options: { now?: Date; force?: boolean } = {},
) {
  const now = options.now ?? new Date();
  const { weekStart, weekEnd } = previousCompletedGrowthWeek(
    now,
    config.APP_TIME_ZONE,
  );
  const existing = await prisma.weeklyGrowthReport.findUnique({
    where: { childId_weekStart: { childId, weekStart } },
  });
  if (existing && isFreshGeneration(existing, now)) return existing;
  if (existing?.status === "COMPLETED" && !options.force) return existing;
  const preserveCompletedReport = Boolean(
    existing?.generatedAt && existing.responsePayload,
  );

  const credentials = await childAiCredentials(childId, config);
  const analytics = await getGrowthAnalyticsForRange(
    childId,
    { from: weekStart, to: weekEnd, days: 7 },
    config.APP_TIME_ZONE,
  );
  const metricsPayload = {
    period: analytics.range,
    privacy: "匿名聚合数据，不包含姓名、登录码、设备、IP、地址或学校",
    summary: analytics.summary,
    daily: analytics.daily,
    taskPerformance: analytics.tasks.map((task) => ({
      templateId: task.templateId,
      title: task.title,
      category: task.categoryLabel,
      scheduledDays: task.scheduledDays,
      completedDays: task.completedDays,
      completionRate: task.completionRate,
      completedAttempts: task.completedAttempts,
      failedAttempts: task.failedAttempts,
      abandonedAttempts: task.abandonedAttempts,
      averageMinutes: task.averageMinutes,
    })),
    categoryPerformance: analytics.categories,
    spendingPreference: {
      categories: analytics.spending,
      items: analytics.spendingItems.slice(0, 8),
    },
  };
  const report = await prisma.weeklyGrowthReport.upsert({
    where: { childId_weekStart: { childId, weekStart } },
    create: {
      familyId: credentials.familyId,
      childId,
      weekStart,
      weekEnd,
      status: "GENERATING",
      promptVersion: WEEKLY_GROWTH_PROMPT_VERSION,
      model: credentials.model,
      metricsPayload: metricsPayload as Prisma.InputJsonValue,
    },
    update: {
      familyId: credentials.familyId,
      weekEnd,
      status: "GENERATING",
      promptVersion: WEEKLY_GROWTH_PROMPT_VERSION,
      model: credentials.model,
      metricsPayload: metricsPayload as Prisma.InputJsonValue,
      errorCode: null,
    },
  });

  try {
    const result = await callDeepSeekJson({
      ...credentials,
      config,
      systemPrompt: weeklyGrowthSystemPrompt,
      userPayload: metricsPayload,
      outputSchema: weeklyGrowthResponseSchema,
      maxTokens: 1_200,
    });
    return await prisma.weeklyGrowthReport.update({
      where: { id: report.id },
      data: {
        status: "COMPLETED",
        model: result.model,
        responsePayload: result.data as Prisma.InputJsonValue,
        generatedAt: new Date(),
        errorCode: null,
      },
    });
  } catch (error) {
    await prisma.weeklyGrowthReport.update({
      where: { id: report.id },
      data: {
        status: preserveCompletedReport ? "COMPLETED" : "FAILED",
        errorCode:
          error instanceof HttpError
            ? error.code
            : "WEEKLY_REPORT_GENERATION_FAILED",
      },
    });
    throw error;
  }
}

export async function latestWeeklyGrowthReport(childId: string) {
  return prisma.weeklyGrowthReport.findFirst({
    where: { childId, status: "COMPLETED" },
    orderBy: { weekStart: "desc" },
  });
}

export async function generateDueWeeklyGrowthReports(
  config: AppConfig,
  logger: FastifyBaseLogger,
  now = new Date(),
) {
  const children = await prisma.childProfile.findMany({
    where: {
      status: "ACTIVE",
      family: { status: "ACTIVE", aiConfig: { is: { enabled: true } } },
    },
    select: { id: true, familyId: true },
  });
  for (const child of children) {
    try {
      await generateWeeklyGrowthReport(child.id, config, { now });
    } catch (error) {
      logger.error(
        { error, childId: child.id, familyId: child.familyId },
        "孩子成长周报生成失败",
      );
    }
  }
}
