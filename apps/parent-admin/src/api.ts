export type StaffUser = {
  id: string;
  username: string;
  displayName: string;
  role: "PARENT" | "SUPER_ADMIN";
  familyId: string | null;
};

export type Child = {
  id: string;
  nickname: string | null;
  petType: string | null;
  status: "ACTIVE" | "DISABLED";
  onboardingCompletedAt: string | null;
  dailyStarGoal: number;
  dailyGoalBonusEnabled: boolean;
  dailyGoalBonusStars: number;
  starBalance: number;
  lifetimeStarsEarned: number;
  loginCodeLastFour: string;
  lastLoginAt: string | null;
};

export type TaskTemplate = {
  id: string;
  title: string;
  experienceKind:
    | "STANDARD"
    | "HANZI_LEARNING"
    | "CLOCK_LEARNING"
    | "POEM_LEARNING"
    | "POEM_REVIEW";
  systemManaged: boolean;
  category: string;
  iconKey: string;
  mode: "UNTIMED" | "TIMED";
  suggestedSeconds: number | null;
  timeLimitSeconds: number | null;
  baseStars: number;
  earlyBonusEnabled: boolean;
  earlyThresholdSeconds: number | null;
  earlyBonusStars: number | null;
  repeatableDaily: boolean;
  scheduleKind: "DAILY" | "WORKDAYS" | "SELECTED_WEEKDAYS" | "ONE_TIME";
  weekdays: number[];
  oneTimeDate: string | null;
  sortOrder: number;
  isEnabled: boolean;
  aiSchedulingEnabled: boolean;
  learningPracticeKind: "GENERAL" | "NEW_CONTENT" | "REVIEW" | "MIXED";
  targetSessionsPerWeek: number | null;
  minimumGapDays: number | null;
};

export type HanziLearningSettings = {
  newCharactersPerDay: number;
  reviewDailyLimit: number;
  consolidationQuestionCount: number;
};

export type ClockLearningSettings = {
  questionsPerDay: number;
  minuteStep: 1 | 5;
};

export type ClockLearningStats = {
  completedSessions: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number | null;
  recentAccuracy: number | null;
  mastery: {
    level: "NO_DATA" | "NEEDS_PRACTICE" | "DEVELOPING" | "PROFICIENT" | "MASTERED";
    label: string;
  };
};

export type HanziCharacterResource = {
  id: string;
  character: string;
  internalPinyin: string;
  meaning: string;
  shapeHint: string;
  sentence: string;
  words: string[];
  wordAudioUrls: string[];
  imageKey: string;
  characterAudioUrl: string | null;
  sentenceAudioUrl: string | null;
  sortOrder: number;
  isEnabled: boolean;
};

export type HanziMediaKind =
  | "image"
  | "character-audio"
  | "sentence-audio"
  | "word-audio";

export type HanziSettingsResponse = {
  settings: HanziLearningSettings;
  progress: Partial<Record<"LEARNING" | "MASTERED", number>>;
  characterCount: number;
};

export type PoemLearningSettings = {
  enabled: boolean;
  learningWeekdays: number[];
  learningTaskStars: number;
  reviewTaskStars: number;
};

export type PoemResource = {
  id: string;
  title: string;
  dynasty: string;
  author: string;
  grade: number;
  semester: string;
  content: string;
  imageUrl: string | null;
  audioUrl: string | null;
  sortOrder: number;
  progress: {
    status: "LEARNING" | "MASTERED";
    reviewStage: number;
    nextReviewDate: string | null;
  } | null;
};

export type PoemSettingsResponse = {
  settings: PoemLearningSettings;
  progress: Partial<Record<"LEARNING" | "MASTERED", number>>;
  poemCount: number;
  dueCount: number;
};

export type AiConfig = {
  provider: "DEEPSEEK";
  model: string;
  apiKeyLastFour: string | null;
  enabled: boolean;
  updatedAt: string | null;
  configured: boolean;
};

export type MinimaxConfig = {
  provider: "MINIMAX";
  apiKeyLastFour: string | null;
  enabled: boolean;
  updatedAt: string | null;
  configured: boolean;
};

