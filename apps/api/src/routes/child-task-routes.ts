import type { FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  abandonTask,
  completeTask,
  getTodayTaskExperience,
  pauseTask,
  resumeTask,
  startTask,
} from "../services/task-service.js";

const idParams = z.object({ id: z.string().min(1) });

export async function registerChildTaskRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/child/tasks/today", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return getTodayTaskExperience(child.id, config);
  });

  app.post("/api/child/tasks/:id/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return startTask(child.id, id, config);
  });

  app.post("/api/child/attempts/:id/pause", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return { attempt: await pauseTask(child.id, id) };
  });

  app.post("/api/child/attempts/:id/resume", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return { attempt: await resumeTask(child.id, id) };
  });

  app.post("/api/child/attempts/:id/abandon", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return { attempt: await abandonTask(child.id, id) };
  });

  app.post("/api/child/attempts/:id/complete", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const timings: Array<{ stage: string; ms: number }> = [];
    const startedAt = performance.now();

    try {
      const result = await completeTask(child.id, id, {
        onTiming: (timing) => timings.push(timing),
      });
      request.log.info(
        {
          childId: child.id,
          attemptId: id,
          alreadyCompleted: result.alreadyCompleted,
          totalMs: Math.round(performance.now() - startedAt),
          timings,
        },
        "child task complete timing",
      );
      return result;
    } catch (error) {
      request.log.warn(
        {
          childId: child.id,
          attemptId: id,
          totalMs: Math.round(performance.now() - startedAt),
          timings,
          error,
        },
        "child task complete failed timing",
      );
      throw error;
    }
  });
}
