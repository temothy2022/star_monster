import { Prisma, type ChildGrowthRecord } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildGrowthDashboard,
  recommendedSleepMinutes,
  sleepDurationMinutes,
} from "../src/services/child-growth-record-service.js";

function record(
  input: Omit<Partial<ChildGrowthRecord>, "recordDate"> & { id: string; recordDate: string },
): ChildGrowthRecord {
  const timestamp = new Date("2026-08-20T00:00:00.000Z");
  return {
    id: input.id,
    childId: "child-1",
    recordDate: new Date(`${input.recordDate}T00:00:00.000Z`),
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    sleepStartMinute: input.sleepStartMinute ?? null,
    wakeMinute: input.wakeMinute ?? null,
    napMinutes: input.napMinutes ?? null,
    sleepQuality: input.sleepQuality ?? null,
    outdoorMinutes: input.outdoorMinutes ?? null,
    exerciseMinutes: input.exerciseMinutes ?? null,
    screenMinutes: input.screenMinutes ?? null,
    moodScore: input.moodScore ?? null,
    energyScore: input.energyScore ?? null,
    appetiteScore: input.appetiteScore ?? null,
    note: input.note ?? null,
    createdById: input.createdById ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

describe("child growth records", () => {
  it("calculates overnight sleep plus nap without timezone timestamps", () => {
    expect(sleepDurationMinutes({ sleepStartMinute: 21 * 60 + 30, wakeMinute: 7 * 60, napMinutes: 30 })).toBe(600);
  });

  it("uses age-specific sleep reference ranges", () => {
    expect(recommendedSleepMinutes(0)).toEqual({ min: 720, max: 960, source: "AASM" });
    expect(recommendedSleepMinutes(2)).toEqual({ min: 660, max: 840, source: "AASM" });
    expect(recommendedSleepMinutes(5)).toEqual({ min: 600, max: 780, source: "AASM" });
    expect(recommendedSleepMinutes(6)).toEqual({ min: 540, max: 720, source: "AASM" });
  });

  it("builds trends and conservative attention signals from repeated records", () => {
    const dashboard = buildGrowthDashboard({
      child: {
        id: "child-1",
        nickname: "测试孩子",
        birthDate: new Date("2020-08-01T00:00:00.000Z"),
        biologicalSex: "MALE",
      },
      now: new Date("2026-08-20T12:00:00.000Z"),
      records: [
        record({ id: "r1", recordDate: "2026-08-16", heightCm: new Prisma.Decimal(118), weightKg: new Prisma.Decimal(22), sleepStartMinute: 23 * 60, wakeMinute: 6 * 60 + 30, exerciseMinutes: 30 }),
        record({ id: "r2", recordDate: "2026-08-17", sleepStartMinute: 23 * 60 + 30, wakeMinute: 6 * 60 + 30, exerciseMinutes: 35 }),
        record({ id: "r3", recordDate: "2026-08-18", sleepStartMinute: 22 * 60 + 45, wakeMinute: 6 * 60 + 15, exerciseMinutes: 25 }),
        record({ id: "r4", recordDate: "2026-08-20", heightCm: new Prisma.Decimal(118.5), weightKg: new Prisma.Decimal(22.2), sleepStartMinute: 23 * 60 + 15, wakeMinute: 6 * 60 + 15, exerciseMinutes: 30 }),
      ],
    });

    expect(dashboard.latest?.bmi).toBe(15.8);
    expect(dashboard.summary.heightDeltaCm).toBe(0.5);
    expect(dashboard.summary.weightDeltaKg).toBe(0.2);
    expect(dashboard.attention.map((item) => item.title)).toContain("近期睡眠时长偏少");
    expect(dashboard.attention.map((item) => item.title)).toContain("活动时间可以逐步增加");
    expect(dashboard.methodology.disclaimer).toContain("不提供诊断");
  });
});
