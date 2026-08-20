import { Prisma, type WeeklyGrowthReport } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import {
  weeklyGrowthResponseSchema,
  type WeeklyGrowthResponse,
} from "../ai/schemas.js";
import {
  WEEKLY_GROWTH_PROMPT_VERSION,
  weeklyGrowthSystemPrompt,
} from "../ai/prompts.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { systemAiCredentials } from "./system-ai-service.js";
import {
  addBusinessDays,
  businessDateAt,
  startOfBusinessWeek,
} from "../lib/time.js";
import { callDeepSeekJson } from "./deepseek-service.js";
import { getGrowthAnalyticsForRange } from "./growth-analytics-service.js";
import { getMathMasteryForRange } from "./math-mastery-service.js";

const GENERATING_STALE_MS = 15 * 60 * 1_000;
const ANALYSIS_WEEKS = 4;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

export function previousCompletedGrowthWindow(
  now: Date,
  timeZone: string,
) {
  const anchor = previousCompletedGrowthWeek(now, timeZone);
  return {
    from: addBusinessDays(anchor.weekEnd, -(ANALYSIS_WEEKS * 7 - 1)),
    to: anchor.weekEnd,
    days: ANALYSIS_WEEKS * 7,
  };
}

type PlanningTemplate = {
  id: string;
  title: string;
  experienceKind: string;
  scheduleKind: "DAILY" | "WORKDAYS" | "SELECTED_WEEKDAYS" | "ONE_TIME";
  weekdays: number[];
  systemManaged: boolean;
};

function isAutomaticReview(template: PlanningTemplate) {
  return (
    template.systemManaged &&
    (template.experienceKind === "HANZI_REVIEW" ||
      template.experienceKind === "POEM_REVIEW")
  );
}

function cadenceLabel(template: PlanningTemplate) {
  if (isAutomaticReview(template)) return "按复习到期日自动出现";
  if (template.scheduleKind === "DAILY") return "每天";
  if (template.scheduleKind === "WORKDAYS") return "工作日";
  if (template.scheduleKind === "ONE_TIME") return "一次性";
  return template.weekdays
    .slice()
    .sort((left, right) => left - right)
    .map((weekday) => WEEKDAY_LABELS[weekday] ?? `星期${weekday}`)
    .join("、");
}

function currentSchedule(template: PlanningTemplate) {
  if (isAutomaticReview(template)) {
    return { frequency: "AUTOMATIC_DUE" as const, weekdays: [] as number[] };
  }
  if (template.scheduleKind === "DAILY") {
    return { frequency: "DAILY" as const, weekdays: [] as number[] };
  }
  if (template.scheduleKind === "WORKDAYS") {
    return { frequency: "WORKDAYS" as const, weekdays: [] as number[] };
  }
  return {
    frequency: "SELECTED_WEEKDAYS" as const,
    weekdays: template.weekdays.slice().sort((left, right) => left - right),
  };
}

function plannedSessionsPerWeek(template: PlanningTemplate) {
  if (isAutomaticReview(template)) return null;
  if (template.scheduleKind === "DAILY") return 7;
  if (template.scheduleKind === "WORKDAYS") return 5;
  if (template.scheduleKind === "ONE_TIME") return 1;
  return new Set(template.weekdays).size;
}

function uniqueByTemplate<T extends { templateId: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.templateId)) return false;
    seen.add(item.templateId);
    return true;
  });
}

