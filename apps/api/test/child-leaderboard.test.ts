import { describe, expect, it } from "vitest";
import { buildMotivationalLeaderboard } from "../src/domain/child-leaderboard.js";
import { leaderboardEffectiveMinute } from "../src/services/footprint-service.js";

const baseInput = {
  childId: "child-a",
  nickname: "了了",
  avatarUrl: null,
  stars: 0,
  completedTasks: 0,
  petType: "DOUYA" as const,
  goalStars: 20,
  maxAvailableStars: 40,
  completionRate: 0,
  dailyGoalStars: 20,
  habitualDailyStars: 24,
  seed: "2026-08-10",
  scoreDays: [{
    seed: "2026-08-10",
    elapsedMinutes: 20 * 60,
    effectiveMinutes: 20 * 60,
    childStars: 0,
    maxAvailableStars: 40,
  }],
};

function competitors(result: ReturnType<typeof buildMotivationalLeaderboard>) {
  return result.entries.filter((entry) => !entry.isSelf);
}

describe("孩子激励排行榜", () => {
  it("每日榜人数在十三到十六人之间且虚拟头像身份完整", () => {
    const result = buildMotivationalLeaderboard(baseInput);
    const rivals = competitors(result);
    expect(result.entries.length).toBeGreaterThanOrEqual(13);
    expect(result.entries.length).toBeLessThanOrEqual(16);
    expect(rivals.every((entry) => entry.competitorId && entry.avatarKey?.startsWith("avatar-"))).toBe(true);
    expect(new Set(rivals.map((entry) => entry.competitorId)).size).toBe(rivals.length);
    expect(result.entries.find((entry) => entry.isSelf)).toMatchObject({
      displayName: "了了",
      flagKey: "CHINA",
      avatarKey: null,
    });
  });

  it("同一天名单和分数稳定，第二天轮换，一周覆盖二十人以上", () => {
    const today = buildMotivationalLeaderboard(baseInput);
    const repeated = buildMotivationalLeaderboard(baseInput);
    const dailyResults = Array.from({ length: 7 }, (_, index) =>
      buildMotivationalLeaderboard({
        ...baseInput,
        seed: `2026-08-${String(10 + index).padStart(2, "0")}`,
        scoreDays: [{
          ...baseInput.scoreDays[0],
          seed: `2026-08-${String(10 + index).padStart(2, "0")}`,
        }],
      }),
    );
    const ids = (result: typeof today) => competitors(result).map((entry) => entry.competitorId).sort();
    expect(repeated).toEqual(today);
    expect(ids(dailyResults[1]!)).not.toEqual(ids(today));
    expect(new Set(dailyResults.flatMap((result) => ids(result))).size).toBeGreaterThanOrEqual(20);
  });

  it("周榜逐日累加每日参赛者的成绩", () => {
    const days = Array.from({ length: 5 }, (_, index) => ({
      seed: `2026-08-${String(3 + index).padStart(2, "0")}`,
      elapsedMinutes: 24 * 60,
      effectiveMinutes: 24 * 60,
      childStars: 12,
      maxAvailableStars: 30,
    }));
    const weekly = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 60,
      goalStars: 100,
      maxAvailableStars: 150,
      completionRate: 1,
      scoreDays: days,
    });
    const expected = new Map<string, number>();
    for (const day of days) {
      const daily = buildMotivationalLeaderboard({
        ...baseInput,
        stars: day.childStars,
        completionRate: 1,
        maxAvailableStars: day.maxAvailableStars,
        scoreDays: [day],
      });
      for (const entry of competitors(daily)) {
        expected.set(entry.competitorId!, (expected.get(entry.competitorId!) ?? 0) + entry.stars);
      }
    }
    expect(competitors(weekly).length).toBeGreaterThanOrEqual(20);
    expect(
      competitors(weekly).every((entry) => entry.stars === expected.get(entry.competitorId!)),
    ).toBe(true);
  });

  it("对手分数随有效时间单调增加且刷新稳定", () => {
    const minutes = [0, 8 * 60, 13 * 60, 18 * 60, 23 * 60 + 59];
    const snapshots = minutes.map((effectiveMinutes) =>
      buildMotivationalLeaderboard({
        ...baseInput,
        scoreDays: [{ ...baseInput.scoreDays[0], effectiveMinutes }],
      }),
    );
    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = new Map(competitors(snapshots[index - 1]!).map((entry) => [entry.competitorId, entry.stars]));
      expect(competitors(snapshots[index]!).every(
        (entry) => entry.stars >= (previous.get(entry.competitorId) ?? 0),
      )).toBe(true);
    }
    expect(snapshots[2]).toEqual(buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [{ ...baseInput.scoreDays[0], effectiveMinutes: 13 * 60 }],
    }));
  });

  it("速度锚点保证修改瞬间不跳分，之后只改变新增速度", () => {
    const before = {
      competitorGrowthPercent: 100,
      dailyCompetitorStarDelta: 0,
      dailyAdjustmentDate: null,
      speedAnchorDate: null,
      speedAnchorMinute: 0,
      speedAnchorEffectiveMinute: 0,
    };
    const effectiveAtChange = leaderboardEffectiveMinute(before, "2026-08-10", 600);
    const faster = {
      ...before,
      competitorGrowthPercent: 180,
      speedAnchorDate: "2026-08-10",
      speedAnchorMinute: 600,
      speedAnchorEffectiveMinute: effectiveAtChange,
    };
    const slower = { ...faster, competitorGrowthPercent: 40 };
    expect(leaderboardEffectiveMinute(faster, "2026-08-10", 600)).toBe(effectiveAtChange);
    expect(leaderboardEffectiveMinute(slower, "2026-08-10", 600)).toBe(effectiveAtChange);
    expect(leaderboardEffectiveMinute(faster, "2026-08-10", 660)).toBeGreaterThan(
      leaderboardEffectiveMinute(slower, "2026-08-10", 660),
    );
  });

  it("孩子大比分领先时有四到六名对手追到接近区间", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 40,
      completedTasks: 16,
      completionRate: 0.9,
      scoreDays: [{ ...baseInput.scoreDays[0], childStars: 40 }],
    });
    const closeRivals = competitors(result).filter((entry) => entry.stars >= 36);
    expect(closeRivals.length).toBeGreaterThanOrEqual(4);
    expect(closeRivals.length).toBeLessThanOrEqual(6);
    expect(Math.max(...competitors(result).map((entry) => entry.stars))).toBe(40);
  });

  it("追赶和人工修正都不能超过孩子理论可获得总量", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 25,
      maxAvailableStars: 25,
      competitorStarDelta: 50,
      scoreDays: [{
        ...baseInput.scoreDays[0],
        childStars: 25,
        maxAvailableStars: 25,
      }],
    });
    expect(competitors(result).every((entry) => entry.stars <= 25)).toBe(true);
  });

  it("低于三颗且落后全部对手时显示未上榜", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 2,
      scoreDays: [{ ...baseInput.scoreDays[0], childStars: 2 }],
    });
    expect(result.self.rank).toBeNull();
    expect(result.self.inTopTen).toBe(false);
    expect(result.entries.find((entry) => entry.isSelf)?.rank).toBeNull();
  });

  it("自己的上传头像原样进入排行榜响应", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      avatarUrl: "/poem-assets/v1/uploads/child-avatar.webp",
    });
    expect(result.entries.find((entry) => entry.isSelf)?.avatarUrl).toBe(
      "/poem-assets/v1/uploads/child-avatar.webp",
    );
  });

  it("真实孩子按实际得星加入榜单且不伪装成虚拟伙伴", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 8,
      completedTasks: 3,
      realCompetitors: [{
        childId: "child-b",
        nickname: "雅雅",
        avatarUrl: "/uploads/yaya.webp",
        petType: "MILU",
        stars: 11,
        completedTasks: 4,
      }],
    });
    expect(result.entries.find((entry) => entry.competitorId === "real:child-b")).toMatchObject({
      displayName: "雅雅",
      stars: 11,
      completedTasks: 4,
      avatarUrl: "/uploads/yaya.webp",
      avatarKey: null,
      participantType: "REAL",
      isSelf: false,
    });
  });

  it("新一天零点加入新参赛者但不会改写既有周榜成绩", () => {
    const firstDay = {
      seed: "2026-08-03",
      elapsedMinutes: 24 * 60,
      effectiveMinutes: 24 * 60,
      childStars: 10,
      maxAvailableStars: 20,
    };
    const first = buildMotivationalLeaderboard({ ...baseInput, stars: 10, scoreDays: [firstDay] });
    const midnight = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 10,
      goalStars: 40,
      maxAvailableStars: 40,
      scoreDays: [
        firstDay,
        { seed: "2026-08-04", elapsedMinutes: 0, effectiveMinutes: 0, childStars: 0, maxAvailableStars: 20 },
      ],
    });
    const midnightById = new Map(competitors(midnight).map((entry) => [entry.competitorId, entry.stars]));
    expect(competitors(first).every(
      (entry) => midnightById.get(entry.competitorId) === entry.stars,
    )).toBe(true);
  });
});