export type TaskAdvice = {
  summary: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  needsParentDecision: string[];
  proposal: {
    title: string;
    category: string;
    iconKey: string;
    mode: "UNTIMED" | "TIMED";
    estimatedMinutes: number;
    timeLimitMinutes: number | null;
    baseStars: number;
    earlyBonusEnabled: boolean;
    earlyThresholdMinutes: number | null;
    earlyBonusStars: number | null;
    repeatableDaily: boolean;
    scheduleKind: "DAILY" | "WORKDAYS" | "SELECTED_WEEKDAYS" | "ONE_TIME";
    weekdays: number[];
    oneTimeDate: string | null;
    learningPracticeKind: "GENERAL" | "NEW_CONTENT" | "REVIEW" | "MIXED";
    aiSchedulingEnabled: boolean;
    targetSessionsPerWeek: number | null;
    minimumGapDays: number | null;
    childFriendlyGoal: string;
    successCriteria: string[];
    parentInstructions: string[];
  };
  rationale: string[];
  alternatives: Array<{ label: string; whenToUse: string; change: string }>;
  cautions: string[];
  evidencePrinciples: string[];
};

export type RewardAudit = {
  verdict: "BALANCED" | "NEEDS_SMALL_CHANGES" | "NEEDS_REBALANCE";
  score: number;
  summary: string;
  estimatedWeeklyStars: { minimum: number; likely: number; maximum: number };
  affordability: Array<{
    wishId: string;
    estimatedWeeks: number;
    assessment: "TOO_EASY" | "REASONABLE" | "TOO_HARD";
  }>;
  findings: Array<{
    severity: "INFO" | "WATCH" | "ADJUST";
    targetType: "SYSTEM" | "TASK" | "WISH";
    targetId: string | null;
    title: string;
    observation: string;
    recommendation: string;
    suggestedStars: number | null;
  }>;
  principles: string[];
  evidencePrinciples: string[];
  disclaimer: string;
};

export type SchedulePreference = {
  maxDailyMinutes: number;
  maxConsecutiveMinutes: number;
  minimumBreakMinutes: number;
  slots: Array<{ weekday: number; startMinute: number; endMinute: number }>;
};

export type AiSchedule = {
  summary: string;
  weekPlan: Array<{
    templateId: string;
    weekday: number;
    startMinute: number;
    durationMinutes: number;
    sessionType: "GENERAL" | "NEW_CONTENT" | "REVIEW" | "MIXED";
    note: string;
  }>;
  taskCadence: Array<{
    templateId: string;
    weekdays: number[];
    reasoning: string;
  }>;
  parentTips: string[];
  warnings: string[];
  evidencePrinciples: string[];
};

export type Wish = {
  id: string;
  category: "SPORTS" | "GAMES" | "TELEVISION" | "TOYS";
  title: string;
  costStars: number;
  redemptionType: "ONE_TIME" | "RECURRING" | "STOCK";
  recurrenceKind: "DAILY" | "WEEKLY" | "INTERVAL" | null;
  recurrenceIntervalDays: number | null;
  stockRemaining: number | null;
  sortOrder: number;
  isEnabled: boolean;
};

