export type StaffUser = {
  id: string;
  username: string;
  displayName: string;
  role: "PARENT" | "SUPER_ADMIN";
  familyId: string | null;
};

export type PlatformFeatureSettings = {
  realChildCompetitionEnabled: boolean;
  updatedAt: string | null;
};

export type ParentAccount = {
  id: string;
  username: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  lastActiveAt: string | null;
};

export type AdminChild = {
  id: string;
  nickname: string | null;
  petType: string | null;
  status: "ACTIVE" | "DISABLED";
  loginCodeLastFour: string;
  lastActiveAt: string | null;
};

export type Family = {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  users: ParentAccount[];
  children: AdminChild[];
};

export type FamilyDataOverview = {
  family: { id: string; name: string; status: "ACTIVE" | "DISABLED"; createdAt: string };
  from: string;
  to: string;
  children: Array<{
    id: string;
    nickname: string | null;
    petType: string | null;
    starBalance: number;
    lifetimeStarsEarned: number;
    dailyStarGoal: number;
    lastActiveAt: string | null;
    taskStats: {
      periodTotal: number;
      periodCompleted: number;
      completionRate: number | null;
      todayTotal: number;
      todayCompleted: number;
      attemptsCompleted: number;
      attemptsAbandoned: number;
    };
    starStats: { periodEarned: number; periodSpent: number };
    taskTemplates: Array<{
      id: string;
      title: string;
      category: string;
      experienceKind: string;
      baseStars: number;
      scheduleKind: string;
      weekdays: number[];
      oneTimeDate: string | null;
      isEnabled: boolean;
      repeatableDaily: boolean;
    }>;
    wishes: Array<{
      id: string;
      title: string;
      category: string;
      costStars: number;
      redemptionType: string;
      recurrenceKind: string | null;
      stockRemaining: number | null;
      isEnabled: boolean;
      redemptionCount: number;
    }>;
    redemptions: Array<{
      id: string;
      titleSnapshot: string;
      categorySnapshot: string;
      costStarsSnapshot: number;
      status: string;
      requestedAt: string;
      completedAt: string | null;
      cancelledAt: string | null;
    }>;
    ledger: Array<{
      id: string;
      type: string;
      amount: number;
      balanceAfter: number;
      reason: string | null;
      createdAt: string;
    }>;
  }>;
};

export type Metrics = {
  families: number;
  parents: number;
  children: number;
  onboardingCompleted: number;
  activeChildren: { daily: number; weekly: number; monthly: number };
  attempts: { completed: number; timedCompleted: number; timedOut: number; abandoned: number };
  dailyTasks: Record<string, number>;
  stars: Record<string, number>;
  redemptions: Record<string, number>;
};

export type AiModelUsageDashboard = {
  days: number;
  collectedFrom: string | null;
  collectedTo: string | null;
  truncated: boolean;
  totals: {
    calls: number;
    success: number;
    failed: number;
    totalTokens: number;
    successRate: number | null;
  };
  providers: Array<{
    provider: string;
    calls: number;
    success: number;
    failed: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    averageDurationMs: number | null;
  }>;
  trend: Array<{
    date: string;
    calls: number;
    success: number;
    failed: number;
    deepseek: number;
    minimax: number;
  }>;
  operations: Array<{
    provider: string;
    operation: string;
    model: string;
    calls: number;
    success: number;
    failed: number;
    totalTokens: number;
    averageDurationMs: number | null;
    lastCalledAt: string;
  }>;
};

export type PerformanceDiagnosis = "server" | "network" | "frontend" | "mixed";

export type PerformanceOperation = {
  operation: string;
  kind: string;
  samples: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  slowCount: number;
  failureCount: number;
  serverAverageMs: number | null;
  networkAverageMs: number | null;
  frontendAverageMs: number | null;
};

