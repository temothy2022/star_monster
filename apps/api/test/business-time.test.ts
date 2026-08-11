import { describe, expect, it } from "vitest";
import {
  businessDateAt,
  businessDateKey,
  businessDateStartInstant,
  businessMinuteOfDayAt,
} from "../src/lib/time.js";

describe("业务时区", () => {
  it("按上海时间在零点切换日期并重置当日分钟", () => {
    const beforeMidnight = new Date("2026-08-07T15:59:00.000Z");
    const midnight = new Date("2026-08-07T16:00:00.000Z");

    expect(
      businessDateKey(businessDateAt(beforeMidnight, "Asia/Shanghai")),
    ).toBe("2026-08-07");
    expect(businessMinuteOfDayAt(beforeMidnight, "Asia/Shanghai")).toBe(1439);
    expect(
      businessDateKey(businessDateAt(midnight, "Asia/Shanghai")),
    ).toBe("2026-08-08");
    expect(businessMinuteOfDayAt(midnight, "Asia/Shanghai")).toBe(0);
  });

  it("把业务日期转换为上海时区真正的零点时刻", () => {
    expect(businessDateStartInstant(
      new Date("2026-08-11T00:00:00.000Z"),
      "Asia/Shanghai",
    ).toISOString()).toBe("2026-08-10T16:00:00.000Z");
  });
});
