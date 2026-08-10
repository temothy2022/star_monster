import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  TaskDashboardLayout,
  TaskDashboardWidgetKey,
} from "../api/child-api";

const LONG_PRESS_MS = 520;
const REORDER_ANIMATION_MS = 340;

export const TASK_DASHBOARD_WIDGETS: ReadonlyArray<{
  key: TaskDashboardWidgetKey;
  label: string;
  description: string;
  size: "large" | "wide" | "medium" | "small";
  tone: string;
  required?: boolean;
}> = [
  { key: "TASKS", label: "我的任务", description: "查看并开始今天的任务", size: "large", tone: "navy", required: true },
  { key: "DAILY_PROGRESS", label: "今日进度", description: "看看今天离目标还有多远", size: "medium", tone: "green" },
  { key: "BALANCE", label: "星星余额", description: "随时查看可以使用的星星", size: "small", tone: "yellow" },
  { key: "MASCOT", label: "星宠伙伴", description: "听听星宠今天想对你说的话", size: "medium", tone: "pink" },
  { key: "TODAY_PLAN", label: "今日计划", description: "待完成、已完成和预计时间", size: "medium", tone: "blue" },
  { key: "STREAK", label: "连续记录", description: "记录坚持完成任务的天数", size: "small", tone: "orange" },
  { key: "GOAL_BONUS", label: "目标奖励", description: "展示达标后可以获得的奖励", size: "small", tone: "purple" },
  { key: "LEADERBOARD", label: "今日排名", description: "查看前三名和自己的今日排名", size: "medium", tone: "indigo" },
  { key: "NOTIFICATIONS", label: "通知", description: "查看新明信片和升级红包", size: "small", tone: "notice" },
  { key: "HANZI_REVIEW", label: "复习汉字", description: "滑动查看最近要复习的汉字", size: "small", tone: "hanzi" },
  { key: "POEM_REVIEW", label: "复习古诗", description: "每天听一首需要复习的古诗", size: "medium", tone: "poem" },
];

const WIDGET_BY_KEY = new Map(TASK_DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]));

type DragSession = {
  key: TaskDashboardWidgetKey;
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  targetLeft: number;
  targetTop: number;
  visualLeft: number;
  visualTop: number;
  animationFrame: number | null;
  lastSwapAt: number;
  width: number;
  height: number;
  target: HTMLElement;
  overlay: HTMLElement | null;
  activated: boolean;
  timer: number;
};

function reorder(
  widgets: TaskDashboardWidgetKey[],
  source: TaskDashboardWidgetKey,
  target: TaskDashboardWidgetKey,
  after: boolean,
) {
  if (source === target) return widgets;
  const next = widgets.filter((key) => key !== source);
  const targetIndex = next.indexOf(target);
  if (targetIndex < 0) return widgets;
  next.splice(targetIndex + (after ? 1 : 0), 0, source);
  return next;
}

