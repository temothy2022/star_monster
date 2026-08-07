import { describe, expect, it } from "vitest";
import { buildChildLeaderboard } from "../src/domain/child-leaderboard.js";

describe("孩子得星排行榜", () => {
  const candidates = [
    { childId: "child-a", stars: 9, completedTasks: 4, petType: "DOUYA" as const },
    { childId: "child-b", stars: 12, completedTasks: 3, petType: "PAOPAO" as const },
    { childId: "child-c", stars: 9, completedTasks: 5, petType: null },
  ];

  it("按得星、任务数和稳定标识依次排序", () => {
    const result = buildChildLeaderboard(candidates, "child-a");
    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 2, 2]);
    expect(result.entries.map((entry) => entry.stars)).toEqual([12, 9, 9]);
    expect(result.entries[1]?.completedTasks).toBe(5);
    expect(result.self?.rank).toBe(2);
  });

  it("隐藏其他孩子真实名称并只把当前孩子标记为我", () => {
    const first = buildChildLeaderboard(candidates, "child-a");
    const second = buildChildLeaderboard(candidates, "child-a");
    expect(first.entries.find((entry) => entry.isSelf)?.displayName).toBe("我");
    expect(first.entries.find((entry) => !entry.isSelf)?.displayName).not.toBe("");
    expect(first.entries).toEqual(second.entries);
  });

  it("计算超过上一名所需的星星并限制为前十名", () => {
    const manyCandidates = Array.from({ length: 12 }, (_, index) => ({
      childId: `child-${index}`,
      stars: 20 - index,
      completedTasks: index,
      petType: null,
    }));
    const result = buildChildLeaderboard(manyCandidates, "child-11");
    expect(result.entries).toHaveLength(10);
    expect(result.self).toMatchObject({
      rank: 12,
      inTopTen: false,
      starsToNextRank: 1,
      totalParticipants: 12,
    });
  });

  it("所有孩子尚未得星时并列第一，不制造没有依据的落后感", () => {
    const result = buildChildLeaderboard(
      candidates.map((candidate) => ({ ...candidate, stars: 0, completedTasks: 0 })),
      "child-a",
    );
    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 1, 1]);
    expect(result.self?.starsToNextRank).toBe(0);
  });
});
