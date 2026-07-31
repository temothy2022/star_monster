export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Shanghai";

export const TASK_CATEGORIES = [
  "MATH",
  "EXERCISE",
  "CHORES",
  "CHINESE",
  "ENGLISH",
  "OTHER",
] as const;

export type TaskCategoryValue = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategoryValue, string> = {
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "生活习惯",
  CHINESE: "语文",
  ENGLISH: "英语",
  OTHER: "综合任务",
};

export const WISH_CATEGORIES = ["SPORTS", "TELEVISION", "TOYS"] as const;

export const WISH_CATEGORY_LABELS = {
  SPORTS: "活动体验",
  TELEVISION: "娱乐时间",
  TOYS: "物品消费",
} as const;

export const CHILD_LOGIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CHILD_LOGIN_CODE_LENGTH = 8;
export const DEFAULT_DAILY_STAR_GOAL = 12;
