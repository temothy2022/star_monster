import type { TaskTemplate } from "./api";

export const WORK_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const CALENDAR_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function taskCalendarDays(template: TaskTemplate): number[] {
  if (template.scheduleKind === "DAILY") return [...CALENDAR_WEEKDAYS];
  if (template.scheduleKind === "WORKDAYS") return [...WORK_WEEKDAYS];
  if (template.scheduleKind === "SELECTED_WEEKDAYS") {
    return template.weekdays.filter((day) => day >= 0 && day <= 6);
  }
  if (!template.oneTimeDate) return [];
  const day = new Date(`${template.oneTimeDate.slice(0, 10)}T12:00:00`).getDay();
  return [day];
}

export function moveTaskWeekday(
  template: Pick<TaskTemplate, "scheduleKind" | "weekdays">,
  sourceDay: number,
  targetDay: number,
): number[] {
  const sourceDays = template.scheduleKind === "DAILY"
    ? [0, 1, 2, 3, 4, 5, 6]
    : template.scheduleKind === "WORKDAYS"
      ? [...WORK_WEEKDAYS]
      : template.weekdays;
  return [...new Set(sourceDays.filter((day) => day !== sourceDay).concat(targetDay))]
    .sort((first, second) => first - second);
}