export type PerformanceDashboard = {
  days: number;
  childCount: number;
  collectedFrom: string | null;
  collectedTo: string | null;
  truncated: boolean;
  filters: {
    selectedFamilyId: string | null;
    selectedChildId: string | null;
    families: Array<{ id: string; name: string }>;
    children: Array<{
      id: string;
      nickname: string | null;
      familyId: string;
      familyName: string;
    }>;
  };
  dataQuality: {
    receivedCount: number;
    usableCount: number;
    ignoredNoiseCount: number;
    navigationCount: number;
    apiCount: number;
    mediaCount: number;
    startupCount: number;
    runtimeFailureCount: number;
  };
  summary: {
    pageOpenCount: number;
    slowPageCount: number;
    slowPageRate: number;
    pageOpenAverageMs: number | null;
    pageOpenP50Ms: number | null;
    pageOpenP95Ms: number | null;
    serverAverageMs: number | null;
    networkAverageMs: number | null;
    frontendAverageMs: number | null;
    completionAverageMs: number | null;
    completionP95Ms: number | null;
    completionCount: number;
    interactionCount: number;
    interactionP95Ms: number | null;
    interactionFailureCount: number;
    interactionFailureRate: number;
    mediaFailureCount: number;
    runtimeFailureCount: number;
  };
  diagnosis: Record<PerformanceDiagnosis, number>;
  operations: PerformanceOperation[];
  pageOperations: PerformanceOperation[];
  interactionOperations: PerformanceOperation[];
  diagnosticOperations: PerformanceOperation[];
  networkBreakdown: Array<{
    network: string;
    samples: number;
    averageMs: number | null;
    p95Ms: number | null;
    averageRttMs: number | null;
    averageDownlinkMbps: number | null;
  }>;
  trend: Array<{
    date: string;
    samples: number;
    averageMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    slowCount: number;
    slowRate: number;
  }>;
  recommendations: Array<{
    level: "good" | "watch" | "action";
    title: string;
    detail: string;
  }>;
  recentSlowEvents: Array<{
    id: string;
    childId?: string;
    childNickname?: string | null;
    familyName?: string | null;
    kind: string;
    operation: string;
    path: string;
    method?: string | null;
    status: number | null;
    requestId: string | null;
    totalMs: number;
    serverMs: number | null;
    clientOverheadMs: number | null;
    apiTotalMs: number | null;
    nonApiMs: number | null;
    effectiveType: string | null;
    connectionRttMs: number | null;
    downlinkMbps: number | null;
    errorName?: string | null;
    errorMessage?: string | null;
    appVersion?: string | null;
    createdAt: string;
    diagnosis: PerformanceDiagnosis;
  }>;
};

export type AuditLog = {
  id: string;
  actorType: "CHILD" | "USER" | "SYSTEM";
  actorId: string | null;
  familyId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
};

export type HanziResource = {
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
  isEnabled: boolean;
};

export type MinimaxConfig = {
  provider: "MINIMAX";
  apiKeyLastFour: string | null;
  enabled: boolean;
  updatedAt: string | null;
  configured: boolean;
};

export type SystemAiConfig = {
  provider: "DEEPSEEK";
  model: string;
  apiKeyLastFour: string | null;
  enabled: boolean;
  updatedAt: string | null;
  configured: boolean;
};

export type ChallengePromptPoolSummary = {
  enabledCount: number;
  draftCount: number;
  totalCount: number;
  updatedAt: string | null;
};

