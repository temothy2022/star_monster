import type { PetType } from "../mascots";
import type { PlanetKey } from "../planets/planet-data";
import type { MathQuestion } from "@star-monsters/math-practice";
import { createIdempotencyKey } from "./idempotency";
import { recordApiPerformance } from "./performance-telemetry";

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

const GET_MEMORY_CACHE_MS = 2_000;
const GET_MEMORY_CACHE_LIMIT = 20;
const getMemoryCache = new Map<
  string,
  { expiresAt: number; value: unknown }
>();

function cacheGetResponse(path: string, value: unknown) {
  getMemoryCache.delete(path);
  getMemoryCache.set(path, {
    expiresAt: Date.now() + GET_MEMORY_CACHE_MS,
    value,
  });
  while (getMemoryCache.size > GET_MEMORY_CACHE_LIMIT) {
    const oldestKey = getMemoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    getMemoryCache.delete(oldestKey);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET") {
    const cached = getMemoryCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) getMemoryCache.delete(path);
  }
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const startedAt = globalThis.performance?.now() ?? Date.now();
  let status = 0;
  let requestId: string | null = null;
  let serverMs: number | null = null;

  try {
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
    status = response.status;
    requestId = response.headers.get("x-request-id");
    const serverTiming = response.headers.get("server-timing");
    const serverDuration = serverTiming?.match(/(?:^|,)\s*app;dur=([\d.]+)/)?.[1];
    serverMs = serverDuration ? Number(serverDuration) : null;

    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    if (!response.ok) {
      const body = (
        isJson ? await response.json().catch(() => ({})) : {}
      ) as ApiErrorBody;
      throw new ApiError(
        body.error?.message ?? "暂时无法连接星宠基地",
        response.status,
        body.error?.code,
      );
    }
    if (!isJson) {
      throw new ApiError(
        "星宠基地服务尚未启动，请稍后再试",
        503,
        "API_UNAVAILABLE",
      );
    }
    const result = (await response.json()) as T;
    if (method === "GET") {
      cacheGetResponse(path, result);
    } else {
      getMemoryCache.clear();
    }
    return result;
  } finally {
    if (!init?.signal?.aborted) {
      const finishedAt = globalThis.performance?.now() ?? Date.now();
      recordApiPerformance({
        path,
        method,
        status,
        requestId,
        startedAt,
        totalMs: Math.max(0, finishedAt - startedAt),
        serverMs,
      });
    }
  }
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

export type PetTravelTier = "NEARBY" | "CHINA" | "WORLD";
export type PetDialogueContext =
  | "PET_NEEDS_CARE"
  | "PET_HUNGRY"
  | "PET_THIRSTY"
  | "PET_TASK_START"
  | "PET_TASK_PROGRESS"
  | "PET_TASK_COMPLETE"
  | "PET_RELAX"
  | "PET_GENERAL";
export type PetTrip = {
  id: string;
  status: "TRAVELING" | "RETURNED" | "REVEALED" | "CANCELLED";
  tier: PetTravelTier;
  destinationName: string;
  city: string;
  country: string;
  introduction: string;
  funFact: string;
  imageUrl: string;
  audioUrl: string | null;
  costStars: number;
  departedAt: string;
  returnsAt: string;
  returnedAt: string | null;
  revealedAt: string | null;
};

