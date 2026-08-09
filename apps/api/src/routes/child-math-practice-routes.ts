import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  answerMathPracticeQuestion,
  finishMathPracticeSession,
  startMathPracticeSession,
} from "../services/math-practice-service.js";

const idParams = z.object({ id: z.string().min(1) });

export async function registerChildMathPracticeRoutes(app: FastifyInstance, config: AppConfig) {
  app.post("/api/child/math-practice/sessions/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { attemptId } = z.object({ attemptId: z.string().min(1) }).parse(request.body);
    return startMathPracticeSession(child.id, attemptId, config);
  });

  app.post("/api/child/math-practice/sessions/:id/answer", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = z.object({
      questionIndex: z.number().int().min(0).max(99),
      values: z.array(z.string().trim().min(1).max(24)).min(1).max(12),
      responseMs: z.number().int().min(0).max(600_000),
    }).parse(request.body);
    return answerMathPracticeQuestion(child.id, id, input);
  });

  app.post("/api/child/math-practice/sessions/:id/finish", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return finishMathPracticeSession(child.id, id);
  });
}
