export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Shanghai";

export const TASK_CATEGORIES = [
  "READING",
  "MATH",
  "EXERCISE",
  "CHORES",
  "ORGANIZING",
  "MUSIC",
  "CHINESE",
  "ENGLISH",
  "PE",
  "OTHER",
] as const;

export type TaskCategoryValue = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategoryValue, string> = {
  READING: "阅读",
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "家务",
  ORGANIZING: "整理",
  MUSIC: "音乐",
  CHINESE: "语文",
  ENGLISH: "英语",
  PE: "体育",
  OTHER: "其他",
};

export const WISH_CATEGORIES = ["SPORTS", "GAMES", "TELEVISION", "TOYS"] as const;

export const WISH_CATEGORY_LABELS = {
  SPORTS: "运动",
  GAMES: "游戏",
  TELEVISION: "电视",
  TOYS: "玩具",
} as const;

export const CHILD_LOGIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CHILD_LOGIN_CODE_LENGTH = 8;
export const DEFAULT_DAILY_STAR_GOAL = 12;
