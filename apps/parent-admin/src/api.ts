import { createIdempotencyKey } from "./idempotency";

export type StaffUser = {
  id: string;
  username: string;
  displayName: string;
  role: "PARENT" | "SUPER_ADMIN";
  familyId: string | null;
};

export type TravelPackingItem = {
  id: string;
  categoryId: string;
  label: string;
  quantity: number;
  packed: boolean;
  location: "SUITCASE" | "BACKPACK" | "CAR";
  expirationDate: string | null;
  sortOrder: number;
};

export type TravelPackingCategory = {
  id: string;
  listId: string;
  name: string;
  sortOrder: number;
  items: TravelPackingItem[];
};

export type TravelPackingList = {
  id: string;
  familyId: string;
  title: string;
  categories: TravelPackingCategory[];
};

export type TravelPackingShare = {
  token: string;
  expiresAt: string;
};

export type TravelPackingTips = {
  summary: { total: number; ready: number; attention: number };
  groups: Array<{
    name: string;
    items: Array<{
      id: string;
      label: string;
      priority: "ESSENTIAL" | "RECOMMENDED";
      status: "NOT_LISTED" | "UNPACKED" | "OUT_OF_STOCK" | "EXPIRED";
    }>;
  }>;
};

export type Child = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
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

export type LeaderboardSettings = {
  competitorGrowthPercent: number;
  dailyCompetitorStarDelta: number;
  dailyAdjustmentDate: string | null;
};

export type PetGrowthSummary = {
  pet: { petType: string; nickname: string | null; level: number; experience: number; growthStage: "BABY" | "GROWING" | "MATURE"; satiety: number; hydration: number; currentLevelStart: number; nextLevelExperience: number | null };
  wallet: { starBalance: number; dailySpent: number; dailySpendLimitStars: number | null };
  redPackets: { availableCount: number; packetsPerLevel: number; minStars: number; maxStars: number };
  statusDecay: { satietyMinutes: number; hydrationMinutes: number };
  waste: {
    active: null | { id: string; appearsMinute: number; positionSeed: number; costStars: number };
    pendingCount: number;
    dailyCount: number;
    cleanCostStars: number;
  };
  travelEnabled: boolean;
  roomThemes: Array<{
    key: string;
    name: string;
    description: string;
    priceStars: number;
    previewUrl: string;
    isOwned: boolean;
    isEquipped: boolean;
  }>;
  currentTrip: null | { id: string; status: string; destinationName: string; city: string; country: string; returnsAt: string };
  postcards: Array<{ id: string; destinationName: string; city: string; country: string; imageUrl: string; revealedAt: string | null }>;
};

export type LeaderboardPreview = {
  entries: Array<{
    rank: number | null;
    displayName: string;
    stars: number;
    completedTasks: number;
    isSelf: boolean;
  }>;
  self: {
    rank: number | null;
    stars: number;
    completedTasks: number;
    totalParticipants: number;
    inTopTen: boolean;
    starsToNextRank: number;
  };
};

export type LeaderboardSettingsResponse = {
  settings: LeaderboardSettings;
  preview: LeaderboardPreview;
};

export type TaskTemplate = {
  id: string;
  title: string;
  experienceKind:
    | "STANDARD"
    | "HANZI_LEARNING"
    | "HANZI_REVIEW"
    | "CLOCK_LEARNING"
    | "MAKE_TEN"
    | "MATH_PRACTICE"
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
  mathPracticeConfig: {
    totalQuestions: number;
    typeCounts: Record<string, number>;
    arithmeticItemsPerQuestion: Record<string, number>;
  } | null;
};

