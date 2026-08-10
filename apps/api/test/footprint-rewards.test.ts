import { describe, expect, it } from "vitest";
import { buildFootprintRewardDetails } from "../src/services/footprint-service.js";

describe("footprint reward details", () => {
  it("shows daily-goal, planet, and pet red packet bonuses on the day they were earned", () => {
    const rewards = buildFootprintRewardDetails(
      [
        {
          id: "goal-ledger",
          type: "DAILY_GOAL_BONUS",
          amount: 3,
          referenceId: "attempt-1",
          createdAt: new Date("2026-08-10T02:00:00.000Z"),
        },
        {
          id: "planet-ledger",
          type: "PLANET_BONUS",
          amount: 8,
          referenceId: "planet-progress-1",
          createdAt: new Date("2026-08-10T03:00:00.000Z"),
        },
        {
          id: "packet-ledger",
          type: "PET_RED_PACKET_REWARD",
          amount: 5,
          referenceId: "packet-1",
          createdAt: new Date("2026-08-10T04:00:00.000Z"),
        },
      ],
      [{ id: "planet-progress-1", planet: "VENUS" }],
      "2026-08-10",
      "Asia/Shanghai",
    );

    expect(rewards).toEqual([
      expect.objectContaining({
        rewardId: "goal-ledger",
        title: "完成每日目标",
        totalStars: 3,
        planet: null,
      }),
      expect.objectContaining({
        rewardId: "planet-ledger",
        title: "点亮金星",
        totalStars: 8,
        planet: "VENUS",
      }),
      expect.objectContaining({
        rewardId: "packet-ledger",
        title: "打开星宠红包",
        totalStars: 5,
        planet: null,
      }),
    ]);
  });

  it("does not leak another day's or non-positive rewards into the details", () => {
    const rewards = buildFootprintRewardDetails(
      [
        {
          id: "yesterday",
          type: "DAILY_GOAL_BONUS",
          amount: 3,
          referenceId: null,
          createdAt: new Date("2026-08-09T02:00:00.000Z"),
        },
        {
          id: "zero",
          type: "PLANET_BONUS",
          amount: 0,
          referenceId: null,
          createdAt: new Date("2026-08-10T02:00:00.000Z"),
        },
      ],
      [],
      "2026-08-10",
      "Asia/Shanghai",
    );

    expect(rewards).toEqual([]);
  });
});
