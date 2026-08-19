import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import {
  CalendarOutlined,
  DownOutlined,
  HolderOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { TaskTemplate } from "./api";
import { taskCalendarDays, WORK_WEEKDAYS } from "./task-week-schedule";

const WEEKDAYS = WORK_WEEKDAYS.map((value) => ({
  value,
  label: `周${"一二三四五"[value - 1]}`,
}));

type CalendarOccurrence = {
  id: string;
  day: number;
  template: TaskTemplate;
};

type CalendarCategoryGroup = {
  key: string;
  label: string;
  color: string;
  occurrences: CalendarOccurrence[];
};

const CATEGORY_META: Record<string, { label: string; color: string; order: number }> = {
  CHINESE: { label: "语文", color: "#df6672", order: 10 },
  MATH: { label: "数学", color: "#7771d3", order: 20 },
  ENGLISH: { label: "英语", color: "#38aabd", order: 30 },
  HOMEWORK: { label: "家庭作业", color: "#ef7c48", order: 40 },
  EXERCISE: { label: "运动", color: "#e36f6b", order: 50 },
  CHORES: { label: "生活习惯", color: "#d9a32f", order: 60 },
  OTHER: { label: "综合任务", color: "#8293a8", order: 70 },
};

function categoryMeta(template: TaskTemplate) {
  if (template.customCategory) {
    return {
      key: `custom:${template.customCategory.id}`,
      label: template.customCategory.name,
      color: template.customCategory.color,
      order: 100,
    };
  }
  const meta = CATEGORY_META[template.category] ?? {
    label: "其他",
    color: "#8293a8",
    order: 90,
  };
  return { key: `built-in:${template.category}`, ...meta };
}

function groupOccurrences(occurrences: CalendarOccurrence[]): CalendarCategoryGroup[] {
  const groups = new Map<string, CalendarCategoryGroup & { order: number }>();
  for (const occurrence of occurrences) {
    const meta = categoryMeta(occurrence.template);
    const group = groups.get(meta.key) ?? { ...meta, occurrences: [] };
    group.occurrences.push(occurrence);
    groups.set(meta.key, group);
  }
  return [...groups.values()]
    .sort((first, second) => first.order - second.order || first.label.localeCompare(second.label, "zh-CN"))
    .map(({ order: _order, ...group }) => group);
}

function CalendarTask({ occurrence }: { occurrence: CalendarOccurrence }) {
  const draggable = !occurrence.template.systemManaged && occurrence.template.scheduleKind !== "ONE_TIME";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: occurrence.id,
    data: occurrence,
    disabled: !draggable,
  });
  return (
    <article
      ref={setNodeRef}
      className={`task-week-card${isDragging ? " task-week-card--dragging" : ""}${!draggable ? " task-week-card--locked" : ""}`}
      style={{
        borderLeftColor: categoryMeta(occurrence.template).color,
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
    >
      <div>
        <strong>{occurrence.template.title}</strong>
        <small>+{occurrence.template.baseStars} 星 · {occurrence.template.isEnabled ? "启用" : "停用"}</small>
      </div>
      {draggable ? <HolderOutlined aria-hidden="true" /> : <span className="task-week-card__system">自动</span>}
    </article>
  );
}

function CalendarDay({
  day,
  occurrences,
  collapsedGroups,
  onToggleGroup,
}: {
  day: (typeof WEEKDAYS)[number];
  occurrences: CalendarOccurrence[];
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${day.value}`, data: { day: day.value } });
  const groups = useMemo(() => groupOccurrences(occurrences), [occurrences]);
  return (
    <section ref={setNodeRef} className={`task-week-day${isOver ? " task-week-day--over" : ""}`}>
      <header><span>{day.label}</span><small>{occurrences.length} 项</small></header>
      <div className="task-week-day__list">
        {groups.map((group) => {
          const collapseKey = `${day.value}:${group.key}`;
          const collapsed = collapsedGroups.has(collapseKey);
          return (
            <section className="task-week-category" key={group.key}>
              <button
                type="button"
                className="task-week-category__toggle"
                aria-expanded={!collapsed}
                onClick={() => onToggleGroup(collapseKey)}
              >
                <span className="task-week-category__dot" style={{ backgroundColor: group.color }} />
                <strong>{group.label}</strong>
                <small>{group.occurrences.length}</small>
                {collapsed ? <RightOutlined /> : <DownOutlined />}
              </button>
              {!collapsed ? (
                <div className="task-week-category__tasks">
                  {group.occurrences.map((occurrence) => <CalendarTask key={occurrence.id} occurrence={occurrence} />)}
                </div>
              ) : null}
            </section>
          );
        })}
        {!occurrences.length ? <div className="task-week-day__empty">拖到这里安排</div> : null}
      </div>
    </section>
  );
}

export function TaskWeekCalendar({
  templates,
  onMove,
}: {
  templates: TaskTemplate[];
  onMove: (template: TaskTemplate, sourceDay: number, targetDay: number) => Promise<void>;
}) {
  const [active, setActive] = useState<CalendarOccurrence | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
  );
  const occurrences = useMemo(() => templates.flatMap((template) =>
    taskCalendarDays(template).map((day) => ({ id: `${template.id}:${day}`, day, template }))), [templates]);
  const groupKeys = useMemo(() => WEEKDAYS.flatMap((day) =>
    groupOccurrences(occurrences.filter((item) => item.day === day.value))
      .map((group) => `${day.value}:${group.key}`)), [occurrences]);
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((key) => collapsedGroups.has(key));

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function start(event: DragStartEvent) {
    setActive(event.active.data.current as CalendarOccurrence);
  }

  async function end(event: DragEndEvent) {
    const occurrence = event.active.data.current as CalendarOccurrence | undefined;
    const targetDay = Number(String(event.over?.id ?? "").replace("day:", ""));
    setActive(null);
    if (!occurrence || !Number.isInteger(targetDay) || targetDay === occurrence.day) return;
    setSaving(true);
    try {
      await onMove(occurrence.template, occurrence.day, targetDay);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`task-week-calendar${saving ? " task-week-calendar--saving" : ""}`}>
      <header className="task-week-calendar__header">
        <div className="task-week-calendar__title"><CalendarOutlined /><span><strong>工作日任务周历</strong><small>按分类查看任务；长按任务后可拖到其他日期</small></span></div>
        <div className="task-week-calendar__actions">
          {saving ? <span>正在保存安排…</span> : null}
          {groupKeys.length ? (
            <button type="button" onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(groupKeys))}>
              {allCollapsed ? <DownOutlined /> : <RightOutlined />}
              {allCollapsed ? "全部展开" : "全部收起"}
            </button>
          ) : null}
        </div>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={start} onDragCancel={() => setActive(null)} onDragEnd={(event) => void end(event)}>
        <div className="task-week-calendar__grid">
          {WEEKDAYS.map((day) => (
            <CalendarDay
              key={day.value}
              day={day}
              occurrences={occurrences.filter((item) => item.day === day.value)}
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? <div className="task-week-card task-week-card--overlay"><strong>{active.template.title}</strong><small>放到目标日期</small></div> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
