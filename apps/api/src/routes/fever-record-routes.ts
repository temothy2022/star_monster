import {
  FeverAntipyreticKind,
  FeverObservationLevel,
  FeverThermometerType,
} from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireChild, requireParent } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import {
  endActiveFeverEpisode,
  getFeverEpisode,
  getFeverOverview,
  saveFeverReading,
  serializeFeverReading,
  updateFeverReading,
} from "../services/fever-record-service.js";

const childParams = z.object({ id: z.string().min(1) });
const episodeParams = z.object({ episodeId: z.string().min(1) });
const parentEpisodeParams = childParams.extend({ episodeId: z.string().min(1) });
const parentReadingParams = childParams.extend({ readingId: z.string().min(1) });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
});
const endSchema = z.object({ endedAt: z.string().datetime({ offset: true }).optional() });
const readingSchema = z.object({
  clientRequestId: z.string().min(8).max(120),
  recordedAt: z.string().datetime({ offset: true }),
  temperatureCelsius: z.number().min(34).max(43),
  thermometerType: z.nativeEnum(FeverThermometerType).nullable().optional(),
  medicationUsed: z.boolean().default(false),
  antipyreticUsed: z.boolean().default(false),
  antipyreticKind: z.nativeEnum(FeverAntipyreticKind).nullable().optional(),
  medicationNote: z.string().trim().max(200).nullable().optional(),
  respiratoryRate: z.number().int().min(5).max(120).nullable().optional(),
  mentalState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  sleepState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  appetiteState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  hydrationState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, context) => {
  if (input.antipyreticUsed && !input.antipyreticKind) {
    context.addIssue({ code: "custom", path: ["antipyreticKind"], message: "请选择退烧药类型" });
  }
  if (input.antipyreticUsed && !input.medicationUsed) {
    context.addIssue({ code: "custom", path: ["medicationUsed"], message: "使用退烧药时，用药情况应选择已用药" });
  }
});
const readingUpdateSchema = z.object({
  recordedAt: z.string().datetime({ offset: true }),
  temperatureCelsius: z.number().min(34).max(43),
  thermometerType: z.nativeEnum(FeverThermometerType).nullable().optional(),
  medicationUsed: z.boolean().default(false),
  antipyreticUsed: z.boolean().default(false),
  antipyreticKind: z.nativeEnum(FeverAntipyreticKind).nullable().optional(),
  medicationNote: z.string().trim().max(200).nullable().optional(),
  respiratoryRate: z.number().int().min(5).max(120).nullable().optional(),
  mentalState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  sleepState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  appetiteState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  hydrationState: z.nativeEnum(FeverObservationLevel).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, context) => {
  if (input.antipyreticUsed && !input.antipyreticKind) {
    context.addIssue({ code: "custom", path: ["antipyreticKind"], message: "请选择退烧药类型" });
  }
  if (input.antipyreticUsed && !input.medicationUsed) {
    context.addIssue({ code: "custom", path: ["medicationUsed"], message: "使用退烧药时，用药情况应选择已用药" });
  }
});

function parsedTime(value: string, fieldName: string) {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new HttpError(400, "INVALID_TIME", `${fieldName}不正确`);
  if (result.getTime() > Date.now() + 10 * 60_000) throw new HttpError(400, "FUTURE_FEVER_RECORD", `${fieldName}不能晚于当前时间`);
  return result;
}

async function requireOwnedChild(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  childId: string,
) {
  const { user } = await requireParent(request, reply, config);
  const child = await prisma.childProfile.findFirst({ where: { id: childId, familyId: user.familyId ?? "__none__" } });
  if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
  return { user, child };
}

