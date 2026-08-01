import { Prisma } from "@prisma/client";
import { unlink } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  HANZI_MEDIA_BODY_LIMIT,
  storeHanziMedia,
} from "../services/hanzi-media-service.js";
import { storeGeneratedPoemMedia } from "../services/poem-media-service.js";

const hanziShape = {
  character: z.string().trim().min(1).max(2),
  internalPinyin: z.string().trim().min(1).max(50),
  meaning: z.string().trim().min(1).max(120),
  shapeHint: z.string().trim().min(1).max(240),
  sentence: z.string().trim().min(3).max(300),
  words: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
  wordAudioUrls: z.array(z.string().trim().max(2048)).max(10).default([]),
  imageKey: z.string().trim().min(1).max(2048).default("default-hanzi"),
  characterAudioUrl: z.string().trim().max(2048).nullable().optional(),
  sentenceAudioUrl: z.string().trim().max(2048).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  isEnabled: z.boolean().default(true),
};
const hanziSchema = z.object(hanziShape).superRefine((input, context) => {
  if (!input.sentence.includes("__")) {
    context.addIssue({
      code: "custom",
      path: ["sentence"],
      message: "例句必须用 __ 标记汉字所在的位置",
    });
  }
});
const hanziPatchSchema = z.object(hanziShape).partial();
const hanziQuery = z.object({
  q: z.string().trim().max(80).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  includeDisabled: z.coerce.boolean().default(true),
});
const hanziParams = z.object({ id: z.string().min(1) });
const hanziMediaParams = hanziParams.extend({
  kind: z.enum(["image", "character-audio", "sentence-audio", "word-audio"]),
});
const mediaQuery = z.object({
  wordIndex: z.coerce.number().int().min(0).max(9).optional(),
});

const poemShape = {
  title: z.string().trim().min(1).max(120),
  dynasty: z.string().trim().min(1).max(40),
  author: z.string().trim().min(1).max(80),
  grade: z.number().int().min(1).max(6),
  semester: z.string().trim().min(1).max(20),
  content: z.string().trim().min(1).max(3000),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  audioUrl: z.string().trim().max(2048).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  isEnabled: z.boolean().default(true),
};
const poemSchema = z.object(poemShape);
const poemPatchSchema = z.object(poemShape).partial();
const poemQuery = z.object({
  q: z.string().trim().max(80).default(""),
  grade: z.coerce.number().int().min(1).max(6).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  includeDisabled: z.coerce.boolean().default(true),
});
const poemParams = z.object({
  id: z.string().min(1),
});
const poemMediaParams = poemParams.extend({
  kind: z.enum(["image", "audio"]),
});

async function adminUser(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
) {
  return requireAdmin(request, reply, config);
}

