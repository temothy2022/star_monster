import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import balanceStar from "@star-monsters/assets/images/task-list/semantic/balance-star.png";
import streakFlame from "@star-monsters/assets/images/task-list/semantic/streak-flame.png";
import bookIcon from "@star-monsters/assets/images/task-list/semantic/task-book.png";
import trainingIcon from "@star-monsters/assets/images/task-list/semantic/task-training.png";
import mathIcon from "@star-monsters/assets/images/task-list/semantic/task-math.png";
import returnIcon from "@star-monsters/assets/images/task-list/semantic/task-return.png";
import clockIcon from "@star-monsters/assets/images/task-list/semantic/meta-clock.png";
import rewardStar from "@star-monsters/assets/images/task-list/semantic/meta-star.png";
import startArrow from "@star-monsters/assets/icons/task-list/semantic/task-start-arrow-figma.svg";
import completedStamp from "@star-monsters/assets/images/task-list/semantic/completed-stamp.webp";
import emptyRocket from "@star-monsters/assets/images/task-list/semantic/empty-rocket.webp";
import addPlus from "@star-monsters/assets/images/task-list/semantic/add-plus.png";
import launchBase from "@star-monsters/assets/images/task-list/semantic/launch-base.webp";
import completeStar from "@star-monsters/assets/images/task-list/semantic/complete-star.png";
import compassIcon from "@star-monsters/assets/images/task-list/semantic/compass.png";
import reviewAudioPlay from "@star-monsters/assets/images/task-dashboard/review-audio-play.webp";
import taskListScrollHandle from "@star-monsters/assets/images/task-dashboard/task-list-scroll-handle.webp";
import { MASCOTS, useMascot } from "../mascots";
import {
  createAudioWithSpeechFallback,
  createHtmlAudioPlayback,
  createSequentialPlayback,
  createSpeechPlayback,
  SinglePendingPlaybackQueue,
  stopManagedHtmlAudio,
} from "../audio/queued-playback";
import { ChildBottomNav, type ChildRoute } from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import {
  ApiError,
  getChildLeaderboards,
  getChildPlanets,
  getPetNotifications,
  getPetPostcards,
  getTaskDashboardReviews,
  getTodayTasks,
  markChildPlanetNotified,
  updateTaskDashboardLayout,
  type ChildPlanet,
  type ChildLeaderboard,
  type ChildLeaderboardEntry,
  type DailyTask,
  type DashboardHanziReview,
  type DashboardPoemReview,
  type MascotAsset,
  type MascotDialogue,
  type PetNotificationSummary,
  type PetTrip,
  type TaskAttempt,
  type TodayTaskExperience,
  type TaskDashboardWidgetKey,
  type TaskDashboardReviewSummary,
} from "../api/child-api";
import { PlanetUnlockModal } from "../planets/PlanetUnlockModal";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import {
  reportChildAppStartupReady,
  reportChildPageReady,
} from "../api/performance-telemetry";
import { TaskDashboard } from "./TaskDashboard";
import { LEADERBOARD_AVATARS } from "../progress/leaderboard-avatars";
import { LEADERBOARD_FLAGS } from "../progress/leaderboard-flags";
import fallbackChallengeAvatar from "@star-monsters/assets/images/challenge-letters/xiaoyue-avatar.webp?no-inline";
import { CountdownTimerWidget, PostcardCarouselWidget } from "./DashboardUtilityWidgets";

