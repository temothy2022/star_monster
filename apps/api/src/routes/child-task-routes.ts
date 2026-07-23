import type { FastifyInstance } from "fastify";
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
    return completeTask(child.id, id);
  });
}
