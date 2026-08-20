import { prisma } from "../lib/prisma.js";
import {
  MAX_VALID_TASK_DURATION_SECONDS,
  MIN_VALID_TASK_DURATION_SECONDS,
  RECENT_TASK_DURATION_SAMPLE_SIZE,
  recentAverageTaskSeconds,
} from "../domain/task-duration.js";

const DURATION_LOOKBACK_DAYS = 365;
const CACHE_TTL_MS = 5 * 60 * 1_000;

type DurationCacheEntry = {
  expiresAt: number;
  values: Map<string, number>;
};

const durationCache = new Map<string, DurationCacheEntry>();

export function invalidateTaskDurationCache(childId: string): void {
  durationCache.delete(childId);
}

export async function syncRecentTaskSuggestedSeconds(
  childId: string,
  options: { force?: boolean; now?: Date } = {},
): Promise<Map<string, number>> {
  const now = options.now ?? new Date();
  const cached = durationCache.get(childId);
  if (!options.force && cached && cached.expiresAt > now.getTime()) {
    return new Map(cached.values);
  }

  const cutoff = new Date(
    now.getTime() - DURATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1_000,
  );
  const [templates, attempts] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { childId, archivedAt: null },
      select: { id: true, suggestedSeconds: true },
    }),
    prisma.taskAttempt.findMany({
      where: {
        childId,
        status: "COMPLETED",
        endedAt: { gte: cutoff },
        elapsedSeconds: {
          gte: MIN_VALID_TASK_DURATION_SECONDS,
          lte: MAX_VALID_TASK_DURATION_SECONDS,
        },
      },
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      select: {
        elapsedSeconds: true,
        dailyTask: { select: { templateId: true } },
      },
    }),
  ]);

  const activeTemplateIds = new Set(templates.map((template) => template.id));
  const samplesByTemplate = new Map<string, number[]>();
  for (const attempt of attempts) {
    const templateId = attempt.dailyTask.templateId;
    if (!activeTemplateIds.has(templateId) || attempt.elapsedSeconds === null) {
      continue;
    }
    const samples = samplesByTemplate.get(templateId) ?? [];
    if (samples.length >= RECENT_TASK_DURATION_SAMPLE_SIZE) continue;
    samples.push(attempt.elapsedSeconds);
    samplesByTemplate.set(templateId, samples);
  }

  const averages = new Map<string, number>();
  for (const [templateId, samples] of samplesByTemplate) {
    const average = recentAverageTaskSeconds(samples);
    if (average !== null) averages.set(templateId, average);
  }

  const changed = templates.flatMap((template) => {
    const average = averages.get(template.id);
    return average !== undefined && average !== template.suggestedSeconds
      ? [{ templateId: template.id, average }]
      : [];
  });
  if (changed.length) {
    await prisma.$transaction(
      changed.flatMap(({ templateId, average }) => [
        prisma.taskTemplate.update({
          where: { id: templateId },
          data: { suggestedSeconds: average },
        }),
        prisma.dailyTask.updateMany({
          where: { childId, templateId, status: "PENDING" },
          data: { suggestedSecondsSnapshot: average },
        }),
      ]),
    );
  }

  durationCache.set(childId, {
    expiresAt: now.getTime() + CACHE_TTL_MS,
    values: averages,
  });
  return new Map(averages);
}
