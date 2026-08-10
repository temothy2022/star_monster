import { z } from "zod";

export const TASK_DASHBOARD_WIDGET_KEYS = [
  "TASKS",
  "DAILY_PROGRESS",
  "BALANCE",
  "MASCOT",
  "TODAY_PLAN",
  "STREAK",
  "GOAL_BONUS",
  "QUICK_LINKS",
  "LEADERBOARD",
] as const;

export type TaskDashboardWidgetKey = typeof TASK_DASHBOARD_WIDGET_KEYS[number];

export type TaskDashboardLayout = {
  version: 1;
  widgets: TaskDashboardWidgetKey[];
};

export const DEFAULT_TASK_DASHBOARD_LAYOUT: TaskDashboardLayout = {
  version: 1,
  widgets: ["DAILY_PROGRESS", "BALANCE", "STREAK", "MASCOT", "LEADERBOARD", "TASKS"],
};

export const taskDashboardLayoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.enum(TASK_DASHBOARD_WIDGET_KEYS))
    .min(1)
    .max(TASK_DASHBOARD_WIDGET_KEYS.length)
    .refine((widgets) => new Set(widgets).size === widgets.length, "组件不能重复")
    .refine((widgets) => widgets.includes("TASKS"), "任务列表不能删除"),
});

export function normalizeTaskDashboardLayout(value: unknown): TaskDashboardLayout {
  const parsed = taskDashboardLayoutSchema.safeParse(value);
  if (!parsed.success) return { ...DEFAULT_TASK_DASHBOARD_LAYOUT, widgets: [...DEFAULT_TASK_DASHBOARD_LAYOUT.widgets] };
  return parsed.data;
}
