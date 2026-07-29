import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  answerHanziQuestion,
  answerHanziReview,
  completeHanziNewCharacter,
  finalizeHanziSession,
  finishHanziSession,
  startHanziSession,
} from "../services/hanzi-learning-service.js";

const idParams = z.object({ id: z.string().min(1) });
const finalizeSchema = z.object({
  reviewAnswers: z
    .array(
      z.object({
        characterId: z.string().min(1),
        known: z.boolean(),
      }),
    )
    .max(50),
  learnedCharacterIds: z.array(z.string().min(1)).max(20),
  answers: z
    .array(
      z.object({
        questionIndex: z.number().int().min(0).max(20),
        selectedCharacterId: z.string().min(1),
      }),
    )
    .max(20),
});

export async function registerChildHanziRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post("/api/child/hanzi/sessions/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { attemptId } = z.object({ attemptId: z.string().min(1) }).parse(request.body);
    return startHanziSession(child.id, attemptId, config);
  });

  app.post("/api/child/hanzi/sessions/:id/review", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = z
      .object({ characterId: z.string().min(1), known: z.boolean() })
      .parse(request.body);
    return answerHanziReview(child.id, id, input.characterId, input.known, config);
  });

  app.post("/api/child/hanzi/sessions/:id/learn", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { characterId } = z.object({ characterId: z.string().min(1) }).parse(request.body);
    return completeHanziNewCharacter(child.id, id, characterId, config);
  });

  app.post("/api/child/hanzi/sessions/:id/answer", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = z
      .object({
        questionIndex: z.number().int().min(0),
        selectedCharacterId: z.string().min(1),
      })
      .parse(request.body);
    return answerHanziQuestion(
      child.id,
      id,
      input.questionIndex,
      input.selectedCharacterId,
    );
  });

  app.post("/api/child/hanzi/sessions/:id/finish", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    return finishHanziSession(child.id, id);
  });

  app.post(
    "/api/child/hanzi/sessions/:id/finalize",
    async (request, reply) => {
      const { child } = await requireChild(request, reply, config);
      const { id } = idParams.parse(request.params);
      const input = finalizeSchema.parse(request.body);
      return finalizeHanziSession(child.id, id, input, config);
    },
  );
}
