import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
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
      const data = await readFile(filePath);
      return reply
        .header("Content-Type", contentTypeForPoemMedia(fileName))
        .header("Cache-Control", "public, max-age=2592000, immutable")
        .send(data);
    },
  );
}
