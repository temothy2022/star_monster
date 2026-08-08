import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireParent } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  getPetGrowthState,
  listPetDestinations,
  updatePetConfig,
} from "../services/pet-growth-service.js";

const idParams = z.object({ id: z.string().min(1) });
const destinationSchema = z.object({
  slug: z.string().trim().min(2).max(100),
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
  tier: z.enum(["NEARBY", "CHINA", "WORLD"]),
  introduction: z.string().trim().min(10).max(500),
  funFact: z.string().trim().min(5).max(300),
  imageUrl: z.string().trim().min(1).max(2048),
  audioUrl: z.string().trim().max(2048).nullable().optional(),
  weight: z.number().int().min(1).max(10000).default(100),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  isEnabled: z.boolean().default(true),
});
const destinationPatchSchema = destinationSchema.partial();
const configSchema = z.object({
  feedCostStars: z.number().int().min(0).max(100),
  feedRestore: z.number().int().min(1).max(100),
  feedExperience: z.number().int().min(0).max(1000),
  drinkCostStars: z.number().int().min(0).max(100),
  drinkRestore: z.number().int().min(1).max(100),
  drinkExperience: z.number().int().min(0).max(1000),
  satietyDecayMinutes: z.number().int().min(10).max(10080),
  hydrationDecayMinutes: z.number().int().min(10).max(10080),
  nearbyCostStars: z.number().int().min(0).max(1000),
  nearbyDurationMinutes: z.number().int().min(1).max(43200),
  nearbyExperience: z.number().int().min(0).max(10000),
  chinaCostStars: z.number().int().min(0).max(1000),
  chinaDurationMinutes: z.number().int().min(1).max(43200),
  chinaExperience: z.number().int().min(0).max(10000),
  worldCostStars: z.number().int().min(0).max(1000),
  worldDurationMinutes: z.number().int().min(1).max(43200),
  worldExperience: z.number().int().min(0).max(10000),
});
const parentSettingsSchema = z.object({
  travelEnabled: z.boolean(),
  dailySpendLimitStars: z.number().int().min(0).max(10000).nullable(),
});
const parentRoomThemePatchSchema = z.object({
  priceStars: z.number().int().min(0).max(10000),
});

async function ownedChild(user: { familyId: string | null }, childId: string) {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, familyId: user.familyId ?? "__none__" },
    select: { id: true, familyId: true },
  });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到这个孩子");
  return child;
}

export async function registerPetManagementRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/admin/pet-growth", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return listPetDestinations();
  });

  app.put("/api/admin/pet-growth/config", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = configSchema.parse(request.body);
    const updated = await updatePetConfig(input);
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      action: "PET_GROWTH_CONFIG_UPDATE",
      resourceType: "PetGrowthConfig",
      resourceId: updated.id,
      ipAddress: request.ip,
    });
    return { config: updated };
  });

  app.post("/api/admin/pet-growth/destinations", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = destinationSchema.parse(request.body);
    const destination = await prisma.petTravelDestination.create({ data: input });
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      action: "PET_DESTINATION_CREATE",
      resourceType: "PetTravelDestination",
      resourceId: destination.id,
      ipAddress: request.ip,
    });
    return reply.status(201).send({ destination });
  });

  app.patch("/api/admin/pet-growth/destinations/:id", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = destinationPatchSchema.parse(request.body);
    const destination = await prisma.petTravelDestination.update({ where: { id }, data: input });
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      action: "PET_DESTINATION_UPDATE",
      resourceType: "PetTravelDestination",
      resourceId: destination.id,
      ipAddress: request.ip,
    });
    return { destination };
  });

  app.get("/api/parent/children/:id/pet-growth", async (request, reply) => {
    const { user } = await requireParent(request, reply, config);
    const { id } = idParams.parse(request.params);
    await ownedChild(user, id);
    return getPetGrowthState(id, config);
  });

  app.patch("/api/parent/children/:id/pet-growth/settings", async (request, reply) => {
    const { user } = await requireParent(request, reply, config);
    const { id } = idParams.parse(request.params);
    const child = await ownedChild(user, id);
    const input = parentSettingsSchema.parse(request.body);
    const profile = await prisma.petGrowthProfile.upsert({
      where: { childId: id },
      update: input,
      create: { childId: id, ...input },
    });
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      familyId: child.familyId,
      action: "PET_GROWTH_SETTINGS_UPDATE",
      resourceType: "PetGrowthProfile",
      resourceId: profile.id,
      ipAddress: request.ip,
    });
    return { settings: { travelEnabled: profile.travelEnabled, dailySpendLimitStars: profile.dailySpendLimitStars } };
  });

  app.patch("/api/parent/pet-growth/themes/:key", async (request, reply) => {
    const { user } = await requireParent(request, reply, config);
    const { key } = z.object({ key: z.string().trim().min(1).max(64) }).parse(request.params);
    const input = parentRoomThemePatchSchema.parse(request.body);
    const theme = await prisma.petRoomTheme.findUnique({ where: { key } });
    if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "没有找到这个小屋背景");
    if (!user.familyId) throw new HttpError(403, "PARENT_FAMILY_REQUIRED", "当前账号没有绑定家庭");
    const updated = await prisma.familyPetRoomThemeSetting.upsert({
      where: { familyId_themeId: { familyId: user.familyId, themeId: theme.id } },
      update: input,
      create: { familyId: user.familyId, themeId: theme.id, ...input },
    });
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      familyId: user.familyId ?? undefined,
      action: "PET_ROOM_THEME_UPDATE",
      resourceType: "PetRoomTheme",
      resourceId: theme.id,
      metadata: { priceStars: updated.priceStars },
      ipAddress: request.ip,
    });
    return { theme: updated };
  });
}
