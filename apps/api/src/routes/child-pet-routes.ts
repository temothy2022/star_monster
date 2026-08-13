import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireChild } from "../services/auth-service.js";
import {
  careForPet,
  cleanPetWaste,
  getPetGrowthState,
  getPetNotificationSummary,
  getPetPostcards,
  openPetRedPacket,
  purchasePetRoomTheme,
  revealPetTrip,
  selectPetRoomTheme,
  startPetTrip,
} from "../services/pet-growth-service.js";
import {
  getChallengeConversation,
  listChallengeContacts,
  sendChallengeReply,
  startChallengeConversation,
} from "../services/challenge-conversation-service.js";

const actionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
});
const travelSchema = actionSchema.extend({
  tier: z.enum(["NEARBY", "CHINA", "WORLD"]),
});
const tripParams = z.object({ id: z.string().min(1) });
const wasteParams = z.object({ id: z.string().min(1) });
const roomThemeParams = z.object({ key: z.string().trim().min(1).max(64) });
const challengeReplySchema = z.object({
  competitorId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(60),
});
const challengeStartSchema = z.object({
  competitorId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(32),
  avatarKey: z.string().trim().min(1).max(64),
});
const challengeConversationQuery = z.object({ competitorId: z.string().trim().min(1).optional() });

export async function registerChildPetRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/child/pet", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return getPetGrowthState(child.id, config);
  });

  app.get("/api/child/pet/notifications", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return getPetNotificationSummary(child.id, config);
  });

  app.get("/api/child/challenge-conversation", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { competitorId } = challengeConversationQuery.parse(request.query);
    return getChallengeConversation(child.id, config, new Date(), competitorId);
  });

  app.get("/api/child/challenge-conversation/contacts", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return listChallengeContacts(child.id, config);
  });

  app.post("/api/child/challenge-conversation/start", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = challengeStartSchema.parse(request.body);
    return startChallengeConversation(child.id, input, config);
  });

  app.post("/api/child/challenge-conversation/replies", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { competitorId, text } = challengeReplySchema.parse(request.body);
    return sendChallengeReply(child.id, competitorId, text, config);
  });

  app.get("/api/child/pet/postcards", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return getPetPostcards(child.id, config);
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

  app.post("/api/child/pet/waste/:id/clean", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { id } = wasteParams.parse(request.params);
    const { idempotencyKey } = actionSchema.parse(request.body);
    return cleanPetWaste({ childId: child.id, wasteId: id, idempotencyKey, appConfig: config });
  });

  app.post("/api/child/pet/red-packets/open", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { idempotencyKey } = actionSchema.parse(request.body);
    return openPetRedPacket({ childId: child.id, idempotencyKey, appConfig: config });
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

  app.post("/api/child/pet/room-themes/:key/purchase", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { key } = roomThemeParams.parse(request.params);
    const { idempotencyKey } = actionSchema.parse(request.body);
    return purchasePetRoomTheme({ childId: child.id, themeKey: key, idempotencyKey, appConfig: config });
  });

  app.post("/api/child/pet/room-themes/:key/select", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { key } = roomThemeParams.parse(request.params);
    return selectPetRoomTheme({ childId: child.id, themeKey: key, appConfig: config });
  });
}
