import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  completeNewPoem,
  finishPoemReview,
  reviewPoem,
  startPoemSession,
} from "../services/poem-learning-service.js";

const sessionParams = z.object({ id: z.string().min(1) });
const startSchema = z.object({ attemptId: z.string().min(1) });
const poemSchema = z.object({ poemId: z.string().min(1) });
const reviewSchema = poemSchema.extend({
  rating: z.enum(["EASY", "EFFORTFUL", "HINTED", "FORGOT"]).optional(),
  responseMs: z.number().int().min(0).max(10 * 60 * 1000).optional(),
  result: z.enum(["REMEMBERED", "FORGOT"]).optional(),
}).transform((value) => ({
  poemId: value.poemId,
  rating: value.rating ?? (value.result === "FORGOT" ? "FORGOT" : "EASY"),
  responseMs: value.responseMs,
}));

export async function registerChildPoemRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post("/api/child/poems/sessions/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { attemptId } = startSchema.parse(request.body);
    return startPoemSession(child.id, attemptId, config);
  });

  app.post("/api/child/poems/sessions/:id/learn", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = sessionParams.parse(request.params);
    const { poemId } = poemSchema.parse(request.body);
    return completeNewPoem(child.id, id, poemId, config);
  });

  app.post("/api/child/poems/sessions/:id/review", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = sessionParams.parse(request.params);
    const { poemId, rating, responseMs } = reviewSchema.parse(request.body);
    return reviewPoem(child.id, id, poemId, rating, responseMs, config);
  });

  app.post("/api/child/poems/sessions/:id/finish", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = sessionParams.parse(request.params);
    return finishPoemReview(child.id, id);
  });
}
