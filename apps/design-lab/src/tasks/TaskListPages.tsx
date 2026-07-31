import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import completedStamp from "../assets/task-list/semantic/completed-stamp.webp";
import emptyRocket from "../assets/task-list/semantic/empty-rocket.webp";
import addPlus from "../assets/task-list/semantic/add-plus.png";
import launchBase from "../assets/task-list/semantic/launch-base.webp";
import completeStar from "../assets/task-list/semantic/complete-star.png";
import compassIcon from "../assets/task-list/semantic/compass.png";
import { useMascot } from "../mascots";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import {
  ApiError,
  getChildPlanets,
  getTodayTasks,
  markChildPlanetNotified,
  type ChildPlanet,
  type DailyTask,
  type TaskAttempt,
  type TodayTaskExperience,
} from "../api/child-api";
import { PlanetUnlockModal } from "../planets/PlanetUnlockModal";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  reportChildAppStartupReady,
  reportChildPageReady,
} from "../api/performance-telemetry";

export type TaskView = "partial" | "complete" | "empty";
type TaskIconName = "book" | "training" | "math" | "return";
type TaskItem = {
  id: string;
  title: string;
  duration: number;
  reward: number;
  icon: TaskIconName;
  accentColor: string;
  status: "pending" | "completed";
  mode: "UNTIMED" | "TIMED";
  repeatableDaily: boolean;
  repeatCompletionCount: number;
};

const TASK_ICONS: Record<TaskIconName, string> = {
  book: bookIcon,
  training: trainingIcon,
  math: mathIcon,
  return: returnIcon,
};

// Keep the left rail meaningful at a glance.  This is deliberately based on
// the persisted task category rather than its icon or timed/untimed state, so
// the same task always has the same visual cue everywhere it is shown.
const TASK_ACCENT_COLORS: Record<DailyTask["categorySnapshot"], string> = {
  READING: "#D65A72",
  MATH: "#7F83D4",
  EXERCISE: "#F36F6A",
  CHORES: "#E9A23B",
  ORGANIZING: "#E9A23B",
  MUSIC: "#9CA3AF",
  CHINESE: "#D65A72",
  ENGLISH: "#45B7C6",
  PE: "#F36F6A",
  OTHER: "#9CA3AF",
};

