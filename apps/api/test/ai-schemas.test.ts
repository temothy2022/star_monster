import { describe, expect, it } from "vitest";
import { taskAdviceResponseSchema } from "../src/ai/schemas.js";

const validAdvice = {
  summary: "每周间隔复习三次",
  confidence: "HIGH",
  needsParentDecision: [],
  proposal: {
    title: "汉字复习",
    category: "CHINESE",
    iconKey: "chinese",
    mode: "UNTIMED",
    estimatedMinutes: 10,
    timeLimitMinutes: null,
    baseStars: 2,
    earlyBonusEnabled: false,
    earlyThresholdMinutes: null,
    earlyBonusStars: null,
    repeatableDaily: false,
    scheduleKind: "SELECTED_WEEKDAYS",
    weekdays: [1, 3, 5],
    oneTimeDate: null,
    learningPracticeKind: "REVIEW",
    aiSchedulingEnabled: true,
    targetSessionsPerWeek: 3,
    minimumGapDays: 1,
    childFriendlyGoal: "看看还记得哪些汉字",
    successCriteria: ["认真回忆 10 分钟"],
    parentInstructions: ["先让孩子自己回忆"],
  },
  rationale: ["用间隔复习避免机械重复"],
  alternatives: [],
  cautions: [],
  evidencePrinciples: ["SPACING_AND_RETRIEVAL"],
};

describe("AI 任务草案字段一致性", () => {
  it("接受出现日期与每周次数一致、分类图标匹配的草案", () => {
    expect(taskAdviceResponseSchema.safeParse(validAdvice).success).toBe(true);
  });

  it("拒绝写着每周四次、实际却安排五天的草案", () => {
    const result = taskAdviceResponseSchema.safeParse({
      ...validAdvice,
      proposal: {
        ...validAdvice.proposal,
        weekdays: [1, 2, 3, 4, 5],
        targetSessionsPerWeek: 4,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "proposal.targetSessionsPerWeek" &&
            issue.message.includes("当前应为 5"),
        ),
      ).toBe(true);
    }
  });

  it("拒绝分类、图标及关闭状态下的残留配置", () => {
    const result = taskAdviceResponseSchema.safeParse({
      ...validAdvice,
      proposal: {
        ...validAdvice.proposal,
        iconKey: "english",
        aiSchedulingEnabled: false,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("proposal.iconKey");
      expect(paths).toContain("proposal.aiSchedulingEnabled");
    }
  });
});
