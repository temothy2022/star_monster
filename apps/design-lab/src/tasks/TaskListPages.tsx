import { useEffect, useMemo, useState } from "react";
import balanceStar from "../assets/task-list/semantic/balance-star.png";
import streakFlame from "../assets/task-list/semantic/streak-flame.png";
import pendingIcon from "../assets/task-list/semantic/section-pending.png";
import completeIcon from "../assets/task-list/semantic/section-complete.png";
import bookIcon from "../assets/task-list/semantic/task-book.png";
import trainingIcon from "../assets/task-list/semantic/task-training.png";
import mathIcon from "../assets/task-list/semantic/task-math.png";
import returnIcon from "../assets/task-list/semantic/task-return.png";
import clockIcon from "../assets/task-list/semantic/meta-clock.png";
import rewardStar from "../assets/task-list/semantic/meta-star.png";
import startArrow from "../assets/task-list/semantic/task-start-arrow-figma.svg";
import completedStamp from "../assets/task-list/semantic/completed-stamp.png";
import emptyRocket from "../assets/task-list/semantic/empty-rocket.png";
import addPlus from "../assets/task-list/semantic/add-plus.png";
import launchBase from "../assets/task-list/semantic/launch-base.png";
import completeStar from "../assets/task-list/semantic/complete-star.png";
import compassIcon from "../assets/task-list/semantic/compass.png";
import { useMascot } from "../mascots";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import {
  ApiError,
  getTodayTasks,
  type DailyTask,
  type TaskAttempt,
  type TodayTaskExperience,
} from "../api/child-api";

export type TaskView = "partial" | "complete" | "empty";
type TaskIconName = "book" | "training" | "math" | "return";

type TaskItem = {
  id: string;
  title: string;
  duration: number;
  reward: number;
  icon: TaskIconName;
  accent: "blue" | "coral" | "gray";
  status: "pending" | "completed";
  mode: "UNTIMED" | "TIMED";
};

const TASK_ICONS: Record<TaskIconName, string> = {
  book: bookIcon,
  training: trainingIcon,
  math: mathIcon,
  return: returnIcon,
};

function DailyProgress({ earned, total }: { earned: number; total: number }) {
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, total === 0 ? 0 : earned / total));

  return (
    <div className="daily-progress" role="img" aria-label={`今日进度 ${earned}/${total}`}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="daily-progress__track" cx="80" cy="80" r={radius} />
        {ratio > 0 && (
          <circle
            className="daily-progress__value"
            cx="80"
            cy="80"
            r={radius}
            strokeDasharray={`${circumference * ratio} ${circumference}`}
          />
        )}
      </svg>
      <span className="daily-progress__label">{earned}/{total}</span>
    </div>
  );
}

function ProgressColumn({
  earned,
  goal,
  balance,
}: {
  earned: number;
  goal: number;
  balance: number;
}) {
  const { mascot } = useMascot();

  return (
    <aside className="task-progress-column">
      <section className="task-progress-card" aria-labelledby="daily-progress-title">
        <div className="task-progress-card__decoration" />
        <h2 id="daily-progress-title">今日一共赚了</h2>
        <p>加油！争取将今天所有的收集完成哦！</p>
        <DailyProgress earned={earned} total={goal} />
        <div className="task-balance">
          <div className="task-balance__value"><img src={balanceStar} alt="星星" /><strong>{balance}</strong></div>
          <span>当前余额</span>
        </div>
      </section>
      <section className="task-mascot-area" aria-label={`${mascot.name}的鼓励`}>
        <div className="task-mascot-area__glow" />
        <div className="task-speech-bubble"><span>今天装状态不错呢～</span><span>快加油完成任务吧！</span></div>
        <img className="task-mascot-area__image" src={mascot.images.neutral} alt={`星宠${mascot.name}`} />
      </section>
    </aside>
  );
}