function MascotSpeech({ lines }: { lines: [string, string] }) {
  return (
    <div
      className="task-speech-bubble"
      aria-label={lines.join("，")}
      aria-live="polite"
    >
      {lines.map((line, lineIndex) => {
        const delayOffset = lineIndex === 0 ? 0 : Array.from(lines[0]).length + 2;
        return (
          <span className="task-speech-bubble__line" aria-hidden="true" key={line}>
            {Array.from(line).map((character, characterIndex) => (
              <span
                className="task-speech-bubble__character"
                key={`${character}-${characterIndex}`}
                style={{
                  animationDelay: `${(delayOffset + characterIndex) * 55}ms`,
                }}
              >
                {character === " " ? "\u00a0" : character}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

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
  tasks,
  streakDays,
}: {
  earned: number;
  goal: number;
  balance: number;
  tasks: TaskItem[];
  streakDays: number;
}) {
  const { mascot } = useMascot();
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const repeatedCompletionCount = tasks.reduce(
    (sum, task) => sum + task.repeatCompletionCount,
    0,
  );
  const pendingCount = tasks.length - completedCount;
  const encouragement: [string, string] =
    tasks.length === 0
      ? ["今天没有任务哦～", "去星愿看看惊喜吧！"]
      : pendingCount === 0
        ? ["今天的任务都完成啦！", "你真的太棒了！"]
        : goal > 0 && earned >= goal
          ? ["今日星星目标达成！", "剩下的也轻松完成～"]
            : completedCount + repeatedCompletionCount > 0 && pendingCount === 1
            ? ["只剩最后一个任务啦！", "再加把劲就完成了～"]
            : completedCount + repeatedCompletionCount > 0
              ? [`今天已经完成 ${completedCount + repeatedCompletionCount} 次！`, "继续保持这个节奏吧～"]
              : streakDays > 2
                ? [`已经连续 ${streakDays} 天啦！`, "今天也一起加油吧～"]
                : ["今天的探险开始啦～", "选一个任务出发吧！"];

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
        <div className="task-mascot-figure">
          <MascotSpeech
            key={encouragement.join("|")}
            lines={encouragement}
          />
          <img className="task-mascot-area__image" src={mascot.images.neutral} alt={`星宠${mascot.name}`} />
        </div>
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
    <article
      className="task-card task-card--pending"
      style={{ "--task-card-accent": task.accentColor } as CSSProperties}
    >
      <span className="task-card__accent" aria-hidden="true" />
      <div className="task-card__icon-box"><img src={TASK_ICONS[task.icon]} alt="" /></div>
      <div className="task-card__content">
        <h4>{task.title}</h4>
        <div className="task-card__meta">
          <span><img src={clockIcon} alt="" />{task.duration} mins</span>
          <span><img src={rewardStar} alt="" />+{task.reward}</span>
          {task.repeatableDaily && (
            <span className="task-repeatable-badge">
              {task.repeatCompletionCount > 0
                ? `今日 ${task.repeatCompletionCount} 次`
                : "可重复"}
            </span>
          )}
        </div>
      </div>
      <button
        className="task-start-button"
        type="button"
        aria-label={`开始 ${task.title}`}
        aria-busy={starting}
        disabled={starting}
        onClick={() => onStart?.(task)}
      >
        <span>Start</span><img src={startArrow} alt="" />
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

function accentForTask(task: DailyTask): string {
  return TASK_ACCENT_COLORS[task.categorySnapshot];
}

function taskItemFromApi(task: DailyTask): TaskItem {
  const seconds =
    task.modeSnapshot === "TIMED"
      ? task.timeLimitSecondsSnapshot
      : task.suggestedSecondsSnapshot;
  const completedAttempt = task.attempts?.[0];
  const isCompleted = task.status === "COMPLETED";
  return {
    id: task.id,
    title: task.titleSnapshot,
    duration: Math.max(1, Math.round((seconds ?? 60) / 60)),
    reward: isCompleted && completedAttempt
      ? completedAttempt.baseStarsAwarded + completedAttempt.bonusStarsAwarded
      : task.baseStarsSnapshot,
    icon: iconForTask(task),
    accentColor: accentForTask(task),
    status: isCompleted ? "completed" : "pending",
    mode: task.modeSnapshot,
    repeatableDaily: task.repeatableDailySnapshot,
    repeatCompletionCount: task.repeatableDailySnapshot
      ? (task.completedAttemptCount ?? 0)
      : 0,
  };
}

export function TaskExperience({
  view,
  onStartAttempt,
  onNavigate,
  initialExperience = null,
  onExperienceChange,
}: {
  view: TaskView;
  onStartAttempt?: (attempt: TaskAttempt) => void;
  onNavigate?: (route: ChildRoute) => void;
  initialExperience?: TodayTaskExperience | null;
  onExperienceChange?: (experience: TodayTaskExperience) => void;
}) {
  const [experience, setExperience] = useState<TodayTaskExperience | null>(
    initialExperience,
  );
  const [planetUnlock, setPlanetUnlock] = useState<ChildPlanet | null>(null);
  const [loading, setLoading] = useState(!initialExperience);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [acknowledgingPlanet, setAcknowledgingPlanet] = useState(false);
  const [apiError, setApiError] = useState("");
  const onStartAttemptRef = useRef(onStartAttempt);

  useEffect(() => {
    onStartAttemptRef.current = onStartAttempt;
  }, [onStartAttempt]);

  function updateExperience(nextExperience: TodayTaskExperience) {
    setExperience(nextExperience);
    onExperienceChange?.(nextExperience);
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(!experience);
    setApiError("");
    setPlanetUnlock(null);

    const planetRequest = getChildPlanets(controller.signal);
    void getTodayTasks(controller.signal)
      .then((result) => {
        if (cancelled) return;
        updateExperience(result);
        reportChildAppStartupReady("/api/child/tasks/today");
        if (result.active) onStartAttemptRef.current?.(result.active);
      })
      .catch((reason: unknown) => {
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

    void planetRequest
      .then((planetData) => {
        if (cancelled) return;
        const nextPlanet = planetData.pendingNotifications[0];
        setPlanetUnlock(
          nextPlanet
            ? planetData.planets.find(
                (planet) => planet.planet === nextPlanet,
              ) ?? null
            : null,
        );
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        setApiError("星球点亮提醒暂时无法读取，今天的任务仍可正常使用");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [view]);

  useLiveRefresh(
    async (signal) => {
      try {
        const result = await getTodayTasks(signal);
        updateExperience(result);
        if (result.active) onStartAttemptRef.current?.(result.active);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: Boolean(experience), intervalMs: 10_000 },
  );

  useEffect(() => {
    if (experience) {
      reportChildPageReady("tasks-partial", "/api/child/tasks/today");
    }
  }, [experience]);

  const tasks = useMemo(
    () => experience?.tasks
      .filter((task) => task.status !== "EXPIRED")
      .map(taskItemFromApi) ?? [],
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
      if (
        reason instanceof ApiError &&
        (reason.status === 404 ||
          reason.code === "TASK_ALREADY_COMPLETED" ||
          reason.code === "TASK_NOT_STARTABLE")
      ) {
        updateExperience(await getTodayTasks());
        return;
      }
      setApiError(reason instanceof Error ? reason.message : "任务暂时无法开始");
    } finally {
      setStartingTaskId(null);
    }
  }

  async function acknowledgePlanet(destination: "map" | "tasks") {
    if (!planetUnlock || acknowledgingPlanet) return;
    setAcknowledgingPlanet(true);
    setApiError("");
    try {
      await markChildPlanetNotified(planetUnlock.planet);
      setPlanetUnlock(null);
      if (destination === "map") onNavigate?.("map");
    } catch (reason) {
      setApiError(
        reason instanceof Error ? reason.message : "暂时无法记录星球点亮消息",
      );
    } finally {
      setAcknowledgingPlanet(false);
    }
  }

  if (loading || !experience) {
    return (
      <div className="task-page task-page--loading">
        <ChildDataState
          error={!loading && Boolean(apiError)}
          message={loading ? "正在读取今天的任务…" : apiError || "任务暂时无法读取"}
        />
        <ChildBottomNav active="tasks" onNavigate={onNavigate} />
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
            tasks={tasks}
            streakDays={experience.streakDays}
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
      <ChildBottomNav active="tasks" onNavigate={onNavigate} />
      {planetUnlock && (
        <PlanetUnlockModal
          progress={planetUnlock}
          busy={acknowledgingPlanet}
          onOpenMap={() => void acknowledgePlanet("map")}
          onStay={() => void acknowledgePlanet("tasks")}
        />
      )}
    </div>
  );
}
