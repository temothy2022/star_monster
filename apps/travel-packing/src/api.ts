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

export type TravelPackingTodo = {
  id: string;
  listId: string;
  label: string;
  completed: boolean;
  sortOrder: number;
};

export type TravelPackingList = {
  id: string;
  familyId: string;
  title: string;
  categories: TravelPackingCategory[];
  todos: TravelPackingTodo[];
};

export type TravelPackingShare = { token: string; expiresAt: string };
export type TravelPackingTips = {
  summary: { total: number; ready: number; attention: number };
  groups: Array<{ name: string; items: Array<{
    id: string;
    label: string;
    priority: "ESSENTIAL" | "RECOMMENDED";
    status: "NOT_LISTED" | "UNPACKED" | "OUT_OF_STOCK" | "EXPIRED";
  }> }>;
};

export class ApiError extends Error {
  constructor(message: string, public status = 500, public code?: string) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "网络连接失败", 0, "NETWORK_ERROR");
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) throw new ApiError(body.error?.message ?? "请求失败，请稍后重试", response.status, body.error?.code);
  if (!isJson) throw new ApiError("服务返回了无效内容", 503, "INVALID_RESPONSE");
  return body as T;
}

export function createTravelPackingApi(shareToken?: string) {
  const base = shareToken ? `/api/public/travel-packing/${encodeURIComponent(shareToken)}` : "/api/parent/travel-packing-list";
  return {
    list: () => api<{ list: TravelPackingList }>(base),
    tips: () => api<TravelPackingTips>(`${base}/tips`),
    addTodo: (label: string) => api<{ list: TravelPackingList }>(`${base}/todos`, { method: "POST", body: JSON.stringify({ label }) }),
    updateTodo: (id: string, completed: boolean) => api<{ list: TravelPackingList }>(`${base}/todos/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }),
    deleteTodo: (id: string) => api<{ list: TravelPackingList }>(`${base}/todos/${id}`, { method: "DELETE" }),
    renameList: (title: string) => api<{ list: TravelPackingList }>(base, { method: "PATCH", body: JSON.stringify({ title }) }),
    addCategory: (name: string) => api<{ list: TravelPackingList }>(`${base}/categories`, { method: "POST", body: JSON.stringify({ name }) }),
    renameCategory: (id: string, name: string) => api<{ list: TravelPackingList }>(`${base}/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    deleteCategory: (id: string) => api<{ list: TravelPackingList }>(`${base}/categories/${id}`, { method: "DELETE" }),
    addItem: (categoryId: string, label: string, quantity: number, location: TravelPackingItem["location"] = "SUITCASE", expirationDate: string | null = null) => api<{ list: TravelPackingList }>(`${base}/categories/${categoryId}/items`, { method: "POST", body: JSON.stringify({ label, quantity, location, expirationDate }) }),
    updateItem: (id: string, data: Partial<Pick<TravelPackingItem, "categoryId" | "label" | "quantity" | "packed" | "location" | "expirationDate">>) => api<{ list: TravelPackingList }>(`${base}/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteItem: (id: string) => api<{ list: TravelPackingList }>(`${base}/items/${id}`, { method: "DELETE" }),
    resetList: () => api<{ list: TravelPackingList }>(`${base}/reset`, { method: "POST" }),
    createShare: (expiresInDays: number) => api<TravelPackingShare>("/api/parent/travel-packing-list/shares", { method: "POST", body: JSON.stringify({ expiresInDays }) }),
  };
}
