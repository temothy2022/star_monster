import { Prisma } from "@prisma/client";
import { unlink } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { decryptSecret, encryptSecret } from "../lib/secret-encryption.js";
import { writeAudit } from "../services/audit-service.js";
import { requireAdmin } from "../services/auth-service.js";
import {
  generateMiniMaxImage,
  generateMiniMaxSpeech,
  hanziImagePrompts,
  poemImagePrompts,
  poemSpeechText,
} from "../services/minimax-media-generation-service.js";
import { storeHanziMedia } from "../services/hanzi-media-service.js";
import { storeGeneratedPoemMedia } from "../services/poem-media-service.js";

const minimaxConfigSchema = z.object({
  apiKey: z.string().trim().min(10).max(512).optional(),
  enabled: z.boolean().default(true),
});
const hanziGenerateParams = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "image",
    "character-audio",
    "sentence-audio",
    "word-audio",
  ]),
});
const hanziGenerateQuery = z.object({
  wordIndex: z.coerce.number().int().min(0).max(9).optional(),
});
const poemGenerateParams = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "audio"]),
});
const mascotDialogueParams = z.object({ id: z.string().min(1) });
const mascotDialoguePatchSchema = z.object({
  text: z.string().trim().min(2).max(40).optional(),
  context: z.enum([
    "START", "PROGRESS", "COMPLETE", "EMPTY", "GENERAL",
    "PET_NEEDS_CARE", "PET_HUNGRY", "PET_THIRSTY",
    "PET_TASK_START", "PET_TASK_PROGRESS", "PET_TASK_COMPLETE",
    "PET_RELAX", "PET_GENERAL",
  ]).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
}).refine((input) => Object.keys(input).length > 0, {
  message: "至少提交一项修改",
});
const generationLocks = new Set<string>();

async function adminUser(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
) {
  return requireAdmin(request, reply, config);
}

async function minimaxCredentials(config: AppConfig) {
  const stored = await prisma.systemMinimaxConfig.findUnique({
    where: { id: "default" },
  });
  if (!stored || !stored.enabled) {
    throw new HttpError(
      409,
      "MINIMAX_NOT_CONFIGURED",
      "请先在超级后台保存并启用 MiniMax 密钥",
    );
  }
  return {
    apiKey: decryptSecret(
      {
        ciphertext: stored.encryptedApiKey,
        iv: stored.encryptionIv,
        tag: stored.encryptionTag,
      },
      config.AI_CONFIG_ENCRYPTION_KEY,
    ),
  };
}

function enforceMiniMaxLimit(
  userId: string,
  action: string,
  limit = 30,
) {
  enforceRateLimit({
    key: `minimax:system:${userId}:${action}`,
    limit,
    windowMs: 60 * 60 * 1000,
    code: "MINIMAX_RATE_LIMITED",
    message: "自动生成次数较多，请稍后再试",
  });
}

async function withGenerationLock<T>(key: string, work: () => Promise<T>) {
  if (generationLocks.has(key)) {
    throw new HttpError(
      409,
      "MINIMAX_GENERATION_IN_PROGRESS",
      "这个资源正在生成，请等待完成",
    );
  }
  generationLocks.add(key);
  try {
    return await work();
  } finally {
    generationLocks.delete(key);
  }
}

