import { z } from "zod";

export const evidencePrincipleSchema = z.enum([
  "AUTONOMY_SUPPORT",
  "CLEAR_ROUTINES",
  "AGE_APPROPRIATE_ATTENTION",
  "POSITIVE_REINFORCEMENT",
  "SPACING_AND_RETRIEVAL",
  "EFFORT_OVER_PERFECTION",
  "CHOICE_AND_PLAY",
]);

const taskCategorySchema = z.enum([
  "MATH",
  "EXERCISE",
  "CHORES",
  "CHINESE",
  "ENGLISH",
  "OTHER",
]);

const iconKeySchema = z.enum([
  "math",
  "exercise",
  "chores",
  "chinese",
  "english",
  "other",
]);

const categoryIconPairs = {
  MATH: "math",
  EXERCISE: "exercise",
  CHORES: "chores",
  CHINESE: "chinese",
  ENGLISH: "english",
  OTHER: "other",
} as const;

export const taskAdviceResponseSchema = z.object({
  summary: z.string().min(1).max(500),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  needsParentDecision: z.array(z.string().min(1).max(200)).max(5),
  proposal: z.object({
    title: z.string().min(1).max(80),
    category: taskCategorySchema,
    iconKey: iconKeySchema,
    mode: z.enum(["UNTIMED", "TIMED"]),
    estimatedMinutes: z.number().int().min(1).max(120),
    timeLimitMinutes: z.number().int().min(1).max(120).nullable(),
    baseStars: z.number().int().min(1).max(30),
    earlyBonusEnabled: z.boolean(),
    earlyThresholdMinutes: z.number().int().min(1).max(120).nullable(),
    earlyBonusStars: z.number().int().min(1).max(10).nullable(),
    repeatableDaily: z.boolean().default(false),
    scheduleKind: z.enum([
      "DAILY",
      "WORKDAYS",
      "SELECTED_WEEKDAYS",
      "ONE_TIME",
    ]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    oneTimeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    learningPracticeKind: z.enum([
      "GENERAL",
      "NEW_CONTENT",
      "REVIEW",
      "MIXED",
    ]),
    aiSchedulingEnabled: z.boolean(),
    targetSessionsPerWeek: z.number().int().min(1).max(7).nullable(),
    minimumGapDays: z.number().int().min(0).max(6).nullable(),
    childFriendlyGoal: z.string().min(1).max(100),
    successCriteria: z.array(z.string().min(1).max(120)).min(1).max(4),
    parentInstructions: z.array(z.string().min(1).max(200)).min(1).max(5),
  }),
  rationale: z.array(z.string().min(1).max(300)).min(1).max(6),
  alternatives: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        whenToUse: z.string().min(1).max(180),
        change: z.string().min(1).max(180),
      }),
    )
    .max(3),
  cautions: z.array(z.string().min(1).max(240)).max(5),
  evidencePrinciples: z.array(evidencePrincipleSchema).min(1).max(7),
}).superRefine((input, context) => {
  const proposal = input.proposal;
  if (proposal.mode === "TIMED" && proposal.timeLimitMinutes === null) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "timeLimitMinutes"],
      message: "限时任务必须给出倒计时时长",
    });
  }
  if (proposal.mode === "UNTIMED" && proposal.timeLimitMinutes !== null) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "timeLimitMinutes"],
      message: "不限时任务的倒计时时长必须为 null",
    });
  }
  if (
    proposal.earlyBonusEnabled &&
    (proposal.mode !== "TIMED" ||
      proposal.earlyThresholdMinutes === null ||
      proposal.earlyBonusStars === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "earlyBonusEnabled"],
      message: "提前奖励字段不完整",
    });
  }
  if (
    !proposal.earlyBonusEnabled &&
    (proposal.earlyThresholdMinutes !== null ||
      proposal.earlyBonusStars !== null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "earlyBonusEnabled"],
      message: "未启用提前奖励时，加奖时长和星星必须为 null",
    });
  }
  if (
    proposal.scheduleKind === "SELECTED_WEEKDAYS" &&
    proposal.weekdays.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "weekdays"],
      message: "指定星期任务必须包含至少一天",
    });
  }
  if (
    proposal.scheduleKind !== "SELECTED_WEEKDAYS" &&
    proposal.weekdays.length > 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "weekdays"],
      message: "非指定星期任务的 weekdays 必须为空数组",
    });
  }
  if (new Set(proposal.weekdays).size !== proposal.weekdays.length) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "weekdays"],
      message: "weekdays 不能包含重复日期",
    });
  }
  if (
    proposal.scheduleKind === "ONE_TIME" &&
    proposal.oneTimeDate === null
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "oneTimeDate"],
      message: "一次性任务必须给出日期",
    });
  }
  if (
    proposal.scheduleKind !== "ONE_TIME" &&
    proposal.oneTimeDate !== null
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "oneTimeDate"],
      message: "循环任务的 oneTimeDate 必须为 null",
    });
  }
  if (
    proposal.aiSchedulingEnabled &&
    (proposal.targetSessionsPerWeek === null ||
      proposal.minimumGapDays === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "aiSchedulingEnabled"],
      message: "启用 AI 排班时必须给出每周次数和最小间隔",
    });
  }
  if (
    !proposal.aiSchedulingEnabled &&
    (proposal.targetSessionsPerWeek !== null ||
      proposal.minimumGapDays !== null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "aiSchedulingEnabled"],
      message: "未启用 AI 排班时，每周次数和最小间隔必须为 null",
    });
  }
  const expectedSessions =
    proposal.scheduleKind === "DAILY"
      ? 7
      : proposal.scheduleKind === "WORKDAYS"
        ? 5
        : proposal.scheduleKind === "ONE_TIME"
          ? 1
          : proposal.weekdays.length;
  if (
    proposal.aiSchedulingEnabled &&
    proposal.targetSessionsPerWeek !== expectedSessions
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "targetSessionsPerWeek"],
      message: `每周次数必须与出现方式一致，当前应为 ${expectedSessions}`,
    });
  }
  if (categoryIconPairs[proposal.category] !== proposal.iconKey) {
    context.addIssue({
      code: "custom",
      path: ["proposal", "iconKey"],
      message: "任务分类与图标必须匹配",
    });
  }
});