export function TaskDashboard({
  layout,
  onSave,
  renderWidget,
}: {
  layout: TaskDashboardLayout;
  onSave: (layout: TaskDashboardLayout) => Promise<void>;
  renderWidget: (key: TaskDashboardWidgetKey) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draftWidgets, setDraftWidgets] = useState<TaskDashboardWidgetKey[]>(layout.widgets);
  const [pressedWidget, setPressedWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const [settlingWidget, setSettlingWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const dropOverlayRef = useRef<HTMLElement | null>(null);
  const widgetsRef = useRef(draftWidgets);
  const previousRectsRef = useRef<Map<TaskDashboardWidgetKey, DOMRect> | null>(null);

  useEffect(() => {
    widgetsRef.current = draftWidgets;
  }, [draftWidgets]);

  useEffect(() => {
    if (!editing) setDraftWidgets(layout.widgets);
  }, [editing, layout]);

  useEffect(() => () => {
    const drag = dragRef.current;
    if (drag) {
      window.clearTimeout(drag.timer);
      if (drag.animationFrame !== null) window.cancelAnimationFrame(drag.animationFrame);
      drag.overlay?.remove();
    }
    dropOverlayRef.current?.remove();
  }, []);

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current;
    previousRectsRef.current = null;
    if (previousRects && gridRef.current) {
      for (const element of gridRef.current.querySelectorAll<HTMLElement>("[data-task-widget]")) {
        const key = element.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
        if (!key || key === draggingWidget) continue;
        const previous = previousRects.get(key);
        if (!previous) continue;
        for (const animation of element.getAnimations()) animation.cancel();
        const current = element.getBoundingClientRect();
        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
        const animation = element.animate(
          [
            { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: REORDER_ANIMATION_MS,
            easing: "cubic-bezier(.2,.78,.2,1)",
            fill: "both",
          },
        );
        void animation.finished.catch(() => undefined).finally(() => animation.cancel());
      }
    }

    const drag = dragRef.current;
    if (drag?.activated) paintDragPosition(drag);

  }, [draftWidgets, draggingWidget]);

  function paintDragPosition(session: DragSession) {
    session.overlay?.style.setProperty("--task-drag-x", `${session.visualLeft}px`);
    session.overlay?.style.setProperty("--task-drag-y", `${session.visualTop}px`);
  }

  function scheduleDragPosition(session: DragSession) {
    if (session.animationFrame !== null) return;
    const tick = () => {
      session.animationFrame = null;
      if (dragRef.current !== session || !session.activated) return;
      const deltaX = session.targetLeft - session.visualLeft;
      const deltaY = session.targetTop - session.visualTop;
      const settled = Math.abs(deltaX) < .35 && Math.abs(deltaY) < .35;
      if (settled) {
        session.visualLeft = session.targetLeft;
        session.visualTop = session.targetTop;
      } else {
        session.visualLeft += deltaX * .34;
        session.visualTop += deltaY * .34;
      }
      paintDragPosition(session);
      if (!settled) session.animationFrame = window.requestAnimationFrame(tick);
    };
    session.animationFrame = window.requestAnimationFrame(tick);
  }

  function captureWidgetRects(exclude?: TaskDashboardWidgetKey) {
    const positions = new Map<TaskDashboardWidgetKey, DOMRect>();
    for (const element of gridRef.current?.querySelectorAll<HTMLElement>("[data-task-widget]") ?? []) {
      const key = element.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
      if (key && key !== exclude) positions.set(key, element.getBoundingClientRect());
    }
    return positions;
  }

  function enterEditing() {
    setDraftWidgets(layout.widgets);
    setEditing(true);
    setMessage("");
    navigator.vibrate?.(18);
  }

  function activateDrag(session: DragSession) {
    try {
      session.target.setPointerCapture?.(session.pointerId);
    } catch {
      dragRef.current = null;
      setPressedWidget(null);
      return;
    }
    if (!editing) enterEditing();
    const overlay = session.target.cloneNode(true) as HTMLElement;
    overlay.classList.remove("is-long-pressing", "is-dragging");
    overlay.classList.add("task-dashboard-drag-overlay");
    overlay.removeAttribute("data-task-widget");
    overlay.setAttribute("aria-hidden", "true");
    overlay.querySelector(".task-dashboard-widget__edit-controls")?.remove();
    for (const element of overlay.querySelectorAll<HTMLElement>("[id]")) element.removeAttribute("id");
    overlay.style.width = `${session.width}px`;
    overlay.style.height = `${session.height}px`;
    document.body.append(overlay);
    session.overlay = overlay;
    session.activated = true;
    paintDragPosition(session);
    setPressedWidget(null);
    setDraggingWidget(session.key);
  }

  function beginDrag(key: TaskDashboardWidgetKey, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if (settlingWidget !== null) return;
    const interactive = (event.target as HTMLElement).closest("button, a, input, select, textarea");
    if (interactive) return;
    const previous = dragRef.current;
    if (previous) {
      window.clearTimeout(previous.timer);
      if (previous.animationFrame !== null) window.cancelAnimationFrame(previous.animationFrame);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const session: DragSession = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      targetLeft: rect.left,
      targetTop: rect.top,
      visualLeft: rect.left,
      visualTop: rect.top,
      animationFrame: null,
      lastSwapAt: 0,
      width: rect.width,
      height: rect.height,
      target: event.currentTarget,
      overlay: null,
      activated: false,
      timer: 0,
    };
    dragRef.current = session;
    setPressedWidget(key);
    if (editing) {
      event.preventDefault();
      activateDrag(session);
      return;
    }
    session.timer = window.setTimeout(() => {
      if (dragRef.current === session) activateDrag(session);
    }, LONG_PRESS_MS);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.activated) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > 12) {
        window.clearTimeout(session.timer);
        dragRef.current = null;
        setPressedWidget(null);
      }
      return;
    }
    event.preventDefault();
    session.targetLeft = event.clientX - session.grabOffsetX;
    session.targetTop = event.clientY - session.grabOffsetY;
    scheduleDragPosition(session);
    const scroll = scrollRef.current;
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      if (event.clientY < rect.top + 72) scroll.scrollBy({ top: -18, behavior: "auto" });
      if (event.clientY > rect.bottom - 72) scroll.scrollBy({ top: 18, behavior: "auto" });
    }
    // The grid places widgets by their leading corner. Using the center makes a
    // wide widget hit the card two columns away and prevents valid placements.
    const placementX = session.targetLeft + Math.min(42, session.width * .12);
    const placementY = session.targetTop + Math.min(36, session.height * .12);
    const candidate = document.elementFromPoint(placementX, placementY)
      ?.closest<HTMLElement>("[data-task-widget]");
    const targetKey = candidate?.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
    if (!candidate || !targetKey || targetKey === session.key || !WIDGET_BY_KEY.has(targetKey)) return;
    const sourceIndex = widgetsRef.current.indexOf(session.key);
    const targetIndex = widgetsRef.current.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const rect = candidate.getBoundingClientRect();
    const overlapY = Math.min(session.targetTop + session.height, rect.bottom) -
      Math.max(session.targetTop, rect.top);
    const sameRow = overlapY > Math.min(session.height, rect.height) * .5;
    const movingForward = targetIndex > sourceIndex;
    if (sameRow) {
      const centerX = rect.left + rect.width / 2;
      if (movingForward ? placementX < centerX : placementX > centerX) return;
    } else {
      const centerY = rect.top + rect.height / 2;
      if (movingForward ? placementY < centerY : placementY > centerY) return;
    }
    const now = performance.now();
    if (now - session.lastSwapAt < REORDER_ANIMATION_MS) return;
    const after = movingForward;
    const next = reorder(widgetsRef.current, session.key, targetKey, after);
    if (next !== widgetsRef.current) {
      previousRectsRef.current = captureWidgetRects(session.key);
      session.lastSwapAt = now;
      widgetsRef.current = next;
      setDraftWidgets(next);
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    window.clearTimeout(session.timer);
    if (session.animationFrame !== null) window.cancelAnimationFrame(session.animationFrame);
    if (session.activated) event.preventDefault();
    if (session.target.hasPointerCapture?.(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
    const overlay = session.overlay;
    const destination = session.target.getBoundingClientRect();
    if (session.activated && overlay) setSettlingWidget(session.key);
    dragRef.current = null;
    setPressedWidget(null);
    setDraggingWidget(null);
    if (!overlay) return;
    const animation = overlay.animate(
      [
        { transform: `translate3d(${session.visualLeft}px, ${session.visualTop}px, 0) scale(1.035) rotate(.35deg)` },
        { transform: `translate3d(${destination.left}px, ${destination.top}px, 0) scale(1) rotate(0deg)` },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.82,.2,1)", fill: "forwards" },
    );
    dropOverlayRef.current = overlay;
    void animation.finished.catch(() => undefined).finally(() => {
      overlay.remove();
      if (dropOverlayRef.current === overlay) {
        dropOverlayRef.current = null;
        setSettlingWidget(null);
      }
    });
  }

  function moveBy(key: TaskDashboardWidgetKey, amount: -1 | 1) {
    const index = widgetsRef.current.indexOf(key);
    const target = index + amount;
    if (index < 0 || target < 0 || target >= widgetsRef.current.length) return;
    const next = [...widgetsRef.current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    widgetsRef.current = next;
    setDraftWidgets(next);
  }

  function removeWidget(key: TaskDashboardWidgetKey) {
    if (WIDGET_BY_KEY.get(key)?.required) return;
    const next = widgetsRef.current.filter((widget) => widget !== key);
    widgetsRef.current = next;
    setDraftWidgets(next);
  }

  function addWidget(key: TaskDashboardWidgetKey) {
    if (widgetsRef.current.includes(key)) return;
    const next = [...widgetsRef.current, key];
    widgetsRef.current = next;
    setDraftWidgets(next);
  }

  function cancelEditing() {
    setDraftWidgets(layout.widgets);
    setEditing(false);
    setLibraryOpen(false);
    setMessage("");
  }

  async function saveEditing() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await onSave({ version: 1, widgets: draftWidgets });
      setEditing(false);
      setLibraryOpen(false);
      setMessage("桌面布置已保存");
      window.setTimeout(() => setMessage(""), 2_000);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "桌面暂时无法保存");
    } finally {
      setSaving(false);
    }
  }

  const availableWidgets = TASK_DASHBOARD_WIDGETS.filter(
    (widget) => !draftWidgets.includes(widget.key),
  );

  return (
    <div className={`task-dashboard-shell${editing ? " is-editing" : ""}`}>
      <div className="task-dashboard-topbar">
        <div>
          <strong>今天的探险</strong>
          {editing && <span>拖动组件，布置自己的任务桌面</span>}
        </div>
        {editing ? (
          <div className="task-dashboard-topbar__actions">
            <button type="button" onClick={() => setLibraryOpen(true)}>添加组件</button>
            <button type="button" onClick={cancelEditing}>取消</button>
            <button className="task-dashboard-save" type="button" disabled={saving} onClick={() => void saveEditing()}>
              {saving ? "保存中" : "完成"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="task-dashboard-scroll" ref={scrollRef}>
        <div className="task-dashboard-grid" ref={gridRef}>
          {draftWidgets.map((key, index) => {
            const definition = WIDGET_BY_KEY.get(key)!;
            return (
              <section
                className={[
                  "task-dashboard-widget",
                  `task-dashboard-widget--${definition.size}`,
                  `task-dashboard-widget--${definition.tone}`,
                  pressedWidget === key ? "is-long-pressing" : "",
                  draggingWidget === key ? "is-dragging" : "",
                  settlingWidget === key ? "is-drop-placeholder" : "",
                ].filter(Boolean).join(" ")}
                data-task-widget={key}
                aria-label={definition.label}
                key={key}
                onPointerDown={(event) => beginDrag(key, event)}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onContextMenu={(event) => event.preventDefault()}
              >
                {editing && (
                  <div className="task-dashboard-widget__edit-controls">
                    <span aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                    <div>
                      <button type="button" disabled={index === 0} aria-label={`${definition.label}向前移动`} onClick={() => moveBy(key, -1)}>↑</button>
                      <button type="button" disabled={index === draftWidgets.length - 1} aria-label={`${definition.label}向后移动`} onClick={() => moveBy(key, 1)}>↓</button>
                      {!definition.required && <button className="task-dashboard-widget__remove" type="button" aria-label={`删除${definition.label}`} onClick={() => removeWidget(key)}>×</button>}
                    </div>
                  </div>
                )}
                <div className="task-dashboard-widget__content">
                  {renderWidget(key)}
                </div>
              </section>
            );
          })}
          {editing && availableWidgets.length > 0 && (
            <button className="task-dashboard-add-tile" type="button" onClick={() => setLibraryOpen(true)}>
              <span aria-hidden="true">+</span><strong>添加组件</strong>
            </button>
          )}
        </div>
      </div>

      {message && <div className="task-dashboard-message" role="status">{message}</div>}

      {libraryOpen && (
        <div className="task-widget-library-backdrop" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setLibraryOpen(false);
        }}>
          <section className="task-widget-library" role="dialog" aria-modal="true" aria-labelledby="task-widget-library-title">
            <header>
              <div><small>任务桌面</small><h2 id="task-widget-library-title">添加组件</h2></div>
              <button type="button" aria-label="关闭组件库" onClick={() => setLibraryOpen(false)}>×</button>
            </header>
            {availableWidgets.length > 0 ? (
              <div className="task-widget-library__grid">
                {availableWidgets.map((widget) => (
                  <button className={`task-widget-library__item task-widget-library__item--${widget.tone}`} type="button" key={widget.key} onClick={() => addWidget(widget.key)}>
                    <span className="task-widget-library__preview" aria-hidden="true"><i /><i /><i /></span>
                    <span><strong>{widget.label}</strong><small>{widget.description}</small></span>
                    <b aria-hidden="true">+</b>
                  </button>
                ))}
              </div>
            ) : (
              <p className="task-widget-library__empty">所有组件都已经放到桌面上了</p>
            )}
            <button className="task-widget-library__done" type="button" onClick={() => setLibraryOpen(false)}>返回桌面</button>
          </section>
        </div>
      )}
    </div>
  );
}