export type HanziLearningSettings = {
  newCharactersPerDay: number;
  reviewDailyLimit: number;
  consolidationQuestionCount: number;
  reviewTaskStars: number;
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

export type MakeTenLearningSettings = {
  questionsPerDay: number;
  secondsPerQuestion: number;
  passAccuracyPercent: number;
};

export type MathPracticeSettings = {
  totalQuestions: number;
  typeCounts: Record<string, number>;
  arithmeticItemsPerQuestion: Record<string, number>;
};

export type MathMasteryLevel = "NO_DATA" | "WEAK" | "DEVELOPING" | "PROFICIENT" | "MASTERED";
export type MathMasteryTrend = "INSUFFICIENT" | "IMPROVING" | "STABLE" | "DECLINING";

export type MathMasteryStats = {
  practiceSessions: number;
  totalQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  accuracy: number | null;
  firstTryAccuracy: number | null;
  averageResponseMs: number | null;
  expectedResponseMs: number | null;
  recentQuestions: number;
  recentAccuracy: number | null;
  recentAverageResponseMs: number | null;
  mastery: { level: MathMasteryLevel; label: string; score: number };
  trend: MathMasteryTrend;
};

export type MathMasteryResponse = {
  range: { from: string; to: string; recentFrom: string };
  summary: MathMasteryStats;
  types: Array<MathMasteryStats & {
    questionTypeId: string;
    name: string;
    categoryId: string;
    categoryName: string;
    familyId: string;
    familyName: string;
  }>;
};

export type MakeTenFactStats = {
  target: number;
  answer: number;
  attemptCount: number;
  correctCount: number;
  accuracy: number | null;
  averageResponseMs: number | null;
  recentAccuracy: number | null;
  recentResponseMs: number | null;
  consecutiveWrong: number;
  priority: {
    level: "NO_DATA" | "FOCUS" | "SLOW" | "STRONG" | "PRACTICING";
    label: string;
  };
  questionWeight: number;
};

export type MakeTenLearningStats = ClockLearningStats & {
  averageResponseMs: number | null;
  facts: MakeTenFactStats[];
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
    | "PET_CARE_SPEND"
    | "PET_TRAVEL_SPEND"
    | "PET_ROOM_THEME_SPEND"
    | "PET_RED_PACKET_REWARD"
    | "PET_REFUND"
    | "MANUAL_ADJUSTMENT";
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
};

export type GrowthAnalytics = {
  range: { days: number; from: string; to: string };
  summary: {
    scheduledTasks: number;
    completedTasks: number;
    completionRate: number;
    activeDays: number;
    taskStarsEarned: number;
    bonusStarsEarned: number;
    rewardStarsReversed: number;
    starsSpent: number;
    starsRefunded: number;
    netStars: number;
  };
  daily: Array<{
    date: string;
    scheduledTasks: number;
    completedTasks: number;
    completedAttempts: number;
    failedAttempts: number;
    abandonedAttempts: number;
    taskStarsEarned: number;
    bonusStarsEarned: number;
    rewardStarsReversed: number;
    starsSpent: number;
    starsRefunded: number;
  }>;
  categories: Array<{
    category: "MATH" | "EXERCISE" | "CHORES" | "CHINESE" | "ENGLISH" | "OTHER";
    label: string;
    scheduledTasks: number;
    completedTasks: number;
    completedAttempts: number;
    failedAttempts: number;
    starsEarned: number;
    completionRate: number;
  }>;
  tasks: Array<{
    templateId: string;
    title: string;
    category: "MATH" | "EXERCISE" | "CHORES" | "CHINESE" | "ENGLISH" | "OTHER";
    categoryLabel: string;
    repeatableDaily: boolean;
    scheduledDays: number;
    completedDays: number;
    completedAttempts: number;
    failedAttempts: number;
    abandonedAttempts: number;
    starsEarned: number;
    completionRate: number;
    averageMinutes: number | null;
  }>;
  spending: Array<{
    category: "SPORTS" | "TELEVISION" | "TOYS" | "PET_CARE" | "PET_TRAVEL" | "PET_ROOM_THEME";
    label: string;
    redemptionCount: number;
    starsSpent: number;
    share: number;
  }>;
  spendingItems: Array<{
    title: string;
    category: "SPORTS" | "TELEVISION" | "TOYS" | "PET_CARE" | "PET_TRAVEL" | "PET_ROOM_THEME";
    redemptionCount: number;
    starsSpent: number;
  }>;
  insights: {
    strongTaskIds: string[];
    focusTaskIds: string[];
    preferredWishCategory: "SPORTS" | "TELEVISION" | "TOYS" | null;
  };
};

export type WeeklyGrowthTaskFinding = {
  templateId: string;
  title: string;
  evidence: string;
  nextStep: string;
};

export type WeeklyGrowthAnalysis = {
  summary: string;
  dataQuality: "SUFFICIENT" | "LIMITED";
  doingWell: WeeklyGrowthTaskFinding[];
  needsAdjustment: WeeklyGrowthTaskFinding[];
  cadenceChanges: Array<{
    templateId: string;
    title: string;
    currentCadence: string;
    recommendedCadence: string;
    reason: string;
  }>;
  recommendedSchedule: Array<{
    templateId: string;
    title: string;
    frequency: "DAILY" | "WORKDAYS" | "SELECTED_WEEKDAYS" | "AUTOMATIC_DUE";
    weekdays: number[];
    reason: string;
  }>;
  parentActions: string[];
};

export type WeeklyGrowthReport = {
  id: string;
  status: "GENERATING" | "COMPLETED" | "FAILED";
  weekStart: string;
  weekEnd: string;
  analysisStart: string;
  analysisEnd: string;
  generatedAt: string | null;
  model: string | null;
  analysis: WeeklyGrowthAnalysis | null;
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
    status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "ROLLED_BACK" | "TIMED_OUT" | "ABANDONED" | "DAY_ENDED";
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
export const PARENT_FEEDBACK_EVENT = "parent-feedback";

function isMutationRequest(path: string, method: string) {
  return method !== "GET" && !path.includes("/auth/");
}

function mutationSuccessText(method: string) {
  if (method === "DELETE") return "删除成功";
  if (method === "PATCH" || method === "PUT") return "保存成功";
  return "操作成功";
}

function notifyParentFeedback(kind: "success" | "error", text: string) {
  window.dispatchEvent(new CustomEvent(PARENT_FEEDBACK_EVENT, { detail: { kind, text } }));
}

function uploadContentType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    tif: "image/tiff",
    tiff: "image/tiff",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isMutation = isMutationRequest(path, method);
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (reason) {
    if (isMutation) notifyParentFeedback("error", "网络连接失败，保存没有完成");
    throw reason;
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!response.ok) {
    const body = isJson ? await response.json().catch(() => ({})) : {};
    if (response.status === 401 && path !== "/api/parent/auth/login") {
      window.dispatchEvent(new Event(PARENT_SESSION_EXPIRED_EVENT));
    }
    const errorMessage = body.error?.message ?? "请求失败，请稍后重试";
    if (isMutation) notifyParentFeedback("error", errorMessage);
    throw new ApiError(
      errorMessage,
      response.status,
      body.error?.code,
    );
  }
  if (!isJson) {
    if (isMutation) notifyParentFeedback("error", "后台服务尚未启动，请稍后重试");
    throw new ApiError("后台服务尚未启动，请稍后重试", 503, "API_UNAVAILABLE");
  }
  const result = await response.json() as T;
  if (isMutation) notifyParentFeedback("success", mutationSuccessText(method));
  return result;
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

export function createTravelPackingApi(shareToken?: string) {
  const base = shareToken
    ? `/api/public/travel-packing/${encodeURIComponent(shareToken)}`
    : "/api/parent/travel-packing-list";
  return {
    list: () => api<{ list: TravelPackingList }>(base),
    tips: () => api<TravelPackingTips>(`${base}/tips`),
    renameList: (title: string) => api<{ list: TravelPackingList }>(base, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
    addCategory: (name: string) => api<{ list: TravelPackingList }>(`${base}/categories`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
    renameCategory: (id: string, name: string) => api<{ list: TravelPackingList }>(`${base}/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
    deleteCategory: (id: string) => api<{ list: TravelPackingList }>(`${base}/categories/${id}`, {
      method: "DELETE",
    }),
    addItem: (
      categoryId: string,
      label: string,
      quantity: number,
      location: TravelPackingItem["location"] = "SUITCASE",
      expirationDate: string | null = null,
    ) => api<{ list: TravelPackingList }>(`${base}/categories/${categoryId}/items`, {
      method: "POST",
      body: JSON.stringify({ label, quantity, location, expirationDate }),
    }),
    updateItem: (
      id: string,
      data: Partial<Pick<TravelPackingItem, "label" | "quantity" | "packed" | "location" | "expirationDate">>,
    ) => api<{ list: TravelPackingList }>(`${base}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    deleteItem: (id: string) => api<{ list: TravelPackingList }>(`${base}/items/${id}`, {
      method: "DELETE",
    }),
    resetList: () => api<{ list: TravelPackingList }>(`${base}/reset`, { method: "POST" }),
  };
}

export const parentApi = {
  travelPackingList: () =>
    api<{ list: TravelPackingList }>("/api/parent/travel-packing-list"),
  renameTravelPackingList: (title: string) =>
    api<{ list: TravelPackingList }>("/api/parent/travel-packing-list", {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  addTravelPackingCategory: (name: string) =>
    api<{ list: TravelPackingList }>("/api/parent/travel-packing-list/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameTravelPackingCategory: (id: string, name: string) =>
    api<{ list: TravelPackingList }>(`/api/parent/travel-packing-list/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteTravelPackingCategory: (id: string) =>
    api<{ list: TravelPackingList }>(`/api/parent/travel-packing-list/categories/${id}`, {
      method: "DELETE",
    }),
  addTravelPackingItem: (categoryId: string, label: string, quantity: number, location: TravelPackingItem["location"] = "SUITCASE", expirationDate: string | null = null) =>
    api<{ list: TravelPackingList }>(`/api/parent/travel-packing-list/categories/${categoryId}/items`, {
      method: "POST",
      body: JSON.stringify({ label, quantity, location, expirationDate }),
    }),
  updateTravelPackingItem: (
    id: string,
    data: Partial<Pick<TravelPackingItem, "label" | "quantity" | "packed" | "location" | "expirationDate">>,
  ) =>
    api<{ list: TravelPackingList }>(`/api/parent/travel-packing-list/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTravelPackingItem: (id: string) =>
    api<{ list: TravelPackingList }>(`/api/parent/travel-packing-list/items/${id}`, {
      method: "DELETE",
    }),
  resetTravelPackingList: () =>
    api<{ list: TravelPackingList }>("/api/parent/travel-packing-list/reset", { method: "POST" }),
  createTravelPackingShare: (expiresInDays: number) =>
    api<TravelPackingShare>("/api/parent/travel-packing-list/shares", {
      method: "POST",
      body: JSON.stringify({ expiresInDays }),
    }),
  petGrowth: (childId: string) => api<PetGrowthSummary>(`/api/parent/children/${childId}/pet-growth`),
  updatePetGrowthSettings: (childId: string, data: {
    travelEnabled: boolean;
    dailySpendLimitStars: number | null;
    satiety?: number;
    hydration?: number;
    satietyDecayMinutes: number;
    hydrationDecayMinutes: number;
    dailyWasteCount: number;
    wasteCleanCostStars: number;
    redPacketsPerLevel: number;
    redPacketMinStars: number;
    redPacketMaxStars: number;
  }) => api<{ settings: {
    travelEnabled: boolean;
    dailySpendLimitStars: number | null;
    satietyDecayMinutes: number | null;
    hydrationDecayMinutes: number | null;
    dailyWasteCount: number;
    wasteCleanCostStars: number;
    redPacketsPerLevel: number;
    redPacketMinStars: number;
    redPacketMaxStars: number;
  } }>(`/api/parent/children/${childId}/pet-growth/settings`, { method: "PATCH", body: JSON.stringify(data) }),
  grantPetRedPackets: (childId: string, count: number) =>
    api<{ grantedCount: number; availableCount: number }>(
      `/api/parent/children/${childId}/pet-growth/red-packets/grant`,
      { method: "POST", body: JSON.stringify({ count }) },
    ),
  updatePetRoomThemes: (themes: Array<{ key: string; priceStars: number }>) => api<{ themes: Array<{ themeId: string; priceStars: number }> }>("/api/parent/pet-growth/themes", { method: "PATCH", body: JSON.stringify({ themes }) }),
  children: () => api<{ children: Child[] }>("/api/parent/children"),
  updateChild: (id: string, data: Record<string, unknown>) =>
    api<{ child: Child }>(`/api/parent/children/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  uploadChildAvatar: (id: string, file: File) =>
    api<{ child: { id: string; avatarUrl: string } }>(
      `/api/parent/children/${id}/avatar`,
      {
        method: "PUT",
        headers: { "Content-Type": uploadContentType(file) },
        body: file,
      },
    ),
  leaderboardSettings: (childId: string) =>
    api<LeaderboardSettingsResponse>(`/api/parent/children/${childId}/leaderboard/settings`),
  updateLeaderboardSettings: (childId: string, data: Pick<LeaderboardSettings, "competitorGrowthPercent" | "dailyCompetitorStarDelta">) =>
    api<LeaderboardSettingsResponse>(`/api/parent/children/${childId}/leaderboard/settings`, {
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
  makeTenSettings: (childId: string) =>
    api<{ settings: MakeTenLearningSettings; stats: MakeTenLearningStats }>(
      `/api/parent/children/${childId}/make-ten/settings`,
    ),
  updateMakeTenSettings: (childId: string, data: MakeTenLearningSettings) =>
    api<{ settings: MakeTenLearningSettings }>(
      `/api/parent/children/${childId}/make-ten/settings`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  mathPracticeSettings: (childId: string) =>
    api<{ settings: MathPracticeSettings }>(
      `/api/parent/children/${childId}/math/settings`,
    ),
  updateMathPracticeSettings: (childId: string, data: MathPracticeSettings) =>
    api<{ settings: MathPracticeSettings }>(
      `/api/parent/children/${childId}/math/settings`,
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
          idempotencyKey: createIdempotencyKey("manual-stars"),
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
  growthAnalytics: (childId: string, days: 7 | 30 | 90) =>
    api<GrowthAnalytics>(
      `/api/parent/children/${childId}/growth-analytics?days=${days}`,
    ),
  mathMastery: (childId: string, days: 7 | 30 | 90) =>
    api<MathMasteryResponse>(
      `/api/parent/children/${childId}/math-mastery?days=${days}`,
    ),
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
  weeklyGrowth: (childId: string) =>
    api<{ configured: boolean; report: WeeklyGrowthReport | null }>(
      `/api/parent/children/${childId}/ai/weekly-growth`,
    ),
  generateWeeklyGrowth: (childId: string) =>
    api<{ report: WeeklyGrowthReport | null }>(
      `/api/parent/children/${childId}/ai/weekly-growth/generate`,
      { method: "POST" },
    ),
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
  triggerChallengeLetter: (childId: string) =>
    api<{ conversation: unknown }>(`/api/parent/children/${childId}/challenge-letter`, { method: "POST" }),
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