export type TaskView = "partial" | "complete" | "empty";
type TaskIconName = "book" | "training" | "math" | "return";
type TaskItem = {
  id: string;
  title: string;
  category: DailyTask["categorySnapshot"];
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

const CHILD_DISCOVERY_FACTS = [
  { tag: "太空为什么", title: "最热的行星是谁？", body: "不是离太阳最近的水星，而是被厚厚大气包住的金星。热量很难逃出去，所以金星更热。", source: "NASA Science" },
  { tag: "太空为什么", title: "天空为什么是蓝色？", body: "阳光里藏着很多颜色。进入空气后，蓝色光更容易被四处散开，所以我们抬头时常看到蓝天。", source: "NASA Space Place" },
  { tag: "月亮为什么", title: "月亮真的会变形吗？", body: "月亮没有变形。太阳总会照亮它的一半，只是我们每天看到的亮面多少不同。", source: "NASA Space Place" },
  { tag: "太阳系", title: "太阳是一颗什么？", body: "太阳不是行星，而是一颗恒星。它的引力把八颗行星和许多小天体留在太阳系里。", source: "NASA Science" },
  { tag: "太阳系", title: "最大的行星有多大？", body: "木星是太阳系最大的行星。假如它是空心的，里面大约能装下一千个地球。", source: "NASA Science" },
  { tag: "地球为什么", title: "云朵是怎么来的？", body: "看不见的水蒸气升到高处变冷，会在微小的灰尘或盐粒旁变成小水滴，很多水滴聚在一起就成了云。", source: "NASA Kids" },
  { tag: "地球为什么", title: "雾和云有什么关系？", body: "雾其实就是贴近地面的云。走进雾里，也可以说是走进了一朵云。", source: "NASA Kids" },
  { tag: "水的秘密", title: "水会变成几种样子？", body: "水能变成液体、固体和气体。河水是液体，冰雪是固体，空气里还藏着看不见的水蒸气。", source: "NASA Kids" },
  { tag: "水的秘密", title: "冰块为什么会浮起来？", body: "冰比同样大小的液态水轻一些，所以冰块会浮在水面上。", source: "USGS Water Science" },
  { tag: "水的秘密", title: "地球上的水会旅行吗？", body: "会。水会蒸发到天空，变成云，再以雨或雪回到地面，然后流进河流和海洋。", source: "NASA Kids" },
  { tag: "动物为什么", title: "火烈鸟为什么是粉色？", body: "火烈鸟吃的藻类和小虾里有天然色素，身体吸收后，羽毛会慢慢变成粉红色。", source: "Smithsonian's National Zoo" },
  { tag: "动物为什么", title: "大象能悄悄聊天吗？", body: "大象会用很低很低的声音交流。有些声音人耳几乎听不到，却能传到很远的同伴那里。", source: "Smithsonian's National Zoo" },
  { tag: "动物为什么", title: "大熊猫只会安静吃竹子吗？", body: "大熊猫也会发出不同声音，它们可能会咩叫、鸣叫、吠叫，用声音和同伴交流。", source: "Smithsonian's National Zoo" },
  { tag: "光的秘密", title: "晚霞为什么会变红？", body: "太阳快落山时，阳光要穿过更多空气。蓝色光被散开得更多，红色和黄色就更容易来到我们眼前。", source: "NASA Space Place" },
  { tag: "冰雪为什么", title: "很厚的冰为什么发蓝？", body: "厚冰会吸收更多红色光，让蓝色光继续穿过并散开，所以冰川深处常会显出蓝色。", source: "USGS Water Science" },
] as const;

function pickDiscoveryFact() {
  const storageKey = "star-monsters-dashboard-fact";
  let previousTitle = "";
  try {
    previousTitle = window.sessionStorage.getItem(storageKey) ?? "";
  } catch {
    // Storage may be unavailable in private browsing; random selection still works.
  }
  const candidates = CHILD_DISCOVERY_FACTS.filter((fact) => fact.title !== previousTitle);
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? CHILD_DISCOVERY_FACTS[0];
  try {
    window.sessionStorage.setItem(storageKey, selected.title);
  } catch {
    // The fact does not need persistence to render.
  }
  return selected;
}

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

function MascotSpeech({ text }: { text: string }) {
  return (
    <div
      className="task-speech-bubble"
      aria-label={text}
      aria-live="polite"
    >
      <span className="task-speech-bubble__line" aria-hidden="true">
        {Array.from(text).map((character, characterIndex) => (
          <span
            className="task-speech-bubble__character"
            key={`${character}-${characterIndex}`}
            style={{ animationDelay: `${characterIndex * 48}ms` }}
          >
            {character === " " ? "\u00a0" : character}
          </span>
        ))}
      </span>
    </div>
  );
}

const FALLBACK_MASCOT_DIALOGUES: Record<
  TodayTaskExperience["mascotContext"],
  string[]
> = {
  START: ["选一个喜欢的任务，我们一起出发吧！", "准备好了吗？今天也会很有趣！"],
  PROGRESS: ["做得真稳，休息一下再继续吧！", "保持自己的节奏，你正在变得更厉害。"],
  COMPLETE: ["今天的探险很精彩，你认真完成了！", "你坚持到了最后，我真为你开心！"],
  EMPTY: ["今天轻松一点，去看看你的星愿吧！", "暂时没有新任务，我们一起放松一下。"],
};

function pickMascotDialogue(
  dialogues: MascotDialogue[],
  currentId?: string | null,
) {
  if (dialogues.length === 0) return null;
  const choices = currentId == null || dialogues.length === 1
    ? dialogues
    : dialogues.filter((dialogue) => dialogue.id !== currentId);
  return choices[Math.floor(Math.random() * choices.length)] ?? dialogues[0] ?? null;
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

function TaskMascotWidget({
  mascotContext,
  dialogues,
  mascotAssets,
  petWidget,
  dashboard = false,
}: {
  mascotContext: TodayTaskExperience["mascotContext"];
  dialogues: MascotDialogue[];
  mascotAssets: MascotAsset[];
  petWidget?: TodayTaskExperience["petWidget"];
  dashboard?: boolean;
}) {
  const { mascot } = useMascot();
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const candidates = useMemo(() => dialogues, [dialogues]);
  const uploadedMascotImages = useMemo(
    () => new Map(
      mascotAssets
        .filter((asset) => asset.petType === mascot.type)
        .map((asset) => [asset.slot, asset.mediaUrl]),
    ),
    [mascot.type, mascotAssets],
  );
  const idleMascotImage = useMemo(
    () => Math.random() < .42
      ? uploadedMascotImages.get("SLEEPING") ?? mascot.activityImages.sleeping
      : uploadedMascotImages.get("NEUTRAL") ?? mascot.images.neutral,
    [mascot.activityImages.sleeping, mascot.images.neutral, uploadedMascotImages],
  );
  const dashboardMascotImage = useMemo(() => {
    if (!petWidget) return idleMascotImage;
    if (petWidget.currentTripStatus === "TRAVELING") {
      return uploadedMascotImages.get("TRAVEL") ?? mascot.activityImages.travel;
    }
    if (petWidget.currentTripStatus === "RETURNED") {
      return uploadedMascotImages.get("CELEBRATE") ?? mascot.images.celebrate;
    }
    if (petWidget.satiety < 30 || petWidget.hydration < 30) {
      return uploadedMascotImages.get("HUNGRY") ?? mascot.activityImages.hungry;
    }
    return petWidget.roomMascotAnimationUrl ?? idleMascotImage;
  }, [idleMascotImage, mascot.activityImages, mascot.images.celebrate, petWidget, uploadedMascotImages]);
  const taskMascotImage = dashboard
    ? dashboardMascotImage
    : uploadedMascotImages.get("TASK_IDLE") ?? mascot.taskImage ?? mascot.images.neutral;
  const [displayedMascotImage, setDisplayedMascotImage] = useState(
    mascot.images.neutral,
  );
  const candidatesRef = useRef<MascotDialogue[]>(candidates);
  const fallbackText = FALLBACK_MASCOT_DIALOGUES[mascotContext][0];
  const [selectedDialogue, setSelectedDialogue] = useState<MascotDialogue | null>(
    () => pickMascotDialogue(candidates),
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const playbackQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  if (!playbackQueueRef.current) {
    playbackQueueRef.current = new SinglePendingPlaybackQueue(setIsSpeaking);
  }

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let idleId: number | null = null;
    const image = new Image();
    setDisplayedMascotImage(mascot.images.neutral);
    if (taskMascotImage === mascot.images.neutral) return;

    const load = () => {
      image.decoding = "async";
      image.onload = () => {
        if (!disposed) setDisplayedMascotImage(taskMascotImage);
      };
      image.src = taskMascotImage;
    };
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      idleId = requestIdle(load, { timeout: 1_500 });
    } else {
      timer = window.setTimeout(load, 350);
    }
    return () => {
      disposed = true;
      image.onload = null;
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [mascot.images.neutral, taskMascotImage]);

  useEffect(() => {
    candidatesRef.current = candidates;
    setSelectedDialogue((current) =>
      candidates.find((dialogue) => dialogue.id === current?.id) ??
      pickMascotDialogue(candidates) ??
      null,
    );
  }, [candidates]);

  useEffect(() => {
    function refreshDialogueOnVisible() {
      if (document.visibilityState !== "visible") return;
      setSelectedDialogue((current) =>
        pickMascotDialogue(candidatesRef.current, current?.id),
      );
    }

    document.addEventListener("visibilitychange", refreshDialogueOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshDialogueOnVisible);
  }, []);

  useEffect(() => () => {
    playbackQueueRef.current?.clear();
  }, []);

  function speak() {
    if (!selectedDialogue?.audioUrl) return;

    const audioUrl = selectedDialogue.audioUrl;
    playbackQueueRef.current?.enqueue(() => {
      const cached = audioCacheRef.current.get(audioUrl);
      const audio = cached ?? new Audio(audioUrl);
      if (!cached) {
        audio.preload = "auto";
        audioCacheRef.current.set(audioUrl, audio);
      }
      return createHtmlAudioPlayback(audio);
    });
  }

  const levelRange = !petWidget || petWidget.nextLevelExperience === null
    ? 1
    : Math.max(1, petWidget.nextLevelExperience - petWidget.currentLevelStart);
  const levelProgress = !petWidget
    ? 0
    : petWidget.nextLevelExperience === null
      ? 100
      : Math.min(100, Math.max(
          0,
          ((petWidget.experience - petWidget.currentLevelStart) / levelRange) * 100,
        ));
  const remainingExperience = petWidget?.nextLevelExperience === null
    ? null
    : Math.max(0, (petWidget?.nextLevelExperience ?? 0) - (petWidget?.experience ?? 0));

  return (
    <section className={`task-mascot-area task-mascot-area--widget${dashboard ? " task-mascot-area--dashboard-widget" : ""}`} aria-label={`${mascot.name}的鼓励`}>
      <div className="task-mascot-area__glow" />
      {dashboard && petWidget && (
        <div className="task-mascot-status" aria-label={`${mascot.name}等级 ${petWidget.level}，成长进度 ${Math.round(levelProgress)}%`}>
          <div>
            <span><b>Lv.{petWidget.level}</b>{mascot.name}的成长</span>
            <strong>{remainingExperience === null ? "最高等级" : `离升级还差 ${remainingExperience} 点`}</strong>
          </div>
          <i><b style={{ width: `${levelProgress}%` }} /></i>
        </div>
      )}
      <button
        className={`task-mascot-figure${isSpeaking ? " task-mascot-figure--speaking" : ""}`}
        type="button"
        aria-label={`点击让${mascot.name}说话`}
        aria-pressed={isSpeaking}
        onClick={speak}
      >
        <MascotSpeech
          key={selectedDialogue?.id ?? `${mascotContext}-fallback`}
          text={selectedDialogue?.text ?? fallbackText}
        />
        <img
          className="task-mascot-area__image"
          src={displayedMascotImage}
          alt={`星宠${mascot.name}`}
          decoding="async"
        />
      </button>
    </section>
  );
}

function ProgressColumn({
  earned,
  goal,
  balance,
  mascotContext,
  dialogues,
  mascotAssets,
}: {
  earned: number;
  goal: number;
  balance: number;
  mascotContext: TodayTaskExperience["mascotContext"];
  dialogues: MascotDialogue[];
  mascotAssets: MascotAsset[];
}) {
  return (
    <aside className="task-progress-column">
      <section className="task-progress-card" aria-labelledby="daily-progress-title">
        <div className="task-progress-card__decoration" />
        <h2 id="daily-progress-title">今日一共赚了</h2>
        <DailyProgress earned={earned} total={goal} />
        <div className="task-balance">
          <div className="task-balance__value">
            <img src={balanceStar} alt="星星" />
            <strong>{balance}</strong>
          </div>
          <span>当前余额</span>
        </div>
      </section>
      <TaskMascotWidget
        mascotContext={mascotContext}
        dialogues={dialogues}
        mascotAssets={mascotAssets}
      />
    </aside>
  );
}

function DailyProgressWidget({ earned, goal }: { earned: number; goal: number }) {
  const remaining = Math.max(0, goal - earned);
  const completedPercent = goal > 0 ? Math.min(100, Math.round((earned / goal) * 100)) : 100;
  return (
    <div className="task-widget-progress">
      <DailyProgress earned={earned} total={goal} />
      <div className="task-widget-progress__copy">
        <div className="task-widget-heading"><small>今日进度</small><strong>{remaining > 0 ? `还差 ${remaining} 颗星` : "目标达成"}</strong></div>
        <div className="task-widget-progress__summary">
          <span><b>{earned}</b> 已收集</span>
          <span><b>{goal}</b> 今日目标</span>
        </div>
        <div className="task-widget-progress__rail" aria-label={`今日目标完成 ${completedPercent}%`}><i style={{ width: `${completedPercent}%` }} /></div>
      </div>
    </div>
  );
}

function BalanceWidget({ balance }: { balance: number }) {
  return (
    <div className="task-widget-balance">
      <span className="task-widget-balance__star" aria-hidden="true">★</span>
      <div className="task-widget-balance__copy">
        <small>我的星星</small><strong>{balance}</strong><span>可用于星愿和星宠</span>
        <div className="task-widget-balance__uses" aria-hidden="true"><i>星愿</i><i>照顾星宠</i></div>
      </div>
    </div>
  );
}

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  const hourAngle = hours * 30;
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;
  const pad = (value: number) => String(value).padStart(2, "0");
  const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="task-widget-clock" role="timer" aria-label={`当前时间 ${timeText}`}>
      <div className="task-widget-clock__dial" aria-hidden="true">
        <div className="task-widget-clock__numbers">
          {Array.from({ length: 12 }, (_, index) => {
            const number = index + 1;
            return (
              <span
                key={number}
                style={{ "--clock-angle": `${number * 30}deg` } as CSSProperties}
              >
                <b>{number}</b>
              </span>
            );
          })}
        </div>
        {Array.from({ length: 12 }, (_, index) => (
          <i
            className={`task-widget-clock__tick${index % 3 === 0 ? " task-widget-clock__tick--hour" : ""}`}
            key={index}
            style={{ "--clock-angle": `${index * 30}deg` } as CSSProperties}
          />
        ))}
        <span className="task-widget-clock__hand task-widget-clock__hand--hour" style={{ transform: `translateX(-50%) rotate(${hourAngle}deg)` }} />
        <span className="task-widget-clock__hand task-widget-clock__hand--minute" style={{ transform: `translateX(-50%) rotate(${minuteAngle}deg)` }} />
        <span className="task-widget-clock__hand task-widget-clock__hand--second" style={{ transform: `translateX(-50%) rotate(${secondAngle}deg)` }} />
        <b className="task-widget-clock__pin" />
      </div>
    </div>
  );
}

