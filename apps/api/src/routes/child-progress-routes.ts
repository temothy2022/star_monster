import type { FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { getFootprints } from "../services/footprint-service.js";
import { requireChild } from "../services/auth-service.js";
import {
  markPlanetCelebrated,
  markPlanetNotified,
  PLANET_KEYS,
  syncPlanetProgress,
} from "../services/planet-service.js";
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
const planetParams = z.object({ planet: z.enum(PLANET_KEYS) });

export async function registerChildProgressRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/child/wishes", async (request, reply) => {
    const startedAt = performance.now();
    const { child } = await requireChild(request, reply, config);
    const authenticatedAt = performance.now();
    const result = await listChildWishes(child.id, config);
    const completedAt = performance.now();
    if (completedAt - startedAt >= 200) {
      request.log.warn(
        {
          event: "slow_child_read_detail",
          requestId: request.id,
          operation: "load_wishes",
          childId: child.id,
          totalMs: Math.round(completedAt - startedAt),
          authMs: Math.round(authenticatedAt - startedAt),
          queryMs: Math.round(completedAt - authenticatedAt),
        },
        "slow child wishes read",
      );
    }
    return result;
  });

  app.post("/api/child/wishes/:id/redeem", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { idempotencyKey } = redemptionSchema.parse(request.body);
    return redeemWish(child.id, id, idempotencyKey, config);
  });

  app.get("/api/child/footprints", async (request, reply) => {
    const startedAt = performance.now();
    const { child } = await requireChild(request, reply, config);
    const authenticatedAt = performance.now();
    const { date } = footprintQuery.parse(request.query);
    const result = await getFootprints(child.id, config, date);
    const completedAt = performance.now();
    if (completedAt - startedAt >= 200) {
      request.log.warn(
        {
          event: "slow_child_read_detail",
          requestId: request.id,
          operation: "load_footprints",
          childId: child.id,
          totalMs: Math.round(completedAt - startedAt),
          authMs: Math.round(authenticatedAt - startedAt),
          queryMs: Math.round(completedAt - authenticatedAt),
        },
        "slow child footprints read",
      );
    }
    return result;
  });

  app.get("/api/child/planets", async (request, reply) => {
    const startedAt = performance.now();
    const { child } = await requireChild(request, reply, config);
    const authenticatedAt = performance.now();
    const result = await syncPlanetProgress(child.id);
    const completedAt = performance.now();
    if (completedAt - startedAt >= 200) {
      request.log.warn(
        {
          event: "slow_child_read_detail",
          requestId: request.id,
          operation: "load_planets",
          childId: child.id,
          totalMs: Math.round(completedAt - startedAt),
          authMs: Math.round(authenticatedAt - startedAt),
          queryMs: Math.round(completedAt - authenticatedAt),
        },
        "slow child planets read",
      );
    }
    return result;
  });

  app.post("/api/child/planets/:planet/celebrated", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { planet } = planetParams.parse(request.params);
    return markPlanetCelebrated(child.id, planet);
  });

  app.post("/api/child/planets/:planet/notified", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { planet } = planetParams.parse(request.params);
    return markPlanetNotified(child.id, planet);
  });
}