export type Redemption = {
  id: string;
  titleSnapshot: string;
  categorySnapshot: string;
  costStarsSnapshot: number;
  status: "PENDING" | "ARRANGED" | "COMPLETED" | "CANCELLED";
  requestedAt: string;
  arrangedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type LedgerEntry = {
  id: string;
  type:
    | "TASK_REWARD"
    | "TASK_REWARD_REVERSAL"
    | "DAILY_GOAL_BONUS"
    | "PLANET_BONUS"
    | "WISH_SPEND"
    | "WISH_REFUND"
    | "MANUAL_ADJUSTMENT";
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
};

export type PlanetKey =
  | "MERCURY"
  | "VENUS"
  | "EARTH"
  | "MARS"
  | "JUPITER"
  | "SATURN"
  | "URANUS"
  | "NEPTUNE";

export type PlanetSetting = {
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

export type PlanetSettingsResponse = {
  starBalance: number;
  lifetimeStarsEarned: number;
  planets: PlanetSetting[];
  pendingNotifications: PlanetKey[];
  pendingCelebrations: PlanetKey[];
};

export type Device = {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type TaskHistoryItem = {
  id: string;
  taskDate: string;
  titleSnapshot: string;
  categorySnapshot: string;
  modeSnapshot: "UNTIMED" | "TIMED";
  repeatableDailySnapshot: boolean;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "EXPIRED";
  baseStarsSnapshot: number;
  completedAt: string | null;
  completionDurationSeconds: number | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: "RUNNING" | "PAUSED" | "COMPLETED" | "ROLLED_BACK" | "TIMED_OUT" | "ABANDONED" | "DAY_ENDED";
    startedAt: string;
    endedAt: string | null;
    elapsedSeconds: number | null;
    baseStarsAwarded: number;
    bonusStarsAwarded: number;
  }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const PARENT_SESSION_EXPIRED_EVENT = "parent-session-expired";

function uploadContentType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
    const body = isJson ? await response.json().catch(() => ({})) : {};
    if (response.status === 401 && path !== "/api/parent/auth/login") {
      window.dispatchEvent(new Event(PARENT_SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      body.error?.message ?? "请求失败，请稍后重试",
      response.status,
      body.error?.code,
    );
  }
  if (!isJson) {
    throw new ApiError("后台服务尚未启动，请稍后重试", 503, "API_UNAVAILABLE");
  }
  return response.json();
}

export const staffApi = {
  me: () => api<{ user: StaffUser }>("/api/parent/me"),
  login: (username: string, password: string) =>
    api<{ user: StaffUser }>("/api/parent/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => api<{ ok: true }>("/api/parent/auth/logout", { method: "POST" }),
};

export const parentApi = {
  children: () => api<{ children: Child[] }>("/api/parent/children"),
  updateChild: (id: string, data: Record<string, unknown>) =>
    api<{ child: Child }>(`/api/parent/children/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  devices: (id: string) =>
    api<{ devices: Device[] }>(`/api/parent/children/${id}/devices`),
  logoutAll: (id: string) =>
    api<{ ok: true; sessionsRemoved: number }>(
      `/api/parent/children/${id}/logout-all`,
      { method: "POST" },
    ),
  templates: (childId: string) =>
    api<{ templates: TaskTemplate[] }>(
      `/api/parent/children/${childId}/task-templates`,
    ),
  hanziSettings: (childId: string) =>
    api<HanziSettingsResponse>(
      `/api/parent/children/${childId}/hanzi/settings`,
    ),
  updateHanziSettings: (
    childId: string,
    data: HanziLearningSettings,
  ) =>
    api<{ settings: HanziLearningSettings }>(
      `/api/parent/children/${childId}/hanzi/settings`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  clockSettings: (childId: string) =>
    api<{ settings: ClockLearningSettings; stats: ClockLearningStats }>(
      `/api/parent/children/${childId}/clock/settings`,
    ),
  updateClockSettings: (childId: string, data: ClockLearningSettings) =>
    api<{ settings: ClockLearningSettings }>(
      `/api/parent/children/${childId}/clock/settings`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  hanziCharacters: (
    childId: string,
    query: { q?: string; page?: number; pageSize?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.page) search.set("page", String(query.page));
    if (query.pageSize) search.set("pageSize", String(query.pageSize));
    return api<{
      characters: HanziCharacterResource[];
      total: number;
      page: number;
      pageSize: number;
    }>(
      `/api/parent/children/${childId}/hanzi/characters?${search.toString()}`,
    );
  },
  createHanziCharacter: (
    childId: string,
    data: Record<string, unknown>,
  ) =>
    api<{ character: HanziCharacterResource }>(
      `/api/parent/children/${childId}/hanzi/characters`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  updateHanziCharacter: (
    childId: string,
    id: string,
    data: Record<string, unknown>,
  ) =>
    api<{ character: HanziCharacterResource }>(
      `/api/parent/children/${childId}/hanzi/characters/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  uploadHanziMedia: (
    childId: string,
    id: string,
    kind: HanziMediaKind,
    file: File,
    wordIndex?: number,
  ) => {
    const search = new URLSearchParams();
    if (wordIndex !== undefined) {
      search.set("wordIndex", String(wordIndex));
    }
    const suffix = search.size ? `?${search.toString()}` : "";
    return api<{ character: HanziCharacterResource }>(
      `/api/parent/children/${childId}/hanzi/characters/${id}/media/${kind}${suffix}`,
      {
        method: "PUT",
        headers: { "Content-Type": uploadContentType(file) },
        body: file,
      },
    );
  },
  generateHanziMedia: (
    childId: string,
    id: string,
    kind: HanziMediaKind,
    wordIndex?: number,
  ) => {
    const search = new URLSearchParams();
    if (wordIndex !== undefined) {
      search.set("wordIndex", String(wordIndex));
    }
    const suffix = search.size ? `?${search.toString()}` : "";
    return api<{ character: HanziCharacterResource }>(
      `/api/parent/children/${childId}/hanzi/characters/${id}/generate/${kind}${suffix}`,
      { method: "POST" },
    );
  },
  deleteHanziCharacter: (childId: string, id: string) =>
    api<{ ok: true }>(
      `/api/parent/children/${childId}/hanzi/characters/${id}`,
      { method: "DELETE" },
    ),
  poemSettings: (childId: string) =>
    api<PoemSettingsResponse>(
      `/api/parent/children/${childId}/poems/settings`,
    ),
  updatePoemSettings: (
    childId: string,
    data: PoemLearningSettings,
  ) =>
    api<{ settings: PoemLearningSettings }>(
      `/api/parent/children/${childId}/poems/settings`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  poems: (
    childId: string,
    query: { q?: string; grade?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.grade) search.set("grade", String(query.grade));
    return api<{ poems: PoemResource[] }>(
      `/api/parent/children/${childId}/poems?${search.toString()}`,
    );
  },
  generatePoemMedia: (
    childId: string,
    id: string,
    kind: "image" | "audio",
  ) =>
    api<{ poem: Omit<PoemResource, "progress"> }>(
      `/api/parent/children/${childId}/poems/${id}/generate/${kind}`,
      { method: "POST" },
    ),
  createTemplate: (childId: string, data: Record<string, unknown>) =>
    api<{ template: TaskTemplate }>(
      `/api/parent/children/${childId}/task-templates`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  updateTemplate: (
    childId: string,
    id: string,
    data: Record<string, unknown>,
  ) =>
    api<{ template?: TaskTemplate }>(
      `/api/parent/children/${childId}/task-templates/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  archiveTemplate: (childId: string, id: string) =>
    api<{ ok: true }>(
      `/api/parent/children/${childId}/task-templates/${id}`,
      { method: "DELETE" },
    ),
  reorderTemplates: (
    childId: string,
    items: Array<{ id: string; sortOrder: number }>,
  ) =>
    api<{ ok: true }>(`/api/parent/children/${childId}/task-templates/order`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),
  wishes: (childId: string) =>
    api<{ wishes: Wish[] }>(`/api/parent/children/${childId}/wishes`),
  createWish: (childId: string, data: Record<string, unknown>) =>
    api<{ wish: Wish }>(`/api/parent/children/${childId}/wishes`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWish: (childId: string, id: string, data: Record<string, unknown>) =>
    api<{ ok: true }>(`/api/parent/children/${childId}/wishes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archiveWish: (childId: string, id: string) =>
    api<{ ok: true }>(`/api/parent/children/${childId}/wishes/${id}`, {
      method: "DELETE",
    }),
  redemptions: (childId: string) =>
    api<{ redemptions: Redemption[] }>(
      `/api/parent/children/${childId}/redemptions`,
    ),
  updateRedemption: (
    childId: string,
    id: string,
    status: "ARRANGED" | "COMPLETED" | "CANCELLED",
    cancelReason?: string,
  ) =>
    api<{ redemption: Redemption }>(
      `/api/parent/children/${childId}/redemptions/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, cancelReason }),
      },
    ),
  ledger: (childId: string) =>
    api<{ entries: LedgerEntry[] }>(
      `/api/parent/children/${childId}/star-ledger`,
    ),
  adjustStars: (
    childId: string,
    amount: number,
    reason: string,
  ) =>
    api<{ ledger: LedgerEntry }>(
      `/api/parent/children/${childId}/stars/adjust`,
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    ),
  stats: (childId: string) =>
    api<{
      tasks: Record<string, number>;
      taskInstances: { total: number; completed: number };
      attempts: Array<{
        status: string;
        count: number;
        elapsedSeconds: number;
        baseStars: number;
        bonusStars: number;
      }>;
      stars: Record<string, number>;
    }>(`/api/parent/children/${childId}/stats`),
  taskHistory: (childId: string, days: number) =>
    api<{ from: string; to: string; days: number; tasks: TaskHistoryItem[] }>(
      `/api/parent/children/${childId}/task-history?days=${days}`,
    ),
  refundTask: (childId: string, taskId: string) =>
    api<{
      ok: true;
      dailyTaskId: string;
      attemptId: string;
      attemptNumber: number;
      taskRewardStars: number;
      dailyGoalBonusStars: number;
      reversedStars: number;
      balanceAfter: number;
      lifetimeStarsEarnedAfter: number;
    }>(`/api/parent/children/${childId}/task-history/${taskId}/rollback`, {
      method: "POST",
    }),
  planets: (childId: string) =>
    api<PlanetSettingsResponse>(`/api/parent/children/${childId}/planets`),
  savePlanets: (
    childId: string,
    planets: Array<{
      planet: PlanetKey;
      requiredLifetimeStars: number;
      bonusStars: number;
    }>,
  ) =>
    api<PlanetSettingsResponse>(`/api/parent/children/${childId}/planets`, {
      method: "PUT",
      body: JSON.stringify({ planets }),
    }),
  aiConfig: () => api<{ config: AiConfig }>("/api/parent/ai/config"),
  aiModels: () =>
    api<{ models: Array<{ id: string; ownedBy: string }> }>("/api/parent/ai/models"),
  saveAiConfig: (data: {
    apiKey?: string;
    model: AiConfig["model"];
    enabled: boolean;
  }) =>
    api<{ config: AiConfig }>("/api/parent/ai/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testAiConfig: () =>
    api<{ ok: true; message: string; model: string }>(
      "/api/parent/ai/config/test",
      { method: "POST" },
    ),
  minimaxConfig: () =>
    api<{ config: MinimaxConfig }>("/api/parent/minimax/config"),
  saveMinimaxConfig: (data: { apiKey?: string; enabled: boolean }) =>
    api<{ config: MinimaxConfig }>("/api/parent/minimax/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testMinimaxConfig: () =>
    api<{ ok: true; message: string }>("/api/parent/minimax/config/test", {
      method: "POST",
    }),
  taskAdvice: (
    childId: string,
    data: { description: string; desiredOutcome?: string; constraints?: string },
  ) =>
    api<{ recommendationId: string; advice: TaskAdvice; promptVersion: string }>(
      `/api/parent/children/${childId}/ai/task-advice`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  applyTaskAdvice: (childId: string, recommendationId: string) =>
    api<{ template: TaskTemplate }>(
      `/api/parent/children/${childId}/ai/task-advice/${recommendationId}/apply`,
      { method: "POST" },
    ),
  rewardAudit: (childId: string) =>
    api<{ recommendationId: string; audit: RewardAudit; promptVersion: string }>(
      `/api/parent/children/${childId}/ai/reward-audit`,
      { method: "POST" },
    ),
  schedulePreference: (childId: string) =>
    api<{ preference: SchedulePreference }>(
      `/api/parent/children/${childId}/schedule-preferences`,
    ),
  saveSchedulePreference: (
    childId: string,
    preference: SchedulePreference,
  ) =>
    api<{ ok: true }>(
      `/api/parent/children/${childId}/schedule-preferences`,
      { method: "PUT", body: JSON.stringify(preference) },
    ),
  generateSchedule: (childId: string) =>
    api<{
      recommendationId: string;
      schedule: AiSchedule;
      promptVersion: string;
    }>(`/api/parent/children/${childId}/ai/schedule`, { method: "POST" }),
  applySchedule: (childId: string, recommendationId: string) =>
    api<{ ok: true }>(
      `/api/parent/children/${childId}/ai/schedule/${recommendationId}/apply`,
      { method: "POST" },
    ),
};
