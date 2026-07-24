import type { ScheduleResponse } from "../ai/schemas.js";

export type AvailabilitySlot = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type SchedulableTemplate = {
  id: string;
  estimatedMinutes: number;
};

export type SchedulePreferences = {
  maxDailyMinutes: number;
  maxConsecutiveMinutes: number;
  minimumBreakMinutes: number;
};

export function validateSchedulePlan(input: {
  plan: ScheduleResponse;
  slots: AvailabilitySlot[];
  templates: SchedulableTemplate[];
  preferences: SchedulePreferences;
}): string[] {
  const errors: string[] = [];
  const templateIds = new Set(input.templates.map((item) => item.id));
  const expectedDurations = new Map(
    input.templates.map((item) => [item.id, item.estimatedMinutes]),
  );
  const byDay = new Map<number, ScheduleResponse["weekPlan"]>();

  for (const session of input.plan.weekPlan) {
    if (!templateIds.has(session.templateId)) {
      errors.push(`排班包含不属于这个孩子的任务 ${session.templateId}`);
      continue;
    }
    const expected = expectedDurations.get(session.templateId);
    if (expected && session.durationMinutes !== expected) {
      errors.push(`任务 ${session.templateId} 的时长与后台设置不一致`);
    }
    const containingSlot = input.slots.some(
      (slot) =>
        slot.weekday === session.weekday &&
        session.startMinute >= slot.startMinute &&
        session.startMinute + session.durationMinutes <= slot.endMinute,
    );
    if (!containingSlot) {
      errors.push(`任务 ${session.templateId} 超出了家长设置的可用时间`);
    }
    const sessions = byDay.get(session.weekday) ?? [];
    sessions.push(session);
    byDay.set(session.weekday, sessions);
  }

  for (const [weekday, sessions] of byDay) {
    sessions.sort((a, b) => a.startMinute - b.startMinute);
    const total = sessions.reduce((sum, item) => sum + item.durationMinutes, 0);
    if (total > input.preferences.maxDailyMinutes) {
      errors.push(`星期 ${weekday} 的任务总时长超过每日上限`);
    }
    for (let index = 0; index < sessions.length; index += 1) {
      const current = sessions[index]!;
      if (current.durationMinutes > input.preferences.maxConsecutiveMinutes) {
        errors.push(`任务 ${current.templateId} 超过单次连续专注上限`);
      }
      const next = sessions[index + 1];
      if (!next) continue;
      const currentEnd = current.startMinute + current.durationMinutes;
      if (next.startMinute < currentEnd) {
        errors.push(`星期 ${weekday} 有任务时间重叠`);
      } else if (
        next.startMinute - currentEnd <
        input.preferences.minimumBreakMinutes
      ) {
        errors.push(`星期 ${weekday} 的连续任务没有达到休息间隔`);
      }
    }
  }

  for (const cadence of input.plan.taskCadence) {
    if (!templateIds.has(cadence.templateId)) {
      errors.push(`任务频率包含无效任务 ${cadence.templateId}`);
    }
    // taskCadence 表示家长最终要应用到循环任务的目标频率；
    // weekPlan 是 AI 在当前可用时间内排出的示例周计划。家庭时间不足时，
    // 两者允许不完全一致，不能因此阻断方案生成或一键应用。
  }

  return [...new Set(errors)];
}
