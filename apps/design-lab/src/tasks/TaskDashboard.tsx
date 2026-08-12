import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  TaskDashboardLayout,
  TaskDashboardWidgetKey,
} from "../api/child-api";
import postcardStack from "@star-monsters/assets/images/task-dashboard/postcard-stack.webp";
import spaceTimer from "@star-monsters/assets/images/task-dashboard/space-timer.webp";

const LONG_PRESS_MS = 520;
const REORDER_ANIMATION_MS = 340;

export const TASK_DASHBOARD_WIDGETS: ReadonlyArray<{
  key: TaskDashboardWidgetKey;
  label: string;
  description: string;
  size: "large" | "wide" | "medium" | "small";
  tone: string;
  defaultRows: number;
  minRows: number;
  maxRows: number;
}> = [
  { key: "TASKS", label: "我的任务", description: "查看并开始今天的任务", size: "large", tone: "navy", defaultRows: 35, minRows: 27, maxRows: 60 },
  { key: "DAILY_PROGRESS", label: "今日进度", description: "看看今天离目标还有多远", size: "medium", tone: "green", defaultRows: 15, minRows: 12, maxRows: 26 },
  { key: "CLOCK", label: "现在时间", description: "查看当前的时针、分针和秒针", size: "small", tone: "clock", defaultRows: 12, minRows: 10, maxRows: 22 },
  { key: "CATEGORY_PROGRESS", label: "分类进度", description: "看看今天各类任务完成得怎么样", size: "medium", tone: "teal", defaultRows: 15, minRows: 12, maxRows: 24 },
  { key: "BALANCE", label: "星星余额", description: "随时查看可以使用的星星", size: "small", tone: "yellow", defaultRows: 12, minRows: 9, maxRows: 22 },
  { key: "MASCOT", label: "星宠伙伴", description: "听听星宠今天想对你说的话", size: "medium", tone: "pink", defaultRows: 15, minRows: 13, maxRows: 26 },
  { key: "TODAY_PLAN", label: "今日计划", description: "待完成、已完成和预计时间", size: "medium", tone: "blue", defaultRows: 15, minRows: 12, maxRows: 24 },
  { key: "STREAK", label: "连续记录", description: "记录坚持完成任务的天数", size: "small", tone: "orange", defaultRows: 12, minRows: 9, maxRows: 22 },
  { key: "GOAL_BONUS", label: "目标奖励", description: "展示达标后可以获得的奖励", size: "small", tone: "purple", defaultRows: 12, minRows: 9, maxRows: 22 },
  { key: "LEADERBOARD", label: "今日排名", description: "查看前三名和自己的今日排名", size: "medium", tone: "indigo", defaultRows: 15, minRows: 13, maxRows: 24 },
  { key: "NOTIFICATIONS", label: "通知", description: "查看新明信片和升级红包", size: "small", tone: "notice", defaultRows: 9, minRows: 8, maxRows: 18 },
  { key: "HANZI_REVIEW", label: "复习汉字", description: "滑动查看最近要复习的汉字", size: "small", tone: "hanzi", defaultRows: 12, minRows: 11, maxRows: 20 },
  { key: "POEM_REVIEW", label: "复习古诗", description: "每天听一首需要复习的古诗", size: "medium", tone: "poem", defaultRows: 15, minRows: 12, maxRows: 24 },
  { key: "POSTCARDS", label: "旅行明信片", description: "滚动看看星宠带回来的旅行收藏", size: "wide", tone: "postcard", defaultRows: 16, minRows: 13, maxRows: 26 },
  { key: "COUNTDOWN_TIMER", label: "倒计时钟", description: "设置最长 60 分钟的可视化提醒", size: "small", tone: "timer", defaultRows: 16, minRows: 12, maxRows: 22 },
];

const WIDGET_BY_KEY = new Map(TASK_DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]));
const GENERATED_WIDGET_PREVIEWS: Partial<Record<TaskDashboardWidgetKey, string>> = {
  POSTCARDS: postcardStack,
  COUNTDOWN_TIMER: spaceTimer,
};