function PendingTaskCard({
  task,
  starting,
  onStart,
}: {
  task: TaskItem;
  starting: boolean;
  onStart?: (task: TaskItem) => void;
}) {
  return (
    <article className={`task-card task-card--pending task-card--${task.accent}`}>
      <span className="task-card__accent" aria-hidden="true" />
      <div className="task-card__icon-box"><img src={TASK_ICONS[task.icon]} alt="" /></div>
      <div className="task-card__content">
        <h4>{task.title}</h4>
        <div className="task-card__meta">
          <span><img src={clockIcon} alt="" />{task.duration} mins</span>
          <span><img src={rewardStar} alt="" />+{task.reward}</span>
        </div>
      </div>
      <button
        className="task-start-button"
        type="button"
        aria-label={`开始 ${task.title}`}
        disabled={starting}
        onClick={() => onStart?.(task)}
      >
        <span>{starting ? "..." : "Start"}</span><img src={startArrow} alt="" />
      </button>
    </article>
  );
}

function CompletedTaskCard({ task }: { task: TaskItem }) {
  return (
    <article className="task-card task-card--completed">
      <div className="task-card__icon-box"><img src={TASK_ICONS[task.icon]} alt="" /></div>
      <div className="task-card__content">
        <h4>{task.title}</h4>
        <div className="task-reward-pill"><img src={rewardStar} alt="星星" /><span>+ {task.reward}</span></div>
      </div>
      <img className="task-card__stamp" src={completedStamp} alt="已完成" />
    </article>
  );
}

