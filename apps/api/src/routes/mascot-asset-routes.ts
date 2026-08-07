import { unlink } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  MASCOT_ASSET_BODY_LIMIT,
  storeMascotAsset,
} from "../services/mascot-asset-service.js";

const mascotAssetParams = z.object({
  petType: z.enum(["DOUYA", "PAOPAO", "TUANTUAN", "MILU", "SHANSHAN"]),
  slot: z.enum([
    "TASK_IDLE",
    "NEUTRAL",
    "FOCUS",
    "CELEBRATE",
    "HUNGRY",
    "EATING",
    "DRINKING",
    "TRAVEL",
    "SLEEPING",
  ]),
});

export async function registerMascotAssetRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.get("/api/admin/mascot-assets", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return {
      assets: await prisma.mascotAsset.findMany({
        orderBy: [{ petType: "asc" }, { slot: "asc" }],
      }),
    };
  });

  app.put(
    "/api/admin/mascot-assets/:petType/:slot",
    { bodyLimit: MASCOT_ASSET_BODY_LIMIT },
    async (request, reply) => {
      const { user } = await requireAdmin(request, reply, config);
      const { petType, slot } = mascotAssetParams.parse(request.params);
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(400, "MASCOT_ASSET_INVALID_BODY", "请选择要上传的星宠图片");
      }

      const stored = await storeMascotAsset({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        petType,
        slot,
        contentType: request.headers["content-type"] ?? "",
        data: request.body,
      });

      try {
        const asset = await prisma.$transaction(async (tx) => {
          const updated = await tx.mascotAsset.upsert({
            where: { petType_slot: { petType, slot } },
            update: {
              mediaUrl: stored.publicUrl,
              contentType: stored.contentType,
              fileName: stored.fileName,
              updatedByUserId: user.id,
            },
            create: {
              petType,
              slot,
              mediaUrl: stored.publicUrl,
              contentType: stored.contentType,
              fileName: stored.fileName,
              updatedByUserId: user.id,
            },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            action: "MASCOT_ASSET_REPLACED",
            resourceType: "MascotAsset",
            resourceId: updated.id,
            metadata: { petType, slot, fileName: stored.fileName },
            ipAddress: request.ip,
          });
          return updated;
        });
        return { asset };
      } catch (error) {
        if (stored.created) await unlink(stored.filePath).catch(() => undefined);
        throw error;
      }
    },
  );
}
