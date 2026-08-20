import { describe, expect, it } from "vitest";
import { recentAverageTaskSeconds } from "../src/domain/task-duration.js";

describe("任务最近平均用时", () => {
  it("只使用最近十次有效完成记录并按分钟取整", () => {
    expect(
      recentAverageTaskSeconds([
        120,
        180,
        240,
        300,
        360,
        420,
        480,
        540,
        600,
        660,
        3_600,
      ]),
    ).toBe(420);
  });

  it("忽略异常的瞬时完成和超长记录", () => {
    expect(recentAverageTaskSeconds([1, 30, 300, 20_000])).toBe(180);
  });

  it("不足一分钟时使用一分钟作为建议下限", () => {
    expect(recentAverageTaskSeconds([20, 30, 40])).toBe(60);
  });

  it("没有有效记录时不覆盖家长原有配置", () => {
    expect(recentAverageTaskSeconds([0, 5, 20_000])).toBeNull();
  });
});
