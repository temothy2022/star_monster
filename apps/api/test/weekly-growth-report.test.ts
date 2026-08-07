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
      progressHighlights: [
        { title: "生活习惯稳定", evidence: "安排 5 天，完成 5 天。" },
      ],
      focusAreas: [
        {
          title: "数学任务完成率偏低",
          evidence: "安排 4 天，完成 2 天。",
          suggestion: "下周先把每次练习缩短到 5 分钟并固定在晚饭前。",
        },
      ],
      consumptionInsight: {
        summary: "本周主要兑换活动体验。",
        preferredCategories: ["活动体验"],
      },
      nextWeekSuggestions: [
        {
          title: "缩短数学练习",
          action: "每次只做一组题，完成后立即结束。",
          reason: "降低开始任务的阻力。",
        },
      ],
      parentMessage: "保持稳定节奏，先观察一周再调整奖励。",
      disclaimer: "本周报告只基于平台内数据。",
    });
    expect(result.success).toBe(true);
  });

  it("拒绝超过三条的泛化建议", () => {
    const item = { title: "建议", action: "执行动作", reason: "数据依据" };
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "本周数据有限。",
      progressHighlights: [],
      focusAreas: [],
      consumptionInsight: { summary: "暂无消费。", preferredCategories: [] },
      nextWeekSuggestions: [item, item, item, item],
      parentMessage: "继续观察。",
      disclaimer: "仅供参考。",
    });
    expect(result.success).toBe(false);
  });
});