export async function registerFeverRecordRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/child/fever-records", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { page, pageSize } = pageQuery.parse(request.query);
    return getFeverOverview(child.id, page, pageSize);
  });

  app.post("/api/child/fever-records", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = readingSchema.parse(request.body);
    const reading = await saveFeverReading({
      childId: child.id,
      createdById: child.id,
      input: { ...input, recordedAt: parsedTime(input.recordedAt, "记录时间") },
    });
    await writeAudit(prisma, { actorType: "CHILD", actorId: child.id, familyId: child.familyId, action: "CHILD_FEVER_READING_SAVED", resourceType: "ChildFeverReading", resourceId: reading.id, metadata: { episodeId: reading.episodeId }, ipAddress: request.ip });
    reply.status(201);
    return { reading: serializeFeverReading(reading) };
  });

  app.patch("/api/child/fever-records/readings/:readingId", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { readingId } = z.object({ readingId: z.string().min(1) }).parse(request.params);
    const input = readingUpdateSchema.parse(request.body);
    const reading = await updateFeverReading({
      childId: child.id,
      readingId,
      input: { ...input, recordedAt: parsedTime(input.recordedAt, "记录时间") },
    });
    await writeAudit(prisma, { actorType: "CHILD", actorId: child.id, familyId: child.familyId, action: "CHILD_FEVER_READING_UPDATED", resourceType: "ChildFeverReading", resourceId: reading.id, metadata: { episodeId: reading.episodeId }, ipAddress: request.ip });
    return { reading: serializeFeverReading(reading) };
  });

  app.post("/api/child/fever-records/end", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = endSchema.parse(request.body ?? {});
    const episode = await endActiveFeverEpisode(child.id, input.endedAt ? parsedTime(input.endedAt, "结束时间") : new Date());
    await writeAudit(prisma, { actorType: "CHILD", actorId: child.id, familyId: child.familyId, action: "CHILD_FEVER_EPISODE_ENDED", resourceType: "ChildFeverEpisode", resourceId: episode.id, ipAddress: request.ip });
    return { episode: await getFeverEpisode(child.id, episode.id) };
  });

  app.get("/api/child/fever-records/episodes/:episodeId", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { episodeId } = episodeParams.parse(request.params);
    return { episode: await getFeverEpisode(child.id, episodeId) };
  });

  app.get("/api/parent/children/:id/fever-records", async (request, reply) => {
    const { id } = childParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    const { page, pageSize } = pageQuery.parse(request.query);
    return getFeverOverview(id, page, pageSize);
  });

  app.post("/api/parent/children/:id/fever-records", async (request, reply) => {
    const { id } = childParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const input = readingSchema.parse(request.body);
    const reading = await saveFeverReading({ childId: id, createdById: user.id, input: { ...input, recordedAt: parsedTime(input.recordedAt, "记录时间") } });
    await writeAudit(prisma, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_FEVER_READING_SAVED", resourceType: "ChildFeverReading", resourceId: reading.id, metadata: { episodeId: reading.episodeId }, ipAddress: request.ip });
    reply.status(201);
    return { reading: serializeFeverReading(reading) };
  });

  app.patch("/api/parent/children/:id/fever-records/readings/:readingId", async (request, reply) => {
    const { id, readingId } = parentReadingParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const input = readingUpdateSchema.parse(request.body);
    const reading = await updateFeverReading({
      childId: id,
      readingId,
      input: { ...input, recordedAt: parsedTime(input.recordedAt, "记录时间") },
    });
    await writeAudit(prisma, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_FEVER_READING_UPDATED", resourceType: "ChildFeverReading", resourceId: reading.id, metadata: { episodeId: reading.episodeId }, ipAddress: request.ip });
    return { reading: serializeFeverReading(reading) };
  });

  app.post("/api/parent/children/:id/fever-records/end", async (request, reply) => {
    const { id } = childParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const input = endSchema.parse(request.body ?? {});
    const episode = await endActiveFeverEpisode(id, input.endedAt ? parsedTime(input.endedAt, "结束时间") : new Date());
    await writeAudit(prisma, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_FEVER_EPISODE_ENDED", resourceType: "ChildFeverEpisode", resourceId: episode.id, ipAddress: request.ip });
    return { episode: await getFeverEpisode(id, episode.id) };
  });

  app.get("/api/parent/children/:id/fever-records/episodes/:episodeId", async (request, reply) => {
    const { id, episodeId } = parentEpisodeParams.parse(request.params);
    await requireOwnedChild(request, reply, config, id);
    return { episode: await getFeverEpisode(id, episodeId) };
  });
}