function widgetColumnSpan(key: TaskDashboardWidgetKey) {
  const size = WIDGET_BY_KEY.get(key)?.size;
  return size === "large" || size === "wide" ? 8 : 4;
}

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
  lastSwapX: number | null;
  lastSwapY: number | null;
  width: number;
  height: number;
  target: HTMLElement;
  overlay: HTMLElement | null;
  activated: boolean;
  timer: number;
};

type ResizeSession = {
  key: TaskDashboardWidgetKey;
  pointerId: number;
  startY: number;
  startRows: number;
  rowStep: number;
};

function rowsFromLayout(layout: TaskDashboardLayout) {
  const rows = { ...(layout.rows ?? {}) };
  if (rows.TASKS === undefined && layout.taskRows !== undefined) rows.TASKS = layout.taskRows;
  return rows;
}

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

function hasSameOrder(
  first: TaskDashboardWidgetKey[],
  second: TaskDashboardWidgetKey[],
) {
  return first.length === second.length && first.every((key, index) => key === second[index]);
}

function distanceToRange(value: number, start: number, end: number) {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
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
  const [draftColumns, setDraftColumns] = useState<Partial<Record<TaskDashboardWidgetKey, number>>>(layout.columns ?? {});
  const [draftRows, setDraftRows] = useState<Partial<Record<TaskDashboardWidgetKey, number>>>(() => rowsFromLayout(layout));
  const [clockEnabled, setClockEnabled] = useState(layout.clockEnabled !== false);
  const [categoryProgressEnabled, setCategoryProgressEnabled] = useState(layout.categoryProgressEnabled !== false);
  const [pressedWidget, setPressedWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const [settlingWidget, setSettlingWidget] = useState<TaskDashboardWidgetKey | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const dropOverlayRef = useRef<HTMLElement | null>(null);
  const dropCleanupTimerRef = useRef<number | null>(null);
  const widgetsRef = useRef(draftWidgets);
  const columnsRef = useRef(draftColumns);
  const previousRectsRef = useRef<Map<TaskDashboardWidgetKey, DOMRect> | null>(null);

  useEffect(() => {
    widgetsRef.current = draftWidgets;
  }, [draftWidgets]);

  useEffect(() => {
    columnsRef.current = draftColumns;
  }, [draftColumns]);

  useEffect(() => {
    if (!editing) {
      setDraftWidgets(layout.widgets);
      setDraftColumns(layout.columns ?? {});
      setDraftRows(rowsFromLayout(layout));
      setClockEnabled(layout.clockEnabled !== false);
      setCategoryProgressEnabled(layout.categoryProgressEnabled !== false);
    }
  }, [editing, layout]);

  useEffect(() => {
    // A drag preview lives under document.body. Clean up anything left behind by
    // an interrupted Safari touch gesture before this dashboard starts.
    removeDetachedDragOverlays();

    const finishFromWindow = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      finishDragSession(session, true);
    };
    const cancelFromWindow = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      finishDragSession(session, false);
    };
    const cancelActiveGesture = () => finishDragSession(dragRef.current, false);
    const cancelWhenHidden = () => {
      if (document.visibilityState === "hidden") cancelActiveGesture();
    };

    window.addEventListener("pointerup", finishFromWindow);
    window.addEventListener("pointercancel", cancelFromWindow, true);
    window.addEventListener("blur", cancelActiveGesture);
    window.addEventListener("pagehide", cancelActiveGesture);
    document.addEventListener("lostpointercapture", cancelFromWindow, true);
    document.addEventListener("visibilitychange", cancelWhenHidden);

    return () => {
      window.removeEventListener("pointerup", finishFromWindow);
      window.removeEventListener("pointercancel", cancelFromWindow, true);
      window.removeEventListener("blur", cancelActiveGesture);
      window.removeEventListener("pagehide", cancelActiveGesture);
      document.removeEventListener("lostpointercapture", cancelFromWindow, true);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      clearAllDragArtifacts();
    };
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

  }, [draftWidgets, draftRows, draggingWidget]);

  function paintDragPosition(session: DragSession) {
    session.overlay?.style.setProperty("--task-drag-x", `${session.visualLeft}px`);
    session.overlay?.style.setProperty("--task-drag-y", `${session.visualTop}px`);
  }

  function removeDetachedDragOverlays() {
    for (const overlay of document.querySelectorAll<HTMLElement>(".task-dashboard-drag-overlay")) {
      for (const animation of overlay.getAnimations()) animation.cancel();
      overlay.remove();
    }
  }

  function clearDropCleanupTimer() {
    if (dropCleanupTimerRef.current === null) return;
    window.clearTimeout(dropCleanupTimerRef.current);
    dropCleanupTimerRef.current = null;
  }

  function removeSettlingOverlay(updateState = true) {
    clearDropCleanupTimer();
    const overlay = dropOverlayRef.current;
    dropOverlayRef.current = null;
    if (overlay) {
      for (const animation of overlay.getAnimations()) animation.cancel();
      overlay.remove();
    }
    if (updateState) setSettlingWidget(null);
  }

  function clearAllDragArtifacts() {
    const session = dragRef.current;
    dragRef.current = null;
    if (session) {
      window.clearTimeout(session.timer);
      if (session.animationFrame !== null) window.cancelAnimationFrame(session.animationFrame);
      try {
        if (session.target.hasPointerCapture?.(session.pointerId)) {
          session.target.releasePointerCapture(session.pointerId);
        }
      } catch {
        // The element may already be detached while navigating to another page.
      }
      session.overlay?.remove();
    }
    removeSettlingOverlay(false);
    removeDetachedDragOverlays();
  }

  function finishDragSession(session: DragSession | null, animateDrop: boolean) {
    if (!session || dragRef.current !== session) return;

    // Clear the ref before releasing capture. Safari can synchronously emit
    // lostpointercapture, which must not finish the same drag twice.
    dragRef.current = null;
    window.clearTimeout(session.timer);
    if (session.animationFrame !== null) window.cancelAnimationFrame(session.animationFrame);
    session.animationFrame = null;
    try {
      if (session.target.hasPointerCapture?.(session.pointerId)) {
        session.target.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Pointer capture may already have been cancelled by iPadOS.
    }

    setPressedWidget(null);
    setDraggingWidget(null);
    const overlay = session.overlay;
    if (!overlay) return;

    if (!animateDrop || !session.target.isConnected) {
      overlay.remove();
      setSettlingWidget(null);
      return;
    }

    removeSettlingOverlay(false);
    setSettlingWidget(session.key);
    dropOverlayRef.current = overlay;
    const removeOverlay = () => {
      if (dropOverlayRef.current !== overlay) {
        overlay.remove();
        return;
      }
      clearDropCleanupTimer();
      dropOverlayRef.current = null;
      overlay.remove();
      setSettlingWidget(null);
    };

    try {
      const destination = session.target.getBoundingClientRect();
      const animation = overlay.animate(
        [
          { transform: `translate3d(${session.visualLeft}px, ${session.visualTop}px, 0) scale(1.035) rotate(.35deg)` },
          { transform: `translate3d(${destination.left}px, ${destination.top}px, 0) scale(1) rotate(0deg)` },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.82,.2,1)", fill: "forwards" },
      );
      animation.onfinish = removeOverlay;
      animation.oncancel = removeOverlay;
      // WebKit has occasionally left Animation.finished pending after a touch
      // interruption. The timer guarantees the body-level clone is removed.
      dropCleanupTimerRef.current = window.setTimeout(removeOverlay, 420);
    } catch {
      removeOverlay();
    }
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

  function captureWidgetColumns() {
    const grid = gridRef.current;
    if (!grid || window.innerWidth <= 900) return { ...columnsRef.current };
    const gridRect = grid.getBoundingClientRect();
    const styles = window.getComputedStyle(grid);
    const gap = Number.parseFloat(styles.columnGap) || 16;
    const trackWidth = (gridRect.width - gap * 2) / 3;
    const step = trackWidth + gap;
    const columns: Partial<Record<TaskDashboardWidgetKey, number>> = {};
    for (const element of grid.querySelectorAll<HTMLElement>("[data-task-widget]")) {
      const key = element.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
      if (!key) continue;
      const rect = element.getBoundingClientRect();
      const maxLane = widgetColumnSpan(key) === 8 ? 1 : 2;
      const lane = Math.max(0, Math.min(maxLane, Math.round((rect.left - gridRect.left) / step)));
      columns[key] = lane * 4;
    }
    return columns;
  }

  function enterEditing() {
    setDraftWidgets(layout.widgets);
    setDraftRows(rowsFromLayout(layout));
    const columns = { ...captureWidgetColumns(), ...(layout.columns ?? {}) };
    columnsRef.current = columns;
    setDraftColumns(columns);
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
    removeSettlingOverlay();
    removeDetachedDragOverlays();
    const overlay = session.target.cloneNode(true) as HTMLElement;
    overlay.classList.remove("is-long-pressing", "is-dragging");
    overlay.classList.add("task-dashboard-drag-overlay");
    overlay.removeAttribute("data-task-widget");
    overlay.setAttribute("aria-hidden", "true");
    overlay.querySelector(".task-dashboard-widget__edit-controls")?.remove();
    overlay.querySelector(".task-dashboard-widget__resize-handle")?.remove();
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
    if (previous) finishDragSession(previous, false);
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
      lastSwapX: null,
      lastSwapY: null,
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
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    if (
      placementX < gridRect.left || placementX > gridRect.right ||
      placementY < gridRect.top || placementY > gridRect.bottom
    ) return;

    const supportsColumnPlacement = window.innerWidth > 900;
    let targetColumn = columnsRef.current[session.key] ?? 0;
    if (supportsColumnPlacement) {
      const gridStyles = window.getComputedStyle(grid);
      const gridGap = Number.parseFloat(gridStyles.columnGap) || 16;
      const trackWidth = (gridRect.width - gridGap * 2) / 3;
      const columnStep = trackWidth + gridGap;
      const maxLane = widgetColumnSpan(session.key) === 8 ? 1 : 2;
      const targetLane = Math.max(
        0,
        Math.min(maxLane, Math.round((session.targetLeft - gridRect.left) / columnStep)),
      );
      targetColumn = targetLane * 4;
      if (columnsRef.current[session.key] !== targetColumn) {
        previousRectsRef.current = captureWidgetRects(session.key);
        const columns = { ...columnsRef.current, [session.key]: targetColumn };
        columnsRef.current = columns;
        setDraftColumns(columns);
      }
    }

    const elements = Array.from(grid.querySelectorAll<HTMLElement>("[data-task-widget]"));
    const directCandidate = document.elementFromPoint(placementX, placementY)
      ?.closest<HTMLElement>("[data-task-widget]");
    if (directCandidate?.dataset.taskWidget === session.key) return;
    const occupiesTargetColumn = (element: HTMLElement) => {
      const key = element.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
      if (!key) return false;
      const column = columnsRef.current[key];
      if (!supportsColumnPlacement || column === undefined) return true;
      const width = widgetColumnSpan(key);
      return column <= targetColumn && column + width > targetColumn;
    };
    let candidate = directCandidate && grid.contains(directCandidate) &&
      directCandidate.dataset.taskWidget !== session.key && occupiesTargetColumn(directCandidate)
      ? directCandidate
      : null;

    // Empty grid cells are valid destinations too. Prefer a widget occupying
    // the same visual row, then use the nearest edge as the insertion anchor.
    if (!candidate) {
      const candidates = elements
        .filter((element) => (
          element.dataset.taskWidget !== session.key && occupiesTargetColumn(element)
        ))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }));
      const sameRowCandidates = candidates.filter(({ rect }) => (
        placementY >= rect.top && placementY <= rect.bottom
      ));
      const pool = sameRowCandidates.length > 0 ? sameRowCandidates : candidates;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const item of pool) {
        const horizontalDistance = distanceToRange(placementX, item.rect.left, item.rect.right);
        const verticalDistance = distanceToRange(placementY, item.rect.top, item.rect.bottom);
        const distance = sameRowCandidates.length > 0
          ? horizontalDistance + Math.abs(placementY - (item.rect.top + item.rect.height / 2)) * .08
          : Math.hypot(horizontalDistance, verticalDistance);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          candidate = item.element;
        }
      }
    }

    const targetKey = candidate?.dataset.taskWidget as TaskDashboardWidgetKey | undefined;
    if (!candidate || !targetKey || !WIDGET_BY_KEY.has(targetKey)) return;
    const sourceIndex = widgetsRef.current.indexOf(session.key);
    const targetIndex = widgetsRef.current.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const rect = candidate.getBoundingClientRect();
    const overlapY = Math.min(session.targetTop + session.height, rect.bottom) -
      Math.max(session.targetTop, rect.top);
    const sameRow = overlapY > Math.min(session.height, rect.height) * .5;
    let after: boolean;
    if (sameRow) {
      const centerX = rect.left + rect.width / 2;
      after = placementX >= centerX;
    } else {
      const centerY = rect.top + rect.height / 2;
      after = placementY >= centerY;
    }
    const now = performance.now();
    if (now - session.lastSwapAt < REORDER_ANIMATION_MS) return;
    if (
      session.lastSwapX !== null && session.lastSwapY !== null &&
      Math.hypot(event.clientX - session.lastSwapX, event.clientY - session.lastSwapY) < 14
    ) return;
    const next = reorder(widgetsRef.current, session.key, targetKey, after);
    if (!hasSameOrder(next, widgetsRef.current)) {
      previousRectsRef.current = captureWidgetRects(session.key);
      session.lastSwapAt = now;
      session.lastSwapX = event.clientX;
      session.lastSwapY = event.clientY;
      widgetsRef.current = next;
      setDraftWidgets(next);
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.activated) event.preventDefault();
    finishDragSession(session, true);
  }

  function beginWidgetResize(key: TaskDashboardWidgetKey, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const widget = event.currentTarget.closest<HTMLElement>(`[data-task-widget='${key}']`);
    const grid = gridRef.current;
    if (!widget || !grid) return;
    const styles = window.getComputedStyle(grid);
    const rowHeight = Number.parseFloat(styles.gridAutoRows) || 1;
    const rowGap = Number.parseFloat(styles.rowGap) || 16;
    const definition = WIDGET_BY_KEY.get(key)!;
    const measuredRows = Math.round(
      (widget.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap),
    );
    const startRows = draftRows[key] ?? (measuredRows || definition.defaultRows);
    resizeRef.current = {
      key,
      pointerId: event.pointerId,
      startY: event.clientY,
      startRows,
      rowStep: rowHeight + rowGap,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeWidget(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const definition = WIDGET_BY_KEY.get(session.key)!;
    const nextRows = Math.max(
      definition.minRows,
      Math.min(definition.maxRows, session.startRows + Math.round((event.clientY - session.startY) / session.rowStep)),
    );
    if (nextRows === draftRows[session.key]) return;
    previousRectsRef.current = captureWidgetRects(session.key);
    setDraftRows((current) => ({ ...current, [session.key]: nextRows }));
  }

  function finishWidgetResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function removeWidget(key: TaskDashboardWidgetKey) {
    if (widgetsRef.current.length <= 1) {
      setMessage("首页至少需要保留一个组件");
      return;
    }
    const next = widgetsRef.current.filter((widget) => widget !== key);
    const columns = { ...columnsRef.current };
    const rows = { ...draftRows };
    delete columns[key];
    delete rows[key];
    columnsRef.current = columns;
    setDraftColumns(columns);
    setDraftRows(rows);
    widgetsRef.current = next;
    setDraftWidgets(next);
    if (key === "CLOCK") setClockEnabled(false);
    if (key === "CATEGORY_PROGRESS") setCategoryProgressEnabled(false);
  }

  function addWidget(key: TaskDashboardWidgetKey) {
    if (widgetsRef.current.includes(key)) return;
    const next = [...widgetsRef.current, key];
    const candidateLanes = widgetColumnSpan(key) === 8 ? [0, 1] : [0, 1, 2];
    const laneCounts = candidateLanes.map((lane) => Object.values(columnsRef.current)
      .filter((column) => column === lane * 4).length);
    const lane = candidateLanes[laneCounts.indexOf(Math.min(...laneCounts))] ?? 0;
    const columns = { ...columnsRef.current, [key]: lane * 4 };
    columnsRef.current = columns;
    setDraftColumns(columns);
    widgetsRef.current = next;
    setDraftWidgets(next);
    if (key === "CLOCK") setClockEnabled(true);
    if (key === "CATEGORY_PROGRESS") setCategoryProgressEnabled(true);
  }

  function cancelEditing() {
    setDraftWidgets(layout.widgets);
    setDraftColumns(layout.columns ?? {});
    setDraftRows(rowsFromLayout(layout));
    setClockEnabled(layout.clockEnabled !== false);
    setCategoryProgressEnabled(layout.categoryProgressEnabled !== false);
    setEditing(false);
    setLibraryOpen(false);
    setMessage("");
  }

  async function saveEditing() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await onSave({
        version: 1,
        widgets: draftWidgets,
        columns: draftColumns,
        rows: Object.fromEntries(Object.entries(draftRows).filter(([key]) => (
          draftWidgets.includes(key as TaskDashboardWidgetKey)
        ))) as Partial<Record<TaskDashboardWidgetKey, number>>,
        clockEnabled,
        categoryProgressEnabled,
      });
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
      <div className="task-dashboard-scroll" ref={scrollRef}>
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
        <div className="task-dashboard-grid" ref={gridRef}>
          {draftWidgets.map((key) => {
            const definition = WIDGET_BY_KEY.get(key)!;
            const column = draftColumns[key];
            const rows = draftRows[key] ?? definition.defaultRows;
            const density = rows <= definition.minRows + 1
              ? "compact"
              : rows >= definition.defaultRows + 3
                ? "expanded"
                : "regular";
            const widgetStyle = {
              ...(column === undefined ? {} : { "--task-widget-column": column + 1 }),
              "--task-widget-rows": rows,
            } as CSSProperties;
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
                data-widget-key={key}
                data-widget-density={density}
                data-task-column={column === undefined ? undefined : column}
                data-widget-rows={rows}
                style={Object.keys(widgetStyle).length > 0 ? widgetStyle : undefined}
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
                      <button
                        className="task-dashboard-widget__remove"
                        type="button"
                        aria-label={`删除${definition.label}`}
                        disabled={draftWidgets.length <= 1}
                        onClick={() => removeWidget(key)}
                      >×</button>
                    </div>
                  </div>
                )}
                <div className="task-dashboard-widget__content">
                  {renderWidget(key)}
                </div>
                {editing && (
                  <button
                    className="task-dashboard-widget__resize-handle"
                    type="button"
                    aria-label={`调整${definition.label}高度`}
                    title="上下拖动调整高度"
                    onPointerDown={(event) => beginWidgetResize(key, event)}
                    onPointerMove={resizeWidget}
                    onPointerUp={finishWidgetResize}
                    onPointerCancel={finishWidgetResize}
                  ><i /><i /><i /></button>
                )}
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
                    <span className="task-widget-library__preview" aria-hidden="true">
                      {GENERATED_WIDGET_PREVIEWS[widget.key]
                        ? <img src={GENERATED_WIDGET_PREVIEWS[widget.key]} alt="" />
                        : <><i /><i /><i /></>}
                    </span>
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