const auditFindingSchema = z.object({
  severity: z.enum(["INFO", "WATCH", "ADJUST"]),
  targetType: z.enum(["SYSTEM", "TASK", "WISH"]),
  targetId: z.string().nullable(),
  title: z.string().min(1).max(100),
  observation: z.string().min(1).max(300),
  recommendation: z.string().min(1).max(300),
  suggestedStars: z.number().int().min(1).max(9999).nullable(),
});

export const rewardAuditResponseSchema = z.object({
  verdict: z.enum(["BALANCED", "NEEDS_SMALL_CHANGES", "NEEDS_REBALANCE"]),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(500),
  estimatedWeeklyStars: z.object({
    minimum: z.number().int().min(0).max(99999),
    likely: z.number().int().min(0).max(99999),
    maximum: z.number().int().min(0).max(99999),
  }),
  affordability: z
    .array(
      z.object({
        wishId: z.string(),
        estimatedWeeks: z.number().min(0).max(520),
        assessment: z.enum(["TOO_EASY", "REASONABLE", "TOO_HARD"]),
      }),
    )
    .max(100),
  findings: z.array(auditFindingSchema).max(100),
  principles: z.array(z.string().min(1).max(220)).min(1).max(8),
  evidencePrinciples: z.array(evidencePrincipleSchema).min(1).max(7),
  disclaimer: z.string().min(1).max(300),
});

export const scheduleResponseSchema = z.object({
  summary: z.string().min(1).max(500),
  weekPlan: z
    .array(
      z.object({
        templateId: z.string(),
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        durationMinutes: z.number().int().min(1).max(120),
        sessionType: z.enum(["GENERAL", "NEW_CONTENT", "REVIEW", "MIXED"]),
        note: z.string().min(1).max(180),
      }),
    )
    .max(100),
  taskCadence: z
    .array(
      z.object({
        templateId: z.string(),
        weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        reasoning: z.string().min(1).max(250),
      }),
    )
    .max(100),
  parentTips: z.array(z.string().min(1).max(240)).max(8),
  warnings: z.array(z.string().min(1).max(240)).max(8),
  evidencePrinciples: z.array(evidencePrincipleSchema).min(1).max(7),
});

export const weeklyGrowthResponseSchema = z.object({
  summary: z.string().min(1).max(320),
  progressHighlights: z
    .array(
      z.object({
        title: z.string().min(1).max(50),
        evidence: z.string().min(1).max(180),
      }),
    )
    .max(3),
  focusAreas: z
    .array(
      z.object({
        title: z.string().min(1).max(50),
        evidence: z.string().min(1).max(180),
        suggestion: z.string().min(1).max(220),
      }),
    )
    .max(3),
  consumptionInsight: z.object({
    summary: z.string().min(1).max(220),
    preferredCategories: z.array(z.string().min(1).max(30)).max(3),
  }),
  nextWeekSuggestions: z
    .array(
      z.object({
        title: z.string().min(1).max(50),
        action: z.string().min(1).max(220),
        reason: z.string().min(1).max(180),
      }),
    )
    .max(3),
  parentMessage: z.string().min(1).max(240),
  disclaimer: z.string().min(1).max(240),
});

export type TaskAdviceResponse = z.infer<typeof taskAdviceResponseSchema>;
export type RewardAuditResponse = z.infer<typeof rewardAuditResponseSchema>;
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;
export type WeeklyGrowthResponse = z.infer<typeof weeklyGrowthResponseSchema>;
