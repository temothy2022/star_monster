import { describe, expect, it } from "vitest";
import { weeklyGrowthResponseSchema } from "../src/ai/schemas.js";
import { growthAnalyticsRange } from "../src/services/growth-analytics-service.js";
import { previousCompletedGrowthWeek } from "../src/services/weekly-growth-report-service.js";

describe("成长统计时间范围", () => {
  it("按上海业务日期计算最近 30 天", () => {
    const range = growthAnalyticsRange(
      30,
      new Date("2026-08-07T04:00:00.000Z"),
      "Asia/Shanghai",
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-07-09");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-08-07");
  });

  it("周报始终分析上一完整的周一至周日", () => {
    const period = previousCompletedGrowthWeek(
      new Date("2026-08-07T04:00:00.000Z"),
      "Asia/Shanghai",
    );
    expect(period.weekStart.toISOString().slice(0, 10)).toBe("2026-07-27");
    expect(period.weekEnd.toISOString().slice(0, 10)).toBe("2026-08-02");
  });
});

describe("DeepSeek 成长周报结构", () => {
  it("接受简洁且可执行的结构化分析", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "本周任务完成较稳定，数学练习仍有提升空间。",
      strengths: ["生活习惯任务安排 5 天，完成 5 天。"],
      focus: "数学任务安排 4 天，只完成 2 天。",
      suggestions: ["下周把数学练习缩短到 5 分钟并固定在晚饭前。"],
    });
    expect(result.success).toBe(true);
  });

  it("拒绝超过两条的泛化建议", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "本周数据有限。",
      strengths: [],
      focus: null,
      suggestions: ["建议一", "建议二", "建议三"],
    });
    expect(result.success).toBe(false);
  });
});
