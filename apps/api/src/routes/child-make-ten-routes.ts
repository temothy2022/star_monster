import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  answerMakeTenQuestion,
  finishMakeTenSession,
  startMakeTenSession,
} from "../services/make-ten-learning-service.js";

const idParams = z.object({ id: z.string().min(1) });

export async function registerChildMakeTenRoutes(app: FastifyInstance, config: AppConfig) {
  app.post("/api/child/make-ten/sessions/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { attemptId } = z.object({ attemptId: z.string().min(1) }).parse(request.body);
    return startMakeTenSession(child.id, attemptId, config);
  });

  app.post("/api/child/make-ten/sessions/:id/answer", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = z.object({
      questionIndex: z.number().int().min(0).max(50),
      selectedNumber: z.number().int().min(1).max(9).nullable(),
      timedOut: z.boolean().default(false),
      responseMs: z.number().int().min(0).max(60_000).optional(),
    }).parse(request.body);
    return answerMakeTenQuestion(child.id, id, input);
  });

  app.post("/api/child/make-ten/sessions/:id/finish", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return finishMakeTenSession(child.id, id);
  });
}
