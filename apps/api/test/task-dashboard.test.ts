import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_DASHBOARD_LAYOUT,
  normalizeTaskDashboardLayout,
  taskDashboardLayoutSchema,
} from "../src/domain/task-dashboard.js";

describe("task dashboard layout", () => {
  it("uses a useful default layout when no saved layout exists", () => {
    expect(normalizeTaskDashboardLayout(null)).toEqual(DEFAULT_TASK_DASHBOARD_LAYOUT);
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("TASKS");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("MASCOT");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("CLOCK");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("CATEGORY_PROGRESS");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("LEADERBOARD");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("NOTIFICATIONS");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("HANZI_REVIEW");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("POEM_REVIEW");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("POSTCARDS");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("COUNTDOWN_TIMER");
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "POSTCARDS", "COUNTDOWN_TIMER"],
      columns: { TASKS: 0, POSTCARDS: 4, COUNTDOWN_TIMER: 8 },
      rows: { POSTCARDS: 16, COUNTDOWN_TIMER: 16 },
    }).success).toBe(true);
  });

  it("keeps a valid child-defined order", () => {
    const layout = {
      version: 1 as const,
      widgets: ["BALANCE", "TASKS", "LEADERBOARD", "NOTIFICATIONS"] as const,
      columns: { BALANCE: 0 as const, TASKS: 4 as const, NOTIFICATIONS: 8 as const },
      taskRows: 42,
    };
    expect(normalizeTaskDashboardLayout(layout)).toEqual({
      version: 1,
      widgets: [...layout.widgets, "CLOCK", "CATEGORY_PROGRESS"],
      columns: layout.columns,
      rows: { TASKS: 42 },
    });
  });

  it("keeps task height within the supported desktop range", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS"],
      taskRows: 27,
    }).success).toBe(true);
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS"],
      taskRows: 61,
    }).success).toBe(false);
  });

  it("keeps valid heights for every enabled widget", () => {
    const layout = {
      version: 1 as const,
      widgets: ["TASKS", "BALANCE", "MASCOT", "NOTIFICATIONS"] as const,
      rows: { TASKS: 38, BALANCE: 14, MASCOT: 19, NOTIFICATIONS: 10 },
    };
    expect(taskDashboardLayoutSchema.safeParse(layout).success).toBe(true);
    expect(normalizeTaskDashboardLayout(layout)).toEqual({ ...layout, widgets: [...layout.widgets, "CLOCK", "CATEGORY_PROGRESS"] });
  });

  it("rejects a widget height outside that widget's usable range", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "BALANCE"],
      rows: { TASKS: 38, BALANCE: 8 },
    }).success).toBe(false);
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "LEADERBOARD"],
      rows: { LEADERBOARD: 25 },
    }).success).toBe(false);
  });

  it("accepts the clock widget height", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["CLOCK"],
      rows: { CLOCK: 12 },
    }).success).toBe(true);
  });

  it("rejects unsupported dashboard columns", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "TODAY_PLAN"],
      columns: { TASKS: 8, TODAY_PLAN: 3 },
    }).success).toBe(false);
  });

  it("removes the retired quick links widget without resetting the saved order", () => {
    expect(normalizeTaskDashboardLayout({
      version: 1,
      widgets: ["BALANCE", "QUICK_LINKS", "TASKS", "MASCOT"],
    })).toEqual({
      version: 1,
      widgets: ["BALANCE", "TASKS", "MASCOT", "CLOCK", "CATEGORY_PROGRESS"],
    });
  });

  it("rejects duplicate widgets but allows removing the task list", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "TASKS"],
    }).success).toBe(false);
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["BALANCE", "MASCOT", "CLOCK", "CATEGORY_PROGRESS"],
    }).success).toBe(true);
    expect(normalizeTaskDashboardLayout({
      version: 1,
      widgets: ["BALANCE", "MASCOT", "CLOCK", "CATEGORY_PROGRESS"],
    })).toEqual({
      version: 1,
      widgets: ["BALANCE", "MASCOT", "CLOCK", "CATEGORY_PROGRESS"],
    });
  });

  it("keeps at least one dashboard widget", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: [],
    }).success).toBe(false);
  });
});
