import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import {
  contentTypeForHanziMedia,
  resolveHanziMediaFile,
} from "../services/hanzi-media-service.js";

const mediaParams = z.object({
  fileName: z.string().min(1).max(240),
});

export async function registerHanziMediaRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.get(
    "/hanzi-assets/v1/uploads/:fileName",
    async (request, reply) => {
      const { fileName } = mediaParams.parse(request.params);
      const filePath = resolveHanziMediaFile(
        config.HANZI_ASSET_UPLOAD_DIR,
        fileName,
      );
      await access(filePath).catch(() => {
        throw new HttpError(
          404,
          "HANZI_MEDIA_NOT_FOUND",
          "没有找到这个媒体文件",
        );
      });
      reply
        .type(contentTypeForHanziMedia(fileName))
        .header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(createReadStream(filePath));
    },
  );
}
