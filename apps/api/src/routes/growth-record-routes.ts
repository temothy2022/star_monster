import { GrowthMilestoneCategory, Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { addBusinessDays, businessDateAt } from "../lib/time.js";
import { requireAdmin, requireChild, requireParent } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import { buildGrowthDashboard, serializeGrowthRecord } from "../services/child-growth-record-service.js";

const idParams = z.object({ id: z.string().min(1) });
const recordParams = z.object({ id: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const milestoneParams = z.object({ id: z.string().min(1), milestoneId: z.string().min(1) });
const rangeQuery = z.object({ days: z.coerce.number().int().min(7).max(730).default(90) });
const pagedQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
const adminQuery = pagedQuery.extend({ days: z.coerce.number().int().min(7).max(365).default(30) });

const optionalNumber = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const growthRecordSchema = z.object({
  heightCm: optionalNumber(40, 230),
  weightKg: optionalNumber(2, 250),
  sleepStartMinute: optionalNumber(0, 1439),
  wakeMinute: optionalNumber(0, 1439),
  napMinutes: optionalNumber(0, 600),
  sleepQuality: optionalNumber(1, 5),
  outdoorMinutes: optionalNumber(0, 1440),
  exerciseMinutes: optionalNumber(0, 1440),
  screenMinutes: optionalNumber(0, 1440),
  moodScore: optionalNumber(1, 5),
  energyScore: optionalNumber(1, 5),
  appetiteScore: optionalNumber(1, 5),
  note: z.string().trim().max(1000).nullable().optional(),
});
const profileSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  biologicalSex: z.enum(["MALE", "FEMALE", "UNSPECIFIED"]).nullable(),
});
const milestoneSchema = z.object({
  happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.nativeEnum(GrowthMilestoneCategory),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).nullable().optional(),
  visibleToChild: z.boolean().default(true),
});

function dateValue(value: string) {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "INVALID_DATE", "日期不正确");
  }
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

function recordData(input: z.infer<typeof growthRecordSchema>) {
  return {
    heightCm: input.heightCm === undefined ? undefined : input.heightCm === null ? null : new Prisma.Decimal(input.heightCm),
    weightKg: input.weightKg === undefined ? undefined : input.weightKg === null ? null : new Prisma.Decimal(input.weightKg),
    sleepStartMinute: input.sleepStartMinute,
    wakeMinute: input.wakeMinute,
    napMinutes: input.napMinutes,
    sleepQuality: input.sleepQuality,
    outdoorMinutes: input.outdoorMinutes,
    exerciseMinutes: input.exerciseMinutes,
    screenMinutes: input.screenMinutes,
    moodScore: input.moodScore,
    energyScore: input.energyScore,
    appetiteScore: input.appetiteScore,
    note: input.note === "" ? null : input.note,
  };
}

