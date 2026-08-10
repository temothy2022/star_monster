import {
  useEffect,
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
  { key: "MASCOT", label: "星宠伙伴", description: "让星宠陪你完成今天的挑战", size: "wide", tone: "pink" },
  { key: "TODAY_PLAN", label: "今日计划", description: "待完成、已完成和预计时间", size: "medium", tone: "blue" },
  { key: "STREAK", label: "连续记录", description: "记录坚持完成任务的天数", size: "small", tone: "orange" },
  { key: "GOAL_BONUS", label: "目标奖励", description: "展示达标后可以获得的奖励", size: "small", tone: "purple" },
  { key: "QUICK_LINKS", label: "快捷入口", description: "快速前往星宠、星愿和足迹", size: "medium", tone: "teal" },
];

const WIDGET_BY_KEY = new Map(TASK_DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]));

type DragSession = {
  key: TaskDashboardWidgetKey;
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLElement;
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const widgetsRef = useRef(draftWidgets);

  useEffect(() => {
    widgetsRef.current = draftWidgets;
  }, [draftWidgets]);

  useEffect(() => {
    if (!editing) setDraftWidgets(layout.widgets);
  }, [editing, layout]);

  useEffect(() => () => {
    const drag = dragRef.current;
    if (drag) window.clearTimeout(drag.timer);
  }, []);

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
    session.activated = true;
    setPressedWidget(null);
    setDraggingWidget(session.key);
  }

  function beginDrag(key: TaskDashboardWidgetKey, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const interactive = (event.target as HTMLElement).closest("button, a, input, select, textarea");
    if (interactive) return;
    const previous = dragRef.current;
    if (previous) window.clearTimeout(previous.timer);
    const session: DragSession = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
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
    const scroll = scrollRef.current;
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      if (event.clientY < rect.top + 72) scroll.scrollBy({ top: -18, behavior: "auto" });
      if (event.clientY > rect.bottom - 72) scroll.scrollBy({ top: 18, behavior: "auto" });
    }
    const previousPointerEvents = session.target.style.pointerEvents;
    session.target.style.pointerEvents = "none";
    const candidate = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-task-widget]");
    session.target.style.pointerEvents = previousPointerEvents;
    const targetKey = candidate?.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
    if (!candidate || !targetKey || targetKey === session.key || !WIDGET_BY_KEY.has(targetKey)) return;
    const rect = candidate.getBoundingClientRect();
    const sameRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
    const after = sameRow
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    const next = reorder(widgetsRef.current, session.key, targetKey, after);
    if (next !== widgetsRef.current) {
      widgetsRef.current = next;
      setDraftWidgets(next);
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    window.clearTimeout(session.timer);
    if (session.activated) event.preventDefault();
    if (session.target.hasPointerCapture?.(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
    dragRef.current = null;
    setPressedWidget(null);
    setDraggingWidget(null);
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
          <span>{editing ? "拖动组件，布置自己的任务桌面" : "长按组件可以调整桌面"}</span>
        </div>
        {editing ? (
          <div className="task-dashboard-topbar__actions">
            <button type="button" onClick={() => setLibraryOpen(true)}>添加组件</button>
            <button type="button" onClick={cancelEditing}>取消</button>
            <button className="task-dashboard-save" type="button" disabled={saving} onClick={() => void saveEditing()}>
              {saving ? "保存中" : "完成"}
            </button>
          </div>
        ) : (
          <button className="task-dashboard-edit" type="button" onClick={enterEditing} aria-label="编辑任务桌面">
            <i aria-hidden="true" /><span>编辑桌面</span>
          </button>
        )}
      </div>

      <div className="task-dashboard-scroll" ref={scrollRef}>
        <div className="task-dashboard-grid">
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
                ].filter(Boolean).join(" ")}
                data-task-widget={key}
                key={key}
                onPointerDown={(event) => beginDrag(key, event)}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
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