export async function registerAdminMinimaxRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.get("/api/admin/mascot-dialogues", async (request, reply) => {
    await adminUser(request, reply, config);
    return {
      dialogues: await prisma.mascotDialogue.findMany({
        orderBy: [{ context: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    };
  });

  app.patch("/api/admin/mascot-dialogues/:id", async (request, reply) => {
    const { id } = mascotDialogueParams.parse(request.params);
    const { user } = await adminUser(request, reply, config);
    const input = mascotDialoguePatchSchema.parse(request.body);
    const existing = await prisma.mascotDialogue.findUnique({ where: { id } });
    if (!existing) {
      throw new HttpError(404, "MASCOT_DIALOGUE_NOT_FOUND", "没有找到这条星宠对话");
    }
    const dialogue = await prisma.$transaction(async (tx) => {
      const updated = await tx.mascotDialogue.update({
        where: { id },
        data: {
          ...input,
          ...(input.text !== undefined && input.text !== existing.text
            ? { audioUrl: null }
            : {}),
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "MASCOT_DIALOGUE_UPDATE",
        resourceType: "MascotDialogue",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { dialogue };
  });

  app.post("/api/admin/mascot-dialogues/:id/generate-audio", async (request, reply) => {
    const { id } = mascotDialogueParams.parse(request.params);
    const { user } = await adminUser(request, reply, config);
    const existing = await prisma.mascotDialogue.findUnique({ where: { id } });
    if (!existing) {
      throw new HttpError(404, "MASCOT_DIALOGUE_NOT_FOUND", "没有找到这条星宠对话");
    }
    enforceMiniMaxLimit(user.id, "mascot-dialogue", 60);
    const credentials = await minimaxCredentials(config);
    return withGenerationLock(`mascot-dialogue:${id}`, async () => {
      const generated = await generateMiniMaxSpeech({
        ...credentials,
        text: existing.text,
        config,
      });
      const stored = await storeGeneratedPoemMedia({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        poemId: `mascot-${existing.key}`,
        kind: "audio",
        data: generated,
      });
      try {
        const dialogue = await prisma.$transaction(async (tx) => {
          const updated = await tx.mascotDialogue.update({
            where: { id },
            data: { audioUrl: stored.publicUrl },
          });
          await writeAudit(tx, {
            actorType: "USER",
            actorId: user.id,
            action: "MASCOT_DIALOGUE_AUDIO_GENERATED",
            resourceType: "MascotDialogue",
            resourceId: id,
            metadata: {
              key: existing.key,
              fileName: stored.fileName,
              provider: "MINIMAX",
            },
            ipAddress: request.ip,
          });
          return updated;
        });
        return { dialogue };
      } catch (error) {
        if (stored.created) await unlink(stored.filePath).catch(() => undefined);
        throw error;
      }
    });
  });

  app.get("/api/admin/minimax/config", async (request, reply) => {
    await adminUser(request, reply, config);
    const stored = await prisma.systemMinimaxConfig.findUnique({
      where: { id: "default" },
      select: {
        provider: true,
        apiKeyLastFour: true,
        enabled: true,
        updatedAt: true,
      },
    });
    return {
      config: stored
        ? { ...stored, configured: true }
        : {
            provider: "MINIMAX",
            apiKeyLastFour: null,
            enabled: false,
            updatedAt: null,
            configured: false,
          },
    };
  });

  app.put("/api/admin/minimax/config", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const input = minimaxConfigSchema.parse(request.body);
    const existing = await prisma.systemMinimaxConfig.findUnique({
      where: { id: "default" },
    });
    if (!existing && !input.apiKey) {
      throw new HttpError(
        400,
        "MINIMAX_KEY_REQUIRED",
        "首次配置必须填写 MiniMax 密钥",
      );
    }
    const encrypted = input.apiKey
      ? encryptSecret(input.apiKey, config.AI_CONFIG_ENCRYPTION_KEY)
      : null;
    const stored = await prisma.$transaction(async (tx) => {
      const saved = await tx.systemMinimaxConfig.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          enabled: input.enabled,
          encryptedApiKey: encrypted!.ciphertext,
          encryptionIv: encrypted!.iv,
          encryptionTag: encrypted!.tag,
          apiKeyLastFour: input.apiKey!.slice(-4),
          updatedByUserId: user.id,
        },
        update: {
          enabled: input.enabled,
          updatedByUserId: user.id,
          ...(encrypted
            ? {
                encryptedApiKey: encrypted.ciphertext,
                encryptionIv: encrypted.iv,
                encryptionTag: encrypted.tag,
                apiKeyLastFour: input.apiKey!.slice(-4),
              }
            : {}),
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "MINIMAX_CONFIG_UPDATE",
        resourceType: "SystemMinimaxConfig",
        resourceId: saved.id,
        metadata: {
          enabled: input.enabled,
          keyReplaced: Boolean(input.apiKey),
        },
        ipAddress: request.ip,
      });
      return saved;
    });
    return {
      config: {
        provider: stored.provider,
        apiKeyLastFour: stored.apiKeyLastFour,
        enabled: stored.enabled,
        updatedAt: stored.updatedAt,
        configured: true,
      },
    };
  });

  app.post("/api/admin/minimax/config/test", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    enforceMiniMaxLimit(user.id, "connection", 5);
    const { apiKey } = await minimaxCredentials(config);
    await generateMiniMaxSpeech({
      apiKey,
      text: "连接成功",
      config,
    });
    return { ok: true, message: "MiniMax 连接成功" };
  });

  app.post(
    "/api/admin/hanzi/characters/:id/generate/:kind",
    async (request, reply) => {
      const { id, kind } = hanziGenerateParams.parse(request.params);
      const { wordIndex } = hanziGenerateQuery.parse(request.query);
      const { user } = await adminUser(request, reply, config);
      const existing = await prisma.hanziCharacter.findUnique({ where: { id } });
      if (!existing || !existing.isEnabled) {
        throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
      }
      if (
        kind === "word-audio" &&
        (wordIndex === undefined || wordIndex >= existing.words.length)
      ) {
        throw new HttpError(
          400,
          "HANZI_WORD_INDEX_INVALID",
          "没有找到要生成读音的词语",
        );
      }
      enforceMiniMaxLimit(user.id, "hanzi-media");
      const credentials = await minimaxCredentials(config);
      const lockKey = `hanzi:${id}:${kind}:${wordIndex ?? ""}`;
      return withGenerationLock(lockKey, async () => {
        const sentence = existing.sentence.replaceAll("__", existing.character);
        const generated =
          kind === "image"
            ? await generateMiniMaxImage({
                ...credentials,
                ...hanziImagePrompts({
                  meaning: existing.meaning,
                  shapeHint: existing.shapeHint,
                  sentence,
                }),
                config,
              })
            : await generateMiniMaxSpeech({
                ...credentials,
                text:
                  kind === "character-audio"
                    ? existing.character
                    : kind === "sentence-audio"
                      ? sentence
                      : existing.words[wordIndex!],
                config,
              });
        const stored = await storeHanziMedia({
          uploadDir: config.HANZI_ASSET_UPLOAD_DIR,
          characterId: existing.id,
          kind,
          wordIndex,
          contentType: kind === "image" ? "image/jpeg" : "audio/mpeg",
          data: generated,
        });
        try {
          const character = await prisma.$transaction(async (tx) => {
            const data: Prisma.HanziCharacterUpdateInput =
              kind === "image"
                ? { imageKey: stored.publicUrl }
                : kind === "character-audio"
                  ? { characterAudioUrl: stored.publicUrl }
                  : kind === "sentence-audio"
                    ? { sentenceAudioUrl: stored.publicUrl }
                    : {
                        wordAudioUrls: existing.words.map((_, index) =>
                          index === wordIndex
                            ? stored.publicUrl
                            : existing.wordAudioUrls[index] || "",
                        ),
                      };
            const updated = await tx.hanziCharacter.update({
              where: { id },
              data,
            });
            await writeAudit(tx, {
              actorType: "USER",
              actorId: user.id,
              action: "HANZI_MEDIA_GENERATED",
              resourceType: "HanziCharacter",
              resourceId: id,
              metadata: {
                character: existing.character,
                kind,
                wordIndex: wordIndex ?? null,
                fileName: stored.fileName,
                provider: "MINIMAX",
              },
              ipAddress: request.ip,
            });
            return updated;
          });
          return { character };
        } catch (error) {
          if (stored.created) await unlink(stored.filePath).catch(() => undefined);
          throw error;
        }
      });
    },
  );

  app.post(
    "/api/admin/poems/:id/generate/:kind",
    async (request, reply) => {
      const { id, kind } = poemGenerateParams.parse(request.params);
      const { user } = await adminUser(request, reply, config);
      const existing = await prisma.poem.findUnique({ where: { id } });
      if (!existing || !existing.isEnabled) {
        throw new HttpError(404, "POEM_NOT_FOUND", "没有找到这首古诗");
      }
      enforceMiniMaxLimit(user.id, "poem-media");
      const credentials = await minimaxCredentials(config);
      return withGenerationLock(`poem:${id}:${kind}`, async () => {
        const generated =
          kind === "image"
            ? await generateMiniMaxImage({
                ...credentials,
                ...poemImagePrompts(existing),
                config,
              })
            : await generateMiniMaxSpeech({
                ...credentials,
                text: poemSpeechText(existing),
                config,
              });
        const stored = await storeGeneratedPoemMedia({
          uploadDir: config.POEM_ASSET_UPLOAD_DIR,
          poemId: existing.id,
          kind,
          data: generated,
        });
        try {
          const poem = await prisma.$transaction(async (tx) => {
            const updated = await tx.poem.update({
              where: { id },
              data:
                kind === "image"
                  ? { imageUrl: stored.publicUrl }
                  : { audioUrl: stored.publicUrl },
            });
            await writeAudit(tx, {
              actorType: "USER",
              actorId: user.id,
              action: "POEM_MEDIA_GENERATED",
              resourceType: "Poem",
              resourceId: id,
              metadata: {
                title: existing.title,
                kind,
                fileName: stored.fileName,
                provider: "MINIMAX",
              },
              ipAddress: request.ip,
            });
            return updated;
          });
          return { poem };
        } catch (error) {
          if (stored.created) await unlink(stored.filePath).catch(() => undefined);
          throw error;
        }
      });
    },
  );
}
