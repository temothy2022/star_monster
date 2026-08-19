import { unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireChild } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  childAvatarFileName,
  CHILD_AVATAR_BODY_LIMIT,
  storeChildAvatar,
} from "../services/child-avatar-service.js";

const onboardingSchema = z.object({
  petType: z
    .enum(["DOUYA", "PAOPAO", "TUANTUAN", "MILU", "SHANSHAN"])
    .optional(),
  nickname: z.string().trim().min(2).max(9).optional(),
  complete: z.boolean().optional(),
});

const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(9),
});

export async function registerChildProfileRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.patch("/api/child/profile", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = profileSchema.parse(request.body);
    const updated = await prisma.$transaction(async (tx) => {
      const profile = await tx.childProfile.update({
        where: { id: child.id },
        data: { nickname: input.nickname },
      });
      await writeAudit(tx, {
        actorType: "CHILD",
        actorId: child.id,
        familyId: child.familyId,
        action: "CHILD_PROFILE_UPDATED",
        resourceType: "ChildProfile",
        resourceId: child.id,
        metadata: { nickname: input.nickname },
        ipAddress: request.ip,
      });
      return profile;
    });
    return {
      child: {
        id: updated.id,
        nickname: updated.nickname,
        avatarUrl: updated.avatarUrl,
        petType: updated.petType,
      },
    };
  });

  app.put(
    "/api/child/profile/avatar",
    { bodyLimit: CHILD_AVATAR_BODY_LIMIT },
    async (request, reply) => {
      const { child } = await requireChild(request, reply, config);
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(400, "CHILD_AVATAR_INVALID_BODY", "请选择头像图片");
      }
      const stored = await storeChildAvatar({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        childId: child.id,
        data: request.body,
      });
      try {
        const updated = await prisma.$transaction(async (tx) => {
          const profile = await tx.childProfile.update({
            where: { id: child.id },
            data: { avatarUrl: stored.publicUrl },
          });
          await writeAudit(tx, {
            actorType: "CHILD",
            actorId: child.id,
            familyId: child.familyId,
            action: "CHILD_AVATAR_REPLACED",
            resourceType: "ChildProfile",
            resourceId: child.id,
            metadata: { fileName: stored.fileName },
            ipAddress: request.ip,
          });
          return profile;
        });
        const previousFileName = childAvatarFileName(child.avatarUrl);
        if (previousFileName && previousFileName !== stored.fileName) {
          await unlink(path.join(config.POEM_ASSET_UPLOAD_DIR, previousFileName)).catch(() => undefined);
        }
        return {
          child: {
            id: updated.id,
            nickname: updated.nickname,
            avatarUrl: updated.avatarUrl,
            petType: updated.petType,
          },
        };
      } catch (error) {
        if (stored.created) await unlink(stored.filePath).catch(() => undefined);
        throw error;
      }
    },
  );

  app.patch("/api/child/onboarding", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = onboardingSchema.parse(request.body);
    const petType = input.petType ?? child.petType;
    const nickname = input.nickname ?? child.nickname;

    if (input.complete && (!petType || !nickname)) {
      throw new HttpError(
        400,
        "ONBOARDING_INCOMPLETE",
        "需要先选择星宠并填写昵称",
      );
    }

    const updated = await prisma.childProfile.update({
      where: { id: child.id },
      data: {
        ...(input.petType ? { petType: input.petType } : {}),
        ...(input.nickname ? { nickname: input.nickname } : {}),
        ...(input.complete ? { onboardingCompletedAt: new Date() } : {}),
      },
    });

    return {
      child: {
        id: updated.id,
        nickname: updated.nickname,
        petType: updated.petType,
        onboardingCompletedAt: updated.onboardingCompletedAt,
      },
    };
  });
}