function hanziWhere(input: z.infer<typeof hanziQuery>): Prisma.HanziCharacterWhereInput {
  return {
    ...(input.includeDisabled ? {} : { isEnabled: true }),
    ...(input.q
      ? {
          OR: [
            { character: { contains: input.q, mode: "insensitive" } },
            { internalPinyin: { contains: input.q, mode: "insensitive" } },
            { meaning: { contains: input.q, mode: "insensitive" } },
            { shapeHint: { contains: input.q, mode: "insensitive" } },
            { sentence: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function poemWhere(input: z.infer<typeof poemQuery>): Prisma.PoemWhereInput {
  return {
    ...(input.includeDisabled ? {} : { isEnabled: true }),
    ...(input.grade ? { grade: input.grade } : {}),
    ...(input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: "insensitive" } },
            { dynasty: { contains: input.q, mode: "insensitive" } },
            { author: { contains: input.q, mode: "insensitive" } },
            { content: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function registerAdminLearningResourceRoutes(
  app: FastifyInstance,
  config: AppConfig,
) {
  app.get("/api/admin/hanzi/characters", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const input = hanziQuery.parse(request.query);
    const where = hanziWhere(input);
    const [characters, total] = await Promise.all([
      prisma.hanziCharacter.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.hanziCharacter.count({ where }),
    ]);
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      action: "HANZI_LIBRARY_VIEW",
      resourceType: "HanziCharacter",
      metadata: { q: input.q, page: input.page },
      ipAddress: request.ip,
    });
    return { characters, total, page: input.page, pageSize: input.pageSize };
  });

  app.post("/api/admin/hanzi/characters", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const input = hanziSchema.parse(request.body);
    try {
      const character = await prisma.$transaction(async (tx) => {
        const created = await tx.hanziCharacter.create({
          data: {
            ...input,
            wordAudioUrls: input.words.map((_, index) => input.wordAudioUrls[index] || ""),
            characterAudioUrl: input.characterAudioUrl || null,
            sentenceAudioUrl: input.sentenceAudioUrl || null,
          },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          action: "HANZI_CREATED",
          resourceType: "HanziCharacter",
          resourceId: created.id,
          metadata: { character: created.character },
          ipAddress: request.ip,
        });
        return created;
      });
      reply.status(201);
      return { character };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "HANZI_ALREADY_EXISTS", "这个汉字已经在基础字库中");
      }
      throw error;
    }
  });

  app.patch("/api/admin/hanzi/characters/:id", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id } = hanziParams.parse(request.params);
    const patch = hanziPatchSchema.parse(request.body);
    const existing = await prisma.hanziCharacter.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
    const input = hanziSchema.parse({ ...existing, ...patch });
    try {
      const character = await prisma.$transaction(async (tx) => {
        const updated = await tx.hanziCharacter.update({
          where: { id },
          data: {
            ...input,
            wordAudioUrls: input.words.map((_, index) => input.wordAudioUrls[index] || ""),
            characterAudioUrl: input.characterAudioUrl || null,
            sentenceAudioUrl: input.sentenceAudioUrl || null,
          },
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          action: "HANZI_UPDATED",
          resourceType: "HanziCharacter",
          resourceId: id,
          metadata: { character: updated.character },
          ipAddress: request.ip,
        });
        return updated;
      });
      return { character };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "HANZI_ALREADY_EXISTS", "这个汉字已经在基础字库中");
      }
      throw error;
    }
  });

  app.delete("/api/admin/hanzi/characters/:id", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id } = hanziParams.parse(request.params);
    const enabledCount = await prisma.hanziCharacter.count({ where: { isEnabled: true } });
    if (enabledCount <= 3) {
      throw new HttpError(409, "HANZI_LIBRARY_MINIMUM", "基础字库至少需要保留 3 个汉字");
    }
    const result = await prisma.hanziCharacter.updateMany({
      where: { id, isEnabled: true },
      data: { isEnabled: false },
    });
    if (!result.count) throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
    await writeAudit(prisma, {
      actorType: "USER",
      actorId: user.id,
      action: "HANZI_ARCHIVED",
      resourceType: "HanziCharacter",
      resourceId: id,
      ipAddress: request.ip,
    });
    return { ok: true };
  });

  app.put("/api/admin/hanzi/characters/:id/media/:kind", { bodyLimit: HANZI_MEDIA_BODY_LIMIT }, async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id, kind } = hanziMediaParams.parse(request.params);
    const { wordIndex } = mediaQuery.parse(request.query);
    const existing = await prisma.hanziCharacter.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "HANZI_NOT_FOUND", "没有找到这个汉字");
    if (kind === "word-audio" && (wordIndex === undefined || wordIndex >= existing.words.length)) {
      throw new HttpError(400, "HANZI_WORD_INDEX_INVALID", "没有找到要替换读音的词语");
    }
    if (!Buffer.isBuffer(request.body)) throw new HttpError(400, "HANZI_MEDIA_INVALID_BODY", "请选择要上传的媒体文件");
    const stored = await storeHanziMedia({
      uploadDir: config.HANZI_ASSET_UPLOAD_DIR,
      characterId: existing.id,
      kind,
      wordIndex,
      contentType: request.headers["content-type"] ?? "",
      data: request.body,
    });
    try {
      const character = await prisma.$transaction(async (tx) => {
        const data: Prisma.HanziCharacterUpdateInput = kind === "image"
          ? { imageKey: stored.publicUrl }
          : kind === "character-audio"
            ? { characterAudioUrl: stored.publicUrl }
            : kind === "sentence-audio"
              ? { sentenceAudioUrl: stored.publicUrl }
              : { wordAudioUrls: existing.words.map((_, index) => index === wordIndex ? stored.publicUrl : existing.wordAudioUrls[index] || "") };
        const updated = await tx.hanziCharacter.update({ where: { id }, data });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          action: "HANZI_MEDIA_REPLACED",
          resourceType: "HanziCharacter",
          resourceId: id,
          metadata: { character: existing.character, kind, wordIndex: wordIndex ?? null, fileName: stored.fileName },
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

  app.get("/api/admin/poems", async (request, reply) => {
    await adminUser(request, reply, config);
    const input = poemQuery.parse(request.query);
    const where = poemWhere(input);
    const [poems, total] = await Promise.all([
      prisma.poem.findMany({
        where,
        orderBy: [{ grade: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.poem.count({ where }),
    ]);
    return { poems, total, page: input.page, pageSize: input.pageSize };
  });

  app.post("/api/admin/poems", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const input = poemSchema.parse(request.body);
    try {
      const poem = await prisma.$transaction(async (tx) => {
        const created = await tx.poem.create({ data: { ...input, imageUrl: input.imageUrl || null, audioUrl: input.audioUrl || null } });
        await writeAudit(tx, { actorType: "USER", actorId: user.id, action: "POEM_CREATED", resourceType: "Poem", resourceId: created.id, metadata: { title: created.title }, ipAddress: request.ip });
        return created;
      });
      reply.status(201);
      return { poem };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "POEM_ALREADY_EXISTS", "这首古诗已经在古诗库中");
      throw error;
    }
  });

  app.patch("/api/admin/poems/:id", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id } = poemParams.parse(request.params);
    const existing = await prisma.poem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "POEM_NOT_FOUND", "没有找到这首古诗");
    const input = poemSchema.parse({ ...existing, ...poemPatchSchema.parse(request.body) });
    try {
      const poem = await prisma.$transaction(async (tx) => {
        const updated = await tx.poem.update({ where: { id }, data: { ...input, imageUrl: input.imageUrl || null, audioUrl: input.audioUrl || null } });
        await writeAudit(tx, { actorType: "USER", actorId: user.id, action: "POEM_UPDATED", resourceType: "Poem", resourceId: id, metadata: { title: updated.title }, ipAddress: request.ip });
        return updated;
      });
      return { poem };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "POEM_ALREADY_EXISTS", "这首古诗已经在古诗库中");
      throw error;
    }
  });

  app.delete("/api/admin/poems/:id", async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id } = poemParams.parse(request.params);
    const result = await prisma.poem.updateMany({ where: { id, isEnabled: true }, data: { isEnabled: false } });
    if (!result.count) throw new HttpError(404, "POEM_NOT_FOUND", "没有找到这首古诗");
    await writeAudit(prisma, { actorType: "USER", actorId: user.id, action: "POEM_ARCHIVED", resourceType: "Poem", resourceId: id, ipAddress: request.ip });
    return { ok: true };
  });

  app.put("/api/admin/poems/:id/media/:kind", { bodyLimit: HANZI_MEDIA_BODY_LIMIT }, async (request, reply) => {
    const { user } = await adminUser(request, reply, config);
    const { id, kind } = poemMediaParams.parse(request.params);
    const existing = await prisma.poem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "POEM_NOT_FOUND", "没有找到这首古诗");
    if (!Buffer.isBuffer(request.body)) throw new HttpError(400, "POEM_MEDIA_INVALID_BODY", "请选择要上传的媒体文件");
    const stored = await storeGeneratedPoemMedia({ uploadDir: config.POEM_ASSET_UPLOAD_DIR, poemId: id, kind, data: request.body });
    try {
      const poem = await prisma.$transaction(async (tx) => {
        const updated = await tx.poem.update({ where: { id }, data: kind === "image" ? { imageUrl: stored.publicUrl } : { audioUrl: stored.publicUrl } });
        await writeAudit(tx, { actorType: "USER", actorId: user.id, action: "POEM_MEDIA_REPLACED", resourceType: "Poem", resourceId: id, metadata: { title: existing.title, kind, fileName: stored.fileName }, ipAddress: request.ip });
        return updated;
      });
      return { poem };
    } catch (error) {
      if (stored.created) await unlink(stored.filePath).catch(() => undefined);
      throw error;
    }
  });
}
