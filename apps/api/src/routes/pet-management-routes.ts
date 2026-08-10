import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
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
import {
  PET_ROOM_THEME_IMAGE_BODY_LIMIT,
  storePetRoomThemeImages,
} from "../services/pet-room-theme-image-service.js";
import {
  PET_ROOM_THEME_ANIMATION_BODY_LIMIT,
  storePetRoomThemeAnimation,
} from "../services/pet-room-theme-animation-service.js";

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
  satiety: z.number().int().min(0).max(100).optional(),
  hydration: z.number().int().min(0).max(100).optional(),
  redPacketsPerLevel: z.number().int().min(0).max(10).optional(),
  redPacketMinStars: z.number().int().min(1).max(100).optional(),
  redPacketMaxStars: z.number().int().min(1).max(100).optional(),
}).refine((value) => {
  const values = [value.redPacketsPerLevel, value.redPacketMinStars, value.redPacketMaxStars];
  return values.every((item) => item === undefined) || values.every((item) => item !== undefined);
}, {
  message: "请完整填写红包数量和奖励范围",
  path: ["redPacketsPerLevel"],
}).refine((value) => (
  value.redPacketMaxStars === undefined
  || value.redPacketMinStars === undefined
  || value.redPacketMaxStars >= value.redPacketMinStars
), {
  message: "红包最高星星不能少于最低星星",
  path: ["redPacketMaxStars"],
});
const parentRoomThemePatchSchema = z.object({
  themes: z.array(z.object({
    key: z.string().trim().min(1).max(64),
    priceStars: z.number().int().min(0).max(10000),
  })).min(1).max(50),
});
const roomThemeCreateQuerySchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().min(2).max(160),
  priceStars: z.coerce.number().int().min(0).max(10000),
  mascotMotion: z.enum([
    "IDLE",
    "CLOUD_FLOAT",
    "UNDERWATER_SWIM",
    "PETAL_SWAY",
    "STARGAZE",
    "ZERO_GRAVITY",
    "SPORT_BOUNCE",
    "ADVENTURE_MARCH",
  ]).default("IDLE"),
});
const roomThemeMotionSchema = z.object({
  mascotMotion: roomThemeCreateQuerySchema.shape.mascotMotion,
});
const roomThemeAnimationParams = z.object({
  id: z.string().min(1),
  petType: z.enum(["DOUYA", "PAOPAO", "TUANTUAN", "MILU", "SHANSHAN"]),
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
    const [growth, roomThemes] = await Promise.all([
      listPetDestinations(),
      prisma.petRoomTheme.findMany({
        where: { ownerFamilyId: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { mascotAnimations: { orderBy: { petType: "asc" } } },
      }),
    ]);
    return { ...growth, roomThemes };
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

  app.post(
    "/api/admin/pet-growth/themes",
    { bodyLimit: PET_ROOM_THEME_IMAGE_BODY_LIMIT },
    async (request, reply) => {
      const { user } = await requireAdmin(request, reply, config);
      const input = roomThemeCreateQuerySchema.parse(request.query);
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(400, "PET_ROOM_THEME_IMAGE_INVALID_BODY", "请选择要上传的小屋背景图片");
      }

      const themeKey = `platform-${randomUUID()}`;
      const stored = await storePetRoomThemeImages({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        themeKey,
        contentType: request.headers["content-type"] ?? "",
        data: request.body,
      });
      try {
        const theme = await prisma.$transaction(async (tx) => {
          const highest = await tx.petRoomTheme.aggregate({ _max: { sortOrder: true } });
          const created = await tx.petRoomTheme.create({
            data: {
              id: `pet-room-theme-${randomUUID()}`,
              key: themeKey,
              ownerFamilyId: null,
              name: input.name,
              description: input.description,
              priceStars: input.priceStars,
              backgroundLandscapeUrl: stored.urls.landscape,
              backgroundTabletUrl: stored.urls.tablet,
              backgroundPhoneUrl: stored.urls.phone,
              previewUrl: stored.urls.preview,
              ambience: [],
              mascotMotion: input.mascotMotion,
              sortOrder: (highest._max.sortOrder ?? 0) + 10,
            },
            include: { mascotAnimations: true },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            action: "PET_ROOM_THEME_CREATED",
            resourceType: "PetRoomTheme",
            resourceId: created.id,
            metadata: {
              scope: "PLATFORM",
              key: created.key,
              name: created.name,
              source: stored.source,
              outputBytes: stored.outputBytes,
              files: Object.fromEntries(Object.entries(stored.files).map(([key, file]) => [key, file.fileName])),
            },
            ipAddress: request.ip,
          });
          return created;
        });
        reply.status(201);
        return {
          theme,
          processing: {
            source: stored.source,
            outputBytes: stored.outputBytes,
            format: "webp" as const,
          },
        };
      } catch (error) {
        await Promise.all(stored.createdPaths.map((filePath) => unlink(filePath).catch(() => undefined)));
        throw error;
      }
    },
  );

  app.patch("/api/admin/pet-growth/themes/:id/motion", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = roomThemeMotionSchema.parse(request.body);
    const existing = await prisma.petRoomTheme.findFirst({
      where: { id, ownerFamilyId: null },
      select: { id: true },
    });
    if (!existing) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "没有找到这个平台小屋背景");

    const theme = await prisma.$transaction(async (tx) => {
      const updated = await tx.petRoomTheme.update({
        where: { id },
        data: { mascotMotion: input.mascotMotion },
        include: { mascotAnimations: { orderBy: { petType: "asc" } } },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "PET_ROOM_THEME_MOTION_UPDATE",
        resourceType: "PetRoomTheme",
        resourceId: id,
        metadata: { mascotMotion: input.mascotMotion },
        ipAddress: request.ip,
      });
      return updated;
    });
    return { theme };
  });

  app.put(
    "/api/admin/pet-growth/themes/:id/mascot-animations/:petType",
    { bodyLimit: PET_ROOM_THEME_ANIMATION_BODY_LIMIT },
    async (request, reply) => {
      const { user } = await requireAdmin(request, reply, config);
      const { id, petType } = roomThemeAnimationParams.parse(request.params);
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_INVALID_BODY", "请选择要上传的星宠动画");
      }
      const theme = await prisma.petRoomTheme.findFirst({
        where: { id, ownerFamilyId: null },
        select: { id: true, key: true, name: true },
      });
      if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", "没有找到这个平台小屋背景");

      const stored = await storePetRoomThemeAnimation({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        themeKey: theme.key,
        petType,
        contentType: request.headers["content-type"] ?? "",
        data: request.body,
      });
      try {
        const result = await prisma.$transaction(async (tx) => {
          const previous = await tx.petRoomThemeMascotAnimation.findUnique({
            where: { themeId_petType: { themeId: id, petType } },
            select: { fileName: true },
          });
          const animation = await tx.petRoomThemeMascotAnimation.upsert({
            where: { themeId_petType: { themeId: id, petType } },
            update: {
              mediaUrl: stored.publicUrl,
              contentType: stored.contentType,
              fileName: stored.fileName,
              sourceWidth: stored.source.width,
              sourceHeight: stored.source.height,
              frameCount: stored.source.frameCount,
              outputBytes: stored.outputBytes,
              updatedByUserId: user.id,
            },
            create: {
              themeId: id,
              petType,
              mediaUrl: stored.publicUrl,
              contentType: stored.contentType,
              fileName: stored.fileName,
              sourceWidth: stored.source.width,
              sourceHeight: stored.source.height,
              frameCount: stored.source.frameCount,
              outputBytes: stored.outputBytes,
              updatedByUserId: user.id,
            },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            action: "PET_ROOM_THEME_MASCOT_ANIMATION_UPDATE",
            resourceType: "PetRoomTheme",
            resourceId: id,
            metadata: {
              themeKey: theme.key,
              petType,
              fileName: stored.fileName,
              frameCount: stored.source.frameCount,
              outputBytes: stored.outputBytes,
            },
            ipAddress: request.ip,
          });
          return { animation, previousFileName: previous?.fileName ?? null };
        });
        if (result.previousFileName && result.previousFileName !== stored.fileName) {
          await unlink(path.join(config.POEM_ASSET_UPLOAD_DIR, path.basename(result.previousFileName))).catch(() => undefined);
        }
        return {
          animation: result.animation,
          processing: {
            source: stored.source,
            outputBytes: stored.outputBytes,
            contentType: stored.contentType,
            processed: stored.processed,
          },
        };
      } catch (error) {
        if (stored.created) await unlink(stored.filePath).catch(() => undefined);
        throw error;
      }
    },
  );

  app.delete("/api/admin/pet-growth/themes/:id/mascot-animations/:petType", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id, petType } = roomThemeAnimationParams.parse(request.params);
    const existing = await prisma.petRoomThemeMascotAnimation.findFirst({
      where: { themeId: id, petType, theme: { ownerFamilyId: null } },
    });
    if (!existing) throw new HttpError(404, "PET_ROOM_THEME_ANIMATION_NOT_FOUND", "这个小屋还没有上传该星宠动画");
    await prisma.$transaction(async (tx) => {
      await tx.petRoomThemeMascotAnimation.delete({ where: { id: existing.id } });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "PET_ROOM_THEME_MASCOT_ANIMATION_DELETE",
        resourceType: "PetRoomTheme",
        resourceId: id,
        metadata: { petType, fileName: existing.fileName },
        ipAddress: request.ip,
      });
    });
    await unlink(path.join(config.POEM_ASSET_UPLOAD_DIR, path.basename(existing.fileName))).catch(() => undefined);
    return { ok: true };
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
    const { satiety, hydration, ...profileInput } = input;
    const profile = await prisma.petGrowthProfile.upsert({
      where: { childId: id },
      update: {
        ...profileInput,
        ...(satiety === undefined ? {} : { satiety, satietySettledAt: new Date() }),
        ...(hydration === undefined ? {} : { hydration, hydrationSettledAt: new Date() }),
      },
      create: { childId: id, ...profileInput, ...(satiety === undefined ? {} : { satiety }), ...(hydration === undefined ? {} : { hydration }) },
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
    return {
      settings: {
        travelEnabled: profile.travelEnabled,
        dailySpendLimitStars: profile.dailySpendLimitStars,
        redPacketsPerLevel: profile.redPacketsPerLevel,
        redPacketMinStars: profile.redPacketMinStars,
        redPacketMaxStars: profile.redPacketMaxStars,
      },
    };
  });

  app.patch("/api/parent/pet-growth/themes", async (request, reply) => {
    const { user } = await requireParent(request, reply, config);
    const { themes } = parentRoomThemePatchSchema.parse(request.body);
    if (!user.familyId) throw new HttpError(403, "PARENT_FAMILY_REQUIRED", "当前账号没有绑定家庭");
    const familyId = user.familyId;
    const updated = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of themes) {
        const theme = await tx.petRoomTheme.findFirst({
          where: {
            key: item.key,
            ownerFamilyId: null,
          },
        });
        if (!theme) throw new HttpError(404, "PET_ROOM_THEME_NOT_FOUND", `没有找到小屋背景：${item.key}`);
        results.push(await tx.familyPetRoomThemeSetting.upsert({
          where: { familyId_themeId: { familyId, themeId: theme.id } },
          update: { priceStars: item.priceStars },
          create: { familyId, themeId: theme.id, priceStars: item.priceStars },
        }));
      }
      return results;
    });
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      familyId: user.familyId ?? undefined,
      action: "PET_ROOM_THEME_UPDATE",
      resourceType: "PetRoomTheme",
      resourceId: familyId,
      metadata: { themes: updated.map((theme) => ({ themeId: theme.themeId, priceStars: theme.priceStars })) },
      ipAddress: request.ip,
    });
    return { themes: updated };
  });

}
