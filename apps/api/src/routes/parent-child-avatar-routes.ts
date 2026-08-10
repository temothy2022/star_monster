import { unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireParent } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  childAvatarFileName,
  CHILD_AVATAR_BODY_LIMIT,
  storeChildAvatar,
} from "../services/child-avatar-service.js";

const paramsSchema = z.object({ id: z.string().min(1) });

export async function registerParentChildAvatarRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.put(
    "/api/parent/children/:id/avatar",
    { bodyLimit: CHILD_AVATAR_BODY_LIMIT },
    async (request, reply) => {
      const { user } = await requireParent(request, reply, config);
      const { id } = paramsSchema.parse(request.params);
      const child = await prisma.childProfile.findFirst({
        where: { id, familyId: user.familyId ?? "__none__" },
        select: { id: true, familyId: true, avatarUrl: true },
      });
      if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "孩子档案不存在");
      if (!Buffer.isBuffer(request.body)) {
        throw new HttpError(400, "CHILD_AVATAR_INVALID_BODY", "请选择孩子头像");
      }

      const stored = await storeChildAvatar({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        childId: id,
        data: request.body,
      });
      try {
        const updated = await prisma.$transaction(async (tx) => {
          const profile = await tx.childProfile.update({
            where: { id },
            data: { avatarUrl: stored.publicUrl },
            select: { id: true, avatarUrl: true },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            familyId: child.familyId,
            action: "CHILD_AVATAR_REPLACED",
            resourceType: "ChildProfile",
            resourceId: id,
            metadata: { fileName: stored.fileName },
            ipAddress: request.ip,
          });
          return profile;
        });
        const previousFileName = childAvatarFileName(child.avatarUrl);
        if (previousFileName && previousFileName !== stored.fileName) {
          await unlink(path.join(config.POEM_ASSET_UPLOAD_DIR, previousFileName)).catch(() => undefined);
        }
        return { child: updated };
      } catch (error) {
        if (stored.created) await unlink(stored.filePath).catch(() => undefined);
        throw error;
      }
    },
  );
}
