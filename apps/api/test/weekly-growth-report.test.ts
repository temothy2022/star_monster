import { describe, expect, it } from "vitest";
import {
  growthAdvisorAnswerSchema,
  weeklyGrowthResponseSchema,
} from "../src/ai/schemas.js";
import {
  growthAnalyticsRange,
  summarizeAttemptEffort,
} from "../src/services/growth-analytics-service.js";
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

describe("分类投入统计口径", () => {
  it("统计所有有计时的有效结束尝试，并排除退款回退记录", () => {
    expect(summarizeAttemptEffort([
      { status: "COMPLETED", elapsedSeconds: 600 },
      { status: "FAILED", elapsedSeconds: 180 },
      { status: "ABANDONED", elapsedSeconds: 90 },
      { status: "ROLLED_BACK", elapsedSeconds: 500 },
      { status: "RUNNING", elapsedSeconds: null },
    ])).toEqual({ closedAttempts: 3, timedAttempts: 3, observedSeconds: 870 });
  });

  it("未记录时长的结束尝试只影响覆盖率，不猜测投入时间", () => {
    expect(summarizeAttemptEffort([
      { status: "COMPLETED", elapsedSeconds: null },
      { status: "TIMED_OUT", elapsedSeconds: 300 },
    ])).toEqual({ closedAttempts: 2, timedAttempts: 1, observedSeconds: 300 });
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

  it("接受包含学科平衡、习惯计划和建议追问的成长分析", () => {
    const result = weeklyGrowthResponseSchema.safeParse({
      summary: "习惯稳定，未来两周优先补足数学薄弱题型。",
      dataQuality: "SUFFICIENT",
      developmentProfile: {
        headline: "正在建立稳定而均衡的学习节奏",
        stage: "BUILDING",
        primaryGoal: "先补足数学薄弱题型",
        rationale: "生活任务稳定，数学应用题仍需短时专项练习。",
      },
      dimensions: [{
        key: "MATH",
        label: "数学",
        score: 68,
        trend: "IMPROVING",
        status: "WATCH",
        evidence: "近四周完成 46 题，近期正确率正在提升。",
        nextStep: "保持短时专项，不增加总题量。",
      }],
      balanceInsight: {
        summary: "语文稳定，数学需要更多针对性练习。",
        wellRepresented: ["语文"],
        needsMoreAttention: ["数学"],
        recommendation: "把两次综合练习替换为应用题专项。",
      },
      doingWell: [],
      needsAdjustment: [],
      cadenceChanges: [],
      recommendedSchedule: [],
      parentActions: ["试行两周后复查"],
      habitPlan: {
        focus: "自主开始第一项任务",
        cue: "看到今日任务列表时",
        routine: "先选一项十分钟内的任务",
        reinforcement: "完成后口头确认自己的选择",
        successSignal: "一周四天无需催促即可开始",
      },
      weeklyPlan: {
        theme: "稳定开始，专项补弱",
        loadGuidance: "不增加总任务时长",
        focusAreas: ["数学应用题"],
        lightDays: ["周日"],
        principles: ["高负担任务错开"],
      },
      riskSignals: [],
      suggestedQuestions: [{
        id: "math-cadence",
        question: "数学应该每天练还是隔天练？",
        reason: "当前已有四周频率和掌握度记录。",
      }],
    });
    expect(result.success).toBe(true);
  });

  it("接受带执行步骤和任务调整的顾问追问回答", () => {
    const result = growthAdvisorAnswerSchema.safeParse({
      title: "数学改为短时隔天练",
      directAnswer: "建议先试行隔天短练，而不是继续增加每天题量。",
      evidence: ["应用题正确率低于其他题型，且单次用时更长。"],
      actionPlan: [{
        order: 1,
        title: "拆短练习",
        action: "每次只练一个薄弱题型。",
        frequency: "未来两周，每周三次",
        successSignal: "首次正确率提升且单次练习不超过十分钟",
      }],
      taskAdjustments: [{
        templateId: "math-template",
        title: "数学练习",
        decision: "SPLIT",
        suggestion: "拆成三次短时专项",
        reason: "降低启动负担并保留提取练习",
      }],
      watchFor: ["孩子是否更容易自主开始"],
      followUpQuestions: ["两周后应该看哪些数据？"],
      boundaryNote: "本建议基于平台记录，不替代专业评估。",
    });
    expect(result.success).toBe(true);
  });
});
