import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt, businessDateKey } from "../lib/time.js";
import { prepareDailyTasks } from "./task-service.js";
import { generateDueWeeklyGrowthReports } from "./weekly-growth-report-service.js";

const MAINTENANCE_INTERVAL_MS = 60_000;
const PERFORMANCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export function startDailyScheduler(
  config: AppConfig,
  logger: FastifyBaseLogger,
): () => void {
  let running = false;
  let weeklyReportsRunning = false;
  let lastWeeklyReportSweepDate: string | null = null;

  const maintain = async () => {
    if (running) return;
    running = true;
    const now = new Date();

    try {
      const children = await prisma.childProfile.findMany({
        where: {
          status: "ACTIVE",
          family: { status: "ACTIVE" },
        },
        select: { id: true },
      });

      for (const child of children) {
        try {
          await prepareDailyTasks(child.id, config, now);
        } catch (error) {
          logger.error({ error, childId: child.id }, "孩子每日任务维护失败");
        }
      }

      await Promise.all([
        prisma.childSession.deleteMany({ where: { expiresAt: { lte: now } } }),
        prisma.userSession.deleteMany({ where: { expiresAt: { lte: now } } }),
        prisma.childPerformanceMetric.deleteMany({
          where: {
            createdAt: {
              lt: new Date(now.getTime() - PERFORMANCE_RETENTION_MS),
            },
          },
        }),
      ]);
    } catch (error) {
      logger.error({ error }, "每日任务维护程序运行失败");
    } finally {
      running = false;
    }
  };

  const maintainWeeklyReports = async () => {
    const now = new Date();
    const dateKey = businessDateKey(
      businessDateAt(now, config.APP_TIME_ZONE),
    );
    if (weeklyReportsRunning || lastWeeklyReportSweepDate === dateKey) return;
    weeklyReportsRunning = true;
    try {
      await generateDueWeeklyGrowthReports(config, logger, now);
    } catch (error) {
      logger.error({ error }, "成长周报定时维护失败");
    } finally {
      lastWeeklyReportSweepDate = dateKey;
      weeklyReportsRunning = false;
    }
  };

  void maintain();
  void maintainWeeklyReports();
  const timer = setInterval(() => {
    void maintain();
    void maintainWeeklyReports();
  }, MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
