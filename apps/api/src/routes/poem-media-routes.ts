import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import {
  contentTypeForPoemMedia,
  resolvePoemMediaFile,
} from "../services/poem-media-service.js";

const mediaParams = z.object({
  fileName: z.string().min(1).max(255),
});

export async function registerPoemMediaRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.get(
    "/poem-assets/v1/uploads/:fileName",
    async (request, reply) => {
      const { fileName } = mediaParams.parse(request.params);
      const filePath = resolvePoemMediaFile(
        config.POEM_ASSET_UPLOAD_DIR,
        fileName,
      );
      await access(filePath).catch(() => {
        throw new HttpError(
          404,
          "POEM_MEDIA_NOT_FOUND",
          "没有找到这个媒体文件",
        );
      });
      return reply
        .type(contentTypeForPoemMedia(fileName))
        .header("Cache-Control", "public, max-age=2592000, immutable")
        .send(createReadStream(filePath));
    },
  );
}