function normalizeWeeklyGrowthResponse(
  analysis: WeeklyGrowthResponse,
  templates: PlanningTemplate[],
): WeeklyGrowthResponse {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const normalizeFindings = (items: WeeklyGrowthResponse["doingWell"]) =>
    uniqueByTemplate(items)
      .filter((item) => templateById.has(item.templateId))
      .map((item) => ({
        ...item,
        title: templateById.get(item.templateId)!.title,
      }));
  const doingWell = normalizeFindings(analysis.doingWell);
  const doingWellIds = new Set(doingWell.map((item) => item.templateId));
  const needsAdjustment = normalizeFindings(analysis.needsAdjustment).filter(
    (item) => !doingWellIds.has(item.templateId),
  );
  const cadenceChanges = uniqueByTemplate(analysis.cadenceChanges)
    .filter((item) => {
      const template = templateById.get(item.templateId);
      return Boolean(
        template &&
          template.scheduleKind !== "ONE_TIME" &&
          !isAutomaticReview(template),
      );
    })
    .map((item) => ({
      ...item,
      title: templateById.get(item.templateId)!.title,
      currentCadence: cadenceLabel(templateById.get(item.templateId)!),
    }));
  const scheduleById = new Map(
    uniqueByTemplate(analysis.recommendedSchedule)
      .filter((item) => {
        const template = templateById.get(item.templateId);
        return Boolean(template && template.scheduleKind !== "ONE_TIME");
      })
      .map((item) => {
        const template = templateById.get(item.templateId)!;
        const automatic = isAutomaticReview(template);
        const fallback = currentSchedule(template);
        const frequency =
          automatic
            ? "AUTOMATIC_DUE" as const
            : item.frequency === "AUTOMATIC_DUE"
              ? fallback.frequency
              : item.frequency;
        return [
          item.templateId,
          {
            ...item,
            title: template.title,
            frequency,
            weekdays:
              frequency === "SELECTED_WEEKDAYS"
                ? item.frequency === "AUTOMATIC_DUE"
                  ? fallback.weekdays
                  : item.weekdays
                : [],
          },
        ];
      }),
  );
  for (const template of templates) {
    if (template.scheduleKind === "ONE_TIME" || scheduleById.has(template.id)) continue;
    scheduleById.set(template.id, {
      templateId: template.id,
      title: template.title,
      ...currentSchedule(template),
      reason: "保持当前安排，继续观察完成情况",
    });
  }
  const dimensions = Array.from(
    new Map(analysis.dimensions.map((item) => [item.key, item])).values(),
  );
  const suggestedQuestions = analysis.suggestedQuestions.filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.question === item.question) === index,
  );
  return {
    ...analysis,
    doingWell,
    needsAdjustment,
    cadenceChanges,
    recommendedSchedule: Array.from(scheduleById.values()),
    dimensions,
    suggestedQuestions,
  };
}

