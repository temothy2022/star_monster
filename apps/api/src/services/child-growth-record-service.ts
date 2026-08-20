import type {
  ChildBiologicalSex,
  ChildGrowthRecord,
  ChildProfile,
} from "@prisma/client";

export type GrowthRecordSnapshot = ReturnType<typeof serializeGrowthRecord>;

export function serializeGrowthRecord(record: ChildGrowthRecord) {
  const heightCm = record.heightCm === null ? null : Number(record.heightCm);
  const weightKg = record.weightKg === null ? null : Number(record.weightKg);
  const bmi = heightCm && weightKg
    ? Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1))
    : null;
  return {
    id: record.id,
    recordDate: record.recordDate.toISOString().slice(0, 10),
    heightCm,
    weightKg,
    bmi,
    sleepStartMinute: record.sleepStartMinute,
    wakeMinute: record.wakeMinute,
    napMinutes: record.napMinutes,
    sleepQuality: record.sleepQuality,
    outdoorMinutes: record.outdoorMinutes,
    exerciseMinutes: record.exerciseMinutes,
    screenMinutes: record.screenMinutes,
    moodScore: record.moodScore,
    energyScore: record.energyScore,
    appetiteScore: record.appetiteScore,
    note: record.note,
    sleepMinutes: sleepDurationMinutes(record),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function sleepDurationMinutes(
  record: Pick<ChildGrowthRecord, "sleepStartMinute" | "wakeMinute" | "napMinutes">,
) {
  if (record.sleepStartMinute === null || record.wakeMinute === null) return null;
  const overnight = record.wakeMinute <= record.sleepStartMinute
    ? record.wakeMinute + 24 * 60 - record.sleepStartMinute
    : record.wakeMinute - record.sleepStartMinute;
  return overnight + (record.napMinutes ?? 0);
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function ageYearsOn(birthDate: Date | null, date: Date) {
  if (!birthDate) return null;
  let age = date.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday = date.getUTCMonth() < birthDate.getUTCMonth()
    || (date.getUTCMonth() === birthDate.getUTCMonth() && date.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function recommendedSleepMinutes(ageYears: number | null) {
  if (ageYears === null) return null;
  if (ageYears < 1) return { min: 12 * 60, max: 16 * 60, source: "AASM" as const };
  if (ageYears <= 2) return { min: 11 * 60, max: 14 * 60, source: "AASM" as const };
  if (ageYears <= 5) return { min: 10 * 60, max: 13 * 60, source: "AASM" as const };
  if (ageYears <= 12) return { min: 9 * 60, max: 12 * 60, source: "AASM" as const };
  if (ageYears <= 18) return { min: 8 * 60, max: 10 * 60, source: "AASM" as const };
  return null;
}

function latestMeasurement(records: GrowthRecordSnapshot[]) {
  return [...records].reverse().find((record) => record.heightCm !== null || record.weightKg !== null) ?? null;
}

function trendDelta(
  records: GrowthRecordSnapshot[],
  key: "heightCm" | "weightKg",
) {
  const values = records.filter((record) => record[key] !== null);
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return Number(((last[key] ?? 0) - (first[key] ?? 0)).toFixed(key === "heightCm" ? 1 : 2));
}

export function buildGrowthDashboard(input: {
  child: Pick<ChildProfile, "id" | "nickname" | "birthDate" | "biologicalSex">;
  records: ChildGrowthRecord[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const records = input.records.map(serializeGrowthRecord).sort((left, right) => left.recordDate.localeCompare(right.recordDate));
  const ageYears = ageYearsOn(input.child.birthDate, now);
  const sleepRange = recommendedSleepMinutes(ageYears);
  const latest = latestMeasurement(records);
  const recentSeven = records.slice(-7);
  const sleepValues = recentSeven.map((record) => record.sleepMinutes);
  const activityValues = recentSeven.map((record) => record.exerciseMinutes);
  const outdoorValues = recentSeven.map((record) => record.outdoorMinutes);
  const sleepAverage = average(sleepValues);
  const exerciseAverage = average(activityValues);
  const outdoorAverage = average(outdoorValues);
  const sleepSamples = sleepValues.filter((value): value is number => value !== null).length;
  const exerciseSamples = activityValues.filter((value): value is number => value !== null).length;
  const bedtimeValues = recentSeven
    .map((record) => record.sleepStartMinute)
    .filter((value): value is number => value !== null)
    .map((value) => value < 12 * 60 ? value + 24 * 60 : value);
  const bedtimeSpread = bedtimeValues.length >= 2
    ? Math.max(...bedtimeValues) - Math.min(...bedtimeValues)
    : null;

  const attention: Array<{ level: "info" | "watch"; title: string; detail: string }> = [];
  if (!input.child.birthDate) {
    attention.push({ level: "info", title: "补充出生日期", detail: "补充后才能按年龄显示睡眠参考范围。" });
  }
  if (records.filter((record) => record.heightCm !== null || record.weightKg !== null).length < 2) {
    attention.push({ level: "info", title: "继续积累身体测量", detail: "至少两次、使用相同测量方式，才能观察可靠趋势。" });
  }
  if (sleepRange && sleepSamples >= 3 && sleepAverage !== null && sleepAverage < sleepRange.min) {
    attention.push({ level: "watch", title: "近期睡眠时长偏少", detail: `近 7 次记录平均 ${sleepAverage} 分钟，低于该年龄参考范围。建议先连续复测一周；若持续存在并伴随白天精神不佳，可咨询专业人员。` });
  }
  if (bedtimeSpread !== null && bedtimeSpread > 90) {
    attention.push({ level: "watch", title: "入睡时间波动较大", detail: `近 7 次记录的入睡时间相差约 ${bedtimeSpread} 分钟，可优先固定睡前流程。` });
  }
  if (ageYears !== null && ageYears >= 5 && exerciseSamples >= 3 && exerciseAverage !== null && exerciseAverage < 60) {
    attention.push({ level: "watch", title: "活动时间可以逐步增加", detail: "近 7 次记录的日均运动不足 60 分钟。可以从户外游戏、步行和球类活动中逐步增加。" });
  }
  if (!attention.length) {
    attention.push({ level: "info", title: "记录趋势稳定", detail: "目前没有明显的生活节律关注信号，继续保持规律记录即可。" });
  }

  return {
    profile: {
      childId: input.child.id,
      nickname: input.child.nickname,
      birthDate: input.child.birthDate?.toISOString().slice(0, 10) ?? null,
      biologicalSex: input.child.biologicalSex as ChildBiologicalSex | null,
      ageYears,
    },
    latest,
    summary: {
      recordCount: records.length,
      recentDaysRecorded: recentSeven.length,
      averageSleepMinutes: sleepAverage,
      recommendedSleepMinutes: sleepRange,
      averageExerciseMinutes: exerciseAverage,
      averageOutdoorMinutes: outdoorAverage,
      heightDeltaCm: trendDelta(records, "heightCm"),
      weightDeltaKg: trendDelta(records, "weightKg"),
    },
    attention,
    records,
    methodology: {
      bmi: "BMI 仅用于连续趋势观察；儿童 BMI 需结合年龄和生理性别的生长曲线，由专业人员综合判断。",
      growth: "单次测量不能判断生长模式，应使用一致方法进行多次准确测量。",
      sleep: "睡眠参考范围采用 AASM 儿童睡眠时长建议。",
      activity: "5-17 岁活动参考采用 WHO 每天至少 60 分钟中高强度活动建议。",
      disclaimer: "本页面用于家庭记录和筛查提示，不提供诊断或治疗建议。",
    },
  };
}