const TASK_CATEGORY_PROGRESS: Array<{
  key: Exclude<TaskCategoryFilter, "ALL">;
  label: string;
  color: string;
}> = [
  { key: "CHINESE", label: "语文", color: "#d65a72" },
  { key: "MATH", label: "数学", color: "#7f83d4" },
  { key: "ENGLISH", label: "英语", color: "#45b7c6" },
  { key: "EXERCISE", label: "运动", color: "#f36f6a" },
  { key: "LIFE", label: "生活", color: "#e9a23b" },
  { key: "OTHER", label: "综合", color: "#9ca3af" },
];

function CategoryProgressWidget({ tasks }: { tasks: TaskItem[] }) {
  const rows = TASK_CATEGORY_PROGRESS.map((category) => {
    const categoryTasks = tasks.filter((task) => taskCategoryFilterFor(task.category) === category.key);
    return {
      ...category,
      total: categoryTasks.length,
      completed: categoryTasks.filter((task) => task.status === "completed").length,
    };
  }).filter((category) => category.total > 0);

  if (rows.length === 0) {
    return <div className="task-widget-category-progress task-widget-category-progress--empty">今天还没有分类任务</div>;
  }

  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  return (
    <div className="task-widget-category-progress">
      <header className="task-widget-category-progress__heading">
        <div><small>今天的安排</small><strong>分类进度</strong></div>
        <span>{completed}/{tasks.length}</span>
      </header>
      <div className="task-widget-category-progress__grid">
        {rows.map((row) => {
          const percent = Math.round((row.completed / row.total) * 100);
          return (
            <div className="task-widget-category-progress__row" key={row.key}>
              <div className="task-widget-category-progress__label"><i style={{ background: row.color }} /><strong>{row.label}</strong><span>{row.completed}/{row.total}</span></div>
              <div className="task-widget-category-progress__rail" aria-label={`${row.label}完成 ${percent}%`}><i style={{ width: `${percent}%`, background: row.color }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodayPlanWidget({ tasks }: { tasks: TaskItem[] }) {
  const pending = tasks.filter((task) => task.status === "pending");
  const completed = tasks.length - pending.length;
  const minutes = pending.reduce((sum, task) => sum + task.duration, 0);
  const completedPercent = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <div className="task-widget-plan">
      <div className="task-widget-heading"><small>今日计划</small><strong>{pending.length > 0 ? "继续探险" : "全部完成"}</strong></div>
      <div className="task-widget-plan__metrics">
        <span><b>{pending.length}</b><small>待完成</small></span>
        <span><b>{completed}</b><small>已完成</small></span>
        <span><b>{minutes}</b><small>预计分钟</small></span>
      </div>
      <div className="task-widget-plan__rail">
        <span><b style={{ width: `${completedPercent}%` }} /></span><small>今天已完成 {completedPercent}%</small>
      </div>
    </div>
  );
}

function StreakWidget({ days }: { days: number }) {
  const filledDays = Math.min(7, days);
  return (
    <div className="task-widget-streak">
      <span className="task-widget-streak__flame" aria-hidden="true"><i /></span>
      <div className="task-widget-streak__copy">
        <small>连续记录</small><strong>{days} <em>天</em></strong><span>{days > 2 ? "坚持让每一天都闪亮" : "从今天开始积累"}</span>
        <div className="task-widget-streak__trail" aria-label={`最近连续 ${filledDays} 天`}>
          {Array.from({ length: 7 }, (_, index) => <i className={index < filledDays ? "is-lit" : ""} key={index} />)}
        </div>
      </div>
    </div>
  );
}

function GoalBonusWidget({
  earned,
  potential,
  goalReached,
  progress,
  goal,
}: {
  earned: number;
  potential: number;
  goalReached: boolean;
  progress: number;
  goal: number;
}) {
  const completedPercent = goal > 0 ? Math.min(100, Math.round((progress / goal) * 100)) : 100;
  return (
    <div className="task-widget-goal-bonus">
      <span className="task-widget-goal-bonus__gift" aria-hidden="true"><i /></span>
      <div className="task-widget-goal-bonus__copy">
        <small>目标奖励</small><strong>{goalReached ? "已经领取" : potential > 0 ? `达标 +${potential}` : "完成目标"}</strong><span>{earned > 0 ? `今天已获得 ${earned} 颗奖励星` : "向今天的目标前进"}</span>
        <div className="task-widget-goal-bonus__rail" aria-label={`目标完成 ${completedPercent}%`}><i style={{ width: `${completedPercent}%` }} /></div>
      </div>
    </div>
  );
}

type ReviewAudioSegment = {
  text: string;
  audioUrl: string | null;
};

function useReviewAudioPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>());
  const queueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new SinglePendingPlaybackQueue(setIsPlaying);
  }

  useEffect(() => () => queueRef.current?.clear(), []);

  function play(segments: ReviewAudioSegment[]) {
    const playable = segments.filter((segment) => segment.text.trim().length > 0);
    if (playable.length === 0) return;
    queueRef.current?.enqueue(() => createSequentialPlayback(
      playable.map((segment) => () => {
        if (!segment.audioUrl) {
          return createSpeechPlayback(segment.text, { rate: 0.76, pitch: 1.04 });
        }
        const cached = audioCacheRef.current.get(segment.audioUrl);
        const audio = cached ?? new Audio(segment.audioUrl);
        if (!cached) {
          audio.preload = "auto";
          audioCacheRef.current.set(segment.audioUrl, audio);
        }
        return createAudioWithSpeechFallback(audio, segment.text, {
          rate: 0.76,
          pitch: 1.04,
        });
      }),
      280,
    ));
  }

  return { isPlaying, play };
}

function HanziReviewWidget({
  reviews,
  loading,
  unavailable,
}: {
  reviews: DashboardHanziReview[];
  loading: boolean;
  unavailable: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    width: number;
  } | null>(null);
  const { isPlaying, play } = useReviewAudioPlayback();

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, reviews.length - 1)));
  }, [reviews.length]);

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (reviews.length < 2 || event.button !== 0) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rawOffset = event.clientX - drag.startX;
    const atStart = index === 0 && rawOffset > 0;
    const atEnd = index === reviews.length - 1 && rawOffset < 0;
    setDragOffset((atStart || atEnd) ? rawOffset * 0.24 : rawOffset);
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) >= Math.max(32, drag.width * 0.18)) {
      setIndex((current) => Math.max(
        0,
        Math.min(reviews.length - 1, current + (distance < 0 ? 1 : -1)),
      ));
    }
    dragRef.current = null;
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (loading) {
    return <div className="task-widget-review-empty"><i /><span>正在整理复习汉字</span></div>;
  }
  if (unavailable) {
    return <div className="task-widget-review-empty"><i /><span>复习汉字暂时无法读取</span></div>;
  }
  if (reviews.length === 0) {
    return <div className="task-widget-review-empty"><i /><span>暂时没有要复习的汉字</span></div>;
  }

  return (
    <div className={`task-widget-hanzi-review${dragRef.current ? " is-swiping" : ""}`}>
      <div
        className="task-widget-hanzi-review__viewport"
        onPointerDown={beginSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        <div
          className="task-widget-hanzi-review__track"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragOffset}px), 0, 0)`,
          }}
        >
          {reviews.map((review) => (
            <section className="task-widget-hanzi-review__slide" key={review.id} aria-hidden={reviews[index]?.id !== review.id}>
              <div className="task-widget-hanzi-review__character">
                <small>复习汉字</small>
                <span className="task-widget-hanzi-review__grid">
                  <strong>{review.character}</strong>
                </span>
              </div>
              <span className="task-widget-hanzi-review__phrase">{review.word ?? ""}</span>
              <button
                className={isPlaying && reviews[index]?.id === review.id ? "is-playing" : ""}
                type="button"
                aria-label={`播放${review.character}${review.word ? `和${review.word}` : ""}的读音`}
                tabIndex={reviews[index]?.id === review.id ? 0 : -1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => play([
                  { text: review.character, audioUrl: review.characterAudioUrl },
                  ...(review.word ? [{ text: review.word, audioUrl: review.wordAudioUrl }] : []),
                ])}
              >
                <img src={reviewAudioPlay} alt="" />
              </button>
            </section>
          ))}
        </div>
      </div>
      {reviews.length > 1 && (
        <div className="task-widget-hanzi-review__dots" aria-label={`第 ${index + 1} 个，共 ${reviews.length} 个`}>
          {reviews.map((review, dotIndex) => <i className={dotIndex === index ? "is-active" : ""} key={review.id} />)}
        </div>
      )}
    </div>
  );
}

function PoemReviewWidget({
  poem,
  loading,
  unavailable,
}: {
  poem: DashboardPoemReview | null;
  loading: boolean;
  unavailable: boolean;
}) {
  const { isPlaying, play } = useReviewAudioPlayback();
  if (loading) {
    return <div className="task-widget-review-empty"><i /><span>正在挑选今日古诗</span></div>;
  }
  if (unavailable) {
    return <div className="task-widget-review-empty"><i /><span>复习古诗暂时无法读取</span></div>;
  }
  if (!poem) {
    return <div className="task-widget-review-empty"><i /><span>暂时没有要复习的古诗</span></div>;
  }
  const readingText = `${poem.title}，${poem.dynasty}，${poem.author}。${poem.content.replace(/\n+/g, "，")}`;
  const preview = poem.content.split(/\n+/).filter(Boolean).slice(0, 2).join("　");
  return (
    <div className="task-widget-poem-review">
      <div className="task-widget-poem-review__copy">
        <small>今日古诗</small>
        <strong>{poem.title}</strong>
        <span>{poem.dynasty} · {poem.author}</span>
        <p>{preview}</p>
      </div>
      <button
        className={isPlaying ? "is-playing" : ""}
        type="button"
        aria-label={`播放古诗${poem.title}`}
        onClick={() => play([{ text: readingText, audioUrl: poem.audioUrl }])}
      >
        <img src={reviewAudioPlay} alt="" />
      </button>
    </div>
  );
}

function CompactLeaderboardRow({ entry }: { entry: ChildLeaderboardEntry }) {
  const avatar = entry.avatarUrl ?? (
    entry.avatarKey
      ? LEADERBOARD_AVATARS[entry.avatarKey]
      : MASCOTS[entry.petType].images.neutral
  );
  return (
    <li className={entry.isSelf ? "is-self" : ""}>
      <span className={`task-widget-leaderboard__rank rank-${entry.rank ?? "more"}`}>
        {entry.rank ?? "..."}
      </span>
      <span className="task-widget-leaderboard__avatar" aria-hidden="true">
        <img src={avatar} alt="" loading={entry.isSelf ? "eager" : "lazy"} decoding="async" />
        <img src={LEADERBOARD_FLAGS[entry.flagKey]} alt="" loading="lazy" />
      </span>
      <strong>{entry.isSelf ? "我" : entry.displayName}</strong>
      <span className="task-widget-leaderboard__stars">
        <b>{entry.stars}</b><img src={rewardStar} alt="星星" />
      </span>
    </li>
  );
}

type CompactLeaderboards = {
  daily: ChildLeaderboard;
  weekly: ChildLeaderboard;
};

function CompactLeaderboardSlide({
  leaderboard,
  period,
}: {
  leaderboard: ChildLeaderboard;
  period: "今日榜" | "本周榜";
}) {
  const topThree = leaderboard.entries
    .filter((entry) => entry.rank !== null && entry.rank <= 3)
    .sort((left, right) => (left.rank ?? 4) - (right.rank ?? 4))
    .slice(0, 3);
  const self = leaderboard.entries.find((entry) => entry.isSelf) ?? null;
  const selfOutsideTopThree = self !== null && (self.rank === null || self.rank > 3);

  return (
    <section className="task-widget-leaderboard__slide">
      <div className="task-widget-leaderboard__heading">
        <small>{period}</small><strong>小朋友排名</strong>
      </div>
      <ol>
        {topThree.map((entry) => (
          <CompactLeaderboardRow entry={entry} key={entry.competitorId ?? "self"} />
        ))}
        {selfOutsideTopThree && (
          <>
            <li className="task-widget-leaderboard__divider" aria-hidden="true"><i /><i /><i /></li>
            <CompactLeaderboardRow entry={self} />
          </>
        )}
      </ol>
    </section>
  );
}

function CompactLeaderboardWidget({ leaderboards }: { leaderboards: CompactLeaderboards | null | undefined }) {
  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{ pointerId: number; startX: number; width: number } | null>(null);

  function beginSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (!leaderboards || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rawOffset = event.clientX - drag.startX;
    const atEdge = (index === 0 && rawOffset > 0) || (index === 1 && rawOffset < 0);
    setDragOffset(atEdge ? rawOffset * .2 : rawOffset);
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) >= Math.max(30, drag.width * .16)) {
      setIndex((current) => Math.max(0, Math.min(1, current + (distance < 0 ? 1 : -1))));
    }
    dragRef.current = null;
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (leaderboards === undefined) {
    return (
      <div className="task-widget-leaderboard task-widget-leaderboard--loading" aria-busy="true">
        <div className="task-widget-leaderboard__heading"><small>今日榜</small><strong>小朋友排名</strong></div>
        <span>正在更新排名…</span>
      </div>
    );
  }
  if (leaderboards === null) {
    return (
      <div className="task-widget-leaderboard task-widget-leaderboard--loading">
        <div className="task-widget-leaderboard__heading"><small>今日榜</small><strong>小朋友排名</strong></div>
        <span>排名暂时无法更新</span>
      </div>
    );
  }

  return (
    <div className={`task-widget-leaderboard${dragRef.current ? " is-swiping" : ""}`}>
      <div
        className="task-widget-leaderboard__viewport"
        onPointerDown={beginSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        <div
          className="task-widget-leaderboard__track"
          style={{ transform: `translate3d(calc(${-index * 100}% + ${dragOffset}px), 0, 0)` }}
        >
          <CompactLeaderboardSlide leaderboard={leaderboards.daily} period="今日榜" />
          <CompactLeaderboardSlide leaderboard={leaderboards.weekly} period="本周榜" />
        </div>
      </div>
      <div className="task-widget-leaderboard__pages" aria-label={index === 0 ? "当前显示今日榜" : "当前显示本周榜"}>
        <i className={index === 0 ? "is-active" : ""} /><i className={index === 1 ? "is-active" : ""} />
      </div>
    </div>
  );
}

function NotificationWidget({
  notifications,
  onNavigate,
}: {
  notifications: PetNotificationSummary | null | undefined;
  onNavigate?: (route: ChildRoute) => void;
}) {
  const [discoveryFact] = useState(pickDiscoveryFact);
  const returnedPostcard = notifications?.returnedPostcard ?? null;
  const redPacketCount = notifications?.redPacketCount ?? 0;
  const challengeLetter = notifications?.challengeLetter ?? null;
  const notificationCount = (returnedPostcard ? 1 : 0) + (redPacketCount > 0 ? 1 : 0) + (challengeLetter ? 1 : 0);
  const openPetHome = () => onNavigate?.("pet-growth");
  const openChallengeLetter = () => {
    try { window.sessionStorage.setItem("star-monsters-open-challenge-letter", challengeLetter?.partnerId ?? ""); } catch { /* navigation still works */ }
    onNavigate?.("footprints");
  };

  return (
    <div className="task-widget-notifications" aria-live="polite">
      <div className="task-widget-notifications__list">
        {notifications === undefined && (
          <div className="task-widget-notifications__empty is-loading"><i /><small>正在查看新消息</small></div>
        )}
        {notifications === null && (
          <div className="task-widget-notifications__empty"><i /><small>稍后再来看看</small></div>
        )}
        {notifications && notificationCount === 0 && (
          <article className="task-widget-discovery">
            <div className="task-widget-discovery__heading">
              <span aria-hidden="true">?</span>
              <div><small>{discoveryFact.tag}</small><strong>{discoveryFact.title}</strong></div>
            </div>
            <p>{discoveryFact.body}</p>
            <small className="task-widget-discovery__source">知识来源 · {discoveryFact.source}</small>
          </article>
        )}
        {returnedPostcard && (
          <button type="button" onClick={openPetHome}>
            <i className="task-widget-notifications__icon is-postcard" aria-hidden="true"><b /></i>
            <span><strong>明信片到了</strong><small>来自{returnedPostcard.destinationName}</small></span>
            <b aria-hidden="true">›</b>
          </button>
        )}
        {redPacketCount > 0 && (
          <button type="button" onClick={openPetHome}>
            <i className="task-widget-notifications__icon is-packet" aria-hidden="true"><b /></i>
            <span><strong>{redPacketCount} 个升级红包</strong><small>去拆开惊喜</small></span>
            <b aria-hidden="true">›</b>
          </button>
        )}
        {challengeLetter && (
          <button type="button" className="task-widget-notifications__challenge" onClick={openChallengeLetter}>
            <span className="task-widget-notifications__avatar">
              <img src={LEADERBOARD_AVATARS[challengeLetter.partnerAvatarKey] ?? fallbackChallengeAvatar} alt="" />
              {challengeLetter.unread && <i aria-label="新来信" />}
            </span>
            <span><strong>{challengeLetter.partnerName} 来信</strong><small>{challengeLetter.preview}</small></span>
            <b aria-hidden="true">›</b>
          </button>
        )}
      </div>
    </div>
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

function TaskListScrollRail({
  targetRef,
}: {
  targetRef: { current: HTMLDivElement | null };
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null);
  const [metrics, setMetrics] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0, trackHeight: 0 });

  useEffect(() => {
    const target = targetRef.current;
    const track = trackRef.current;
    if (!target || !track) return;
    const update = () => setMetrics({
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
      trackHeight: track.clientHeight,
    });
    update();
    target.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(target);
    resizeObserver.observe(track);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(target, { childList: true, subtree: true });
    return () => {
      target.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [targetRef]);

  const railInset = 5;
  const usableTrackHeight = Math.max(0, metrics.trackHeight - railInset * 2);
  const maxScroll = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const thumbHeight = usableTrackHeight > 0 && metrics.scrollHeight > 0
    ? Math.min(usableTrackHeight, Math.max(112, usableTrackHeight * (metrics.clientHeight / metrics.scrollHeight)))
    : 112;
  const thumbTravel = Math.max(0, usableTrackHeight - thumbHeight);
  const thumbTop = maxScroll > 0 ? (metrics.scrollTop / maxScroll) * thumbTravel : 0;

  function scrollFromPointer(clientY: number, grabOffset: number) {
    const target = targetRef.current;
    const track = trackRef.current;
    if (!target || !track || maxScroll <= 0 || thumbTravel <= 0) return;
    const trackRect = track.getBoundingClientRect();
    const nextThumbTop = Math.max(0, Math.min(thumbTravel, clientY - trackRect.top - railInset - grabOffset));
    target.scrollTop = (nextThumbTop / thumbTravel) * maxScroll;
  }

  function beginRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || maxScroll <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const trackRect = event.currentTarget.getBoundingClientRect();
    const hitThumb = (event.target as HTMLElement).closest(".task-list-scroll-rail__thumb");
    const grabOffset = hitThumb
      ? event.clientY - trackRect.top - railInset - thumbTop
      : thumbHeight / 2;
    dragRef.current = { pointerId: event.pointerId, grabOffset };
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollFromPointer(event.clientY, grabOffset);
  }

  function moveRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    scrollFromPointer(event.clientY, drag.grabOffset);
  }

  function finishRailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleRailKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = targetRef.current;
    if (!target || maxScroll <= 0) return;
    const increments: Partial<Record<string, number>> = {
      ArrowUp: -88,
      ArrowDown: 88,
      PageUp: -target.clientHeight * .8,
      PageDown: target.clientHeight * .8,
      Home: -maxScroll,
      End: maxScroll,
    };
    const increment = increments[event.key];
    if (increment === undefined) return;
    event.preventDefault();
    target.scrollBy({ top: increment, behavior: "smooth" });
  }

  return (
    <div
      className={`task-list-scroll-rail${maxScroll > 1 ? " is-scrollable" : ""}`}
      ref={trackRef}
      role="scrollbar"
      aria-label="拖动查看更多任务"
      aria-controls="task-dashboard-scrollable-list"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScroll)}
      aria-valuenow={Math.round(metrics.scrollTop)}
      tabIndex={maxScroll > 1 ? 0 : -1}
      onKeyDown={handleRailKey}
      onPointerDown={beginRailDrag}
      onPointerMove={moveRailDrag}
      onPointerUp={finishRailDrag}
      onPointerCancel={finishRailDrag}
    >
      <span className="task-list-scroll-rail__thumb" style={{ height: thumbHeight, transform: `translateY(${thumbTop}px)` }}>
        <img src={taskListScrollHandle} alt="" draggable={false} />
      </span>
    </div>
  );
}

function TaskListPanel({
  tasks,
  streakDays,
  dashboard = false,
  fullPage = false,
  startingTaskId,
  onStart,
}: {
  tasks: TaskItem[];
  streakDays?: number;
  dashboard?: boolean;
  fullPage?: boolean;
  startingTaskId: string | null;
  onStart?: (task: TaskItem) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<TaskCategoryFilter>("ALL");
  const availableFilters = useMemo(() => {
    const presentFilters = new Set(
      tasks.map((task) => taskCategoryFilterFor(task.category)),
    );
    return [
      "ALL" as const,
      ...TASK_CATEGORY_FILTER_ORDER.filter((filter) => presentFilters.has(filter)),
    ];
  }, [tasks]);
  const filteredTasks = categoryFilter === "ALL"
    ? tasks
    : tasks.filter((task) => taskCategoryFilterFor(task.category) === categoryFilter);
  const pendingTasks = filteredTasks.filter((task) => task.status === "pending");
  const completedTasks = filteredTasks.filter((task) => task.status === "completed");
  const dashboardScrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className={`task-list-panel${fullPage ? " task-list-panel--full" : ""}`} aria-labelledby="my-tasks-title">
      <header className="task-list-panel__header">
        <div className="task-list-panel__heading">
          {fullPage && <small>今天的安排</small>}
          <h2 id="my-tasks-title">我的任务</h2>
        </div>
        {dashboard ? (
          <span className="task-list-panel__count">{pendingTasks.length} 项待完成</span>
        ) : (streakDays ?? 0) > 2 ? (
          <div className="task-streak">
            <img src={streakFlame} alt="" />
            <span>连续 {streakDays} 天</span>
          </div>
        ) : null}
        {fullPage && (
          <div className="task-category-filter" role="tablist" aria-label="任务分类">
            {availableFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={categoryFilter === filter}
                className={categoryFilter === filter ? "is-active" : ""}
                onClick={() => setCategoryFilter(filter)}
              >
                {TASK_CATEGORY_LABELS[filter]}
              </button>
            ))}
          </div>
        )}
      </header>
      <div
        className={`task-list-panel__scroll${dashboard ? " task-list-panel__scroll--rail-controlled" : ""}`}
        id={dashboard ? "task-dashboard-scrollable-list" : undefined}
        ref={dashboard ? dashboardScrollRef : undefined}
      >
        <section className="task-section">
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
          <section className="task-section">
            <div className="task-section__cards">
              {completedTasks.map((task) => <CompletedTaskCard key={task.id} task={task} />)}
            </div>
          </section>
        )}
        {filteredTasks.length === 0 && (
          <div className="task-list-filter-empty">这个分类今天还没有任务</div>
        )}
      </div>
      {dashboard && <TaskListScrollRail targetRef={dashboardScrollRef} />}
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

function CompleteTaskPanel({
  earned,
  onOpenMap,
}: {
  earned: number;
  onOpenMap?: () => void;
}) {
  return (
    <main className="task-complete-main">
      <section className="task-complete-card" aria-labelledby="complete-title">
        <span className="task-complete-card__shape task-complete-card__shape--top" />
        <span className="task-complete-card__shape task-complete-card__shape--bottom" />
        <img className="task-complete-card__base" src={launchBase} alt="星球基地" />
        <h2 id="complete-title">今天都完成啦！</h2>
        <p>
          今天你一共赚取了 <strong>{earned}</strong>
          <img src={completeStar} alt="星星" />
        </p>
        <button type="button" onClick={onOpenMap}>
          <span>去看航图</span>
          <img src={compassIcon} alt="" />
        </button>
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
    category: task.categorySnapshot,
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

type TaskCategoryFilter = "ALL" | "CHINESE" | "MATH" | "ENGLISH" | "EXERCISE" | "LIFE" | "OTHER";

const TASK_CATEGORY_FILTER_ORDER: Exclude<TaskCategoryFilter, "ALL">[] = [
  "CHINESE",
  "MATH",
  "ENGLISH",
  "EXERCISE",
  "LIFE",
  "OTHER",
];

const TASK_CATEGORY_LABELS: Record<TaskCategoryFilter, string> = {
  ALL: "全部",
  CHINESE: "语文",
  MATH: "数学",
  ENGLISH: "英语",
  EXERCISE: "运动",
  LIFE: "生活",
  OTHER: "综合",
};

function taskCategoryFilterFor(category: DailyTask["categorySnapshot"]): Exclude<TaskCategoryFilter, "ALL"> {
  if (category === "CHINESE" || category === "READING") return "CHINESE";
  if (category === "MATH") return "MATH";
  if (category === "ENGLISH") return "ENGLISH";
  if (category === "EXERCISE" || category === "PE") return "EXERCISE";
  if (category === "CHORES" || category === "ORGANIZING") return "LIFE";
  return "OTHER";
}

export function TaskExperience({
  view,
  variant = "legacy",
  navActive = "tasks",
  onStartAttempt,
  onNavigate,
  initialExperience = null,
  onExperienceChange,
}: {
  view: TaskView;
  variant?: "legacy" | "dashboard" | "list";
  navActive?: "home" | "tasks";
  onStartAttempt?: (attempt: TaskAttempt) => void;
  onNavigate?: (route: ChildRoute) => void;
  initialExperience?: TodayTaskExperience | null;
  onExperienceChange?: (experience: TodayTaskExperience) => void;
}) {
  const [experience, setExperience] = useState<TodayTaskExperience | null>(
    initialExperience,
  );
  const experienceRef = useRef<TodayTaskExperience | null>(initialExperience);
  const [planetUnlock, setPlanetUnlock] = useState<ChildPlanet | null>(null);
  const [loading, setLoading] = useState(!initialExperience);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [acknowledgingPlanet, setAcknowledgingPlanet] = useState(false);
  const [apiError, setApiError] = useState("");
  const [dashboardLeaderboards, setDashboardLeaderboards] = useState<CompactLeaderboards | null | undefined>(undefined);
  const [petNotifications, setPetNotifications] = useState<PetNotificationSummary | null | undefined>(undefined);
  const [dashboardPostcards, setDashboardPostcards] = useState<PetTrip[] | null | undefined>(undefined);
  const [dashboardReviews, setDashboardReviews] = useState<TaskDashboardReviewSummary | null | undefined>(undefined);
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia(
    "(max-width: 600px), (pointer: coarse) and (max-height: 600px)",
  ).matches);
  const onStartAttemptRef = useRef(onStartAttempt);
  const dashboardActive = variant === "dashboard" && !phoneLayout;
  const listOnly = variant === "list";

  useEffect(() => {
    onStartAttemptRef.current = onStartAttempt;
  }, [onStartAttempt]);

  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 600px), (pointer: coarse) and (max-height: 600px)",
    );
    const update = () => setPhoneLayout(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function updateExperience(nextExperience: TodayTaskExperience) {
    experienceRef.current = nextExperience;
    setExperience(nextExperience);
    onExperienceChange?.(nextExperience);
  }

  useEffect(() => {
    stopManagedHtmlAudio();
    return () => stopManagedHtmlAudio();
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(!experience);
    setApiError("");
    setPlanetUnlock(null);

    void getTodayTasks(controller.signal)
      .then((result) => {
        if (cancelled) return;
        updateExperience(result);
        reportChildAppStartupReady("/api/child/tasks/today");
        if (result.active) onStartAttemptRef.current?.(result.active);

        const loadPlanetNotification = () => {
          if (cancelled || controller.signal.aborted) return;
          void getChildPlanets(controller.signal)
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
              if (
                !cancelled &&
                reason instanceof ApiError &&
                reason.status === 401
              ) {
                window.location.hash = "login";
              }
            });
        };
        const requestIdle = window.requestIdleCallback?.bind(window);
        if (requestIdle) {
          requestIdle(loadPlanetNotification, { timeout: 1_500 });
        } else {
          window.setTimeout(loadPlanetNotification, 150);
        }
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

  const leaderboardEnabled = dashboardActive && Boolean(
    experience?.taskDashboardLayout.widgets.includes("LEADERBOARD"),
  );

  useEffect(() => {
    if (!leaderboardEnabled) {
      setDashboardLeaderboards(undefined);
      return;
    }
    const controller = new AbortController();
    void getChildLeaderboards(controller.signal)
      .then((result) => setDashboardLeaderboards(result.leaderboards))
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!controller.signal.aborted) setDashboardLeaderboards(null);
      });
    return () => controller.abort();
  }, [leaderboardEnabled]);

  useLiveRefresh(
    async (signal) => {
      try {
        const result = await getChildLeaderboards(signal);
        setDashboardLeaderboards(result.leaderboards);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!signal.aborted) {
          setDashboardLeaderboards((current) => current ?? null);
        }
      }
    },
    { enabled: leaderboardEnabled, intervalMs: 60_000 },
  );

  const notificationsEnabled = dashboardActive && Boolean(
    experience?.taskDashboardLayout.widgets.includes("NOTIFICATIONS"),
  );

  useEffect(() => {
    if (!notificationsEnabled) {
      setPetNotifications(undefined);
      return;
    }
    const controller = new AbortController();
    void getPetNotifications(controller.signal)
      .then(setPetNotifications)
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!controller.signal.aborted) setPetNotifications(null);
      });
    return () => controller.abort();
  }, [notificationsEnabled]);

  useLiveRefresh(
    async (signal) => {
      try {
        setPetNotifications(await getPetNotifications(signal));
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: notificationsEnabled, intervalMs: 30_000 },
  );

  const postcardsEnabled = dashboardActive && Boolean(
    experience?.taskDashboardLayout.widgets.includes("POSTCARDS"),
  );

  useEffect(() => {
    if (!postcardsEnabled) {
      setDashboardPostcards(undefined);
      return;
    }
    const controller = new AbortController();
    void getPetPostcards(controller.signal)
      .then((result) => setDashboardPostcards(result.postcards))
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!controller.signal.aborted) setDashboardPostcards(null);
      });
    return () => controller.abort();
  }, [postcardsEnabled]);

  useLiveRefresh(
    async (signal) => {
      try {
        const result = await getPetPostcards(signal);
        setDashboardPostcards(result.postcards);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: postcardsEnabled, intervalMs: 60_000 },
  );

  const dashboardReviewsEnabled = dashboardActive && Boolean(
    experience?.taskDashboardLayout.widgets.some(
      (widget) => widget === "HANZI_REVIEW" || widget === "POEM_REVIEW",
    ),
  );

  useEffect(() => {
    if (!dashboardReviewsEnabled) {
      setDashboardReviews(undefined);
      return;
    }
    const controller = new AbortController();
    setDashboardReviews(undefined);
    void getTaskDashboardReviews(controller.signal)
      .then(setDashboardReviews)
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
          return;
        }
        if (!controller.signal.aborted) setDashboardReviews(null);
      });
    return () => controller.abort();
  }, [dashboardReviewsEnabled]);

  useLiveRefresh(
    async (signal) => {
      try {
        setDashboardReviews(await getTaskDashboardReviews(signal));
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "login";
        }
      }
    },
    { enabled: dashboardReviewsEnabled, intervalMs: 300_000 },
  );

  useEffect(() => {
    if (experience) {
      reportChildPageReady(
        variant === "dashboard" ? "home" : listOnly ? "tasks" : "tasks-partial",
        "/api/child/tasks/today",
      );
    }
  }, [experience, listOnly, variant]);

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

  async function saveDashboardLayout(layout: TodayTaskExperience["taskDashboardLayout"]) {
    const result = await updateTaskDashboardLayout(layout);
    const currentExperience = experienceRef.current;
    if (!currentExperience) return;
    updateExperience({
      ...currentExperience,
      taskDashboardLayout: result.layout,
    });
  }

  function renderDashboardWidget(key: TaskDashboardWidgetKey) {
    switch (key) {
      case "TASKS":
        return effectiveView === "empty" ? (
          <EmptyTaskPanel />
        ) : (
          <TaskListPanel
            tasks={tasks}
            dashboard
            startingTaskId={startingTaskId}
            onStart={start}
          />
        );
      case "DAILY_PROGRESS":
        return <DailyProgressWidget earned={experience!.earnedToday} goal={experience!.dailyStarGoal} />;
      case "CLOCK":
        return <ClockWidget />;
      case "CATEGORY_PROGRESS":
        return <CategoryProgressWidget tasks={tasks} />;
      case "BALANCE":
        return <BalanceWidget balance={experience!.starBalance} />;
      case "MASCOT":
        return (
          <TaskMascotWidget
            mascotContext={experience!.mascotContext}
            dialogues={experience!.mascotDialogues}
            mascotAssets={experience!.mascotAssets ?? []}
            petWidget={experience!.petWidget}
            dashboard
          />
        );
      case "TODAY_PLAN":
        return <TodayPlanWidget tasks={tasks} />;
      case "STREAK":
        return <StreakWidget days={experience!.streakDays} />;
      case "GOAL_BONUS":
        return (
          <GoalBonusWidget
            earned={experience!.dailyGoalBonusStars}
            potential={experience!.dailyGoalBonusPotential}
            goalReached={experience!.earnedToday >= experience!.dailyStarGoal}
            progress={experience!.earnedToday}
            goal={experience!.dailyStarGoal}
          />
        );
      case "LEADERBOARD":
        return <CompactLeaderboardWidget leaderboards={dashboardLeaderboards} />;
      case "NOTIFICATIONS":
        return <NotificationWidget notifications={petNotifications} onNavigate={onNavigate} />;
      case "HANZI_REVIEW":
        return (
          <HanziReviewWidget
            reviews={dashboardReviews?.hanzi ?? []}
            loading={dashboardReviews === undefined}
            unavailable={dashboardReviews === null}
          />
        );
      case "POEM_REVIEW":
        return (
          <PoemReviewWidget
            poem={dashboardReviews?.poem ?? null}
            loading={dashboardReviews === undefined}
            unavailable={dashboardReviews === null}
          />
        );
      case "POSTCARDS":
        return <PostcardCarouselWidget postcards={dashboardPostcards} onNavigate={onNavigate} />;
      case "COUNTDOWN_TIMER":
        return <CountdownTimerWidget />;
    }
  }

  if (loading || !experience) {
    return (
      <div className="task-page task-page--loading">
        <ChildDataState
          error={!loading && Boolean(apiError)}
          message={loading ? "正在读取今天的任务…" : apiError || "任务暂时无法读取"}
        />
        <ChildBottomNav active={navActive} onNavigate={onNavigate} />
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
      {dashboardActive ? (
        <TaskDashboard
          layout={experience.taskDashboardLayout}
          onSave={saveDashboardLayout}
          renderWidget={renderDashboardWidget}
        />
      ) : effectiveView === "complete" && !listOnly ? (
        <CompleteTaskPanel
          earned={experience.earnedToday}
          onOpenMap={() => onNavigate?.("map")}
        />
      ) : (
        <main className={listOnly ? "task-list-main" : "task-main"}>
          {!listOnly && (
            <ProgressColumn
              earned={experience.earnedToday}
              goal={experience.dailyStarGoal}
              balance={experience.starBalance}
              mascotContext={experience.mascotContext}
              dialogues={experience.mascotDialogues}
              mascotAssets={experience.mascotAssets ?? []}
            />
          )}
          {effectiveView === "empty" && !listOnly ? (
            <EmptyTaskPanel />
          ) : (
            <TaskListPanel
              tasks={tasks}
              streakDays={experience.streakDays}
              fullPage={listOnly}
              startingTaskId={startingTaskId}
              onStart={start}
            />
          )}
        </main>
      )}
      <ChildBottomNav
        active={navActive}
        onNavigate={onNavigate}
      />
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
