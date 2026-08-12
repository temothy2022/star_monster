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
  rows?: Partial<Record<TaskDashboardWidgetKey, number>>;
  /** @deprecated Kept only while normalizing layouts saved before per-widget resizing. */
  taskRows?: number;
};

export const TASK_DASHBOARD_WIDGET_ROW_LIMITS: Record<
  TaskDashboardWidgetKey,
  { min: number; max: number }
> = {
  TASKS: { min: 27, max: 60 },
  DAILY_PROGRESS: { min: 12, max: 26 },
  BALANCE: { min: 9, max: 22 },
  MASCOT: { min: 13, max: 26 },
  TODAY_PLAN: { min: 12, max: 24 },
  STREAK: { min: 9, max: 22 },
  GOAL_BONUS: { min: 9, max: 22 },
  LEADERBOARD: { min: 13, max: 24 },
  NOTIFICATIONS: { min: 8, max: 18 },
  HANZI_REVIEW: { min: 11, max: 20 },
  POEM_REVIEW: { min: 12, max: 24 },
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

const dashboardRowsSchema = z.partialRecord(
  z.enum(TASK_DASHBOARD_WIDGET_KEYS),
  z.number().int().min(8).max(60),
);

function validateWidgetRows(
  layout: { rows?: Partial<Record<TaskDashboardWidgetKey, number>> },
  context: z.RefinementCtx,
) {
  for (const [key, rows] of Object.entries(layout.rows ?? {})) {
    if (rows === undefined) continue;
    const limits = TASK_DASHBOARD_WIDGET_ROW_LIMITS[key as TaskDashboardWidgetKey];
    if (rows < limits.min || rows > limits.max) {
      context.addIssue({
        code: "custom",
        message: `组件高度必须在 ${limits.min}-${limits.max} 行之间`,
        path: ["rows", key],
      });
    }
  }
}

export const taskDashboardLayoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.enum(TASK_DASHBOARD_WIDGET_KEYS))
    .min(1)
    .max(TASK_DASHBOARD_WIDGET_KEYS.length)
    .refine((widgets) => new Set(widgets).size === widgets.length, "组件不能重复"),
  columns: z.partialRecord(
    z.enum(TASK_DASHBOARD_WIDGET_KEYS),
    z.union([z.literal(0), z.literal(4), z.literal(8)]),
  ).optional(),
  rows: dashboardRowsSchema.optional(),
  taskRows: z.number().int().min(27).max(60).optional(),
}).superRefine((layout, context) => {
  if (layout.columns?.TASKS === 8) {
    context.addIssue({
      code: "custom",
      message: "任务列表不能超出桌面网格",
      path: ["columns", "TASKS"],
    });
  }
  validateWidgetRows(layout, context);
});

const storedTaskDashboardLayoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(z.enum([...TASK_DASHBOARD_WIDGET_KEYS, "QUICK_LINKS"] as const))
    .min(1)
    .refine((widgets) => new Set(widgets).size === widgets.length, "组件不能重复"),
  columns: z.partialRecord(
    z.enum(TASK_DASHBOARD_WIDGET_KEYS),
    z.union([z.literal(0), z.literal(4), z.literal(8)]),
  ).optional(),
  rows: dashboardRowsSchema.optional(),
  taskRows: z.number().int().min(27).max(60).optional(),
}).superRefine(validateWidgetRows);

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
  const rows = parsed.data.rows
    ? Object.fromEntries(Object.entries(parsed.data.rows).filter(([key]) => (
      widgets.includes(key as TaskDashboardWidgetKey)
    ))) as Partial<Record<TaskDashboardWidgetKey, number>>
    : {};
  if (parsed.data.taskRows !== undefined && rows.TASKS === undefined) {
    rows.TASKS = parsed.data.taskRows;
  }
  return {
    version: 1,
    widgets,
    ...(columns && Object.keys(columns).length > 0 ? { columns } : {}),
    ...(Object.keys(rows).length > 0 ? { rows } : {}),
  };
}