function TaskListPanel({
  tasks,
  streakDays,
  startingTaskId,
  onStart,
}: {
  tasks: TaskItem[];
  streakDays: number;
  startingTaskId: string | null;
  onStart?: (task: TaskItem) => void;
}) {
  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const completedTasks = tasks.filter((task) => task.status === "completed");

  return (
    <section className="task-list-panel" aria-labelledby="my-tasks-title">
      <header className="task-list-panel__header">
        <h2 id="my-tasks-title">我的任务</h2>
        {streakDays > 2 && (
          <div className="task-streak">
            <img src={streakFlame} alt="" />
            <span>连续 {streakDays} 天</span>
          </div>
        )}
      </header>
      <div className="task-list-panel__scroll">
        <section className="task-section" aria-labelledby="pending-title">
          <h3 id="pending-title"><img src={pendingIcon} alt="" />待完成任务</h3>
          <div className="task-section__cards">
            {pendingTasks.map((task) => (
              <PendingTaskCard
                key={task.id}
                task={task}
                starting={startingTaskId === task.id}
                onStart={onStart}
              />
            ))}
          </div>
        </section>
        {completedTasks.length > 0 && (
          <>
            <div className="task-section-divider" />
            <section className="task-section task-section--completed" aria-labelledby="completed-title">
              <h3 id="completed-title"><img src={completeIcon} alt="" />已完成</h3>
              <div className="task-section__cards">
                {completedTasks.map((task) => <CompletedTaskCard key={task.id} task={task} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  );
}

function EmptyTaskPanel() {
  return (
    <section className="task-empty-panel" aria-labelledby="empty-title">
      <img className="task-empty-panel__rocket" src={emptyRocket} alt="" />
      <div className="task-empty-panel__content">
        <h2 id="empty-title">今天还没有任务哦</h2>
        <p>休息一下，或者去看看星愿瓶里有什么惊喜吧！</p>
        <button className="task-add-button" type="button"><img src={addPlus} alt="" /><span>家长添加任务</span></button>
      </div>
    </section>
  );
}

function CompleteTaskPanel({ earned }: { earned: number }) {
  return (
    <main className="task-complete-main">
      <section className="task-complete-card" aria-labelledby="complete-title">
        <span className="task-complete-card__shape task-complete-card__shape--top" />
        <span className="task-complete-card__shape task-complete-card__shape--bottom" />
        <img className="task-complete-card__base" src={launchBase} alt="星球基地" />
        <h2 id="complete-title">今天都完成啦！</h2>
        <p>今天你一共赚取了 <strong>{earned}</strong><img src={completeStar} alt="星星" /></p>
        <button type="button"><span>去看航图</span><img src={compassIcon} alt="" /></button>
      </section>
    </main>
  );
}

function iconForTask(task: DailyTask): TaskIconName {
  if (task.categorySnapshot === "MATH") return "math";
  if (task.categorySnapshot === "EXERCISE" || task.categorySnapshot === "PE")
    return "training";
  if (
    task.categorySnapshot === "CHORES" ||
    task.categorySnapshot === "ORGANIZING"
  )
    return "return";
  return "book";
}

function taskItemFromApi(task: DailyTask): TaskItem {
  const seconds =
    task.modeSnapshot === "TIMED"
      ? task.timeLimitSecondsSnapshot
      : task.suggestedSecondsSnapshot;
  const completedAttempt = task.attempts?.[0];
  return {
    id: task.id,
    title: task.titleSnapshot,
    duration: Math.max(1, Math.round((seconds ?? 60) / 60)),
    reward: completedAttempt
      ? completedAttempt.baseStarsAwarded + completedAttempt.bonusStarsAwarded
      : task.baseStarsSnapshot,
    icon: iconForTask(task),
    accent:
      task.categorySnapshot === "EXERCISE" || task.categorySnapshot === "PE"
        ? "coral"
        : task.categorySnapshot === "MATH"
          ? "gray"
          : "blue",
    status: task.status === "COMPLETED" ? "completed" : "pending",
    mode: task.modeSnapshot,
  };
}

export function TaskExperience({
  view,
  onStartAttempt,
  onNavigate,
}: {
  view: TaskView;
  onStartAttempt?: (attempt: TaskAttempt) => void;
  onNavigate?: (route: "wishes-requested" | "footprints") => void;
}) {
  const [experience, setExperience] = useState<TodayTaskExperience | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApiError("");
    void getTodayTasks()
      .then((result) => {
        if (!cancelled) {
          setExperience(result);
          if (result.active) onStartAttempt?.(result.active);
        }
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!cancelled) {
          setApiError(reason instanceof Error ? reason.message : "任务暂时无法读取");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, onStartAttempt]);

  const tasks = useMemo(
    () => experience?.tasks.map(taskItemFromApi) ?? [],
    [experience],
  );
  const effectiveView: TaskView = tasks.length === 0
    ? "empty"
    : tasks.every((task) => task.status === "completed")
      ? "complete"
      : "partial";

  async function start(task: TaskItem) {
    if (!onStartAttempt) return;
    setStartingTaskId(task.id);
    try {
      const { startDailyTask } = await import("../api/child-api");
      const result = await startDailyTask(task.id);
      onStartAttempt(result.attempt);
    } catch (reason) {
      setApiError(reason instanceof Error ? reason.message : "任务暂时无法开始");
    } finally {
      setStartingTaskId(null);
    }
  }

  if (loading || !experience) {
    return (
      <div className="task-page task-page--loading">
        <ChildDataState
          error={!loading && Boolean(apiError)}
          message={loading ? "正在读取今天的任务…" : apiError || "任务暂时无法读取"}
        />
        <ChildBottomNav active="tasks" onNavigate={onNavigate as ((route: ChildRoute) => void) | undefined} />
      </div>
    );
  }

  return (
    <div className={`task-page task-page--${effectiveView}`}>
      {apiError && (
        <button
          className="task-api-error"
          type="button"
          role="alert"
          onClick={() => setApiError("")}
        >
          {apiError} · 点击关闭
        </button>
      )}
      {effectiveView === "complete" ? (
        <CompleteTaskPanel earned={experience.earnedToday} />
      ) : (
        <main className="task-main">
          <ProgressColumn
            earned={experience.earnedToday}
            goal={experience.dailyStarGoal}
            balance={experience.starBalance}
          />
          {effectiveView === "empty" ? (
            <EmptyTaskPanel />
          ) : (
            <TaskListPanel
              tasks={tasks}
              streakDays={experience.streakDays}
              startingTaskId={startingTaskId}
              onStart={start}
            />
          )}
        </main>
      )}
      <ChildBottomNav active="tasks" onNavigate={onNavigate as ((route: ChildRoute) => void) | undefined} />
    </div>
  );
}
