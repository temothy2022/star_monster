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
  lastLoginAt: string | null;
};

export type AdminChild = {
  id: string;
  nickname: string | null;
  petType: string | null;
  status: "ACTIVE" | "DISABLED";
  loginCodeLastFour: string;
  lastLoginAt: string | null;
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

export const staffApi = {
  me: () => api<{ user: StaffUser }>("/api/staff/me"),
  login: (username: string, password: string) =>
    api<{ user: StaffUser }>("/api/staff/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => api<{ ok: true }>("/api/staff/auth/logout", { method: "POST" }),
};

export const adminApi = {
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
