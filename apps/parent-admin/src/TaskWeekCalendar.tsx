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
import { CalendarOutlined, HolderOutlined } from "@ant-design/icons";
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
        borderLeftColor: occurrence.template.customCategory?.color ?? "#8293a8",
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
}: {
  day: (typeof WEEKDAYS)[number];
  occurrences: CalendarOccurrence[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${day.value}`, data: { day: day.value } });
  return (
    <section ref={setNodeRef} className={`task-week-day${isOver ? " task-week-day--over" : ""}`}>
      <header><span>{day.label}</span><small>{occurrences.length} 项</small></header>
      <div className="task-week-day__list">
        {occurrences.map((occurrence) => <CalendarTask key={occurrence.id} occurrence={occurrence} />)}
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
  );
  const occurrences = useMemo(() => templates.flatMap((template) =>
    taskCalendarDays(template).map((day) => ({ id: `${template.id}:${day}`, day, template }))), [templates]);

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
        <div><CalendarOutlined /><span><strong>工作日任务周历</strong><small>长按任务后拖到其他日期；需要同时选择多天时请编辑任务</small></span></div>
        {saving ? <span>正在保存安排…</span> : null}
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={start} onDragCancel={() => setActive(null)} onDragEnd={(event) => void end(event)}>
        <div className="task-week-calendar__grid">
          {WEEKDAYS.map((day) => (
            <CalendarDay key={day.value} day={day} occurrences={occurrences.filter((item) => item.day === day.value)} />
          ))}
        </div>
        <DragOverlay>
          {active ? <div className="task-week-card task-week-card--overlay"><strong>{active.template.title}</strong><small>放到目标日期</small></div> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
