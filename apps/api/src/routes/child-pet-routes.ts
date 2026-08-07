import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  careForPet,
  getPetGrowthState,
  revealPetTrip,
  startPetTrip,
} from "../services/pet-growth-service.js";

const actionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
});
const travelSchema = actionSchema.extend({
  tier: z.enum(["NEARBY", "CHINA", "WORLD"]),
});
const tripParams = z.object({ id: z.string().min(1) });

export async function registerChildPetRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/child/pet", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return getPetGrowthState(child.id, config);
  });

  app.post("/api/child/pet/feed", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { idempotencyKey } = actionSchema.parse(request.body);
    return careForPet({ childId: child.id, kind: "FEED", idempotencyKey, appConfig: config });
  });

  app.post("/api/child/pet/drink", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { idempotencyKey } = actionSchema.parse(request.body);
    return careForPet({ childId: child.id, kind: "DRINK", idempotencyKey, appConfig: config });
  });

  app.post("/api/child/pet/trips", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = travelSchema.parse(request.body);
    return startPetTrip({ childId: child.id, ...input, appConfig: config });
  });

  app.post("/api/child/pet/trips/:id/reveal", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = tripParams.parse(request.params);
    return revealPetTrip(child.id, id, config);
  });
}
