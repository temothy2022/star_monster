import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  answerClockQuestion,
  finishClockLearningSession,
  startClockLearningSession,
} from "../services/clock-learning-service.js";

const idParams = z.object({ id: z.string().min(1) });

export async function registerChildClockRoutes(app: FastifyInstance, config: AppConfig) {
  app.post("/api/child/clock/sessions/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { attemptId } = z.object({ attemptId: z.string().min(1) }).parse(request.body);
    return startClockLearningSession(child.id, attemptId, config);
  });

  app.post("/api/child/clock/sessions/:id/answer", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = z.object({
      questionIndex: z.number().int().min(0).max(20),
      hour: z.number().int().min(1).max(12),
      minute: z.number().int().min(0).max(59),
      second: z.number().int().min(0).max(59).default(0),
    }).parse(request.body);
    return answerClockQuestion(child.id, id, input);
  });

  app.post("/api/child/clock/sessions/:id/finish", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return finishClockLearningSession(child.id, id);
  });
}
