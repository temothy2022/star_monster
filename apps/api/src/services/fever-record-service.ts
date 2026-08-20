import {
  Prisma,
  type FeverAntipyreticKind,
  type FeverObservationLevel,
  type FeverThermometerType,
} from "@prisma/client";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export type FeverReadingInput = {
  clientRequestId: string;
  recordedAt: Date;
  temperatureCelsius: number;
  thermometerType?: FeverThermometerType | null;
  medicationUsed: boolean;
  antipyreticUsed: boolean;
  antipyreticKind?: FeverAntipyreticKind | null;
  medicationNote?: string | null;
  respiratoryRate?: number | null;
  mentalState?: FeverObservationLevel | null;
  sleepState?: FeverObservationLevel | null;
  appetiteState?: FeverObservationLevel | null;
  hydrationState?: FeverObservationLevel | null;
  note?: string | null;
};

export type FeverReadingUpdateInput = Omit<FeverReadingInput, "clientRequestId">;

type ReadingLike = {
  id: string;
  recordedAt: Date;
  temperatureCelsius: Prisma.Decimal;
  thermometerType: FeverThermometerType | null;
  medicationUsed: boolean;
  antipyreticUsed: boolean;
  antipyreticKind: FeverAntipyreticKind | null;
  medicationNote: string | null;
  respiratoryRate: number | null;
  mentalState: FeverObservationLevel | null;
  sleepState: FeverObservationLevel | null;
  appetiteState: FeverObservationLevel | null;
  hydrationState: FeverObservationLevel | null;
  note: string | null;
  createdAt: Date;
};

type EpisodeLike = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  readings: ReadingLike[];
};

export function serializeFeverReading(reading: ReadingLike) {
  return {
    id: reading.id,
    recordedAt: reading.recordedAt.toISOString(),
    temperatureCelsius: Number(reading.temperatureCelsius),
    thermometerType: reading.thermometerType,
    medicationUsed: reading.medicationUsed,
    antipyreticUsed: reading.antipyreticUsed,
    antipyreticKind: reading.antipyreticKind,
    medicationNote: reading.medicationNote,
    respiratoryRate: reading.respiratoryRate,
    mentalState: reading.mentalState,
    sleepState: reading.sleepState,
    appetiteState: reading.appetiteState,
    hydrationState: reading.hydrationState,
    note: reading.note,
    createdAt: reading.createdAt.toISOString(),
  };
}