export type MascotDialogue = {
  id: string;
  key: string;
  context:
    | "START" | "PROGRESS" | "COMPLETE" | "EMPTY" | "GENERAL"
    | "PET_NEEDS_CARE" | "PET_HUNGRY" | "PET_THIRSTY"
    | "PET_TASK_START" | "PET_TASK_PROGRESS" | "PET_TASK_COMPLETE"
    | "PET_RELAX" | "PET_GENERAL";
  text: string;
  audioUrl: string | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MascotAssetSlot =
  | "TASK_IDLE"
  | "NEUTRAL"
  | "FOCUS"
  | "CELEBRATE"
  | "HUNGRY"
  | "EATING"
  | "DRINKING"
  | "TRAVEL"
  | "SLEEPING";

export type MascotAsset = {
  id: string;
  petType: "DOUYA" | "PAOPAO" | "TUANTUAN" | "MILU" | "SHANSHAN";
  slot: MascotAssetSlot;
  mediaUrl: string;
  contentType: string;
  fileName: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PetTravelTier = "NEARBY" | "CHINA" | "WORLD";
export type PetGrowthConfig = {
  id: string;
  roomThemeExperience: number;
  feedCostStars: number; feedRestore: number; feedExperience: number;
  drinkCostStars: number; drinkRestore: number; drinkExperience: number;
  satietyDecayMinutes: number; hydrationDecayMinutes: number;
  nearbyCostStars: number; nearbyDurationMinutes: number; nearbyExperience: number;
  chinaCostStars: number; chinaDurationMinutes: number; chinaExperience: number;
  worldCostStars: number; worldDurationMinutes: number; worldExperience: number;
  updatedAt: string;
};
export type PetDestination = {
  id: string; slug: string; name: string; city: string; country: string;
  tier: PetTravelTier; introduction: string; funFact: string;
  imageUrl: string; audioUrl: string | null; weight: number;
  sortOrder: number; isEnabled: boolean; createdAt: string; updatedAt: string;
};
export type PetRoomMascotMotion = "IDLE" | "CLOUD_FLOAT" | "UNDERWATER_SWIM" | "PETAL_SWAY" | "STARGAZE" | "ZERO_GRAVITY" | "SPORT_BOUNCE" | "ADVENTURE_MARCH";
export type PetType = "DOUYA" | "PAOPAO" | "TUANTUAN" | "MILU" | "SHANSHAN";
export type PetRoomThemeMascotAnimation = {
  id: string;
  themeId: string;
  petType: PetType;
  mediaUrl: string;
  contentType: string;
  fileName: string;
  sourceWidth: number;
  sourceHeight: number;
  frameCount: number;
  outputBytes: number;
  createdAt: string;
  updatedAt: string;
};
export type PetRoomTheme = {
  id: string;
  key: string;
  name: string;
  description: string;
  priceStars: number;
  previewUrl: string;
  backgroundLandscapeUrl: string;
  backgroundTabletUrl: string;
  backgroundPhoneUrl: string;
  mascotMotion: PetRoomMascotMotion;
  mascotAnimations: PetRoomThemeMascotAnimation[];
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(body.error?.message ?? "请求失败");
  }
  if (!isJson) throw new Error("后台服务尚未启动，请稍后重试");
  return response.json();
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
    gif: "image/gif",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

export const staffApi = {
  me: () => api<{ user: StaffUser }>("/api/admin/me"),
  login: (username: string, password: string) =>
    api<{ user: StaffUser }>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => api<{ ok: true }>("/api/admin/auth/logout", { method: "POST" }),
};

export const adminApi = {
  platformFeatures: () => api<{ settings: PlatformFeatureSettings }>("/api/admin/platform-features"),
  savePlatformFeatures: (data: { realChildCompetitionEnabled: boolean }) =>
    api<{ settings: PlatformFeatureSettings }>("/api/admin/platform-features", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  aiConfig: () => api<{ config: SystemAiConfig }>("/api/admin/ai/config"),
  saveAiConfig: (data: { apiKey?: string; model: string; enabled: boolean }) => api<{ config: SystemAiConfig }>("/api/admin/ai/config", { method: "PUT", body: JSON.stringify(data) }),
  aiModels: () => api<{ models: Array<{ id: string; ownedBy: string }> }>("/api/admin/ai/models"),
  testAiConfig: () => api<{ ok: true; message: string; model: string }>("/api/admin/ai/config/test", { method: "POST" }),
  challengePromptPool: () => api<{ pool: ChallengePromptPoolSummary }>("/api/admin/ai/challenge-prompts"),
  generateChallengePromptPool: () => api<{ pool: ChallengePromptPoolSummary }>("/api/admin/ai/challenge-prompts/generate", { method: "POST" }),
  petGrowth: () => api<{ config: PetGrowthConfig; destinations: PetDestination[]; roomThemes: PetRoomTheme[] }>("/api/admin/pet-growth"),
  updatePetGrowthConfig: (data: Omit<PetGrowthConfig, "id" | "updatedAt">) => api<{ config: PetGrowthConfig }>("/api/admin/pet-growth/config", { method: "PUT", body: JSON.stringify(data) }),
  createPetRoomTheme: (input: { name: string; description: string; priceStars: number; mascotMotion: PetRoomMascotMotion; image: File }) => {
    const query = new URLSearchParams({ name: input.name, description: input.description, priceStars: String(input.priceStars), mascotMotion: input.mascotMotion });
    return api<{
      theme: PetRoomTheme;
      processing: { source: { width: number; height: number; bytes: number; format: string }; outputBytes: number; format: "webp" };
    }>(`/api/admin/pet-growth/themes?${query.toString()}`, {
      method: "POST",
      headers: { "Content-Type": uploadContentType(input.image) },
      body: input.image,
    });
  },
  updatePetRoomThemeMotion: (id: string, mascotMotion: PetRoomMascotMotion) => api<{ theme: PetRoomTheme }>(`/api/admin/pet-growth/themes/${encodeURIComponent(id)}/motion`, { method: "PATCH", body: JSON.stringify({ mascotMotion }) }),
  uploadPetRoomThemeMascotAnimation: (themeId: string, petType: PetType, file: File) => api<{
    animation: PetRoomThemeMascotAnimation;
    processing: { source: { width: number; height: number; frameCount: number; durationMs: number; bytes: number; format: string }; outputBytes: number; contentType: string; processed: false };
  }>(`/api/admin/pet-growth/themes/${encodeURIComponent(themeId)}/mascot-animations/${petType}`, {
    method: "PUT",
    headers: { "Content-Type": uploadContentType(file) },
    body: file,
  }),
  deletePetRoomThemeMascotAnimation: (themeId: string, petType: PetType) => api<{ ok: true }>(`/api/admin/pet-growth/themes/${encodeURIComponent(themeId)}/mascot-animations/${petType}`, { method: "DELETE" }),
  createPetDestination: (data: Omit<PetDestination, "id" | "createdAt" | "updatedAt">) => api<{ destination: PetDestination }>("/api/admin/pet-growth/destinations", { method: "POST", body: JSON.stringify(data) }),
  updatePetDestination: (id: string, data: Partial<Omit<PetDestination, "id" | "createdAt" | "updatedAt">>) => api<{ destination: PetDestination }>(`/api/admin/pet-growth/destinations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  mascotDialogues: () => api<{ dialogues: MascotDialogue[] }>("/api/admin/mascot-dialogues"),
  updateMascotDialogue: (id: string, data: Partial<Pick<MascotDialogue, "text" | "context" | "isEnabled" | "sortOrder">>) => api<{ dialogue: MascotDialogue }>(`/api/admin/mascot-dialogues/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  generateMascotDialogueAudio: (id: string) => api<{ dialogue: MascotDialogue }>(`/api/admin/mascot-dialogues/${id}/generate-audio`, { method: "POST" }),
  mascotAssets: () => api<{ assets: MascotAsset[] }>("/api/admin/mascot-assets"),
  uploadMascotAsset: (
    petType: MascotAsset["petType"],
    slot: MascotAssetSlot,
    file: File,
  ) => api<{ asset: MascotAsset }>(`/api/admin/mascot-assets/${petType}/${slot}`, { method: "PUT", headers: { "Content-Type": uploadContentType(file) }, body: file }),
  hanziCharacters: (query: { q?: string; page?: number; pageSize?: number; includeDisabled?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.page) search.set("page", String(query.page));
    if (query.pageSize) search.set("pageSize", String(query.pageSize));
    if (query.includeDisabled !== undefined) search.set("includeDisabled", String(query.includeDisabled));
    return api<{ characters: HanziResource[]; total: number; page: number; pageSize: number }>(`/api/admin/hanzi/characters?${search.toString()}`);
  },
  createHanziCharacter: (data: Record<string, unknown>) => api<{ character: HanziResource }>("/api/admin/hanzi/characters", { method: "POST", body: JSON.stringify(data) }),
  updateHanziCharacter: (id: string, data: Record<string, unknown>) => api<{ character: HanziResource }>(`/api/admin/hanzi/characters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteHanziCharacter: (id: string) => api<{ ok: true }>(`/api/admin/hanzi/characters/${id}`, { method: "DELETE" }),
  uploadHanziMedia: (id: string, kind: "image" | "character-audio" | "sentence-audio" | "word-audio", file: File, wordIndex?: number) => {
    const search = new URLSearchParams();
    if (wordIndex !== undefined) search.set("wordIndex", String(wordIndex));
    const suffix = search.size ? `?${search.toString()}` : "";
    return api<{ character: HanziResource }>(`/api/admin/hanzi/characters/${id}/media/${kind}${suffix}`, { method: "PUT", headers: { "Content-Type": uploadContentType(file) }, body: file });
  },
  generateHanziMedia: (id: string, kind: "image" | "character-audio" | "sentence-audio" | "word-audio", wordIndex?: number) => {
    const suffix = wordIndex === undefined ? "" : `?wordIndex=${wordIndex}`;
    return api<{ character: HanziResource }>(`/api/admin/hanzi/characters/${id}/generate/${kind}${suffix}`, { method: "POST" });
  },
  poems: (query: { q?: string; grade?: number; page?: number; pageSize?: number; includeDisabled?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.grade) search.set("grade", String(query.grade));
    if (query.page) search.set("page", String(query.page));
    if (query.pageSize) search.set("pageSize", String(query.pageSize));
    if (query.includeDisabled !== undefined) search.set("includeDisabled", String(query.includeDisabled));
    return api<{ poems: PoemResource[]; total: number; page: number; pageSize: number }>(`/api/admin/poems?${search.toString()}`);
  },
  createPoem: (data: Record<string, unknown>) => api<{ poem: PoemResource }>("/api/admin/poems", { method: "POST", body: JSON.stringify(data) }),
  updatePoem: (id: string, data: Record<string, unknown>) => api<{ poem: PoemResource }>(`/api/admin/poems/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePoem: (id: string) => api<{ ok: true }>(`/api/admin/poems/${id}`, { method: "DELETE" }),
  uploadPoemMedia: (id: string, kind: "image" | "audio", file: File) => api<{ poem: PoemResource }>(`/api/admin/poems/${id}/media/${kind}`, { method: "PUT", headers: { "Content-Type": uploadContentType(file) }, body: file }),
  generatePoemMedia: (id: string, kind: "image" | "audio") => api<{ poem: PoemResource }>(`/api/admin/poems/${id}/generate/${kind}`, { method: "POST" }),
  minimaxConfig: () => api<{ config: MinimaxConfig }>("/api/admin/minimax/config"),
  saveMinimaxConfig: (data: { apiKey?: string; enabled: boolean }) => api<{ config: MinimaxConfig }>("/api/admin/minimax/config", { method: "PUT", body: JSON.stringify(data) }),
  testMinimaxConfig: () => api<{ ok: true; message: string }>("/api/admin/minimax/config/test", { method: "POST" }),
  families: () => api<{ families: Family[] }>("/api/admin/families"),
  familyOverview: (id: string) => api<FamilyDataOverview>(`/api/admin/families/${id}/overview`),
  createFamily: (data: {
    name: string;
    parent: { username: string; displayName: string; password: string };
    children: Array<{ nickname?: string }>;
  }) =>
    api<{
      family: Family;
      parent: ParentAccount;
      children: Array<{ childId: string; loginCode: string }>;
    }>("/api/admin/families", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateFamily: (id: string, data: Record<string, unknown>) =>
    api<{ family: Family }>(`/api/admin/families/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  createChild: (familyId: string, nickname?: string) =>
    api<{ childId: string; loginCode: string }>(
      `/api/admin/families/${familyId}/children`,
      { method: "POST", body: JSON.stringify({ nickname }) },
    ),
  createParent: (
    familyId: string,
    data: { username: string; displayName: string; password: string },
  ) =>
    api<{ parent: ParentAccount }>(`/api/admin/families/${familyId}/parents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateUser: (id: string, data: Record<string, unknown>) =>
    api<{ user: ParentAccount }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  resetPassword: (id: string, password: string) =>
    api<{ ok: true }>(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  setChildStatus: (id: string, status: "ACTIVE" | "DISABLED") =>
    api<{ child: AdminChild }>(`/api/admin/children/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateChild: (id: string, nickname: string) =>
    api<{ child: AdminChild }>(`/api/admin/children/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nickname }),
    }),
  regenerateCode: (id: string) =>
    api<{ childId: string; loginCode: string }>(
      `/api/admin/children/${id}/regenerate-code`,
      { method: "POST" },
    ),
  logoutChild: (id: string) =>
    api<{ ok: true; sessionsRemoved: number }>(
      `/api/admin/children/${id}/logout-all`,
      { method: "POST" },
    ),
  metrics: () => api<Metrics>("/api/admin/metrics"),
  aiUsage: (days = 30) => api<AiModelUsageDashboard>(`/api/admin/ai-usage?days=${days}`),
  performance: (
    days: number,
    filters: { familyId?: string; childId?: string } = {},
  ) => {
    const query = new URLSearchParams({ days: String(days) });
    if (filters.familyId) query.set("familyId", filters.familyId);
    if (filters.childId) query.set("childId", filters.childId);
    return api<PerformanceDashboard>(`/api/admin/performance?${query}`);
  },
  auditLogs: (cursor?: string) =>
    api<{ logs: AuditLog[]; nextCursor: string | null }>(
      `/api/admin/audit-logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
};
