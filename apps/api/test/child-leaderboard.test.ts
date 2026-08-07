import { describe, expect, it } from "vitest";
import { buildMotivationalLeaderboard } from "../src/domain/child-leaderboard.js";

const baseInput = {
  childId: "child-a",
  nickname: "了了",
  stars: 0,
  completedTasks: 0,
  petType: "DOUYA" as const,
  goalStars: 12,
  completionRate: 0,
  dailyGoalStars: 12,
  seed: "2026-08-03",
  scoreDays: [{ seed: "2026-08-07", elapsedMinutes: 24 * 60 }],
};

describe("孩子激励排行榜", () => {
  it("始终生成完整的十二人榜单并固定当前孩子为中国国旗", () => {
    const result = buildMotivationalLeaderboard(baseInput);
    const self = result.entries.find((entry) => entry.isSelf);

    expect(result.entries).toHaveLength(12);
    expect(result.entries.map((entry) => entry.rank)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(self).toMatchObject({ displayName: "了了", flagKey: "CHINA" });
    expect(new Set(result.entries.filter((entry) => !entry.isSelf).map((entry) => entry.petType)).size).toBe(5);
    expect(
      result.entries.filter(
        (entry) => !entry.isSelf && entry.flagKey === "CHINA",
      ),
    ).toHaveLength(6);
    expect(
      result.entries
        .filter((entry) => !entry.isSelf)
        .every((entry) => /^[A-Z][a-z]{2}$/.test(entry.displayName)),
    ).toBe(true);
  });

  it("上海时间零点从零开始并让尚未得星的孩子位于榜尾", () => {
    const result = buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [{ seed: "2026-08-08", elapsedMinutes: 0 }],
    });

    expect(result.self.rank).toBe(12);
    expect(result.entries.every((entry) => entry.stars === 0)).toBe(true);
  });

  it("虚拟小朋友随着一天时间推进只增加星星且刷新结果稳定", () => {
    const minutes = [0, 8 * 60, 13 * 60, 18 * 60, 23 * 60 + 59];
    const snapshots = minutes.map((elapsedMinutes) =>
      buildMotivationalLeaderboard({
        ...baseInput,
        scoreDays: [{ seed: "2026-08-07", elapsedMinutes }],
      }),
    );

    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = new Map(
        snapshots[index - 1].entries.map((entry) => [entry.displayName, entry.stars]),
      );
      expect(
        snapshots[index].entries.every(
          (entry) => entry.stars >= (previous.get(entry.displayName) ?? 0),
        ),
      ).toBe(true);
    }
    expect(snapshots.at(-1)?.entries.some((entry) => !entry.isSelf && entry.stars > 0)).toBe(true);
    expect(snapshots[2]).toEqual(
      buildMotivationalLeaderboard({
        ...baseInput,
        scoreDays: [{ seed: "2026-08-07", elapsedMinutes: 13 * 60 }],
      }),
    );
  });

  it("家长调整今日对手星星后仍保留真实得星的递增过程", () => {
    const morning = buildMotivationalLeaderboard({
      ...baseInput,
      competitorStarDelta: 4,
      scoreDays: [{ seed: "2026-08-07", elapsedMinutes: 8 * 60 }],
    });
    const evening = buildMotivationalLeaderboard({
      ...baseInput,
      competitorStarDelta: 4,
      scoreDays: [{ seed: "2026-08-07", elapsedMinutes: 21 * 60 }],
    });
    const morningStars = new Map(
      morning.entries.map((entry) => [entry.displayName, entry.stars]),
    );

    expect(morning.self.stars).toBe(0);
    expect(
      evening.entries
        .filter((entry) => !entry.isSelf)
        .every((entry) => entry.stars >= (morningStars.get(entry.displayName) ?? 0)),
    ).toBe(true);
  });

  it("对手增长速度可调且默认百分比保持原结果", () => {
    const defaults = buildMotivationalLeaderboard(baseInput);
    const explicitDefaults = buildMotivationalLeaderboard({
      ...baseInput,
      competitorGrowthPercent: 100,
      competitorStarDelta: 0,
    });
    const slower = buildMotivationalLeaderboard({
      ...baseInput,
      competitorGrowthPercent: 50,
    });
    const opponentStars = (result: typeof defaults) =>
      result.entries
        .filter((entry) => !entry.isSelf)
        .reduce((sum, entry) => sum + entry.stars, 0);

    expect(explicitDefaults).toEqual(defaults);
    expect(opponentStars(slower)).toBeLessThan(opponentStars(defaults));
  });

  it("孩子获得更多星星后排名自然提升", () => {
    const quarter = buildMotivationalLeaderboard({ ...baseInput, stars: 3 });
    const half = buildMotivationalLeaderboard({ ...baseInput, stars: 6 });
    const goal = buildMotivationalLeaderboard({ ...baseInput, stars: 12 });

    expect(quarter.self.rank).toBeGreaterThanOrEqual(half.self.rank);
    expect(half.self.rank).toBeGreaterThan(goal.self.rank);
    expect(goal.self.rank).toBeLessThanOrEqual(2);
  });

  it("达到目标后大多数日期获得第一名且同一天结果稳定", () => {
    const ranks = Array.from({ length: 100 }, (_, index) =>
      buildMotivationalLeaderboard({
        ...baseInput,
        stars: 12,
        scoreDays: [{
          seed: `day-${String(index + 1).padStart(3, "0")}`,
          elapsedMinutes: 24 * 60,
        }],
      }).self.rank,
    );
    const first = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 12,
    });
    const second = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 12,
    });

    expect(ranks.filter((rank) => rank === 1).length).toBeGreaterThanOrEqual(70);
    expect(ranks.every((rank) => rank >= 1 && rank <= 3)).toBe(true);
    expect(first).toEqual(second);
  });

  it("明显超额时固定为第一名", () => {
    const exceeded = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 17,
    });

    expect(exceeded.self.rank).toBe(1);
  });

  it("虚拟身份一周内保持一致，到新一周再轮换", () => {
    const today = buildMotivationalLeaderboard(baseInput);
    const tomorrow = buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [{ seed: "2026-08-08", elapsedMinutes: 24 * 60 }],
    });
    const nextWeek = buildMotivationalLeaderboard({
      ...baseInput,
      seed: "2026-08-10",
      scoreDays: [{ seed: "2026-08-10", elapsedMinutes: 24 * 60 }],
    });
    const identities = (result: typeof today) =>
      result.entries
        .filter((entry) => !entry.isSelf)
        .map((entry) => `${entry.displayName}:${entry.petType}:${entry.flagKey}`)
        .sort();

    expect(identities(today)).toEqual(identities(tomorrow));
    expect(identities(today)).not.toEqual(identities(nextWeek));
    expect(today.entries).toEqual(buildMotivationalLeaderboard(baseInput).entries);
  });

  it("周榜累计完整日期并在当天零点保留此前成绩", () => {
    const firstDay = buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [{ seed: "2026-08-03", elapsedMinutes: 24 * 60 }],
    });
    const nextMidnight = buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [
        { seed: "2026-08-03", elapsedMinutes: 24 * 60 },
        { seed: "2026-08-04", elapsedMinutes: 0 },
      ],
    });
    const nextNight = buildMotivationalLeaderboard({
      ...baseInput,
      scoreDays: [
        { seed: "2026-08-03", elapsedMinutes: 24 * 60 },
        { seed: "2026-08-04", elapsedMinutes: 24 * 60 },
      ],
    });
    const starsByName = (result: typeof firstDay) =>
      new Map(result.entries.map((entry) => [entry.displayName, entry.stars]));
    const firstStars = starsByName(firstDay);
    const midnightStars = starsByName(nextMidnight);
    const nightStars = starsByName(nextNight);

    expect(midnightStars).toEqual(firstStars);
    expect(
      [...nightStars].some(
        ([name, stars]) => name !== "了了" && stars > (midnightStars.get(name) ?? 0),
      ),
    ).toBe(true);
  });
});
