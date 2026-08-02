export type StaffUser = {
  id: string;
  username: string;
  displayName: string;
  role: "PARENT" | "SUPER_ADMIN";
  familyId: string | null;
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

export type PerformanceDiagnosis = "server" | "network" | "frontend" | "mixed";

export type PerformanceDashboard = {
  days: number;
  childCount: number;
  collectedFrom: string | null;
  collectedTo: string | null;
  summary: {
    pageOpenCount: number;
    slowPageCount: number;
    slowPageRate: number;
    pageOpenAverageMs: number | null;
    pageOpenP95Ms: number | null;
    serverAverageMs: number | null;
    networkAverageMs: number | null;
    frontendAverageMs: number | null;
    completionAverageMs: number | null;
    completionP95Ms: number | null;
    completionCount: number;
  };
  diagnosis: Record<PerformanceDiagnosis, number>;
  operations: Array<{
    operation: string;
    samples: number;
    averageMs: number | null;
    p95Ms: number | null;
    slowCount: number;
    serverAverageMs: number | null;
    networkAverageMs: number | null;
    frontendAverageMs: number | null;
  }>;
  trend: Array<{
    date: string;
    samples: number;
    averageMs: number | null;
    p95Ms: number | null;
    slowCount: number;
  }>;
  recentSlowEvents: Array<{
    id: string;
    childId?: string;
    childNickname?: string | null;
    familyName?: string | null;
    kind: string;
    operation: string;
    path: string;
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
  performance: (days: number) =>
    api<PerformanceDashboard>(`/api/admin/performance?days=${days}`),
  auditLogs: (cursor?: string) =>
    api<{ logs: AuditLog[]; nextCursor: string | null }>(
      `/api/admin/audit-logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
};