function serializeMilestone(item: {
  id: string;
  happenedOn: Date;
  category: GrowthMilestoneCategory;
  title: string;
  description: string | null;
  visibleToChild: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...item, happenedOn: item.happenedOn.toISOString().slice(0, 10), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

export async function registerGrowthRecordRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/parent/children/:id/growth-records/dashboard", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { days } = rangeQuery.parse(request.query);
    const { child } = await requireOwnedChild(request, reply, config, id);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const records = await prisma.childGrowthRecord.findMany({
      where: { childId: id, recordDate: { gte: addBusinessDays(today, -(days - 1)), lte: today } },
      orderBy: { recordDate: "asc" },
    });
    return { dashboard: buildGrowthDashboard({ child, records }), days };
  });

  app.get("/api/parent/children/:id/growth-records", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { page, pageSize } = pagedQuery.parse(request.query);
    await requireOwnedChild(request, reply, config, id);
    const [records, total] = await prisma.$transaction([
      prisma.childGrowthRecord.findMany({ where: { childId: id }, orderBy: { recordDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.childGrowthRecord.count({ where: { childId: id } }),
    ]);
    return { records: records.map(serializeGrowthRecord), total, page, pageSize };
  });

  app.put("/api/parent/children/:id/growth-records/:date", async (request, reply) => {
    const { id, date } = recordParams.parse(request.params);
    const input = growthRecordSchema.parse(request.body);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const record = await prisma.$transaction(async (tx) => {
      const saved = await tx.childGrowthRecord.upsert({
        where: { childId_recordDate: { childId: id, recordDate: dateValue(date) } },
        create: { childId: id, recordDate: dateValue(date), createdById: user.id, ...recordData(input) },
        update: recordData(input),
      });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_RECORD_SAVED", resourceType: "ChildGrowthRecord", resourceId: saved.id, metadata: { recordDate: date }, ipAddress: request.ip });
      return saved;
    });
    return { record: serializeGrowthRecord(record) };
  });

  app.delete("/api/parent/children/:id/growth-records/:date", async (request, reply) => {
    const { id, date } = recordParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const existing = await prisma.childGrowthRecord.findUnique({ where: { childId_recordDate: { childId: id, recordDate: dateValue(date) } } });
    if (!existing) throw new HttpError(404, "GROWTH_RECORD_NOT_FOUND", "没有找到这条记录");
    await prisma.$transaction(async (tx) => {
      await tx.childGrowthRecord.delete({ where: { id: existing.id } });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_RECORD_DELETED", resourceType: "ChildGrowthRecord", resourceId: existing.id, metadata: { recordDate: date }, ipAddress: request.ip });
    });
    return { ok: true };
  });

  app.patch("/api/parent/children/:id/growth-profile", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const input = profileSchema.parse(request.body);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.childProfile.update({ where: { id }, data: { birthDate: input.birthDate ? dateValue(input.birthDate) : null, biologicalSex: input.biologicalSex } });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_PROFILE_UPDATED", resourceType: "ChildProfile", resourceId: id, metadata: { birthDate: input.birthDate, biologicalSex: input.biologicalSex }, ipAddress: request.ip });
      return saved;
    });
    return { profile: { childId: id, birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null, biologicalSex: updated.biologicalSex } };
  });

  app.get("/api/parent/children/:id/growth-milestones", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { page, pageSize } = pagedQuery.parse(request.query);
    await requireOwnedChild(request, reply, config, id);
    const [items, total] = await prisma.$transaction([
      prisma.childGrowthMilestone.findMany({ where: { childId: id }, orderBy: [{ happenedOn: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.childGrowthMilestone.count({ where: { childId: id } }),
    ]);
    return { milestones: items.map(serializeMilestone), total, page, pageSize };
  });

  app.post("/api/parent/children/:id/growth-milestones", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const input = milestoneSchema.parse(request.body);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const item = await prisma.$transaction(async (tx) => {
      const saved = await tx.childGrowthMilestone.create({ data: { childId: id, happenedOn: dateValue(input.happenedOn), category: input.category, title: input.title, description: input.description || null, visibleToChild: input.visibleToChild, createdById: user.id } });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_MILESTONE_CREATED", resourceType: "ChildGrowthMilestone", resourceId: saved.id, metadata: { category: input.category }, ipAddress: request.ip });
      return saved;
    });
    reply.status(201);
    return { milestone: serializeMilestone(item) };
  });

  app.patch("/api/parent/children/:id/growth-milestones/:milestoneId", async (request, reply) => {
    const { id, milestoneId } = milestoneParams.parse(request.params);
    const input = milestoneSchema.partial().parse(request.body);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const existing = await prisma.childGrowthMilestone.findFirst({ where: { id: milestoneId, childId: id } });
    if (!existing) throw new HttpError(404, "GROWTH_MILESTONE_NOT_FOUND", "没有找到这条里程碑");
    const item = await prisma.$transaction(async (tx) => {
      const saved = await tx.childGrowthMilestone.update({ where: { id: milestoneId }, data: { happenedOn: input.happenedOn ? dateValue(input.happenedOn) : undefined, category: input.category, title: input.title, description: input.description === "" ? null : input.description, visibleToChild: input.visibleToChild } });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_MILESTONE_UPDATED", resourceType: "ChildGrowthMilestone", resourceId: saved.id, ipAddress: request.ip });
      return saved;
    });
    return { milestone: serializeMilestone(item) };
  });

  app.delete("/api/parent/children/:id/growth-milestones/:milestoneId", async (request, reply) => {
    const { id, milestoneId } = milestoneParams.parse(request.params);
    const { user, child } = await requireOwnedChild(request, reply, config, id);
    const existing = await prisma.childGrowthMilestone.findFirst({ where: { id: milestoneId, childId: id } });
    if (!existing) throw new HttpError(404, "GROWTH_MILESTONE_NOT_FOUND", "没有找到这条里程碑");
    await prisma.$transaction(async (tx) => {
      await tx.childGrowthMilestone.delete({ where: { id: milestoneId } });
      await writeAudit(tx, { actorType: "USER", actorId: user.id, familyId: child.familyId, action: "CHILD_GROWTH_MILESTONE_DELETED", resourceType: "ChildGrowthMilestone", resourceId: milestoneId, ipAddress: request.ip });
    });
    return { ok: true };
  });

  app.get("/api/child/growth-records/summary", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const records = await prisma.childGrowthRecord.findMany({ where: { childId: child.id, recordDate: { gte: addBusinessDays(today, -29), lte: today } }, orderBy: { recordDate: "asc" } });
    const dashboard = buildGrowthDashboard({ child, records });
    const todayKey = today.toISOString().slice(0, 10);
    return {
      growth: {
        nickname: child.nickname,
        todayRecord: dashboard.records.find((record) => record.recordDate === todayKey) ?? null,
        recentDaysRecorded: dashboard.summary.recentDaysRecorded,
        averageSleepMinutes: dashboard.summary.averageSleepMinutes,
        recommendedSleepMinutes: dashboard.summary.recommendedSleepMinutes,
        averageExerciseMinutes: dashboard.summary.averageExerciseMinutes,
        averageOutdoorMinutes: dashboard.summary.averageOutdoorMinutes,
      },
    };
  });

  app.get("/api/child/growth-records", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const { page, pageSize } = pagedQuery.parse(request.query);
    const [records, total] = await prisma.$transaction([
      prisma.childGrowthRecord.findMany({
        where: { childId: child.id },
        orderBy: { recordDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.childGrowthRecord.count({ where: { childId: child.id } }),
    ]);
    return { records: records.map(serializeGrowthRecord), total, page, pageSize };
  });

  app.put("/api/child/growth-records/:date", async (request, reply) => {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.params);
    const input = growthRecordSchema.parse(request.body);
    const { child } = await requireChild(request, reply, config);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const targetDate = dateValue(date);
    if (targetDate > today) throw new HttpError(400, "FUTURE_GROWTH_RECORD", "不能记录未来日期");
    const record = await prisma.$transaction(async (tx) => {
      const saved = await tx.childGrowthRecord.upsert({
        where: { childId_recordDate: { childId: child.id, recordDate: targetDate } },
        create: { childId: child.id, recordDate: targetDate, createdById: child.id, ...recordData(input) },
        update: recordData(input),
      });
      await writeAudit(tx, { actorType: "CHILD", actorId: child.id, familyId: child.familyId, action: "CHILD_GROWTH_RECORD_SAVED", resourceType: "ChildGrowthRecord", resourceId: saved.id, metadata: { recordDate: date }, ipAddress: request.ip });
      return saved;
    });
    return { record: serializeGrowthRecord(record) };
  });

  app.get("/api/admin/growth-records/overview", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const { days, page, pageSize } = adminQuery.parse(request.query);
    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const from = addBusinessDays(today, -(days - 1));
    const [recordCount, milestoneCount, participatingChildren, families, familyTotal] = await Promise.all([
      prisma.childGrowthRecord.count({ where: { recordDate: { gte: from, lte: today } } }),
      prisma.childGrowthMilestone.count({ where: { happenedOn: { gte: from, lte: today } } }),
      prisma.childGrowthRecord.groupBy({ by: ["childId"], where: { recordDate: { gte: from, lte: today } } }).then((items) => items.length),
      prisma.family.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          children: {
            select: {
              id: true,
              nickname: true,
              birthDate: true,
              _count: { select: { growthRecords: { where: { recordDate: { gte: from, lte: today } } }, growthMilestones: true } },
            },
          },
        },
      }),
      prisma.family.count(),
    ]);
    const totalChildren = await prisma.childProfile.count({ where: { status: "ACTIVE" } });
    return {
      summary: { days, recordCount, milestoneCount, participatingChildren, totalChildren, participationRate: totalChildren ? participatingChildren / totalChildren : 0 },
      families: families.map((family) => ({ id: family.id, name: family.name, children: family.children.map((child) => ({ id: child.id, nickname: child.nickname, birthDateConfigured: Boolean(child.birthDate), recordCount: child._count.growthRecords, milestoneCount: child._count.growthMilestones })) })),
      total: familyTotal,
      page,
      pageSize,
    };
  });
}
