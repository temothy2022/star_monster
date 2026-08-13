import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  parentApi,
  type TravelPackingItem,
  type TravelPackingList as PackingList,
} from "./api";
import travelPackingHero from "./assets/travel-packing-hero-v2.webp";
import "./travel-packing-list.css";

type Filter = "all" | "unpacked" | "shortage" | "packed";
type PageSheet = "menu" | "rename" | "category" | null;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unpacked", label: "待装" },
  { value: "shortage", label: "待补" },
  { value: "packed", label: "已装" },
];

export function TravelPackingList({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<PackingList | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());
  const [pageSheet, setPageSheet] = useState<PageSheet>(null);
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [itemSheetCategoryId, setItemSheetCategoryId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [tripTitle, setTripTitle] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void parentApi.travelPackingList()
      .then(({ list: value }) => {
        if (cancelled) return;
        setList(value);
        setExpandedIds(new Set(value.categories.map((category) => category.id)));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "行李清单暂时无法读取");
      });
    return () => { cancelled = true; };
  }, []);

  const allItems = useMemo(
    () => list?.categories.flatMap((category) => category.items) ?? [],
    [list],
  );
  const packedCount = allItems.filter((item) => item.packed).length;
  const shortageCount = allItems.filter((item) => item.quantity === 0).length;
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
      const result = await parentApi.updateTravelPackingItem(id, data);
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
    setItemSheetCategoryId(categoryId ?? list.categories[0].id);
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!itemSheetCategoryId || !itemName.trim()) return;
    setSubmitting(true);
    try {
      const result = await parentApi.addTravelPackingItem(
        itemSheetCategoryId,
        itemName.trim(),
        itemQuantity,
      );
      setList(result.list);
      setExpandedIds((current) => new Set(current).add(itemSheetCategoryId));
      setItemSheetCategoryId(null);
      setFilter("all");
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
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
    setSubmitting(true);
    try {
      const previousIds = new Set(list?.categories.map((category) => category.id));
      const result = editingCategoryId
        ? await parentApi.renameTravelPackingCategory(editingCategoryId, name)
        : await parentApi.addTravelPackingCategory(name);
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
      const result = await parentApi.deleteTravelPackingCategory(deletingCategoryId);
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
    setItemName(item.label);
    setItemQuantity(item.quantity);
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!editingItemId || !itemName.trim()) return;
    setSubmitting(true);
    try {
      const result = await parentApi.updateTravelPackingItem(editingItemId, {
        label: itemName.trim(),
        quantity: itemQuantity,
        ...(itemQuantity === 0 ? { packed: false } : {}),
      });
      setList(result.list);
      setEditingItemId(null);
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
      const result = await parentApi.deleteTravelPackingItem(deletingItemId);
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
      const result = await parentApi.renameTravelPackingList(tripTitle.trim());
      setList(result.list);
      closePageSheet();
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function resetTrip() {
    setSubmitting(true);
    try {
      const result = await parentApi.resetTravelPackingList();
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

  if (!list) {
    return (
      <main className="packing-page packing-page--centered">
        {error ? (
          <><strong>清单没有打开</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></>
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
          <button type="button" className="packing-round-button" aria-label="返回家长端" onClick={onBack}>‹</button>
          <strong>行李清单</strong>
          <button type="button" className="packing-round-button" aria-label="更多清单操作" onClick={() => setPageSheet("menu")}>•••</button>
        </header>

        <section className="packing-hero" style={{ backgroundImage: `url(${travelPackingHero})` }}>
          <div className="packing-hero__content">
            <h1>{list.title}</h1>
            <div className="packing-hero__score"><strong>{progress}</strong><small>%</small></div>
            <p>{progress === 100 && allItems.length > 0 ? "全部准备好了" : `已装好 ${packedCount} / ${allItems.length} 件`}</p>
          </div>
          <div className="packing-hero__progress" aria-label={`已带好 ${packedCount} 件，共 ${allItems.length} 件`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="packing-overview" aria-label="清单概况">
          <div><span>分类</span><strong>{list.categories.length}</strong></div>
          <div><span>物品</span><strong>{allItems.length}</strong></div>
          <button type="button" className={shortageCount > 0 ? "has-shortage" : ""} onClick={() => setFilter("shortage")}>
            <span>待补充</span><strong>{shortageCount}</strong>
          </button>
        </section>

        {error && <div className="packing-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>关闭</button></div>}

        <nav className="packing-filters" aria-label="筛选清单">
          {FILTERS.map(({ value, label }) => (
            <button type="button" className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>
          ))}
        </nav>

        <div className="packing-list">
          <div className="packing-list__heading">
            <div><span>我的分类</span><small>{filter === "all" ? "轻触分类可收起" : `正在查看：${FILTERS.find((entry) => entry.value === filter)?.label}`}</small></div>
          </div>

          {list.categories.map((category, categoryIndex) => {
            const visibleItems = category.items.filter((item) =>
              filter === "all" ||
              (filter === "packed" && item.packed) ||
              (filter === "unpacked" && !item.packed) ||
              (filter === "shortage" && item.quantity === 0),
            );
            if (visibleItems.length === 0 && filter !== "all") return null;
            const open = expandedIds.has(category.id);
            const categoryPacked = category.items.filter((item) => item.packed).length;
            const categoryShortage = category.items.filter((item) => item.quantity === 0).length;
            const tint = categoryIndex % 4;

            return (
              <section className={`packing-category packing-category--tint-${tint}${open ? " is-open" : ""}`} key={category.id}>
                <div className="packing-category__header">
                  <button type="button" className="packing-category__toggle" aria-expanded={open} onClick={() => toggleCategory(category.id)}>
                    <span className="packing-category__mark" aria-hidden="true">{category.name.slice(0, 1)}</span>
                    <span className="packing-category__title"><strong>{category.name}</strong><small>{categoryPacked}/{category.items.length} 已装{categoryShortage > 0 ? ` · ${categoryShortage} 待补` : ""}</small></span>
                    <span className="packing-category__chevron" aria-hidden="true">⌄</span>
                  </button>
                  <button type="button" className="packing-category__more" aria-label={`管理${category.name}`} onClick={() => setCategoryMenuId(category.id)}>•••</button>
                </div>

                {open && (
                  <div className="packing-category__body">
                    {visibleItems.map((item) => {
                      const working = workingIds.has(item.id);
                      return (
                        <div className={`packing-item${item.packed ? " is-packed" : ""}${item.quantity === 0 ? " is-shortage" : ""}`} key={item.id}>
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
                            {item.quantity === 0 && <small>库存不足，点击补充</small>}
                          </button>
                          <button type="button" className="packing-item__stock" aria-label={`调整${item.label}库存，当前${item.quantity}`} onClick={() => openItemEditor(item)}>
                            <strong>{item.quantity}</strong>
                          </button>
                        </div>
                      );
                    })}
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
          <button type="button" className="packing-bottom-bar__secondary" aria-label="添加分类" onClick={openAddCategory}>分类</button>
          <button type="button" className="packing-bottom-bar__primary" onClick={() => openAddItem()}>添加物品</button>
        </div>
      </section>

      {pageSheet === "menu" && (
        <div className="packing-backdrop" role="presentation" onMouseDown={closePageSheet}>
          <section className="packing-action-sheet" role="dialog" aria-modal="true" aria-label="清单操作" onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <div className="packing-action-sheet__title"><span>清单设置</span><strong>{list.title}</strong></div>
            <button type="button" onClick={() => { setTripTitle(list.title); setPageSheet("rename"); }}><span>修改旅行名称</span><small>更换这次行程的标题</small></button>
            <button type="button" onClick={openAddCategory}><span>添加分类</span><small>建立一个新的物品大类</small></button>
            <button type="button" onClick={() => { setPageSheet(null); setShowResetConfirm(true); }}><span>开始新一趟</span><small>保留清单，只清空已装状态</small></button>
            <button type="button" className="packing-action-sheet__cancel" onClick={closePageSheet}>完成</button>
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
            <label>所属分类<select value={itemSheetCategoryId} onChange={(event) => setItemSheetCategoryId(event.target.value)}>{list.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <label>物品名称<input autoFocus value={itemName} maxLength={30} placeholder="例如：儿童退烧药" onChange={(event) => setItemName(event.target.value)} /></label>
            <label>现有库存<div className="packing-sheet__quantity"><button type="button" onClick={() => setItemQuantity((value) => Math.max(0, value - 1))}>−</button><strong>{itemQuantity}</strong><button type="button" onClick={() => setItemQuantity((value) => Math.min(999, value + 1))}>＋</button></div></label>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setItemSheetCategoryId(null)}>取消</button><button type="submit" className="is-primary" disabled={submitting || !itemName.trim()}>加入清单</button></div>
          </form>
        </div>
      )}

      {editingItemId && editingItem && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setEditingItemId(null)}>
          <form className="packing-sheet" onSubmit={saveItem} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>物品详情</h2><p>调整名称或库存，修改会立即保存到长期清单。</p>
            <label>物品名称<input value={itemName} maxLength={30} onChange={(event) => setItemName(event.target.value)} /></label>
            <label>现有库存<div className="packing-sheet__quantity"><button type="button" onClick={() => setItemQuantity((value) => Math.max(0, value - 1))}>−</button><strong>{itemQuantity}</strong><button type="button" onClick={() => setItemQuantity((value) => Math.min(999, value + 1))}>＋</button></div></label>
            <button type="button" className="packing-sheet__danger" onClick={() => { setEditingItemId(null); setDeletingItemId(editingItem.id); }}>从清单中删除这件物品</button>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setEditingItemId(null)}>取消</button><button type="submit" className="is-primary" disabled={submitting || !itemName.trim()}>保存修改</button></div>
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