async function childAiCredentials(childId: string, config: AppConfig) {
  const child = await prisma.childProfile.findFirst({
    where: {
      id: childId,
      status: "ACTIVE",
      family: { status: "ACTIVE" },
    },
    select: { familyId: true },
  });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
  const credentials = await systemAiCredentials(config);
  return {
    familyId: child.familyId,
    ...credentials,
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
  if (
    existing?.status === "COMPLETED" &&
    !options.force &&
    existing.promptVersion === WEEKLY_GROWTH_PROMPT_VERSION &&
    weeklyGrowthResponseSchema.safeParse(existing.responsePayload).success
  ) {
    return existing;
  }
  const preserveCompletedReport = Boolean(
    existing?.generatedAt && existing.responsePayload,
  );

  const credentials = await childAiCredentials(childId, config);
  const analysisWindow = previousCompletedGrowthWindow(
    now,
    config.APP_TIME_ZONE,
  );
  const analysisEndExclusive = addBusinessDays(analysisWindow.to, 1);
  const [
    analytics,
    templates,
    mathMastery,
    hanziProgress,
    poemProgress,
    clockPractice,
    makeTenPractice,
    makeTenResponseTimes,
  ] = await Promise.all([
    getGrowthAnalyticsForRange(
      childId,
      analysisWindow,
      config.APP_TIME_ZONE,
    ),
    prisma.taskTemplate.findMany({
      where: {
        childId,
        isEnabled: true,
        archivedAt: null,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        experienceKind: true,
        suggestedSeconds: true,
        timeLimitSeconds: true,
        repeatableDaily: true,
        scheduleKind: true,
        weekdays: true,
        oneTimeDate: true,
        learningPracticeKind: true,
        systemManaged: true,
        createdAt: true,
      },
    }),
    getMathMasteryForRange(childId, {
      from: analysisWindow.from,
      to: new Date(analysisEndExclusive.getTime() - 1),
    }),
    prisma.hanziLearningProgress.groupBy({
      by: ["status"],
      where: { childId },
      _count: { _all: true },
    }),
    prisma.poemLearningProgress.groupBy({
      by: ["status"],
      where: { childId },
      _count: { _all: true },
    }),
    prisma.clockLearningSession.aggregate({
      where: {
        childId,
        completedAt: { gte: analysisWindow.from, lt: analysisEndExclusive },
      },
      _count: { _all: true },
      _sum: { correctCount: true, totalQuestions: true },
    }),
    prisma.makeTenLearningSession.aggregate({
      where: {
        childId,
        completedAt: { gte: analysisWindow.from, lt: analysisEndExclusive },
      },
      _count: { _all: true },
      _sum: { correctCount: true, totalQuestions: true },
    }),
    prisma.makeTenQuestionAttempt.aggregate({
      where: {
        childId,
        answeredAt: { gte: analysisWindow.from, lt: analysisEndExclusive },
      },
      _avg: { responseMs: true },
    }),
  ]);
  const performanceById = new Map(
    analytics.tasks.map((task) => [task.templateId, task]),
  );
  const mathMasteryByTemplate = new Map(
    mathMastery.templates.map((item) => [item.templateId, item]),
  );
  const hanziProgressByStatus = Object.fromEntries(
    hanziProgress.map((item) => [item.status, item._count._all]),
  );
  const poemProgressByStatus = Object.fromEntries(
    poemProgress.map((item) => [item.status, item._count._all]),
  );
  const clockQuestions = clockPractice._sum.totalQuestions ?? 0;
  const makeTenQuestions = makeTenPractice._sum.totalQuestions ?? 0;
  const metricsPayload = {
    period: analytics.range,
    privacy: "匿名聚合数据，不包含姓名、登录码、设备、IP、地址或学校",
    summary: {
      scheduledTaskDays: analytics.summary.scheduledTasks,
      completedTaskDays: analytics.summary.completedTasks,
      completionRate: analytics.summary.completionRate,
      activeDays: analytics.summary.activeDays,
    },
    categoryBalance: analytics.categories.map((category) => {
      const categoryTasks = analytics.tasks.filter(
        (task) => task.category === category.category,
      );
      const observedMinutes = categoryTasks.reduce(
        (sum, task) =>
          sum + (task.averageMinutes ?? 0) * task.completedAttempts,
        0,
      );
      return {
        category: category.category,
        label: category.label,
        scheduledDays: category.scheduledTasks,
        completedDays: category.completedTasks,
        completionRate: category.completionRate,
        completedAttempts: category.completedAttempts,
        observedMinutes: Math.round(observedMinutes * 10) / 10,
      };
    }),
    learningSnapshot: {
      hanzi: {
        learning: hanziProgressByStatus.LEARNING ?? 0,
        mastered: hanziProgressByStatus.MASTERED ?? 0,
      },
      poems: {
        learning: poemProgressByStatus.LEARNING ?? 0,
        mastered: poemProgressByStatus.MASTERED ?? 0,
      },
      clock: {
        completedSessions: clockPractice._count._all,
        totalQuestions: clockQuestions,
        accuracy:
          clockQuestions > 0
            ? (clockPractice._sum.correctCount ?? 0) / clockQuestions
            : null,
      },
      makeTen: {
        completedSessions: makeTenPractice._count._all,
        totalQuestions: makeTenQuestions,
        accuracy:
          makeTenQuestions > 0
            ? (makeTenPractice._sum.correctCount ?? 0) / makeTenQuestions
            : null,
        averageResponseSeconds:
          makeTenResponseTimes._avg.responseMs === null
            ? null
            : Math.round((makeTenResponseTimes._avg.responseMs / 1_000) * 10) / 10,
      },
      math: mathMastery.summary,
    },
    taskObservations: templates.map((template) => {
      const performance = performanceById.get(template.id);
      const suggestedMinutes = Math.max(
        1,
        Math.round(
          (template.timeLimitSeconds ?? template.suggestedSeconds ?? 600) / 60,
        ),
      );
      const sessionsPerWeek = plannedSessionsPerWeek(template);
      const observedAverageMinutes = performance?.averageMinutes ?? null;
      const observedSessionsPerWeek = performance
        ? Math.round((performance.completedAttempts / ANALYSIS_WEEKS) * 10) / 10
        : 0;
      const mastery = mathMasteryByTemplate.get(template.id);
      return {
        templateId: template.id,
        title: template.title,
        category: template.category,
        experienceKind: template.experienceKind,
        learningPracticeKind: template.learningPracticeKind,
        systemManaged: template.systemManaged,
        activeForPlanning: template.scheduleKind !== "ONE_TIME",
        currentSchedule: {
          kind: isAutomaticReview(template) ? "AUTOMATIC_DUE" : template.scheduleKind,
          label: cadenceLabel(template),
          weekdays: template.weekdays,
          repeatableDaily: template.repeatableDaily,
        },
        workload: {
          suggestedMinutesPerSession: suggestedMinutes,
          plannedSessionsPerWeek: sessionsPerWeek,
          plannedMinutesPerWeek:
            sessionsPerWeek === null ? null : suggestedMinutes * sessionsPerWeek,
          observedAverageMinutesPerSession: observedAverageMinutes,
          observedSessionsPerWeek,
          observedMinutesPerWeek:
            observedAverageMinutes === null
              ? null
              : Math.round(observedAverageMinutes * observedSessionsPerWeek * 10) / 10,
        },
        sample: {
          scheduledDays: performance?.scheduledDays ?? 0,
          completedDays: performance?.completedDays ?? 0,
          completionRate: performance?.completionRate ?? 0,
          completedAttempts: performance?.completedAttempts ?? 0,
          failedAttempts: performance?.failedAttempts ?? 0,
          abandonedAttempts: performance?.abandonedAttempts ?? 0,
          averageMinutes: performance?.averageMinutes ?? null,
          weeklyBreakdown: performance?.weeklyBreakdown ?? [],
        },
        learningValue: mastery
          ? {
              kind: "MATH_QUESTION_TYPE_MASTERY",
              totalQuestions: mastery.summary.totalQuestions,
              accuracy: mastery.summary.accuracy,
              firstTryAccuracy: mastery.summary.firstTryAccuracy,
              averageResponseSeconds:
                mastery.summary.averageResponseMs === null
                  ? null
                  : Math.round((mastery.summary.averageResponseMs / 1_000) * 10) / 10,
              expectedResponseSeconds:
                mastery.summary.expectedResponseMs === null
                  ? null
                  : Math.round((mastery.summary.expectedResponseMs / 1_000) * 10) / 10,
              mastery: mastery.summary.mastery,
              trend: mastery.summary.trend,
              weakestQuestionTypes: mastery.types.slice(0, 4).map((type) => ({
                questionTypeId: type.questionTypeId,
                name: type.name,
                totalQuestions: type.totalQuestions,
                accuracy: type.accuracy,
                averageResponseSeconds:
                  type.averageResponseMs === null
                    ? null
                    : Math.round((type.averageResponseMs / 1_000) * 10) / 10,
                expectedResponseSeconds:
                  type.expectedResponseMs === null
                    ? null
                    : Math.round((type.expectedResponseMs / 1_000) * 10) / 10,
                mastery: type.mastery,
                trend: type.trend,
              })),
            }
          : null,
      };
    }),
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
      maxTokens: 4_800,
    });
    const normalized = normalizeWeeklyGrowthResponse(result.data, templates);
    return await prisma.weeklyGrowthReport.update({
      where: { id: report.id },
      data: {
        status: "COMPLETED",
        model: result.model,
        responsePayload: normalized as Prisma.InputJsonValue,
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
  let succeeded = 0;
  let failed = 0;
  for (const child of children) {
    try {
      await generateWeeklyGrowthReport(child.id, config, { now });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { error, childId: child.id, familyId: child.familyId },
        "孩子成长周报生成失败",
      );
    }
  }
  return { processed: children.length, succeeded, failed };
}
