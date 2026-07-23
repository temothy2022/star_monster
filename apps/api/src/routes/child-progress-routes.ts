import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { getFootprints } from "../services/footprint-service.js";
import { requireChild } from "../services/auth-service.js";
import { listChildWishes, redeemWish } from "../services/wish-service.js";

const idParams = z.object({ id: z.string().min(1) });
const redemptionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
});
const footprintQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function registerChildProgressRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/child/wishes", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return listChildWishes(child.id);
  });

  app.post("/api/child/wishes/:id/redeem", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { idempotencyKey } = redemptionSchema.parse(request.body);
    return redeemWish(child.id, id, idempotencyKey);
  });

  app.get("/api/child/footprints", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { date } = footprintQuery.parse(request.query);
    return getFootprints(child.id, config, date);
  });
}
