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
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("LEADERBOARD");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("NOTIFICATIONS");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("HANZI_REVIEW");
    expect(DEFAULT_TASK_DASHBOARD_LAYOUT.widgets).toContain("POEM_REVIEW");
  });

  it("keeps a valid child-defined order", () => {
    const layout = {
      version: 1 as const,
      widgets: ["BALANCE", "TASKS", "LEADERBOARD", "NOTIFICATIONS"] as const,
    };
    expect(normalizeTaskDashboardLayout(layout)).toEqual(layout);
  });

  it("removes the retired quick links widget without resetting the saved order", () => {
    expect(normalizeTaskDashboardLayout({
      version: 1,
      widgets: ["BALANCE", "QUICK_LINKS", "TASKS", "MASCOT"],
    })).toEqual({
      version: 1,
      widgets: ["BALANCE", "TASKS", "MASCOT"],
    });
  });

  it("rejects duplicate widgets and layouts without the task list", () => {
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["TASKS", "TASKS"],
    }).success).toBe(false);
    expect(taskDashboardLayoutSchema.safeParse({
      version: 1,
      widgets: ["BALANCE", "MASCOT"],
    }).success).toBe(false);
  });
});
