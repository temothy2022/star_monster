import type { PetType } from "../mascots";
import type { PlanetKey } from "../planets/planet-data";

export type ChildProfile = {
  id: string;
  nickname: string | null;
  petType: PetType | null;
  onboardingCompletedAt: string | null;
  dailyStarGoal: number;
  dailyGoalBonusEnabled: boolean;
  dailyGoalBonusStars: number;
  starBalance: number;
  lifetimeStarsEarned: number;
};

type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!response.ok) {
    const body = (isJson ? await response.json().catch(() => ({})) : {}) as ApiErrorBody;
    throw new ApiError(
      body.error?.message ?? "暂时无法连接星宠基地",
      response.status,
      body.error?.code,
    );
  }
  if (!isJson) {
    throw new ApiError("星宠基地服务尚未启动，请稍后再试", 503, "API_UNAVAILABLE");
  }
  return response.json() as Promise<T>;
}

export async function loginChild(code: string) {
  const result = await request<{
    child: {
      id: string;
      nickname: string | null;
      petType: PetType | null;
      onboardingCompleted: boolean;
    };
  }>("/api/child/auth/login", {
    method: "POST",
    body: JSON.stringify({
      code,
      deviceName: /iPad/i.test(navigator.userAgent) ? "iPad" : "网页浏览器",
    }),
  });
  return result.child;
}

export async function getChildProfile() {
  const result = await request<{ child: ChildProfile }>("/api/child/me");
  return result.child;
}

export async function saveOnboarding(input: {
  petType?: PetType;
  nickname?: string;
  complete?: boolean;
}) {
  const result = await request<{ child: ChildProfile }>(
    "/api/child/onboarding",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return result.child;
}

export async function logoutChild() {
  return request<{ ok: true }>("/api/child/auth/logout", { method: "POST" });
}

export type DailyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "EXPIRED";
  titleSnapshot: string;
  categorySnapshot:
    | "READING"
    | "MATH"
    | "EXERCISE"
    | "CHORES"
    | "ORGANIZING"
    | "MUSIC"
    | "CHINESE"
    | "ENGLISH"
    | "PE"
    | "OTHER";
  iconKeySnapshot: string;
  modeSnapshot: "UNTIMED" | "TIMED";
  suggestedSecondsSnapshot: number | null;
  timeLimitSecondsSnapshot: number | null;
  baseStarsSnapshot: number;
  earlyThresholdSecsSnapshot: number | null;
  earlyBonusStarsSnapshot: number | null;
  repeatableDailySnapshot: boolean;
  completionDurationSeconds: number | null;
  attempts?: Array<{
    baseStarsAwarded: number;
    bonusStarsAwarded: number;
  }>;
};

export type TaskAttempt = {
  id: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "TIMED_OUT" | "ABANDONED" | "DAY_ENDED";
  elapsedSeconds: number | null;
  remainingSeconds: number | null;
  dailyTask: DailyTask;
};

export type TodayTaskExperience = {
  date: string;
  earnedToday: number;
  streakDays: number;
  dailyStarGoal: number;
  dailyGoalBonusStars: number;
  starBalance: number;
  tasks: DailyTask[];
  active: TaskAttempt | null;
  timedOutAttemptId: string | null;
};

export async function getTodayTasks() {
  return request<TodayTaskExperience>("/api/child/tasks/today");
}

export async function startDailyTask(dailyTaskId: string) {
  return request<{ attempt: TaskAttempt; alreadyActive: boolean }>(
    `/api/child/tasks/${dailyTaskId}/start`,
    { method: "POST" },
  );
}

export async function pauseAttempt(attemptId: string) {
  return request<{ attempt: TaskAttempt }>(
    `/api/child/attempts/${attemptId}/pause`,
    { method: "POST" },
  );
}

export async function resumeAttempt(attemptId: string) {
  return request<{ attempt: TaskAttempt }>(
    `/api/child/attempts/${attemptId}/resume`,
    { method: "POST" },
  );
}

export async function abandonAttempt(attemptId: string) {
  return request<{ attempt: TaskAttempt }>(
    `/api/child/attempts/${attemptId}/abandon`,
    { method: "POST" },
  );
}

export async function completeAttempt(attemptId: string) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/attempts/${attemptId}/complete`, { method: "POST" });
}

export type ChildWish = {
  id: string;
  category: "SPORTS" | "GAMES" | "TELEVISION" | "TOYS";
  title: string;
  imageKey: string;
  costStars: number;
  redemptionType: "ONE_TIME" | "RECURRING" | "STOCK";
  recurrenceKind: "DAILY" | "WEEKLY" | "INTERVAL" | null;
  recurrenceIntervalDays: number | null;
  stockRemaining: number | null;
  nextEligibleDate: string | null;
  canRedeem: boolean;
  unavailableReason:
    | "ALREADY_COMPLETED"
    | "ALREADY_REQUESTED"
    | "COOLDOWN"
    | "OUT_OF_STOCK"
    | "INSUFFICIENT_STARS"
    | null;
  activeRedemptionStatus:
    | "PENDING"
    | "ARRANGED"
    | "COMPLETED"
    | "CANCELLED"
    | null;
};

export async function getChildWishes() {
  return request<{ starBalance: number; wishes: ChildWish[] }>(
    "/api/child/wishes",
  );
}

export async function redeemChildWish(wishId: string) {
  return request<{
    redemption: { id: string; status: "PENDING" };
    alreadyProcessed: boolean;
  }>(`/api/child/wishes/${wishId}/redeem`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
  });
}

export type FootprintResponse = {
  weekStart: string;
  weekEnd: string;
  selectedDate: string;
  days: Array<{ date: string; isFuture: boolean; stars: number | null }>;
  tasks: Array<{
    completionId: string;
    dailyTaskId: string;
    title: string;
    category: DailyTask["categorySnapshot"];
    iconKey: string;
    baseStars: number;
    bonusStars: number;
    totalStars: number;
    completedAt: string;
  }>;
};

export async function getChildFootprints(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<FootprintResponse>(`/api/child/footprints${query}`);
}

export type ChildPlanet = {
  id: string;
  planet: PlanetKey;
  requiredLifetimeStars: number;
  bonusStars: number;
  awardedBonusStars: number | null;
  unlocked: boolean;
  unlockedAt: string | null;
  notifiedAt: string | null;
  celebratedAt: string | null;
};

export type PlanetMapResponse = {
  starBalance: number;
  lifetimeStarsEarned: number;
  planets: ChildPlanet[];
  pendingNotifications: PlanetKey[];
  pendingCelebrations: PlanetKey[];
};

export async function getChildPlanets() {
  return request<PlanetMapResponse>("/api/child/planets");
}

export async function markChildPlanetCelebrated(planet: PlanetKey) {
  return request<{ planet: PlanetKey; celebratedAt: string }>(
    `/api/child/planets/${planet}/celebrated`,
    { method: "POST" },
  );
}

export async function markChildPlanetNotified(planet: PlanetKey) {
  return request<{ planet: PlanetKey; notifiedAt: string }>(
    `/api/child/planets/${planet}/notified`,
    { method: "POST" },
  );
}
