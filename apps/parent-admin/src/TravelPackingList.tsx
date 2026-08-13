import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, parentApi, type TravelPackingList as PackingList } from "./api";
import "./travel-packing-list.css";

type Filter = "all" | "unpacked" | "shortage" | "packed";

export function TravelPackingList({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<PackingList | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());
  const [itemSheetCategoryId, setItemSheetCategoryId] = useState<string | null>(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [categoryName, setCategoryName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void parentApi.travelPackingList()
      .then(({ list: value }) => {
        if (!cancelled) setList(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "行李清单暂时无法读取");
      });
    return () => { cancelled = true; };
  }, []);

  const allItems = useMemo(() => list?.categories.flatMap((category) => category.items) ?? [], [list]);
  const packedCount = allItems.filter((item) => item.packed).length;
  const shortageCount = allItems.filter((item) => item.quantity === 0).length;
  const progress = allItems.length === 0 ? 0 : Math.round((packedCount / allItems.length) * 100);

  function message(reason: unknown) {
    setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "保存失败，请重试");
  }

  async function updateItem(id: string, data: { packed?: boolean; quantity?: number }) {
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

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!itemSheetCategoryId || !itemName.trim()) return;
    setSubmitting(true);
    try {
      const result = await parentApi.addTravelPackingItem(itemSheetCategoryId, itemName.trim(), itemQuantity);
      setList(result.list);
      setItemName("");
      setItemQuantity(1);
      setItemSheetCategoryId(null);
      setFilter("all");
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const result = editingCategoryId
        ? await parentApi.renameTravelPackingCategory(editingCategoryId, name)
        : await parentApi.addTravelPackingCategory(name);
      setList(result.list);
      closeCategorySheet();
      setError("");
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  function openCategorySheet(id?: string) {
    const category = id ? list?.categories.find((entry) => entry.id === id) : null;
    setEditingCategoryId(category?.id ?? null);
    setCategoryName(category?.name ?? "");
    setShowCategorySheet(true);
  }

  function closeCategorySheet() {
    setShowCategorySheet(false);
    setEditingCategoryId(null);
    setCategoryName("");
  }

  async function deleteCategory() {
    if (!deletingCategoryId) return;
    setSubmitting(true);
    try {
      const result = await parentApi.deleteTravelPackingCategory(deletingCategoryId);
      setList(result.list);
      setDeletingCategoryId(null);
      closeCategorySheet();
    } catch (reason) {
      message(reason);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteItem(id: string) {
    const item = allItems.find((entry) => entry.id === id);
    if (!window.confirm(`从清单中删除“${item?.label ?? "这件物品"}”？`)) return;
    try {
      const result = await parentApi.deleteTravelPackingItem(id);
      setList(result.list);
    } catch (reason) {
      message(reason);
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

  if (!list) {
    return (
      <main className="packing-page packing-page--centered">
        {error ? <><strong>清单没有打开</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></> : <p>正在打开行李清单…</p>}
      </main>
    );
  }

  return (
    <main className="packing-page">
      <section className="packing-shell" aria-label="旅行行李清单">
        <header className="packing-header">
          <div className="packing-header__topline">
            <button type="button" className="packing-text-button" onClick={onBack}>家长端</button>
            <span>随身行李清单</span>
            <button type="button" className="packing-text-button" onClick={() => setShowResetConfirm(true)}>新一趟</button>
          </div>
          <input
            className="packing-header__title"
            aria-label="旅行名称"
            defaultValue={list.title}
            maxLength={24}
            onBlur={(event) => {
              const title = event.currentTarget.value.trim();
              if (!title || title === list.title) return;
              void parentApi.renameTravelPackingList(title).then((result) => setList(result.list)).catch(message);
            }}
          />
          <div className="packing-progress" aria-label={`已带好 ${packedCount} 件，共 ${allItems.length} 件`}>
            <div><strong>{packedCount} / {allItems.length}</strong><span>{progress === 100 && allItems.length ? "全部带好" : "已经装进行李"}</span></div>
            <b>{progress}%</b>
            <div className="packing-progress__track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          </div>
          {shortageCount > 0 && <button type="button" className="packing-shortage" onClick={() => setFilter("shortage")}>{shortageCount} 件库存为 0，需要补充</button>}
        </header>

        {error && <div className="packing-error" role="alert">{error}<button type="button" onClick={() => setError("")}>知道了</button></div>}

        <nav className="packing-filters" aria-label="筛选清单">
          {([["all", "全部"], ["unpacked", "还没带"], ["shortage", "待补充"], ["packed", "已带好"]] as Array<[Filter, string]>).map(([value, label]) => (
            <button type="button" className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>
          ))}
        </nav>

        <div className="packing-list">
          <div className="packing-list__toolbar">
            <span>{list.categories.length} 个分类</span>
            <button type="button" onClick={() => openCategorySheet()}>添加分类</button>
          </div>
          {list.categories.map((category) => {
            const items = category.items.filter((item) =>
              filter === "all" ||
              (filter === "packed" && item.packed) ||
              (filter === "unpacked" && !item.packed) ||
              (filter === "shortage" && item.quantity === 0),
            );
            if (items.length === 0 && filter !== "all") return null;
            return (
              <section className="packing-category" key={category.id}>
                <div className="packing-category__heading">
                  <div><h2>{category.name}</h2><span>{category.items.filter((item) => item.packed).length}/{category.items.length}</span></div>
                  <div className="packing-category__actions">
                    <button type="button" onClick={() => openCategorySheet(category.id)}>编辑</button>
                    <button type="button" className="is-delete" onClick={() => setDeletingCategoryId(category.id)}>删除</button>
                  </div>
                </div>
                <div className="packing-category__items">
                  {items.map((item) => {
                    const working = workingIds.has(item.id);
                    return (
                      <div className={`packing-item${item.packed ? " is-packed" : ""}${item.quantity === 0 ? " is-shortage" : ""}`} key={item.id}>
                        <button
                          type="button"
                          className="packing-item__toggle"
                          aria-label={`${item.packed ? "取消已带" : "标记已带"}：${item.label}`}
                          aria-pressed={item.packed}
                          disabled={working || item.quantity === 0}
                          onClick={() => void updateItem(item.id, { packed: !item.packed })}
                        ><span aria-hidden="true">{item.packed ? "✓" : ""}</span></button>
                        <div className="packing-item__name"><strong>{item.label}</strong>{item.quantity === 0 && <small>需要补充</small>}</div>
                        <div className="packing-quantity" aria-label={`${item.label}库存数量`}>
                          <button type="button" disabled={working || item.quantity === 0} aria-label={`减少${item.label}数量`} onClick={() => void updateItem(item.id, { quantity: Math.max(0, item.quantity - 1), packed: false })}>−</button>
                          <b>{item.quantity}</b>
                          <button type="button" disabled={working || item.quantity >= 999} aria-label={`增加${item.label}数量`} onClick={() => void updateItem(item.id, { quantity: item.quantity + 1 })}>＋</button>
                        </div>
                        <button type="button" className="packing-item__delete" aria-label={`删除${item.label}`} onClick={() => void deleteItem(item.id)}>删除</button>
                      </div>
                    );
                  })}
                  {category.items.length === 0 && <div className="packing-category__empty">这个分类还没有物品</div>}
                  <button type="button" className="packing-category__add" onClick={() => setItemSheetCategoryId(category.id)}>添加到“{category.name}”</button>
                </div>
              </section>
            );
          })}
          {list.categories.length === 0 && <div className="packing-empty"><strong>先建立一个大类</strong><span>例如药品、孩子用品或衣物。</span><button type="button" onClick={() => openCategorySheet()}>添加分类</button></div>}
        </div>

        {list.categories.length > 0 && <div className="packing-bottom-bar"><button type="button" onClick={() => setItemSheetCategoryId(list.categories[0].id)}>添加物品</button></div>}
      </section>

      {itemSheetCategoryId && (
        <div className="packing-backdrop" role="presentation" onMouseDown={() => setItemSheetCategoryId(null)}>
          <form className="packing-sheet" onSubmit={addItem} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>添加子物品</h2>
            <label>所属分类<select value={itemSheetCategoryId} onChange={(event) => setItemSheetCategoryId(event.target.value)}>{list.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <label>物品名称<input autoFocus value={itemName} maxLength={30} placeholder="例如：儿童退烧药" onChange={(event) => setItemName(event.target.value)} /></label>
            <label>现有数量<div className="packing-sheet__quantity"><button type="button" onClick={() => setItemQuantity((value) => Math.max(0, value - 1))}>−</button><strong>{itemQuantity}</strong><button type="button" onClick={() => setItemQuantity((value) => Math.min(999, value + 1))}>＋</button></div></label>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setItemSheetCategoryId(null)}>取消</button><button type="submit" className="is-primary" disabled={submitting || !itemName.trim()}>加入清单</button></div>
          </form>
        </div>
      )}

      {showCategorySheet && (
        <div className="packing-backdrop" role="presentation" onMouseDown={closeCategorySheet}>
          <form className="packing-sheet" onSubmit={saveCategory} onMouseDown={(event) => event.stopPropagation()}>
            <div className="packing-sheet__handle" aria-hidden="true" />
            <h2>{editingCategoryId ? "管理分类" : "添加大类"}</h2>
            <label>分类名称<input autoFocus={!editingCategoryId} value={categoryName} maxLength={20} placeholder="例如：药品" onChange={(event) => setCategoryName(event.target.value)} /></label>
            <div className="packing-sheet__actions"><button type="button" onClick={closeCategorySheet}>取消</button><button type="submit" className="is-primary" disabled={submitting || !categoryName.trim()}>保存分类</button></div>
          </form>
        </div>
      )}

      {showResetConfirm && (
        <div className="packing-backdrop packing-backdrop--center" role="presentation" onMouseDown={() => setShowResetConfirm(false)}>
          <div className="packing-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <h2>开始新一趟旅行？</h2><p>会清空所有“已带好”状态，分类、物品和库存数量都会保留。</p>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setShowResetConfirm(false)}>暂不</button><button type="button" className="is-primary" disabled={submitting} onClick={() => void resetTrip()}>清空并开始</button></div>
          </div>
        </div>
      )}

      {deletingCategoryId && (
        <div className="packing-backdrop packing-backdrop--center" role="presentation" onMouseDown={() => setDeletingCategoryId(null)}>
          <div className="packing-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-category-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="delete-category-title">删除“{list.categories.find((category) => category.id === deletingCategoryId)?.name}”？</h2>
            <p>这个分类下面的全部物品也会一起删除，此操作无法撤销。</p>
            <div className="packing-sheet__actions"><button type="button" onClick={() => setDeletingCategoryId(null)}>取消</button><button type="button" className="is-danger" disabled={submitting} onClick={() => void deleteCategory()}>确认删除</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
