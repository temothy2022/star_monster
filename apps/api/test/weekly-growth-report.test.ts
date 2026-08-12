import { describe, expect, it } from "vitest";
import { weeklyGrowthResponseSchema } from "../src/ai/schemas.js";
import { growthAnalyticsRange } from "../src/services/growth-analytics-service.js";
import {
  previousCompletedGrowthWeek,
  previousCompletedGrowthWindow,
} from "../src/services/weekly-growth-report-service.js";

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

  it("任务诊断观察最近四个完整周", () => {
    const period = previousCompletedGrowthWindow(
      new Date("2026-08-07T04:00:00.000Z"),
      "Asia/Shanghai",
    );
    expect(period.from.toISOString().slice(0, 10)).toBe("2026-07-06");
    expect(period.to.toISOString().slice(0, 10)).toBe("2026-08-02");
    expect(period.days).toBe(28);
  });
});

describe("DeepSeek 成长周报结构", () => {
  it("接受简洁且可执行的结构化分析", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "生活习惯稳定，数学专项适合改为间隔练习。",
      dataQuality: "SUFFICIENT",
      doingWell: [{ templateId: "habit", title: "刷牙", evidence: "完成 27/28 个安排日", nextStep: "保持每天安排" }],
      needsAdjustment: [{ templateId: "math", title: "数学练习", evidence: "完成 6/16 个安排日", nextStep: "缩短单次时长" }],
      cadenceChanges: [{ templateId: "math", title: "数学练习", currentCadence: "每天", recommendedCadence: "周一、三、五", reason: "专项练习需要间隔" }],
      recommendedSchedule: [{ templateId: "math", title: "数学练习", frequency: "SELECTED_WEEKDAYS", weekdays: [1, 3, 5], reason: "分散练习" }],
      parentActions: ["先试行两周"],
    });
    expect(result.success).toBe(true);
  });

  it("频率建议的原因可以同时说明实际负担与题型掌握度", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "短时口算负担很低，但已熟练，可适度让出时间给应用题。",
      dataQuality: "SUFFICIENT",
      doingWell: [{ templateId: "math", title: "数学口算", evidence: "平均每天 2.3 分钟，近期正确率 96%", nextStep: "保持短时练习" }],
      needsAdjustment: [],
      cadenceChanges: [{ templateId: "math", title: "数学口算", currentCadence: "每天", recommendedCadence: "每周 5 次", reason: "每周仅约 16 分钟且已熟练稳定，可释放两天给薄弱应用题" }],
      recommendedSchedule: [{ templateId: "math", title: "数学口算", frequency: "SELECTED_WEEKDAYS", weekdays: [1, 2, 4, 5, 6], reason: "保留巩固并照顾薄弱题型" }],
      parentActions: ["试行两周后比较题型掌握度"],
    });
    expect(result.success).toBe(true);
  });

  it("拒绝超过三条的家长行动", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "样本有限，先保持观察。",
      dataQuality: "LIMITED",
      doingWell: [],
      needsAdjustment: [],
      cadenceChanges: [],
      recommendedSchedule: [],
      parentActions: ["建议一", "建议二", "建议三", "建议四"],
    });
    expect(result.success).toBe(false);
  });
});