export function summarizeFeverEpisode(episode: EpisodeLike, now = new Date()) {
  const readings = [...episode.readings].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const temperatures = readings.map((reading) => Number(reading.temperatureCelsius));
  const lastReading = readings.at(-1) ?? null;
  const effectiveEnd = episode.endedAt ?? now;
  return {
    id: episode.id,
    startedAt: episode.startedAt.toISOString(),
    endedAt: episode.endedAt?.toISOString() ?? null,
    durationMinutes: Math.max(0, Math.round((effectiveEnd.getTime() - episode.startedAt.getTime()) / 60_000)),
    maximumTemperatureCelsius: temperatures.length ? Math.max(...temperatures) : null,
    latestTemperatureCelsius: lastReading ? Number(lastReading.temperatureCelsius) : null,
    readingCount: readings.length,
    readings: readings.map(serializeFeverReading),
    createdAt: episode.createdAt.toISOString(),
    updatedAt: episode.updatedAt.toISOString(),
  };
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function saveFeverReading(args: {
  childId: string;
  createdById: string;
  input: FeverReadingInput;
}, retryCount = 0) {
  const existing = await prisma.childFeverReading.findUnique({
    where: { clientRequestId: args.input.clientRequestId },
  });
  if (existing) {
    if (existing.childId !== args.childId) throw new HttpError(409, "FEVER_READING_CONFLICT", "这条记录已经被使用");
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let slot = await tx.childFeverActiveSlot.findUnique({
        where: { childId: args.childId },
        include: { episode: true },
      });
      if (slot?.episode.endedAt) {
        await tx.childFeverActiveSlot.delete({ where: { childId: args.childId } });
        slot = null;
      }

      let episodeId: string;
      if (slot) {
        episodeId = slot.episodeId;
        if (args.input.recordedAt < slot.episode.startedAt) {
          await tx.childFeverEpisode.update({
            where: { id: episodeId },
            data: { startedAt: args.input.recordedAt },
          });
        }
      } else {
        const episode = await tx.childFeverEpisode.create({
          data: {
            childId: args.childId,
            startedAt: args.input.recordedAt,
            createdById: args.createdById,
          },
        });
        await tx.childFeverActiveSlot.create({
          data: { childId: args.childId, episodeId: episode.id },
        });
        episodeId = episode.id;
      }

      return tx.childFeverReading.create({
        data: {
          clientRequestId: args.input.clientRequestId,
          childId: args.childId,
          episodeId,
          recordedAt: args.input.recordedAt,
          temperatureCelsius: new Prisma.Decimal(args.input.temperatureCelsius),
          thermometerType: args.input.thermometerType ?? null,
          medicationUsed: args.input.medicationUsed,
          antipyreticUsed: args.input.antipyreticUsed,
          antipyreticKind: args.input.antipyreticUsed ? args.input.antipyreticKind ?? null : null,
          medicationNote: nullableText(args.input.medicationNote),
          respiratoryRate: args.input.respiratoryRate ?? null,
          mentalState: args.input.mentalState ?? null,
          sleepState: args.input.sleepState ?? null,
          appetiteState: args.input.appetiteState ?? null,
          hydrationState: args.input.hydrationState ?? null,
          note: nullableText(args.input.note),
          createdById: args.createdById,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const idempotentReading = await prisma.childFeverReading.findUnique({
        where: { clientRequestId: args.input.clientRequestId },
      });
      if (idempotentReading) {
        if (idempotentReading.childId !== args.childId) throw new HttpError(409, "FEVER_READING_CONFLICT", "这条记录已经被使用");
        return idempotentReading;
      }
      if (retryCount < 1) return saveFeverReading(args, retryCount + 1);
    }
    throw error;
  }
}

export async function updateFeverReading(args: {
  childId: string;
  readingId: string;
  input: FeverReadingUpdateInput;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.childFeverReading.findFirst({
      where: { id: args.readingId, childId: args.childId },
      select: { id: true, episodeId: true },
    });
    if (!existing) throw new HttpError(404, "FEVER_READING_NOT_FOUND", "没有找到这条体温记录");

    const reading = await tx.childFeverReading.update({
      where: { id: existing.id },
      data: {
        recordedAt: args.input.recordedAt,
        temperatureCelsius: new Prisma.Decimal(args.input.temperatureCelsius),
        thermometerType: args.input.thermometerType ?? null,
        medicationUsed: args.input.medicationUsed,
        antipyreticUsed: args.input.antipyreticUsed,
        antipyreticKind: args.input.antipyreticUsed ? args.input.antipyreticKind ?? null : null,
        medicationNote: nullableText(args.input.medicationNote),
        respiratoryRate: args.input.respiratoryRate ?? null,
        mentalState: args.input.mentalState ?? null,
        sleepState: args.input.sleepState ?? null,
        appetiteState: args.input.appetiteState ?? null,
        hydrationState: args.input.hydrationState ?? null,
        note: nullableText(args.input.note),
      },
    });

    const episode = await tx.childFeverEpisode.findUnique({
      where: { id: existing.episodeId },
      select: { startedAt: true, endedAt: true },
    });
    const readings = await tx.childFeverReading.findMany({
      where: { episodeId: existing.episodeId },
      select: { recordedAt: true },
      orderBy: { recordedAt: "asc" },
    });
    const firstReadingAt = readings[0]?.recordedAt;
    const lastReadingAt = readings.at(-1)?.recordedAt;
    if (episode && firstReadingAt && lastReadingAt) {
      const data: { startedAt?: Date; endedAt?: Date | null } = {};
      if (firstReadingAt.getTime() !== episode.startedAt.getTime()) data.startedAt = firstReadingAt;
      if (episode.endedAt && lastReadingAt > episode.endedAt) data.endedAt = lastReadingAt;
      if (Object.keys(data).length) {
        await tx.childFeverEpisode.update({ where: { id: existing.episodeId }, data });
      }
    }
    return reading;
  });
}

export async function endActiveFeverEpisode(childId: string, endedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.childFeverActiveSlot.findUnique({
      where: { childId },
      include: { episode: { include: { readings: { orderBy: { recordedAt: "asc" } } } } },
    });
    if (!slot) throw new HttpError(409, "NO_ACTIVE_FEVER_EPISODE", "当前没有进行中的发热记录");
    const lastReadingAt = slot.episode.readings.at(-1)?.recordedAt;
    const effectiveEnd = lastReadingAt && lastReadingAt > endedAt ? lastReadingAt : endedAt;
    await tx.childFeverActiveSlot.delete({ where: { childId } });
    return tx.childFeverEpisode.update({
      where: { id: slot.episodeId },
      data: { endedAt: effectiveEnd },
      include: { readings: { orderBy: { recordedAt: "asc" } } },
    });
  });
}

export async function getFeverOverview(childId: string, page: number, pageSize: number) {
  const [activeSlot, history, total] = await prisma.$transaction([
    prisma.childFeverActiveSlot.findUnique({
      where: { childId },
      include: { episode: { include: { readings: { orderBy: { recordedAt: "asc" } } } } },
    }),
    prisma.childFeverEpisode.findMany({
      where: { childId, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { readings: { orderBy: { recordedAt: "asc" } } },
    }),
    prisma.childFeverEpisode.count({ where: { childId, endedAt: { not: null } } }),
  ]);
  return {
    activeEpisode: activeSlot ? summarizeFeverEpisode(activeSlot.episode) : null,
    history: history.map((episode) => summarizeFeverEpisode(episode)),
    total,
    page,
    pageSize,
  };
}

export async function getFeverEpisode(childId: string, episodeId: string) {
  const episode = await prisma.childFeverEpisode.findFirst({
    where: { id: episodeId, childId },
    include: { readings: { orderBy: { recordedAt: "asc" } } },
  });
  if (!episode) throw new HttpError(404, "FEVER_EPISODE_NOT_FOUND", "没有找到这次发热记录");
  return summarizeFeverEpisode(episode);
}
