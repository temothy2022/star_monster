import { z } from "zod";

export const TASK_DASHBOARD_WIDGET_KEYS = [
  "TASKS",
  "DAILY_PROGRESS",
  "BALANCE",
  "MASCOT",
  "TODAY_PLAN",
  "STREAK",
  "GOAL_BONUS",
  "LEADERBOARD",
  "NOTIFICATIONS",
  "HANZI_REVIEW",
  "POEM_REVIEW",
] as const;

export type TaskDashboardWidgetKey = typeof TASK_DASHBOARD_WIDGET_KEYS[number];

export type TaskDashboardLayout = {
  version: 1;
  widgets: TaskDashboardWidgetKey[];
  columns?: Partial<Record<TaskDashboardWidgetKey, number>>;
  taskRows?: number;
};

export const DEFAULT_TASK_DASHBOARD_LAYOUT: TaskDashboardLayout = {
  version: 1,
  widgets: [
    "DAILY_PROGRESS",
    "BALANCE",
    "STREAK",
    "NOTIFICATIONS",
    "HANZI_REVIEW",
    "POEM_REVIEW",
    "MASCOT",
    "LEADERBOARD",
    "TASKS",
  ],
};

export const taskDashboardLayoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.enum(TASK_DASHBOARD_WIDGET_KEYS))
    .min(1)
    .max(TASK_DASHBOARD_WIDGET_KEYS.length)
    .refine((widgets) => new Set(widgets).size === widgets.length, "组件不能重复")
    .refine((widgets) => widgets.includes("TASKS"), "任务列表不能删除"),
  columns: z.partialRecord(
    z.enum(TASK_DASHBOARD_WIDGET_KEYS),
    z.union([z.literal(0), z.literal(4), z.literal(8)]),
  ).optional(),
  taskRows: z.number().int().min(27).max(60).optional(),
}).refine((layout) => layout.columns?.TASKS !== 8, {
  message: "任务列表不能超出桌面网格",
  path: ["columns", "TASKS"],
});

const storedTaskDashboardLayoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.enum([...TASK_DASHBOARD_WIDGET_KEYS, "QUICK_LINKS"] as const))
    .min(1)
    .refine((widgets) => new Set(widgets).size === widgets.length, "组件不能重复")
    .refine((widgets) => widgets.includes("TASKS"), "任务列表不能删除"),
  columns: z.partialRecord(
    z.enum(TASK_DASHBOARD_WIDGET_KEYS),
    z.union([z.literal(0), z.literal(4), z.literal(8)]),
  ).optional(),
  taskRows: z.number().int().min(27).max(60).optional(),
});

export function normalizeTaskDashboardLayout(value: unknown): TaskDashboardLayout {
  const parsed = storedTaskDashboardLayoutSchema.safeParse(value);
  if (!parsed.success) return { ...DEFAULT_TASK_DASHBOARD_LAYOUT, widgets: [...DEFAULT_TASK_DASHBOARD_LAYOUT.widgets] };
  const widgets = parsed.data.widgets.filter(
    (widget): widget is TaskDashboardWidgetKey => widget !== "QUICK_LINKS",
  );
  const columns = parsed.data.columns
    ? Object.fromEntries(Object.entries(parsed.data.columns).filter(([key]) => (
      widgets.includes(key as TaskDashboardWidgetKey)
    ))) as Partial<Record<TaskDashboardWidgetKey, number>>
    : undefined;
  return {
    version: 1,
    widgets,
    ...(columns && Object.keys(columns).length > 0 ? { columns } : {}),
    ...(parsed.data.taskRows !== undefined ? { taskRows: parsed.data.taskRows } : {}),
  };
}
