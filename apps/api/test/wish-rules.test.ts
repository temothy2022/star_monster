import { describe, expect, it } from "vitest";
import {
  nextRecurringWishDate,
  oneTimeWishHiddenAt,
  recurrenceDays,
} from "../src/domain/wish-rules.js";

describe("星愿循环周期", () => {
  it("支持每天、每周和每 N 天", () => {
    expect(recurrenceDays("DAILY", null)).toBe(1);
    expect(recurrenceDays("WEEKLY", null)).toBe(7);
    expect(recurrenceDays("INTERVAL", 3)).toBe(3);
  });

  it("从兑换完成所在业务日期开始计算下一周期", () => {
    expect(
      nextRecurringWishDate(
        new Date("2026-07-25T00:00:00.000Z"),
        "INTERVAL",
        3,
      ).toISOString(),
    ).toBe("2026-07-28T00:00:00.000Z");
  });

  it("每周循环在下一个周一进入新周期", () => {
    expect(
      nextRecurringWishDate(
        new Date("2026-07-25T00:00:00.000Z"),
        "WEEKLY",
        null,
      ).toISOString(),
    ).toBe("2026-07-27T00:00:00.000Z");
    expect(
      nextRecurringWishDate(
        new Date("2026-07-27T00:00:00.000Z"),
        "WEEKLY",
        null,
      ).toISOString(),
    ).toBe("2026-08-03T00:00:00.000Z");
  });
});

describe("一次性星愿前台保留时间", () => {
  it("兑换完成七天后隐藏", () => {
    expect(
      oneTimeWishHiddenAt(
        new Date("2026-07-25T08:30:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-01T08:30:00.000Z");
  });
});
