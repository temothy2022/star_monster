import { describe, expect, it } from "vitest";
import { buildMotivationalLeaderboard } from "../src/domain/child-leaderboard.js";

const baseInput = {
  childId: "child-a",
  stars: 0,
  completedTasks: 0,
  petType: "DOUYA" as const,
  goalStars: 12,
  completionRate: 0,
  seed: "2026-08-07",
};

describe("孩子激励排行榜", () => {
  it("始终生成完整的十二人榜单并固定当前孩子为中国国旗", () => {
    const result = buildMotivationalLeaderboard(baseInput);
    const self = result.entries.find((entry) => entry.isSelf);

    expect(result.entries).toHaveLength(12);
    expect(result.entries.map((entry) => entry.rank)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(self).toMatchObject({ displayName: "我", flagKey: "CHINA" });
    expect(new Set(result.entries.filter((entry) => !entry.isSelf).map((entry) => entry.petType)).size).toBe(5);
  });

  it("尚未获得星星时位于榜尾且其他名次不会全部显示零星", () => {
    const result = buildMotivationalLeaderboard(baseInput);

    expect(result.self.rank).toBe(12);
    expect(result.entries[0]?.stars).toBeGreaterThanOrEqual(baseInput.goalStars);
    expect(
      result.entries.filter((entry) => !entry.isSelf).every((entry) => entry.stars > 0),
    ).toBe(true);
  });

  it("随着每日目标进度提升进入不同排名阶梯", () => {
    const quarter = buildMotivationalLeaderboard({ ...baseInput, stars: 3 });
    const half = buildMotivationalLeaderboard({ ...baseInput, stars: 6 });
    const almost = buildMotivationalLeaderboard({ ...baseInput, stars: 11 });

    expect(quarter.self.rank).toBe(10);
    expect(half.self.rank).toBe(8);
    expect(almost.self.rank).toBe(4);
  });

  it("达到目标后大多数日期获得第一名且同一天结果稳定", () => {
    const ranks = Array.from({ length: 100 }, (_, index) =>
      buildMotivationalLeaderboard({
        ...baseInput,
        stars: 12,
        seed: `2026-08-${String(index + 1).padStart(2, "0")}`,
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

  it("基本完成全部任务或明显超额时固定为第一名", () => {
    const completed = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 7,
      completedTasks: 5,
      completionRate: 0.9,
    });
    const exceeded = buildMotivationalLeaderboard({
      ...baseInput,
      stars: 17,
    });

    expect(completed.self.rank).toBe(1);
    expect(exceeded.self.rank).toBe(1);
  });

  it("身份随周期变化但同一周期保持一致", () => {
    const today = buildMotivationalLeaderboard(baseInput);
    const tomorrow = buildMotivationalLeaderboard({
      ...baseInput,
      seed: "2026-08-08",
    });

    expect(today.entries).not.toEqual(tomorrow.entries);
    expect(today.entries).toEqual(buildMotivationalLeaderboard(baseInput).entries);
  });
});
