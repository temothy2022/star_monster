import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createTravelPackingApi,
  parentApi,
  type TravelPackingItem,
  type TravelPackingList as PackingList,
  type TravelPackingEntrySummary,
  type TravelPackingTips,
  type TravelPackingWorkspace,
} from "./api";
import travelPackingHero from "./assets/travel-packing-hero-v2.webp";
import travelPackingTipsIcon from "./assets/travel-packing-tips-v2.png";
import increaseControlIcon from "@star-monsters/assets/icons/child-controls/increase.svg";
import decreaseControlIcon from "@star-monsters/assets/icons/child-controls/decrease.svg";
import "./travel-packing-list.css";

type Filter = "all" | "unpacked" | "packed";
type PackingLocation = TravelPackingItem["location"];
type PageSheet = "menu" | "rename" | "category" | null;
type ShareResult = { url: string; expiresAt: string };
type TipsFilter = "all" | "not-listed" | "unpacked" | "other";
type LibraryTab = "lists" | "templates";
type LibraryComposer = "list" | "template" | null;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unpacked", label: "待装" },
  { value: "packed", label: "已装" },
];
const LOCATIONS: Array<{ value: PackingLocation; label: string }> = [
  { value: "SUITCASE", label: "行李箱" },
  { value: "BACKPACK", label: "背包" },
  { value: "CAR", label: "家用车" },
];
const TIP_STATUS_LABELS: Record<TravelPackingTips["groups"][number]["items"][number]["status"], string> = {
  NOT_LISTED: "清单里没有",
  UNPACKED: "还没装",
  OUT_OF_STOCK: "需要补充",
  EXPIRED: "已经过期",
};
function isMedicineCategory(name: string | undefined) { return name?.trim().includes("药") ?? false; }
function isExpired(date: string | null | undefined) { return Boolean(date && date < new Date().toISOString().slice(0, 10)); }
function formatShareExpiry(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TravelPackingList({ shareToken }: { shareToken?: string }) {
  const packingApi = useMemo(() => createTravelPackingApi(shareToken), [shareToken]);
  const [list, setList] = useState<PackingList | null>(null);
  const [workspace, setWorkspace] = useState<TravelPackingWorkspace | null>(null);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [locationFilter, setLocationFilter] = useState<PackingLocation | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());
  const [pageSheet, setPageSheet] = useState<PageSheet>(null);
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [itemSheetCategoryId, setItemSheetCategoryId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [lastCategoryId, setLastCategoryId] = useState<string | null>(() => {
    try { return window.localStorage.getItem("star-monsters:last-packing-category"); } catch { return null; }
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemCategoryId, setEditingItemCategoryId] = useState<string | null>(null);
  const [editingCategoryPickerOpen, setEditingCategoryPickerOpen] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showTipsSheet, setShowTipsSheet] = useState(false);
  const [showTodoSheet, setShowTodoSheet] = useState(false);
  const [showLibrarySheet, setShowLibrarySheet] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("lists");
  const [libraryComposer, setLibraryComposer] = useState<LibraryComposer>(null);
  const [libraryTitle, setLibraryTitle] = useState("");
  const [librarySourceId, setLibrarySourceId] = useState<string | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TravelPackingEntrySummary | null>(null);
  const [tips, setTips] = useState<TravelPackingTips | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState("");
  const [tipsFilter, setTipsFilter] = useState<TipsFilter>("all");
  const [shareDays, setShareDays] = useState(7);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [todoName, setTodoName] = useState("");
  const [workingTodoIds, setWorkingTodoIds] = useState<Set<string>>(new Set());
  const [tripTitle, setTripTitle] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemLocation, setItemLocation] = useState<PackingLocation>("SUITCASE");
  const [itemExpirationDate, setItemExpirationDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void packingApi.list()
      .then(({ list: value }) => {
        if (cancelled) return;
        setList(value);
        setExpandedIds(new Set(value.categories.map((category) => category.id)));
      })
      .catch((reason) => {
        if (!cancelled) {
          setAuthRequired(reason instanceof ApiError && reason.status === 401);
          setError(reason instanceof Error ? reason.message : "行李清单暂时无法读取");
        }
      });
    return () => { cancelled = true; };
  }, [packingApi]);

  useEffect(() => {
    if (shareToken) return;
    let cancelled = false;
    void parentApi.travelPackingWorkspace()
      .then((value) => { if (!cancelled) setWorkspace(value); })
      .catch((reason) => { if (!cancelled) message(reason); });
    return () => { cancelled = true; };
  }, [shareToken]);

  const allItems = useMemo(
    () => list?.categories.flatMap((category) => category.items) ?? [],
    [list],
  );
  const packedCount = allItems.filter((item) => item.packed).length;
  const pendingTodoCount = list?.todos.filter((todo) => !todo.completed).length ?? 0;
  const progress = allItems.length === 0 ? 0 : Math.round((packedCount / allItems.length) * 100);
  const activeCategory = list?.categories.find((category) => category.id === categoryMenuId) ?? null;
  const editingItem = allItems.find((item) => item.id === editingItemId) ?? null;
  const deletingItem = allItems.find((item) => item.id === deletingItemId) ?? null;
  const deletingCategory = list?.categories.find((category) => category.id === deletingCategoryId) ?? null;

  function message(reason: unknown) {
    setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "保存失败，请重试");
  }

  async function updateItem(
    id: string,
    data: { packed?: boolean; quantity?: number; label?: string },
  ) {
    if (!list || workingIds.has(id)) return;
    const previous = list;
    setWorkingIds((current) => new Set(current).add(id));
    setList({
      ...list,
      categories: list.categories.map((category) => ({
        ...category,
        items: category.items.map((item) => item.id === id ? { ...item, ...data } : item),
      })),
    });
    try {
      const result = await packingApi.updateItem(id, data);
      setList(result.list);
      setError("");
    } catch (reason) {
      setList(previous);
      message(reason);
    } finally {
      setWorkingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function openAddItem(categoryId?: string) {
    if (!list?.categories.length) {
      openAddCategory();
      return;
    }
    setCategoryMenuId(null);
    setItemName("");
    setItemQuantity(1);
    setItemLocation("SUITCASE");
    setItemExpirationDate("");
    const expandedCategories = list.categories.filter((category) => expandedIds.has(category.id));
    const expandedCategoryId = expandedCategories.length === 1 ? expandedCategories[0].id : null;
    const remembered = lastCategoryId && list.categories.some((category) => category.id === lastCategoryId)
      ? lastCategoryId
      : list.categories[0].id;
    setItemSheetCategoryId(categoryId ?? expandedCategoryId ?? remembered);
    setCategoryPickerOpen(false);
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!itemSheetCategoryId || !itemName.trim()) return;
    const categoryId = itemSheetCategoryId;
    const label = itemName.trim();
    const quantity = itemQuantity;
    const location = itemLocation;
    const expirationDate = itemExpirationDate || null;
    const optimisticId = `optimistic-item-${Date.now()}`;
    const optimisticItem: TravelPackingItem = {
      id: optimisticId,
      categoryId,
      label,
      quantity,
      packed: false,
      location,
      expirationDate,
      sortOrder: Number.MAX_SAFE_INTEGER,
    };
    setList((current) => current ? {
      ...current,
      categories: current.categories.map((category) => category.id === categoryId
        ? { ...category, items: [...category.items, optimisticItem] }
        : category),
    } : current);
    setPendingIds((current) => new Set(current).add(optimisticId));
    setExpandedIds((current) => new Set(current).add(categoryId));
    setItemSheetCategoryId(null);
    setCategoryPickerOpen(false);
    setLastCategoryId(categoryId);
    try { window.localStorage.setItem("star-monsters:last-packing-category", categoryId); } catch { /* storage is optional */ }
    setFilter("all");
    setError("");
    try {
      const result = await packingApi.addItem(categoryId, label, quantity, location, expirationDate);
      setList(result.list);
    } catch (reason) {
      setList((current) => current ? {
        ...current,
        categories: current.categories.map((category) => ({
          ...category,
          items: category.items.filter((item) => item.id !== optimisticId),
        })),
      } : current);
      message(reason);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(optimisticId);
        return next;
      });
    }
  }

  function openAddCategory() {
    setCategoryMenuId(null);
    setEditingCategoryId(null);
    setCategoryName("");
    setPageSheet("category");
  }

  function openEditCategory(id: string) {
    const category = list?.categories.find((entry) => entry.id === id);
    if (!category) return;
    setCategoryMenuId(null);
    setEditingCategoryId(id);
    setCategoryName(category.name);
    setPageSheet("category");
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    if (!editingCategoryId) {
      const optimisticId = `optimistic-category-${Date.now()}`;
      const optimisticCategory = {
        id: optimisticId,
        listId: list?.id ?? "",
        name,
        sortOrder: Number.MAX_SAFE_INTEGER,
        items: [],
      };
      setList((current) => current ? { ...current, categories: [...current.categories, optimisticCategory] } : current);
      setPendingIds((current) => new Set(current).add(optimisticId));
      setExpandedIds((current) => new Set(current).add(optimisticId));
      closePageSheet();
      setError("");
      try {
        const result = await packingApi.addCategory(name);
        setList(result.list);
      } catch (reason) {
        setList((current) => current ? { ...current, categories: current.categories.filter((category) => category.id !== optimisticId) } : current);
        message(reason);
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(optimisticId);
          return next;
        });
      }
      return;
    }
    setSubmitting(true);
    try {
      const previousIds = new Set(list?.categories.map((category) => category.id));
      const result = editingCategoryId
        ? await packingApi.renameCategory(editingCategoryId, name)
        : await packingApi.addCategory(name);
      setList(result.list);
      const created = result.list.categories.find((category) => !previousIds.has(category.id));
      if (created) setExpandedIds((current) => new Set(current).add(created.id));
      closePageSheet();
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function closePageSheet() {
    setPageSheet(null);
    setEditingCategoryId(null);
    setCategoryName("");
  }

  async function deleteCategory() {
    if (!deletingCategoryId) return;
    setSubmitting(true);
    try {
      const result = await packingApi.deleteCategory(deletingCategoryId);
      setList(result.list);
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(deletingCategoryId);
        return next;
      });
      setDeletingCategoryId(null);
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function openItemEditor(item: TravelPackingItem) {
    setEditingItemId(item.id);
    setEditingItemCategoryId(item.categoryId);
    setEditingCategoryPickerOpen(false);
    setItemName(item.label);
    setItemQuantity(item.quantity);
    setItemLocation(item.location);
    setItemExpirationDate(item.expirationDate ?? "");
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!editingItemId || !editingItemCategoryId || !itemName.trim()) return;
    setSubmitting(true);
    try {
      const result = await packingApi.updateItem(editingItemId, {
        categoryId: editingItemCategoryId,
        label: itemName.trim(),
        quantity: itemQuantity,
        location: itemLocation,
        expirationDate: itemExpirationDate || null,
        ...(itemQuantity === 0 ? { packed: false } : {}),
      });
      setList(result.list);
      setExpandedIds((current) => new Set(current).add(editingItemCategoryId));
      setEditingItemId(null);
      setEditingItemCategoryId(null);
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem() {
    if (!deletingItemId) return;
    setSubmitting(true);
    try {
      const result = await packingApi.deleteItem(deletingItemId);
      setList(result.list);
      setDeletingItemId(null);
      setEditingItemId(null);
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function renameTrip(event: FormEvent) {
    event.preventDefault();
    if (!tripTitle.trim()) return;
    setSubmitting(true);
    try {
      const result = await packingApi.renameList(tripTitle.trim());
      setList(result.list);
      if (!shareToken) setWorkspace(await parentApi.travelPackingWorkspace());
      closePageSheet();
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function applyActiveList(next: PackingList) {
    setList(next);
    setExpandedIds(new Set(next.categories.map((category) => category.id)));
    setFilter("all");
    setLocationFilter(null);
    setLastCategoryId(null);
  }

  async function openLibrary(tab: LibraryTab = "lists") {
    if (shareToken) return;
    setPageSheet(null);
    setLibraryTab(tab);
    setShowLibrarySheet(true);
    try {
      setWorkspace(await parentApi.travelPackingWorkspace());
    } catch (reason) {
      message(reason);
    }
  }

  async function activateList(id: string) {
    if (submitting || id === list?.id) {
      setShowLibrarySheet(false);
      return;
    }
    setSubmitting(true);
    try {
      const result = await parentApi.activateTravelPackingList(id);
      applyActiveList(result.list);
      setWorkspace(result.workspace);
      setShowLibrarySheet(false);
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function openListComposer(sourceId: string | null = list?.id ?? null) {
    setLibraryComposer("list");
    setLibraryTitle("新的出行清单");
    setLibrarySourceId(sourceId);
  }

  function openTemplateComposer(sourceId: string = list?.id ?? "") {
    if (!sourceId) return;
    setPageSheet(null);
    setShowLibrarySheet(false);
    setLibraryComposer("template");
    setLibraryTitle(`${list?.title ?? "出行"}模板`);
    setLibrarySourceId(sourceId);
  }

  async function createLibraryEntry(event: FormEvent) {
    event.preventDefault();
    const title = libraryTitle.trim();
    if (!title || !libraryComposer) return;
    setSubmitting(true);
    try {
      if (libraryComposer === "list") {
        const result = await parentApi.createTravelPackingList(title, librarySourceId);
        applyActiveList(result.list);
        setWorkspace(result.workspace);
        setShowLibrarySheet(false);
      } else {
        if (!librarySourceId) return;
        const result = await parentApi.createTravelPackingTemplate(title, librarySourceId);
        setWorkspace(result.workspace);
        setLibraryTab("templates");
        setShowLibrarySheet(true);
      }
      setLibraryComposer(null);
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLibraryEntry() {
    if (!deletingEntry) return;
    setSubmitting(true);
    try {
      if (deletingEntry.kind === "TEMPLATE") {
        const result = await parentApi.deleteTravelPackingTemplate(deletingEntry.id);
        setWorkspace(result.workspace);
      } else {
        const result = await parentApi.deleteTravelPackingList(deletingEntry.id);
        setWorkspace(result.workspace);
        if (result.list.id !== list?.id) applyActiveList(result.list);
      }
      setDeletingEntry(null);
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function resetTrip() {
    setSubmitting(true);
    try {
      const result = await packingApi.resetList();
      setList(result.list);
      setFilter("all");
      setShowResetConfirm(false);
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCategory(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openShare() {
    setPageSheet(null);
    setShareResult(null);
    setCopyStatus("idle");
    setShowShareSheet(true);
  }

  async function createShare() {
    setSubmitting(true);
    try {
      const result = await packingApi.createShare(shareDays);
      const url = `${window.location.origin}/packing/#share/${result.token}`;
      setShareResult({ url, expiresAt: result.expiresAt });
      setCopyStatus("idle");
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyShareUrl() {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.url);
    } catch {
      const field = document.createElement("textarea");
      field.value = shareResult.url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopyStatus("copied");
  }

  async function openTips() {
    setShowTipsSheet(true);
    setTips(null);
    setTipsError("");
    setTipsFilter("all");
    setTipsLoading(true);
    try {
      setTips(await packingApi.tips());
    } catch (reason) {
      setTipsError(reason instanceof Error ? reason.message : "暂时无法检查遗漏");
    } finally {
      setTipsLoading(false);
    }
  }

  async function addTodo(event: FormEvent) {
    event.preventDefault();
    const label = todoName.trim();
    if (!list || !label || submitting) return;
    const previous = list;
    const optimisticId = `optimistic-todo-${Date.now()}`;
    setList({
      ...list,
      todos: [...list.todos, { id: optimisticId, listId: list.id, label, completed: false, sortOrder: Number.MAX_SAFE_INTEGER }],
    });
    setTodoName("");
    setSubmitting(true);
    try {
      const result = await packingApi.addTodo(label);
      setList(result.list);
      setError("");
    } catch (reason) {
      setList(previous);
      setTodoName(label);
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTodo(id: string, completed: boolean) {
    if (!list || workingTodoIds.has(id)) return;
    const previous = list;
    setWorkingTodoIds((current) => new Set(current).add(id));
    setList({ ...list, todos: list.todos.map((todo) => todo.id === id ? { ...todo, completed } : todo) });
    try {
      const result = await packingApi.updateTodo(id, completed);
      setList(result.list);
      setError("");
    } catch (reason) {
      setList(previous);
      message(reason);
    } finally {
      setWorkingTodoIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function deleteTodo(id: string) {
    if (!list || workingTodoIds.has(id)) return;
    const previous = list;
    setWorkingTodoIds((current) => new Set(current).add(id));
    setList({ ...list, todos: list.todos.filter((todo) => todo.id !== id) });
    try {
      const result = await packingApi.deleteTodo(id);
      setList(result.list);
      setError("");
    } catch (reason) {
      setList(previous);
      message(reason);
    } finally {
      setWorkingTodoIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function renderPackingItem(item: TravelPackingItem) {
    const working = workingIds.has(item.id);
    return (
      <div className={`packing-item${item.packed ? " is-packed" : ""}${item.quantity === 0 ? " is-shortage" : ""}${pendingIds.has(item.id) ? " is-pending" : ""}`} key={item.id}>
        <button
          type="button"
          className="packing-item__toggle"
          aria-label={`${item.packed ? "取消已装" : "标记已装"}：${item.label}`}
          aria-pressed={item.packed}
          disabled={working || item.quantity === 0}
          onClick={() => void updateItem(item.id, { packed: !item.packed })}
        ><span aria-hidden="true">{item.packed ? "✓" : ""}</span></button>
        <button type="button" className="packing-item__main" onClick={() => openItemEditor(item)}>
          <strong>{item.label}</strong>
          <small className={isExpired(item.expirationDate) ? "is-expired" : ""}>{isExpired(item.expirationDate) ? "已过期 · " : ""}{item.quantity === 0 ? "库存不足，点击补充 · " : ""}{LOCATIONS.find((location) => location.value === item.location)?.label ?? "行李箱"}</small>
        </button>
        <button type="button" className="packing-item__stock" aria-label={`调整${item.label}库存，当前${item.quantity}`} onClick={() => openItemEditor(item)}>
          <strong>{item.quantity}</strong>
        </button>
      </div>
    );
  }

  if (!list) {
    return (
      <main className="packing-page packing-page--centered">
        {error ? (
          <><strong>{shareToken ? "分享链接无法打开" : authRequired ? "请先登录家长账号" : "清单没有打开"}</strong><p>{error}</p>{authRequired ? <a className="packing-empty-action" href="/parent/">进入家长登录</a> : <button type="button" onClick={() => window.location.reload()}>重新加载</button>}</>
        ) : (
          <><span className="packing-loading-dot" aria-hidden="true" /><p>正在整理你的行李清单…</p></>
        )}
      </main>
    );
  }

  return (
    <main className="packing-page">
      <section className="packing-shell" aria-label="旅行行李清单">
        <header className="packing-appbar">
          <span className="packing-appbar__spacer" aria-hidden="true" />
          <strong>行李清单</strong>
          <button type="button" className="packing-round-button" aria-label="更多清单操作" onClick={() => setPageSheet("menu")}>•••</button>
        </header>

        <section className="packing-hero" style={{ backgroundImage: `url(${travelPackingHero})` }}>
          <div className="packing-hero__content">
            {shareToken ? <h1>{list.title}</h1> : (
              <button type="button" className="packing-hero__list-switch" onClick={() => void openLibrary("lists")}>
                <span>{list.title}</span><small>切换清单</small>
              </button>
            )}
            <div className="packing-hero__score"><strong>{progress}</strong><small>%</small></div>
            <p>{progress === 100 && allItems.length > 0 ? "全部准备好了" : `已装好 ${packedCount} / ${allItems.length} 件`}</p>
          </div>
          <div className="packing-hero__progress" aria-label={`已带好 ${packedCount} 件，共 ${allItems.length} 件`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="packing-overview" aria-label="物品位置">
          {[{ value: null, label: "全部" }, ...LOCATIONS].map((location) => {
            const selected = locationFilter === location.value;
            return (
              <button
                type="button"
                className={`packing-location-button${selected ? " is-active" : ""}`}
                aria-pressed={selected}
                onClick={() => setLocationFilter(location.value as PackingLocation | null)}
                key={location.value ?? "ALL"}
              >
                <span>{location.label}</span>
                <small>{selected ? "正在查看" : "查看物品"}</small>
              </button>
            );
          })}
        </section>

        {error && <div className="packing-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>关闭</button></div>}

        <div className="packing-list-tools">
          <nav className="packing-filters" aria-label="筛选清单">
            {FILTERS.map(({ value, label }) => (
              <button type="button" className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>
            ))}
          </nav>
          <button type="button" className="packing-todo-entry" onClick={() => setShowTodoSheet(true)}>
            <span>出发待办</span><strong>{pendingTodoCount}</strong>
          </button>
        </div>

        <div className="packing-list">
          <div className="packing-list__heading">
            <div>
              <span>{filter === "unpacked" ? "待装物品" : locationFilter ? `${LOCATIONS.find((location) => location.value === locationFilter)?.label ?? "位置"}物品` : "我的分类"}</span>
              {filter === "all" ? <button type="button" onClick={openAddCategory}>添加分类</button> : <small>正在查看：{FILTERS.find((entry) => entry.value === filter)?.label}</small>}
            </div>
          </div>

          {filter === "unpacked" ? (
            allItems.some((item) => !item.packed && (!locationFilter || item.location === locationFilter)) ? (
              <section className="packing-flat-items" aria-label="待装物品">
                {allItems.filter((item) => !item.packed && (!locationFilter || item.location === locationFilter)).map(renderPackingItem)}
              </section>
            ) : (
              <div className="packing-flat-empty"><strong>都装好了</strong><span>清单里的物品已经全部准备完成。</span></div>
            )
          ) : list.categories.map((category, categoryIndex) => {
            const scopedItems = category.items.filter((item) => !locationFilter || item.location === locationFilter);
            const visibleItems = category.items.filter((item) =>
              (!locationFilter || item.location === locationFilter) &&
              (filter === "all" ||
              (filter === "packed" && item.packed)),
            );
            if (visibleItems.length === 0 && (filter !== "all" || locationFilter)) return null;
            const open = expandedIds.has(category.id);
            const categoryPacked = scopedItems.filter((item) => item.packed).length;
            const categoryShortage = scopedItems.filter((item) => item.quantity === 0).length;
            const tint = categoryIndex % 4;

            return (
              <section className={`packing-category packing-category--tint-${tint}${open ? " is-open" : ""}${pendingIds.has(category.id) ? " is-pending" : ""}`} key={category.id}>
                <div className="packing-category__header">
                  <button type="button" className="packing-category__toggle" aria-expanded={open} onClick={() => toggleCategory(category.id)}>
                    <span className="packing-category__mark" aria-hidden="true">{category.name.slice(0, 1)}</span>
                    <span className="packing-category__title"><strong>{category.name}</strong><small>{categoryPacked}/{scopedItems.length} 已装{categoryShortage > 0 ? ` · ${categoryShortage} 待补` : ""}</small></span>
                  </button>
                  <button type="button" className="packing-category__more" aria-label={`管理${category.name}`} onClick={() => setCategoryMenuId(category.id)}>•••</button>
                </div>

                {open && (
                  <div className="packing-category__body">
                    {visibleItems.map(renderPackingItem)}
                    {category.items.length === 0 && <button type="button" className="packing-category__empty" onClick={() => openAddItem(category.id)}>这个分类还没有物品，点击添加</button>}
                  </div>
                )}
              </section>
            );
          })}

          {list.categories.length === 0 && (
            <div className="packing-empty"><strong>先建立一个分类</strong><span>例如药品、孩子用品或衣物。</span><button type="button" onClick={openAddCategory}>添加分类</button></div>
          )}
        </div>

        <div className="packing-bottom-bar">
          <button type="button" className="packing-bottom-bar__secondary" aria-label="AI 建议：检查行李有没有遗漏" onClick={() => void openTips()}><img src={travelPackingTipsIcon} alt="" /><span>AI 建议</span></button>
          <button type="button" className="packing-bottom-bar__primary" onClick={() => openAddItem()}>添加物品</button>
        </div>
      </section>

      {pageSheet === "menu" && (
        <div className="packing-backdrop" role="presentation" onMouseDown={closePageSheet}>
          <section className="packing-action-sheet" role="dialog" aria-modal="true" aria-label="清单操作" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-action-sheet__title"><span>清单设置</span><strong>{list.title}</strong></div>
            {!shareToken && <button type="button" onClick={() => void openLibrary("lists")}><span>清单与模板</span><small>切换清单，或从模板开始一趟新旅行</small></button>}
            <button type="button" onClick={() => { setTripTitle(list.title); setPageSheet("rename"); }}><span>修改旅行名称</span><small>更换这次行程的标题</small></button>
            {!shareToken && <button type="button" onClick={() => openTemplateComposer()}><span>保存为模板</span><small>保存当前分类、物品、位置和待办</small></button>}
            <button type="button" onClick={() => { setPageSheet(null); setShowResetConfirm(true); }}><span>重新整理这份清单</span><small>保留内容，只清空已装和待办完成状态</small></button>
            {!shareToken && <button type="button" onClick={openShare}><span>分享清单</span><small>生成无需登录的临时协作链接</small></button>}
            <button type="button" className="packing-action-sheet__cancel" onClick={closePageSheet}>完成</button>
          </section>
        </div>
      )}

      {showLibrarySheet && !shareToken && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setShowLibrarySheet(false)}>
          <section className="packing-sheet packing-library-sheet" role="dialog" aria-modal="true" aria-labelledby="packing-library-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-library-heading">
              <div><span>按不同场景分别准备</span><h2 id="packing-library-title">清单与模板</h2></div>
              <button type="button" onClick={() => setShowLibrarySheet(false)}>完成</button>
            </div>
            <nav className="packing-library-tabs" aria-label="清单和模板">
              <button type="button" className={libraryTab === "lists" ? "is-active" : ""} onClick={() => setLibraryTab("lists")}>出行清单 <small>{workspace?.lists.length ?? 0}</small></button>
              <button type="button" className={libraryTab === "templates" ? "is-active" : ""} onClick={() => setLibraryTab("templates")}>模板 <small>{workspace?.templates.length ?? 0}</small></button>
            </nav>
            <div className="packing-library-list">
              {libraryTab === "lists" ? workspace?.lists.map((entry) => (
                <article className={`packing-library-row${entry.id === list.id ? " is-current" : ""}`} key={entry.id}>
                  <button type="button" className="packing-library-row__main" disabled={submitting} onClick={() => void activateList(entry.id)}>
                    <span>{entry.title}</span>
                    <small>{entry.itemCount} 件物品 · {entry.categoryCount} 个分类{entry.id === list.id ? " · 当前使用" : ""}</small>
                  </button>
                  <button type="button" className="packing-library-row__more" aria-label={`管理${entry.title}`} onClick={() => setDeletingEntry(entry)}>删除</button>
                </article>
              )) : workspace?.templates.map((entry) => (
                <article className="packing-library-row packing-library-row--template" key={entry.id}>
                  <button type="button" className="packing-library-row__main" onClick={() => { setShowLibrarySheet(false); openListComposer(entry.id); }}>
                    <span>{entry.title}</span>
                    <small>{entry.itemCount} 件物品 · 点击用它新建清单</small>
                  </button>
                  <button type="button" className="packing-library-row__more" aria-label={`管理${entry.title}`} onClick={() => setDeletingEntry(entry)}>删除</button>
                </article>
              ))}
              {libraryTab === "templates" && workspace?.templates.length === 0 && (
                <div className="packing-library-empty"><strong>还没有模板</strong><span>把整理好的一份清单保存下来，下次可以直接复用。</span></div>
              )}
            </div>
            <button type="button" className="packing-library-create" onClick={() => libraryTab === "lists" ? openListComposer() : openTemplateComposer()}>{libraryTab === "lists" ? "新建出行清单" : "保存新模板"}</button>
          </section>
        </div>
      )}

      {libraryComposer && !shareToken && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setLibraryComposer(null)}>
          <form className="packing-sheet packing-library-composer" onSubmit={createLibraryEntry} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>{libraryComposer === "list" ? "新建出行清单" : "保存为模板"}</h2>
            <p>{libraryComposer === "list" ? "可以复制已有内容，也可以从空白开始。复制时会保留分类、物品、库存、位置、有效期和待办，但不会带入完成状态。" : "模板会记录这套物品和待办，今后创建新清单时可以直接继承。"}</p>
            <label>{libraryComposer === "list" ? "清单名称" : "模板名称"}<input autoFocus value={libraryTitle} maxLength={24} onChange={(event) => setLibraryTitle(event.target.value)} /></label>
            <fieldset className="packing-source-picker">
              <legend>{libraryComposer === "list" ? "从哪里开始" : "继承哪份清单"}</legend>
              {libraryComposer === "list" && (
                <button type="button" className={librarySourceId === null ? "is-selected" : ""} onClick={() => setLibrarySourceId(null)}><strong>空白清单</strong><small>不复制任何物品</small></button>
              )}
              {workspace?.lists.map((entry) => (
                <button type="button" className={librarySourceId === entry.id ? "is-selected" : ""} onClick={() => setLibrarySourceId(entry.id)} key={entry.id}>
                  <strong>{entry.id === list.id ? "复制当前清单" : entry.title}</strong><small>{entry.itemCount} 件物品{entry.id === list.id ? ` · ${entry.title}` : ""}</small>
                </button>
              ))}
              {libraryComposer === "list" && workspace?.templates.map((entry) => (
                <button type="button" className={librarySourceId === entry.id ? "is-selected" : ""} onClick={() => setLibrarySourceId(entry.id)} key={entry.id}>
                  <strong>{entry.title}</strong><small>模板 · {entry.itemCount} 件物品</small>
                </button>
              ))}
            </fieldset>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setLibraryComposer(null)}>取消</button><button type="submit" className="is-primary" disabled={submitting || !libraryTitle.trim() || (libraryComposer === "template" && !librarySourceId)}>{submitting ? "正在保存…" : libraryComposer === "list" ? "创建并切换" : "保存模板"}</button></div>
          </form>
        </div>
      )}

      {showShareSheet && !shareToken && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setShowShareSheet(false)}>
          <section className="packing-sheet packing-share-sheet" role="dialog" aria-modal="true" aria-labelledby="packing-share-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2 id="packing-share-title">分享清单</h2>
            <p>拿到链接的人在有效期内无需登录，可以和你一起整理这份清单。</p>
            <span className="packing-share-sheet__label">链接有效期</span>
            <div className="packing-share-duration" role="radiogroup" aria-label="分享链接有效期">
              {[1, 7, 30].map((days) => (
                <button type="button" role="radio" aria-checked={shareDays === days} className={shareDays === days ? "is-selected" : ""} onClick={() => { setShareDays(days); setShareResult(null); setCopyStatus("idle"); }} key={days}>{days} 天</button>
              ))}
            </div>
            {shareResult ? (
              <div className="packing-share-result">
                <span>分享网址</span>
                <div className="packing-share-url">
                  <p>{shareResult.url}</p>
                  <button type="button" aria-label="复制分享网址" onClick={() => void copyShareUrl()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
                  </button>
                </div>
                <small>{copyStatus === "copied" ? "网址已复制" : `有效至 ${formatShareExpiry(shareResult.expiresAt)}`}</small>
              </div>
            ) : (
              <div className="packing-share-note">链接到期后会自动失效，原清单和已有数据不受影响。</div>
            )}
            <div className="packing-sheet__actions">
              <button type="button" onClick={() => setShowShareSheet(false)}>关闭</button>
              {shareResult
                ? <button type="button" className="is-primary" onClick={() => void copyShareUrl()}>{copyStatus === "copied" ? "已复制" : "复制网址"}</button>
                : <button type="button" className="is-primary" disabled={submitting} onClick={() => void createShare()}>{submitting ? "正在生成…" : "生成链接"}</button>}
            </div>
          </section>
        </div>
      )}

      {showTipsSheet && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setShowTipsSheet(false)}>
          <section className="packing-sheet packing-tips-sheet" role="dialog" aria-modal="true" aria-labelledby="packing-tips-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-tips-sheet__heading">
              <div><span>出发前检查</span><h2 id="packing-tips-title">看看还有什么没带</h2></div>
              {tips && <strong>{tips.summary.attention}</strong>}
            </div>
            <p>按常见亲子出行清单粗略匹配，名称不同也会尽量识别。请结合这次行程自行判断。</p>
            {tips && <TipsFilterTabs tips={tips} value={tipsFilter} onChange={setTipsFilter} />}
            <div className="packing-tips-sheet__scroll">
              {tipsLoading && <div className="packing-tips-loading"><span className="packing-loading-dot" aria-hidden="true" /><p>正在检查当前清单…</p></div>}
              {tipsError && <div className="packing-tips-error"><strong>检查没有完成</strong><span>{tipsError}</span><button type="button" onClick={() => void openTips()}>重新检查</button></div>}
              {tips && tips.summary.attention === 0 && <div className="packing-tips-complete"><strong>常用物品都准备好了</strong><span>还是建议出发前再按实际行程检查一次。</span></div>}
              {tips?.groups.map((group, index) => {
                const visibleItems = group.items.filter((item) => {
                  if (tipsFilter === "all") return true;
                  if (tipsFilter === "not-listed") return item.status === "NOT_LISTED";
                  if (tipsFilter === "unpacked") return item.status === "UNPACKED";
                  return item.status === "OUT_OF_STOCK" || item.status === "EXPIRED";
                });
                if (visibleItems.length === 0) return null;
                return (
                <details className="packing-tips-group" open={index < 2} key={group.name}>
                  <summary><span>{group.name}</span><small>{visibleItems.length} 项要留意</small></summary>
                  <div>
                    {visibleItems.map((item) => (
                      <article className={`packing-tip-item packing-tip-item--${item.status.toLowerCase()}`} key={item.id}>
                        <span className="packing-tip-item__dot" aria-hidden="true" />
                        <div><strong>{item.label}</strong><small>{item.priority === "ESSENTIAL" ? "优先检查" : "按行程确认"}</small></div>
                        <em>{TIP_STATUS_LABELS[item.status]}</em>
                      </article>
                    ))}
                  </div>
                </details>
                );
              })}
            </div>
            <button type="button" className="packing-tips-sheet__done" onClick={() => setShowTipsSheet(false)}>知道了</button>
          </section>
        </div>
      )}

      {showTodoSheet && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setShowTodoSheet(false)}>
          <section className="packing-sheet packing-todo-sheet" role="dialog" aria-modal="true" aria-labelledby="packing-todo-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-todo-sheet__heading">
              <div><span>出发前别忘记</span><h2 id="packing-todo-title">待办清单</h2></div>
              <strong>{pendingTodoCount}</strong>
            </div>
            <p>把出门前需要处理的小事记在这里，完成一项就勾掉一项。</p>
            <form className="packing-todo-add" onSubmit={addTodo}>
              <input value={todoName} maxLength={80} placeholder="例如：关水电、检查煤气" aria-label="新增待办" onChange={(event) => setTodoName(event.target.value)} />
              <button type="submit" disabled={submitting || !todoName.trim()}>添加</button>
            </form>
            <div className="packing-todo-list">
              {list.todos.length === 0 && <div className="packing-todo-empty"><strong>暂时没有待办</strong><span>临出发前想到什么，就随手记一条。</span></div>}
              {list.todos.map((todo) => (
                <article className={`packing-todo${todo.completed ? " is-completed" : ""}`} key={todo.id}>
                  <button type="button" className="packing-todo__check" aria-label={`${todo.completed ? "恢复" : "完成"}：${todo.label}`} aria-pressed={todo.completed} disabled={workingTodoIds.has(todo.id)} onClick={() => void toggleTodo(todo.id, !todo.completed)}><span aria-hidden="true">{todo.completed ? "✓" : ""}</span></button>
                  <strong>{todo.label}</strong>
                  <button type="button" className="packing-todo__delete" disabled={workingTodoIds.has(todo.id)} onClick={() => void deleteTodo(todo.id)}>删除</button>
                </article>
              ))}
            </div>
            <button type="button" className="packing-todo-sheet__done" onClick={() => setShowTodoSheet(false)}>完成</button>
          </section>
        </div>
      )}

      {pageSheet === "rename" && (
        <div className="packing-backdrop" role="presentation" onMouseDown={closePageSheet}>
          <form className="packing-sheet" onSubmit={renameTrip} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>旅行名称</h2>
            <p>给这次出行起一个容易辨认的名字。</p>
            <label>名称<input autoFocus value={tripTitle} maxLength={24} onChange={(event) => setTripTitle(event.target.value)} /></label>
            <div className="packing-sheet__actions"><button type="button" onClick={closePageSheet}>取消</button><button type="submit" className="is-primary" disabled={submitting || !tripTitle.trim()}>保存</button></div>
          </form>
        </div>
      )}

      {pageSheet === "category" && (
        <div className="packing-backdrop" role="presentation" onMouseDown={closePageSheet}>
          <form className="packing-sheet" onSubmit={saveCategory} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>{editingCategoryId ? "重命名分类" : "添加分类"}</h2>
            <p>{editingCategoryId ? "分类下的物品会完整保留。" : "把同一类物品放在一起，更容易检查。"}</p>
            <label>分类名称<input autoFocus value={categoryName} maxLength={20} placeholder="例如：药品" onChange={(event) => setCategoryName(event.target.value)} /></label>
            <div className="packing-sheet__actions"><button type="button" onClick={closePageSheet}>取消</button><button type="submit" className="is-primary" disabled={submitting || !categoryName.trim()}>保存</button></div>
          </form>
        </div>
      )}

      {categoryMenuId && activeCategory && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setCategoryMenuId(null)}>
          <section className="packing-action-sheet" role="dialog" aria-modal="true" aria-label={`${activeCategory.name}分类操作`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-action-sheet__title"><span>分类</span><strong>{activeCategory.name}</strong></div>
            <button type="button" onClick={() => openAddItem(activeCategory.id)}><span>添加物品</span><small>添加到这个分类</small></button>
            <button type="button" onClick={() => openEditCategory(activeCategory.id)}><span>重命名分类</span><small>不会影响分类中的物品</small></button>
            <button type="button" className="is-danger" onClick={() => { setCategoryMenuId(null); setDeletingCategoryId(activeCategory.id); }}><span>删除分类</span><small>同时删除分类中的全部物品</small></button>
            <button type="button" className="packing-action-sheet__cancel" onClick={() => setCategoryMenuId(null)}>取消</button>
          </section>
        </div>
      )}

      {itemSheetCategoryId && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setItemSheetCategoryId(null)}>
          <form className="packing-sheet" onSubmit={addItem} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>添加物品</h2><p>物品和库存会保存在你的长期清单里。</p>
            <div className="packing-field">
              <span className="packing-field__label">所属分类</span>
              <button type="button" className="packing-category-picker" aria-expanded={categoryPickerOpen} onClick={() => setCategoryPickerOpen((value) => !value)}>
                <span>{list.categories.find((category) => category.id === itemSheetCategoryId)?.name ?? "选择分类"}</span>
              </button>
              {categoryPickerOpen && <div className="packing-category-picker__menu" role="listbox" onClick={(event) => event.stopPropagation()}>
                {list.categories.map((category) => <button type="button" role="option" aria-selected={category.id === itemSheetCategoryId} className={category.id === itemSheetCategoryId ? "is-selected" : ""} onClick={(event) => { event.stopPropagation(); setItemSheetCategoryId(category.id); setLastCategoryId(category.id); setCategoryPickerOpen(false); try { window.localStorage.setItem("star-monsters:last-packing-category", category.id); } catch { /* storage is optional */ } }} key={category.id}>{category.name}{category.id === itemSheetCategoryId && <span aria-hidden="true">✓</span>}</button>)}
              </div>}
            </div>
            <label>物品名称<input autoFocus value={itemName} maxLength={30} placeholder="例如：儿童退烧药" onChange={(event) => setItemName(event.target.value)} /></label>
            <LocationPicker value={itemLocation} onChange={setItemLocation} />
            {isMedicineCategory(list.categories.find((category) => category.id === itemSheetCategoryId)?.name) && <label>有效期（可选）<input type="date" value={itemExpirationDate} onChange={(event) => setItemExpirationDate(event.target.value)} /></label>}
            <label>现有库存<div className="packing-sheet__quantity"><button type="button" aria-label="库存减少一件" onClick={() => setItemQuantity((value) => Math.max(0, value - 1))}><img src={decreaseControlIcon} alt="" /></button><strong>{itemQuantity}</strong><button type="button" aria-label="库存增加一件" onClick={() => setItemQuantity((value) => Math.min(999, value + 1))}><img src={increaseControlIcon} alt="" /></button></div></label>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setItemSheetCategoryId(null)}>取消</button><button type="submit" className="is-primary" disabled={submitting || !itemName.trim()}>加入清单</button></div>
          </form>
        </div>
      )}

      {editingItemId && editingItem && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => { setEditingItemId(null); setEditingItemCategoryId(null); }}>
          <form className="packing-sheet" onSubmit={saveItem} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>物品详情</h2><p>调整名称或库存，修改会立即保存到长期清单。</p>
            <div className="packing-field">
              <span className="packing-field__label">所属分类</span>
              <button type="button" className="packing-category-picker" aria-expanded={editingCategoryPickerOpen} onClick={() => setEditingCategoryPickerOpen((value) => !value)}>
                <span>{list.categories.find((category) => category.id === editingItemCategoryId)?.name ?? "选择分类"}</span>
              </button>
              {editingCategoryPickerOpen && <div className="packing-category-picker__menu" role="listbox" onClick={(event) => event.stopPropagation()}>
                {list.categories.map((category) => <button type="button" role="option" aria-selected={category.id === editingItemCategoryId} className={category.id === editingItemCategoryId ? "is-selected" : ""} onClick={(event) => { event.stopPropagation(); setEditingItemCategoryId(category.id); setEditingCategoryPickerOpen(false); }} key={category.id}>{category.name}{category.id === editingItemCategoryId && <span aria-hidden="true">✓</span>}</button>)}
              </div>}
            </div>
            <label>物品名称<input value={itemName} maxLength={30} onChange={(event) => setItemName(event.target.value)} /></label>
            <LocationPicker value={itemLocation} onChange={setItemLocation} />
            {isMedicineCategory(list.categories.find((category) => category.id === editingItemCategoryId)?.name) && <label>有效期（可选）<input type="date" value={itemExpirationDate} onChange={(event) => setItemExpirationDate(event.target.value)} /></label>}
            <label>现有库存<div className="packing-sheet__quantity"><button type="button" aria-label="库存减少一件" onClick={() => setItemQuantity((value) => Math.max(0, value - 1))}><img src={decreaseControlIcon} alt="" /></button><strong>{itemQuantity}</strong><button type="button" aria-label="库存增加一件" onClick={() => setItemQuantity((value) => Math.min(999, value + 1))}><img src={increaseControlIcon} alt="" /></button></div></label>
            <button type="button" className="packing-sheet__danger" onClick={() => { setEditingItemId(null); setDeletingItemId(editingItem.id); }}>从清单中删除这件物品</button>
            <div className="packing-sheet__actions"><button type="button" onClick={() => { setEditingItemId(null); setEditingItemCategoryId(null); }}>取消</button><button type="submit" className="is-primary" disabled={submitting || !itemName.trim()}>保存修改</button></div>
          </form>
        </div>
      )}

      {showResetConfirm && (
        <ConfirmDialog
          title="开始新一趟旅行？"
          description="会清空所有“已装好”状态，分类、物品和库存数量都会保留。"
          confirmText="清空并开始"
          submitting={submitting}
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => void resetTrip()}
        />
      )}

      {deletingEntry && (
        <ConfirmDialog
          danger
          title={`删除“${deletingEntry.title}”？`}
          description={deletingEntry.kind === "TEMPLATE"
            ? "模板会被删除，已经从它创建的出行清单不会受到影响。"
            : deletingEntry.id === list.id
              ? "当前清单会被删除，并自动切换到最近使用的另一份清单。"
              : "这份清单和其中的物品、库存及待办会一起删除，此操作无法撤销。"}
          confirmText="确认删除"
          submitting={submitting}
          onCancel={() => setDeletingEntry(null)}
          onConfirm={() => void deleteLibraryEntry()}
        />
      )}

      {deletingCategoryId && deletingCategory && (
        <ConfirmDialog
          danger
          title={`删除“${deletingCategory.name}”？`}
          description={`这个分类和其中 ${deletingCategory.items.length} 件物品会一起删除，此操作无法撤销。`}
          confirmText="确认删除"
          submitting={submitting}
          onCancel={() => setDeletingCategoryId(null)}
          onConfirm={() => void deleteCategory()}
        />
      )}

      {deletingItemId && deletingItem && (
        <ConfirmDialog
          danger
          title={`删除“${deletingItem.label}”？`}
          description="它会从你的长期清单中移除，此操作无法撤销。"
          confirmText="确认删除"
          submitting={submitting}
          onCancel={() => setDeletingItemId(null)}
          onConfirm={() => void deleteItem()}
        />
      )}
    </main>
  );
}

function TipsFilterTabs({
  tips,
  value,
  onChange,
}: {
  tips: TravelPackingTips;
  value: TipsFilter;
  onChange: (value: TipsFilter) => void;
}) {
  const items = tips.groups.flatMap((group) => group.items);
  const counts: Record<TipsFilter, number> = {
    all: items.length,
    "not-listed": items.filter((item) => item.status === "NOT_LISTED").length,
    unpacked: items.filter((item) => item.status === "UNPACKED").length,
    other: items.filter((item) => item.status === "OUT_OF_STOCK" || item.status === "EXPIRED").length,
  };
  const tabs: Array<{ value: TipsFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "not-listed", label: "清单里没有" },
    { value: "unpacked", label: "还没装" },
    { value: "other", label: "库存 / 过期" },
  ];
  return (
    <nav className="packing-tips-tabs" aria-label="遗漏状态筛选">
      {tabs.map((tab) => <button type="button" className={value === tab.value ? "is-active" : ""} aria-pressed={value === tab.value} onClick={() => onChange(tab.value)} key={tab.value}>{tab.label}<strong>{counts[tab.value]}</strong></button>)}
    </nav>
  );
}

function LocationPicker({ value, onChange }: { value: PackingLocation; onChange: (value: PackingLocation) => void }) {
  return (
    <label className="packing-location-field">物品位置
      <div className="packing-location-picker" role="radiogroup" aria-label="物品位置">
        {LOCATIONS.map((location) => <button type="button" role="radio" aria-checked={value === location.value} className={value === location.value ? "is-selected" : ""} onClick={() => onChange(location.value)} key={location.value}>{location.label}</button>)}
      </div>
    </label>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmText,
  danger = false,
  submitting,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="packing-backdrop packing-backdrop--center" role="presentation" onMouseDown={onCancel}>
      <div className="packing-dialog" role="dialog" aria-modal="true" aria-labelledby="packing-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className={`packing-dialog__signal${danger ? " is-danger" : ""}`} aria-hidden="true" />
        <h2 id="packing-confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="packing-sheet__actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className={danger ? "is-danger" : "is-primary"} disabled={submitting} onClick={onConfirm}>{confirmText}</button></div>
      </div>
    </div>
  );
}