export type PetGrowthState = {
  pet: {
    petType: PetType;
    nickname: string | null;
    level: number;
    experience: number;
    growthStage: "BABY" | "GROWING" | "MATURE";
    satiety: number;
    hydration: number;
    currentLevelStart: number;
    nextLevelExperience: number | null;
  };
  wallet: {
    starBalance: number;
    dailySpent: number;
    dailySpendLimitStars: number | null;
  };
  redPackets: {
    availableCount: number;
    packetsPerLevel: number;
    minStars: number;
    maxStars: number;
  };
  travelEnabled: boolean;
  travelOptions: Array<{
    tier: PetTravelTier;
    costStars: number;
    durationMinutes: number;
    experience: number;
  }>;
  careOptions: {
    feed: { costStars: number; restore: number; experience: number };
    drink: { costStars: number; restore: number; experience: number };
  };
  statusDecay: { satietyMinutes: number; hydrationMinutes: number };
  waste: {
    active: null | { id: string; appearsMinute: number; positionSeed: number; costStars: number };
    pendingCount: number;
    dailyCount: number;
    cleanCostStars: number;
  };
  mascotAssets: Array<{
    slot: "TASK_IDLE" | "NEUTRAL" | "FOCUS" | "CELEBRATE" | "HUNGRY" | "EATING" | "DRINKING" | "TRAVEL" | "SLEEPING";
    mediaUrl: string;
    updatedAt: string;
  }>;
  roomThemes: PetRoomTheme[];
  equippedRoomThemeKey: string | null;
  dialogueContext?: PetDialogueContext;
  dialogues?: MascotDialogue[];
  taskProgress?: { total: number; completed: number };
  currentTrip: PetTrip | null;
  postcards: PetTrip[];
};

export type PetRoomTheme = {
  key: string;
  name: string;
  description: string;
  priceStars: number;
  backgroundLandscapeUrl: string;
  backgroundTabletUrl: string;
  backgroundPhoneUrl: string;
  previewUrl: string;
  ambience: Array<{
    imageUrl: string;
    motion: "DRIFT" | "FLY" | "FLOAT" | "FALL" | "TWINKLE" | "RISE" | "SWIM" | "COMET" | "ORBIT";
    placement: "TOP" | "UPPER_RIGHT" | "CENTER" | "BOTTOM_LEFT";
  }>;
  mascotMotion: "IDLE" | "CLOUD_FLOAT" | "UNDERWATER_SWIM" | "PETAL_SWAY" | "STARGAZE" | "ZERO_GRAVITY" | "SPORT_BOUNCE" | "ADVENTURE_MARCH";
  mascotAnimationUrl: string | null;
  isOwned: boolean;
  isEquipped: boolean;
};

export function getPetGrowth(signal?: AbortSignal) {
  return request<PetGrowthState>("/api/child/pet", { cache: "no-store", signal });
}

