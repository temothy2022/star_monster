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
  });

  it("keeps a valid child-defined order", () => {
    const layout = {
      version: 1 as const,
      widgets: ["BALANCE", "TASKS", "QUICK_LINKS"] as const,
    };
    expect(normalizeTaskDashboardLayout(layout)).toEqual(layout);
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