export function careForPet(kind: "feed" | "drink", idempotencyKey: string) {
  return request<PetGrowthState>(`/api/child/pet/${kind}`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function cleanPetWaste(wasteId: string, idempotencyKey: string) {
  return request<PetGrowthState>(`/api/child/pet/waste/${encodeURIComponent(wasteId)}/clean`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function openPetRedPacket(idempotencyKey: string) {
  return request<{
    state: PetGrowthState;
    reward: { packetId: string; stars: number; sourceLevel: number };
  }>("/api/child/pet/red-packets/open", {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function startPetTrip(tier: PetTravelTier, idempotencyKey: string) {
  return request<PetGrowthState>("/api/child/pet/trips", {
    method: "POST",
    body: JSON.stringify({ tier, idempotencyKey }),
  });
}

export function revealPetTrip(tripId: string) {
  return request<PetGrowthState>(`/api/child/pet/trips/${tripId}/reveal`, {
    method: "POST",
  });
}

export function purchasePetRoomTheme(themeKey: string, idempotencyKey: string) {
  return request<PetGrowthState>(`/api/child/pet/room-themes/${encodeURIComponent(themeKey)}/purchase`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function selectPetRoomTheme(themeKey: string) {
  return request<PetGrowthState>(`/api/child/pet/room-themes/${encodeURIComponent(themeKey)}/select`, {
    method: "POST",
  });
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
  experienceKindSnapshot:
    | "STANDARD"
    | "HANZI_LEARNING"
    | "HANZI_REVIEW"
    | "CLOCK_LEARNING"
    | "MAKE_TEN"
    | "MATH_PRACTICE"
    | "POEM_LEARNING"
    | "POEM_REVIEW";
  suggestedSecondsSnapshot: number | null;
  timeLimitSecondsSnapshot: number | null;
  baseStarsSnapshot: number;
  earlyThresholdSecsSnapshot: number | null;
  earlyBonusStarsSnapshot: number | null;
  repeatableDailySnapshot: boolean;
  completionDurationSeconds: number | null;
  completedAttemptCount?: number;
  attempts?: Array<{
    baseStarsAwarded: number;
    bonusStarsAwarded: number;
  }>;
};

export type TaskAttempt = {
  id: string;
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "ROLLED_BACK" | "TIMED_OUT" | "ABANDONED" | "DAY_ENDED";
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
  mascotContext: "START" | "PROGRESS" | "COMPLETE" | "EMPTY";
  mascotDialogues: MascotDialogue[];
  mascotAssets: MascotAsset[];
};

export type MascotAsset = {
  id: string;
  petType: PetType;
  slot: "TASK_IDLE";
  mediaUrl: string;
  updatedAt: string;
};

export type MascotDialogue = {
  id: string;
  key: string;
  context:
    | "START"
    | "PROGRESS"
    | "COMPLETE"
    | "EMPTY"
    | "GENERAL"
    | PetDialogueContext;
  text: string;
  audioUrl: string | null;
};

export async function getTodayTasks(signal?: AbortSignal) {
  return request<TodayTaskExperience>("/api/child/tasks/today", {
    cache: "no-store",
    signal,
  });
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

export type HanziCharacter = {
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
};

export type HanziLearningSession = {
  id: string;
  taskAttemptId: string;
  kind: "COMBINED_LEGACY" | "LEARNING" | "REVIEW";
  phase: "REVIEW" | "NEW_LEARNING" | "CONSOLIDATION" | "COMPLETED";
  reviewCharacterIds: string[];
  reviewIndex: number;
  reviewKnownIds: string[];
  reviewUnknownIds: string[];
  newCharacterIds: string[];
  newIndex: number;
  questionIndex: number;
  consolidationCorrect: number;
  consolidationTotal: number;
  questions: Array<{ targetId: string; optionIds: string[] }>;
  characters: HanziCharacter[];
  summary: {
    reviewKnown: number;
    reviewUnknown: number;
    learned: number;
    correct: number;
    total: number;
  };
};

export async function startHanziLearningSession(
  attemptId: string,
  signal?: AbortSignal,
) {
  return request<{ session: HanziLearningSession }>(
    "/api/child/hanzi/sessions/start",
    {
      method: "POST",
      body: JSON.stringify({ attemptId }),
      signal,
    },
  );
}

export async function answerHanziReview(
  sessionId: string,
  characterId: string,
  known: boolean,
  signal?: AbortSignal,
) {
  return request<{ session: HanziLearningSession }>(
    `/api/child/hanzi/sessions/${sessionId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ characterId, known }),
      signal,
    },
  );
}

export async function completeHanziNewCharacter(
  sessionId: string,
  characterId: string,
  signal?: AbortSignal,
) {
  return request<{ session: HanziLearningSession }>(
    `/api/child/hanzi/sessions/${sessionId}/learn`,
    {
      method: "POST",
      body: JSON.stringify({ characterId }),
      signal,
    },
  );
}

export async function answerHanziQuestion(
  sessionId: string,
  questionIndex: number,
  selectedCharacterId: string,
  signal?: AbortSignal,
) {
  return request<{
    correct: boolean;
    targetCharacterId: string;
    session: HanziLearningSession;
  }>(`/api/child/hanzi/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ questionIndex, selectedCharacterId }),
    signal,
  });
}

export async function finishHanziLearningSession(
  sessionId: string,
  signal?: AbortSignal,
) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/hanzi/sessions/${sessionId}/finish`, {
    method: "POST",
    signal,
  });
}

export async function finalizeHanziLearningSession(
  sessionId: string,
  input: {
    reviewAnswers: Array<{ characterId: string; known: boolean }>;
    learnedCharacterIds: string[];
    masteredCharacterIds: string[];
    answers: Array<{
      questionIndex: number;
      selectedCharacterId: string;
    }>;
  },
  signal?: AbortSignal,
) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/hanzi/sessions/${sessionId}/finalize`, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export type ClockQuestion = {
  type: "SET_CLOCK" | "READ_CLOCK";
  hour: number;
  minute: number;
  second: number;
};

export type ClockAnswer = {
  questionIndex: number;
  hour: number;
  minute: number;
  second: number;
  correct: boolean;
  answeredAt: string;
};

export type ClockLearningSession = {
  id: string;
  taskAttemptId: string;
  minuteStep: 1 | 5;
  questions: ClockQuestion[];
  answers: ClockAnswer[];
  currentIndex: number;
  correctCount: number;
  totalQuestions: number;
  completedAt: string | null;
};

export async function startClockLearningSession(attemptId: string) {
  return request<{ session: ClockLearningSession }>(
    "/api/child/clock/sessions/start",
    { method: "POST", body: JSON.stringify({ attemptId }) },
  );
}

export async function submitClockAnswer(
  sessionId: string,
  input: { questionIndex: number; hour: number; minute: number; second: number },
) {
  return request<{
    session: ClockLearningSession;
    answer: ClockAnswer;
    question: ClockQuestion;
  }>(`/api/child/clock/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function finishClockLearningSession(sessionId: string) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/clock/sessions/${sessionId}/finish`, { method: "POST" });
}

export type MakeTenQuestion = { target: number };

export type MakeTenAnswer = {
  questionIndex: number;
  selectedNumber: number | null;
  correct: boolean;
  timedOut: boolean;
  responseMs: number | null;
  answeredAt: string;
};

export type MakeTenLearningSession = {
  id: string;
  taskAttemptId: string;
  secondsPerQuestion: number;
  passAccuracyPercent: number;
  questions: MakeTenQuestion[];
  answers: MakeTenAnswer[];
  currentIndex: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean | null;
  completedAt: string | null;
};

export async function startMakeTenSession(attemptId: string) {
  return request<{ session: MakeTenLearningSession }>(
    "/api/child/make-ten/sessions/start",
    { method: "POST", body: JSON.stringify({ attemptId }) },
  );
}

export async function submitMakeTenAnswer(
  sessionId: string,
  input: {
    questionIndex: number;
    selectedNumber: number | null;
    timedOut: boolean;
    responseMs: number;
  },
) {
  return request<{
    session: MakeTenLearningSession;
    answer: MakeTenAnswer;
    question: MakeTenQuestion;
  }>(`/api/child/make-ten/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function finishMakeTenSession(sessionId: string) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/make-ten/sessions/${sessionId}/finish`, { method: "POST" });
}

export type MathPracticeQuestion = Omit<MathQuestion, "answer">;

export type MathPracticeSession = {
  id: string;
  taskAttemptId: string;
  currentIndex: number;
  correctCount: number;
  totalQuestions: number;
  completedAt: string | null;
  attemptsForCurrent: number;
  question: MathPracticeQuestion | null;
};

export type MathPracticeFeedback = {
  correct: boolean;
  attemptNumber: number;
  revealAnswer: boolean;
  correctAnswer: { values: string[]; display: string } | null;
  explanation: string | null;
};

export async function startMathPracticeSession(attemptId: string) {
  return request<{ session: MathPracticeSession }>(
    "/api/child/math-practice/sessions/start",
    { method: "POST", body: JSON.stringify({ attemptId }) },
  );
}

export async function submitMathPracticeAnswer(
  sessionId: string,
  input: { questionIndex: number; values: string[]; responseMs: number },
) {
  return request<{ session: MathPracticeSession; feedback: MathPracticeFeedback }>(
    `/api/child/math-practice/sessions/${sessionId}/answer`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function finishMathPracticeSession(sessionId: string) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/math-practice/sessions/${sessionId}/finish`, { method: "POST" });
}

export type Poem = {
  id: string;
  title: string;
  dynasty: string;
  author: string;
  grade: number;
  semester: string;
  content: string;
  imageUrl: string | null;
  audioUrl: string | null;
};

export type PoemLearningSession = {
  id: string;
  taskAttemptId: string;
  kind: "LEARNING" | "REVIEW";
  poemIds: string[];
  currentIndex: number;
  completedPoemIds: string[];
  forgottenPoemIds: string[];
  completedAt: string | null;
  poems: Poem[];
  summary: {
    total: number;
    completed: number;
    forgotten: number;
  };
};

export async function startPoemLearningSession(attemptId: string) {
  return request<{ session: PoemLearningSession }>(
    "/api/child/poems/sessions/start",
    {
      method: "POST",
      body: JSON.stringify({ attemptId }),
    },
  );
}

export async function completePoemLearning(
  sessionId: string,
  poemId: string,
) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/poems/sessions/${sessionId}/learn`, {
    method: "POST",
    body: JSON.stringify({ poemId }),
  });
}

export async function submitPoemReview(
  sessionId: string,
  poemId: string,
  result: "REMEMBERED" | "FORGOT",
) {
  return request<{ session: PoemLearningSession }>(
    `/api/child/poems/sessions/${sessionId}/review`,
    {
      method: "POST",
      body: JSON.stringify({ poemId, result }),
    },
  );
}

export async function finishPoemReview(sessionId: string) {
  return request<{
    attempt: TaskAttempt;
    reward: {
      baseStars: number;
      bonusStars: number;
      dailyGoalBonusStars: number;
      totalStars: number;
    };
    alreadyCompleted: boolean;
  }>(`/api/child/poems/sessions/${sessionId}/finish`, { method: "POST" });
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

export async function getChildWishes(signal?: AbortSignal) {
  return request<{ starBalance: number; wishes: ChildWish[] }>(
    "/api/child/wishes",
    { signal },
  );
}

export async function redeemChildWish(wishId: string) {
  return request<{
    redemption: { id: string; status: "PENDING" };
    alreadyProcessed: boolean;
  }>(`/api/child/wishes/${wishId}/redeem`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: createIdempotencyKey("wish") }),
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
  rewards: Array<{
    rewardId: string;
    type: "DAILY_GOAL_BONUS" | "PLANET_BONUS" | "PET_RED_PACKET_REWARD";
    title: string;
    totalStars: number;
    earnedAt: string;
    planet: PlanetKey | null;
  }>;
  leaderboards: {
    daily: ChildLeaderboard;
    weekly: ChildLeaderboard;
  };
};

export type ChildLeaderboardEntry = {
  rank: number | null;
  displayName: string;
  stars: number;
  completedTasks: number;
  petType: "DOUYA" | "PAOPAO" | "TUANTUAN" | "MILU" | "SHANSHAN";
  flagKey:
    | "CHINA"
    | "JAPAN"
    | "KOREA"
    | "SINGAPORE"
    | "UNITED_KINGDOM"
    | "FRANCE"
    | "GERMANY"
    | "ITALY"
    | "CANADA"
    | "AUSTRALIA"
    | "BRAZIL"
    | "UNITED_STATES";
  isSelf: boolean;
};

export type ChildLeaderboard = {
  entries: ChildLeaderboardEntry[];
  self: {
    rank: number | null;
    stars: number;
    completedTasks: number;
    totalParticipants: number;
    inTopTen: boolean;
    starsToNextRank: number;
  } | null;
};

export async function getChildFootprints(
  date?: string,
  signal?: AbortSignal,
) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<FootprintResponse>(`/api/child/footprints${query}`, {
    signal,
  });
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

export async function getChildPlanets(signal?: AbortSignal) {
  return request<PlanetMapResponse>("/api/child/planets", { signal });
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
