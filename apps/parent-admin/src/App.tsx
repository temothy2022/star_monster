import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  PARENT_SESSION_EXPIRED_EVENT,
  parentApi,
  staffApi,
  type Child,
  type Device,
  type HanziCharacterResource,
  type HanziLearningSettings,
  type HanziMediaKind,
  type LedgerEntry,
  type LeaderboardPreview,
  type LeaderboardSettings as LeaderboardSettingsValue,
  type PlanetKey,
  type PlanetSetting,
  type PoemLearningSettings,
  type PoemResource,
  type Redemption,
  type StaffUser,
  type TaskHistoryItem,
  type TaskTemplate,
  type Wish,
} from "./api";
import { AiAssistant } from "./AiAssistant";
import { GrowthOverview } from "./GrowthOverview";
import { ParentClockLearning, ParentHanziLearning, ParentMakeTenLearning, ParentPoemLearning } from "./LearningLibraries";
import sportsReward from "@star-monsters/assets/images/reward-categories/sports.webp";
import gamesReward from "@star-monsters/assets/images/reward-categories/games.webp";
import televisionReward from "@star-monsters/assets/images/reward-categories/television.webp";
import toysReward from "@star-monsters/assets/images/reward-categories/toys.webp";
import earthPlanet from "@star-monsters/assets/images/planets/earth.webp";
import jupiterPlanet from "@star-monsters/assets/images/planets/jupiter.webp";
import marsPlanet from "@star-monsters/assets/images/planets/mars.webp";
import mercuryPlanet from "@star-monsters/assets/images/planets/mercury.webp";
import neptunePlanet from "@star-monsters/assets/images/planets/neptune.webp";
import saturnPlanet from "@star-monsters/assets/images/planets/saturn.webp";
import uranusPlanet from "@star-monsters/assets/images/planets/uranus.webp";
import venusPlanet from "@star-monsters/assets/images/planets/venus.webp";

type Section =
  | "overview"
  | "history"
  | "tasks"
  | "hanzi"
  | "clock"
  | "make-ten"
  | "poems"
  | "wishes"
  | "redemptions"
  | "stars"
  | "planets"
  | "ai"
  | "leaderboard"
  | "profile"
  | "settings";

const SECTION_LABELS: Record<Section, string> = {
  overview: "成长总览",
  history: "任务记录",
  tasks: "任务配置",
  hanzi: "汉字学习",
  clock: "时钟学习",
  "make-ten": "凑十训练",
  poems: "古诗学习",
  wishes: "星愿管理",
  redemptions: "兑换处理",
  stars: "星星流水",
  planets: "航图规则",
  ai: "AI 助手",
  leaderboard: "排行榜设置",
  profile: "孩子档案",
  settings: "登录设备",
};

type NavItem = {
  key: Section;
  label: string;
  icon: string;
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: "工作台", items: [{ key: "overview", label: "成长总览", icon: "⌂" }] },
  {
    label: "任务中心",
    items: [
      { key: "tasks", label: "任务配置", icon: "✓" },
      { key: "history", label: "任务记录", icon: "≡" },
    ],
  },
  {
    label: "学习内容",
    items: [
      { key: "hanzi", label: "汉字学习", icon: "字" },
      { key: "clock", label: "时钟学习", icon: "时" },
      { key: "make-ten", label: "凑十训练", icon: "十" },
      { key: "poems", label: "古诗学习", icon: "诗" },
    ],
  },
  {
    label: "奖励中心",
    items: [
      { key: "wishes", label: "星愿管理", icon: "☆" },
      { key: "redemptions", label: "兑换处理", icon: "↔" },
      { key: "stars", label: "星星流水", icon: "★" },
      { key: "planets", label: "航图规则", icon: "◎" },
    ],
  },
  {
    label: "智能与设置",
    items: [
      { key: "ai", label: "AI 助手", icon: "✦" },
      { key: "leaderboard", label: "排行榜设置", icon: "榜" },
      { key: "profile", label: "孩子档案", icon: "档" },
      { key: "settings", label: "登录设备", icon: "⚙" },
    ],
  },
];

const PRIMARY_MOBILE_NAV: NavItem[] = [
  { key: "overview", label: "总览", icon: "⌂" },
  { key: "tasks", label: "任务", icon: "✓" },
  { key: "wishes", label: "奖励", icon: "☆" },
  { key: "ai", label: "AI 助手", icon: "✦" },
];

const REWARD_SECTIONS: Section[] = ["wishes", "redemptions", "stars", "planets"];

function sectionFromLocation(): Section {
  const candidate = window.location.hash.replace(/^#/, "") as Section;
  return (Object.keys(SECTION_LABELS) as Section[]).includes(candidate) ? candidate : "overview";
}

const LEDGER_LABELS: Record<LedgerEntry["type"], string> = {
  TASK_REWARD: "任务奖励",
  TASK_REWARD_REVERSAL: "任务奖励回退",
  DAILY_GOAL_BONUS: "每日达标奖",
  PLANET_BONUS: "星球点亮奖",
  WISH_SPEND: "兑换支出",
  WISH_REFUND: "兑换退款",
  PET_CARE_SPEND: "星宠照顾",
  PET_TRAVEL_SPEND: "星宠旅行",
  PET_REFUND: "星宠退款",
  MANUAL_ADJUSTMENT: "手动调整"
};

const PLANET_META: Record<
  PlanetKey,
  { name: string; englishName: string; image: string }
> = {
  MERCURY: { name: "水星", englishName: "Mercury", image: mercuryPlanet },
  VENUS: { name: "金星", englishName: "Venus", image: venusPlanet },
  EARTH: { name: "地球", englishName: "Earth", image: earthPlanet },
  MARS: { name: "火星", englishName: "Mars", image: marsPlanet },
  JUPITER: { name: "木星", englishName: "Jupiter", image: jupiterPlanet },
  SATURN: { name: "土星", englishName: "Saturn", image: saturnPlanet },
  URANUS: { name: "天王星", englishName: "Uranus", image: uranusPlanet },
  NEPTUNE: { name: "海王星", englishName: "Neptune", image: neptunePlanet },
};

const WISH_IMAGES: Record<Wish["category"], string> = {
  SPORTS: sportsReward,
  GAMES: gamesReward,
  TELEVISION: televisionReward,
  TOYS: toysReward,
};

const CATEGORY_LABELS: Record<string, string> = {
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "生活习惯",
  CHINESE: "语文",
  ENGLISH: "英语",
  OTHER: "综合任务",
};

const PET_LABELS: Record<string, string> = {
  DOUYA: "豆芽",
  PAOPAO: "泡泡",
  TUANTUAN: "团团",
  MILU: "米露",
  SHANSHAN: "闪闪",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "暂无";
}

function getDeviceLabel(device: Device) {
  const explicitName = device.deviceName?.trim();
  if (explicitName && !["网页浏览器", "浏览器"].includes(explicitName)) {
    return explicitName;
  }
  const userAgent = device.userAgent ?? "";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/Android/i.test(userAgent)) return "Android 设备";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac 电脑";
  if (/Windows/i.test(userAgent)) return "Windows 电脑";
  return "网页浏览器";
}

function getBrowserLabel(userAgent: string | null) {
  const value = userAgent ?? "";
  if (/MicroMessenger/i.test(value)) return "微信内置浏览器";
  if (/EdgA|EdgiOS|Edg\//i.test(value)) return "Microsoft Edge";
  if (/SamsungBrowser/i.test(value)) return "Samsung Internet";
  if (/OPR\//i.test(value)) return "Opera";
  if (/CriOS|Chrome\//i.test(value)) return "Google Chrome";
  if (/FxiOS|Firefox\//i.test(value)) return "Firefox";
  if (/Safari\//i.test(value) && !/Chrome|CriOS/i.test(value)) return "Safari";
  return "未知浏览器";
}

function formatTimeHM(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function formatElapsed(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "success";
  children: ReactNode;
}) {
  return <div className={`admin-notice admin-notice--${kind}`}>{children}</div>;
}

function LoginPage({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const remembered = (() => {
    try {
      return JSON.parse(localStorage.getItem("star-monsters:parent-login") ?? "null") as {
        username?: string;
        password?: string;
      } | null;
    } catch {
      return null;
    }
  })();
  const [username, setUsername] = useState(remembered?.username ?? "");
  const [password, setPassword] = useState(remembered?.password ?? "");
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await staffApi.login(username, password);
      if (user.role !== "PARENT") {
        await staffApi.logout();
        throw new Error("这个账号不是家长账号");
      }
      if (remember) {
        localStorage.setItem(
          "star-monsters:parent-login",
          JSON.stringify({ username, password }),
        );
      } else {
        localStorage.removeItem("star-monsters:parent-login");
      }
      onLogin(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__card">
        <div className="admin-login__brand"><span>★</span> 星宠成长基地</div>
        <h1>家长管理平台</h1>
        <p>管理孩子的任务、星愿和成长数据</p>
        <form onSubmit={submit}>
          <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <label className="admin-login__remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
                if (!event.target.checked) {
                  localStorage.removeItem("star-monsters:parent-login");
                }
              }}
            />
            <span>在这台设备上记住用户名和密码</span>
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="primary-button" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
        </form>
      </section>
    </main>
  );
}

function History({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [days, setDays] = useState(30);
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void parentApi.taskHistory(child.id, days)
      .then((result) => {
        if (!cancelled) setTasks(result.tasks);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "历史记录读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [child.id, days]);

  const attempts = tasks.flatMap((task) => task.attempts);
  const completed = attempts.filter((attempt) => attempt.status === "COMPLETED").length;
  const failed = attempts.filter((attempt) => attempt.status === "FAILED").length;
  const timedOut = attempts.filter((attempt) => attempt.status === "TIMED_OUT").length;
  const abandoned = attempts.filter((attempt) => attempt.status === "ABANDONED").length;
  const stars = attempts.reduce(
    (sum, attempt) => sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
    0,
  );
  const elapsed = attempts.reduce((sum, attempt) => sum + (attempt.elapsedSeconds ?? 0), 0);
  const outcomeLabel = (task: TaskHistoryItem) => {
    const completedAttempts = task.attempts.filter(
      (attempt) => attempt.status === "COMPLETED",
    ).length;
    if (task.repeatableDailySnapshot && completedAttempts > 0) {
      return `已完成 ${completedAttempts} 次（可重复）`;
    }
    if (task.attempts.some((attempt) => attempt.status === "ROLLED_BACK")) {
      return "已退款，待完成";
    }
    if (task.attempts.some((attempt) => attempt.status === "FAILED")) {
      return "未达标，待完成";
    }
    if (task.status === "COMPLETED") return "已完成";
    if (task.status === "EXPIRED") return "未完成";
    if (task.status === "PAUSED") return "已暂停";
    if (task.status === "IN_PROGRESS") return "进行中";
    return "待开始";
  };

  return (
    <div className="admin-stack">
      <div className="history-toolbar">
        <div>
          <h2>任务历史与执行数据</h2>
          <p>包含完成、未达标、限时超时、放弃、执行时长和奖励明细</p>
        </div>
        <div>{[7, 30, 90].map((range) => <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>近 {range} 天</button>)}</div>
      </div>
      <div className="metric-grid">
        <article><span>已完成</span><strong>{completed}</strong><small>共 {tasks.length} 个每日任务</small></article>
        <article><span>未达标 / 超时 / 放弃</span><strong>{failed + timedOut + abandoned}</strong><small>{failed} 未达标 · {timedOut} 超时 · {abandoned} 放弃</small></article>
        <article><span>任务奖励</span><strong>{stars}</strong><small>基础与加成星星</small></article>
        <article><span>累计执行</span><strong>{Math.round(elapsed / 60)}</strong><small>分钟</small></article>
      </div>
      <Panel title={`任务明细 · 近 ${days} 天`}>
        {error && <Notice kind="error">{error}</Notice>}
        {loading ? <div className="empty-state">正在读取任务历史…</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>日期</th><th>完成时间</th><th>任务</th><th>分类 / 类型</th><th>结果</th><th>尝试</th><th>完成用时 / 总执行</th><th>奖励</th><th>操作</th></tr></thead>
              <tbody>{tasks.map((task) => {
                const taskElapsed = task.attempts.reduce((sum, attempt) => sum + (attempt.elapsedSeconds ?? 0), 0);
                const taskStars = task.attempts.reduce((sum, attempt) => sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded, 0);
                const exception = task.attempts.some((attempt) => attempt.status === "FAILED")
                  ? " · 有未达标"
                  : task.attempts.some((attempt) => attempt.status === "TIMED_OUT")
                    ? " · 有超时"
                  : task.attempts.some((attempt) => attempt.status === "ABANDONED")
                    ? " · 有放弃"
                    : task.attempts.some((attempt) => attempt.status === "ROLLED_BACK")
                      ? " · 已退款"
                    : "";
                const hasCompletion = task.attempts.some((attempt) => attempt.status === "COMPLETED");
                return <tr key={task.id}><td>{task.taskDate.slice(0, 10)}</td><td>{task.completedAt ? formatTimeHM(task.completedAt) : "—"}</td><td><strong>{task.titleSnapshot}</strong></td><td>{CATEGORY_LABELS[task.categorySnapshot] ?? task.categorySnapshot} · {task.modeSnapshot === "TIMED" ? "限时" : "不限时"}{task.repeatableDailySnapshot ? " · 可重复" : ""}</td><td><span className={`status status--${hasCompletion ? "completed" : task.status === "EXPIRED" ? "cancelled" : "pending"}`}>{outcomeLabel(task)}{exception}</span></td><td>{task.attempts.length}</td><td>{formatElapsed(task.completionDurationSeconds)} / {formatElapsed(taskElapsed)}</td><td className={taskStars > 0 ? "positive" : ""}>{taskStars > 0 ? `+${taskStars}` : "—"}</td><td>{hasCompletion && taskStars > 0 ? <button type="button" className="danger-text" disabled={busyTaskId === task.id} onClick={() => { if (!window.confirm(`确定退款“${task.titleSnapshot}”吗？任务奖励和相关每日达标奖会从可用星星及历史累计星星中扣回，任务恢复为未完成。`)) return; setBusyTaskId(task.id); setError(""); void parentApi.refundTask(child.id, task.id).then(() => parentApi.taskHistory(child.id, days)).then((result) => { setTasks(result.tasks); onChanged(); }).catch((reason) => setError(reason instanceof Error ? reason.message : "任务退款失败")).finally(() => setBusyTaskId(null)); }}>{busyTaskId === task.id ? "退款中…" : "退款"}</button> : "—"}</td></tr>;
              })}</tbody>
            </table>
            {!tasks.length && <div className="empty-state">这个时间范围内还没有任务记录</div>}
          </div>
        )}
      </Panel>
    </div>
  );
}

type TaskForm = {
  title: string;
  experienceKind: "STANDARD" | "HANZI_LEARNING" | "HANZI_REVIEW" | "CLOCK_LEARNING" | "MAKE_TEN";
  category: string;
  mode: "UNTIMED" | "TIMED";
  durationMinutes: number;
  baseStars: number;
  earlyBonusEnabled: boolean;
  earlyThresholdMinutes: number;
  earlyBonusStars: number;
  repeatableDaily: boolean;
  scheduleKind: "DAILY" | "WORKDAYS" | "SELECTED_WEEKDAYS" | "ONE_TIME";
  weekdays: number[];
  oneTimeDate: string;
  isEnabled: boolean;
  aiSchedulingEnabled: boolean;
  learningPracticeKind: "GENERAL" | "NEW_CONTENT" | "REVIEW" | "MIXED";
  targetSessionsPerWeek: number;
  minimumGapDays: number;
};

const EMPTY_TASK: TaskForm = {
  title: "",
  experienceKind: "STANDARD",
  category: "CHINESE",
  mode: "UNTIMED",
  durationMinutes: 15,
  baseStars: 2,
  earlyBonusEnabled: false,
  earlyThresholdMinutes: 3,
  earlyBonusStars: 1,
  repeatableDaily: false,
  scheduleKind: "DAILY",
  weekdays: [],
  oneTimeDate: "",
  isEnabled: true,
  aiSchedulingEnabled: false,
  learningPracticeKind: "GENERAL",
  targetSessionsPerWeek: 3,
  minimumGapDays: 1,
};

function taskFormFrom(template: TaskTemplate): TaskForm {
  return {
    title: template.title,
    experienceKind:
      template.experienceKind === "HANZI_LEARNING" ||
      template.experienceKind === "CLOCK_LEARNING" ||
      template.experienceKind === "MAKE_TEN"
        ? template.experienceKind
        : "STANDARD",
    category: template.category,
    mode: template.mode,
    durationMinutes: Math.round(((template.mode === "TIMED" ? template.timeLimitSeconds : template.suggestedSeconds) ?? 60) / 60),
    baseStars: template.baseStars,
    earlyBonusEnabled: template.earlyBonusEnabled,
    earlyThresholdMinutes: Math.round((template.earlyThresholdSeconds ?? 60) / 60),
    earlyBonusStars: template.earlyBonusStars ?? 1,
    repeatableDaily: template.repeatableDaily,
    scheduleKind: template.scheduleKind,
    weekdays: template.weekdays,
    oneTimeDate: template.oneTimeDate?.slice(0, 10) ?? "",
    isEnabled: template.isEnabled,
    aiSchedulingEnabled: template.aiSchedulingEnabled,
    learningPracticeKind: template.learningPracticeKind,
    targetSessionsPerWeek: template.targetSessionsPerWeek ?? 3,
    minimumGapDays: template.minimumGapDays ?? 1,
  };
}

function taskPayload(form: TaskForm, sortOrder = 0) {
  const isHanzi = form.experienceKind === "HANZI_LEARNING";
  const isClock = form.experienceKind === "CLOCK_LEARNING";
  const isMakeTen = form.experienceKind === "MAKE_TEN";
  const isLearningExperience = isHanzi || isClock || isMakeTen;
  const supportsRepeatableDaily = form.experienceKind === "STANDARD" || isMakeTen;
  return {
    title: form.title,
    experienceKind: form.experienceKind,
    category: isHanzi ? "CHINESE" : isClock || isMakeTen ? "MATH" : form.category,
    iconKey: isHanzi ? "chinese" : isClock || isMakeTen ? "math" : form.category.toLowerCase(),
    mode: isLearningExperience ? "UNTIMED" : form.mode,
    suggestedSeconds: isLearningExperience || form.mode === "UNTIMED" ? form.durationMinutes * 60 : null,
    timeLimitSeconds: !isLearningExperience && form.mode === "TIMED" ? form.durationMinutes * 60 : null,
    baseStars: form.baseStars,
    earlyBonusEnabled: !isLearningExperience && form.mode === "TIMED" && form.earlyBonusEnabled,
    earlyThresholdSeconds: !isLearningExperience && form.mode === "TIMED" && form.earlyBonusEnabled ? form.earlyThresholdMinutes * 60 : null,
    earlyBonusStars: !isLearningExperience && form.mode === "TIMED" && form.earlyBonusEnabled ? form.earlyBonusStars : null,
    repeatableDaily: supportsRepeatableDaily && form.repeatableDaily,
    scheduleKind: form.scheduleKind,
    weekdays: form.scheduleKind === "SELECTED_WEEKDAYS" ? form.weekdays : [],
    oneTimeDate: form.scheduleKind === "ONE_TIME" ? form.oneTimeDate : null,
    sortOrder,
    isEnabled: form.isEnabled,
    aiSchedulingEnabled: form.scheduleKind !== "ONE_TIME" && form.aiSchedulingEnabled,
    learningPracticeKind: form.learningPracticeKind,
    targetSessionsPerWeek: form.scheduleKind !== "ONE_TIME" && form.aiSchedulingEnabled ? form.targetSessionsPerWeek : null,
    minimumGapDays: form.scheduleKind !== "ONE_TIME" && form.aiSchedulingEnabled ? form.minimumGapDays : null,
  };
}

function Tasks({ child }: { child: Child }) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [form, setForm] = useState<TaskForm>(EMPTY_TASK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const systemTemplates = templates.filter((template) => template.systemManaged);
  const editableTemplates = templates.filter((template) => !template.systemManaged);

  async function load() {
    const result = await parentApi.templates(child.id);
    setTemplates(result.templates);
  }
  useEffect(() => { void load(); }, [child.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await parentApi.updateTemplate(child.id, editingId, taskPayload(form));
      } else {
        await parentApi.createTemplate(
          child.id,
          taskPayload(form, editableTemplates.length * 10),
        );
      }
      setForm(EMPTY_TASK);
      setEditingId(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder(reordered: TaskTemplate[]) {
    const normalized = reordered.map((item, order) => ({
      ...item,
      sortOrder: order * 10,
    }));
    setTemplates([...systemTemplates, ...normalized]);
    setError("");
    try {
      await parentApi.reorderTemplates(
        child.id,
        normalized.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务排序保存失败");
      await load();
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= editableTemplates.length) return;
    const reordered = [...editableTemplates];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    await saveOrder(reordered);
  }

  function startDragging(event: DragEvent<HTMLElement>, id: string) {
    setDraggingId(id);
    setDragOverId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function dragOver(event: DragEvent<HTMLElement>, id: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  }

  function dropTask(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = draggingId || event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDragOverId(null);
    reorderTask(sourceId, targetId);
  }

  function reorderTask(sourceId: string | null, targetId: string | null) {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = editableTemplates.findIndex((item) => item.id === sourceId);
    const targetIndex = editableTemplates.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...editableTemplates];
    const [dragged] = reordered.splice(sourceIndex, 1);
    if (!dragged) return;
    reordered.splice(targetIndex, 0, dragged);
    void saveOrder(reordered);
  }

  function taskIdAtPoint(clientX: number, clientY: number) {
    return document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-task-id]")
      ?.dataset.taskId ?? null;
  }

  function startPointerDragging(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setDragOverId(id);
  }

  function pointerDragOver(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    event.preventDefault();
    const targetId = taskIdAtPoint(event.clientX, event.clientY);
    if (targetId && targetId !== dragOverId) setDragOverId(targetId);
  }

  function finishPointerDragging(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    event.preventDefault();
    const sourceId = draggingId;
    const targetId = taskIdAtPoint(event.clientX, event.clientY) ?? dragOverId;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingId(null);
    setDragOverId(null);
    reorderTask(sourceId, targetId);
  }

  return (
    <div className="admin-two-column">
      <Panel title={editingId ? "编辑任务" : "添加任务"}>
        <form className="admin-form" onSubmit={submit}>
          <label className="field-span">任务名称<input required maxLength={80} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="field-span">任务内容<select value={form.experienceKind} onChange={(event) => {
            const experienceKind = event.target.value as TaskForm["experienceKind"];
            setForm({
              ...form,
              experienceKind,
              title: !form.title.trim()
                ? experienceKind === "HANZI_LEARNING"
                  ? "汉字学习"
                  : experienceKind === "CLOCK_LEARNING"
                    ? "时钟学习"
                    : experienceKind === "MAKE_TEN"
                      ? "凑十训练"
                    : form.title
                : form.title,
              category: experienceKind === "HANZI_LEARNING" ? "CHINESE" : experienceKind === "CLOCK_LEARNING" || experienceKind === "MAKE_TEN" ? "MATH" : form.category,
              mode: experienceKind === "STANDARD" ? form.mode : "UNTIMED",
              repeatableDaily: experienceKind === "STANDARD" || experienceKind === "MAKE_TEN" ? form.repeatableDaily : false,
              earlyBonusEnabled: experienceKind === "STANDARD" ? form.earlyBonusEnabled : false,
            });
          }}><option value="STANDARD">普通任务</option><option value="HANZI_LEARNING">汉字学习任务</option><option value="CLOCK_LEARNING">时钟学习任务</option><option value="MAKE_TEN">凑十训练任务</option></select></label>
          <label>分类<select disabled={form.experienceKind !== "STANDARD"} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>计时类型<select disabled={form.experienceKind !== "STANDARD"} value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as TaskForm["mode"] })}><option value="UNTIMED">不限时</option><option value="TIMED">限时任务</option></select></label>
          <label>{form.mode === "TIMED" ? "倒计时（分钟）" : "建议时长（分钟）"}<input type="number" min={1} max={1440} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>
          <label>基础星星<input type="number" min={1} max={999} value={form.baseStars} onChange={(event) => setForm({ ...form, baseStars: Number(event.target.value) })} /></label>
          {form.mode === "TIMED" && <label className="checkbox field-span"><input type="checkbox" checked={form.earlyBonusEnabled} onChange={(event) => setForm({ ...form, earlyBonusEnabled: event.target.checked })} />启用提前完成加奖</label>}
          {form.mode === "TIMED" && form.earlyBonusEnabled && <>
            <label>剩余至少（分钟）<input type="number" min={1} value={form.earlyThresholdMinutes} onChange={(event) => setForm({ ...form, earlyThresholdMinutes: Number(event.target.value) })} /></label>
            <label>额外星星<input type="number" min={1} value={form.earlyBonusStars} onChange={(event) => setForm({ ...form, earlyBonusStars: Number(event.target.value) })} /></label>
          </>}
          {(form.experienceKind === "STANDARD" || form.experienceKind === "MAKE_TEN") && <label className="checkbox field-span"><input type="checkbox" checked={form.repeatableDaily} onChange={(event) => setForm({ ...form, repeatableDaily: event.target.checked })} />当天可反复完成并领取奖励（不限制次数）</label>}
          <label>出现方式<select value={form.scheduleKind} onChange={(event) => setForm({ ...form, scheduleKind: event.target.value as TaskForm["scheduleKind"] })}><option value="DAILY">每天</option><option value="WORKDAYS">工作日</option><option value="SELECTED_WEEKDAYS">指定星期</option><option value="ONE_TIME">一次性任务</option></select></label>
          {form.scheduleKind === "ONE_TIME" && <label>任务日期<input required type="date" value={form.oneTimeDate} onChange={(event) => setForm({ ...form, oneTimeDate: event.target.value })} /></label>}
          {form.scheduleKind === "SELECTED_WEEKDAYS" && <fieldset className="weekday-field field-span"><legend>选择星期</legend>{["日","一","二","三","四","五","六"].map((label, weekday) => <label key={weekday}><input type="checkbox" checked={form.weekdays.includes(weekday)} onChange={(event) => setForm({ ...form, weekdays: event.target.checked ? [...form.weekdays, weekday] : form.weekdays.filter((item) => item !== weekday) })} />周{label}</label>)}</fieldset>}
          {form.scheduleKind !== "ONE_TIME" && <label className="checkbox field-span"><input type="checkbox" checked={form.aiSchedulingEnabled} onChange={(event) => setForm({ ...form, aiSchedulingEnabled: event.target.checked })} />参与 AI 智能排班</label>}
          {form.scheduleKind !== "ONE_TIME" && form.aiSchedulingEnabled && <>
            <label>练习类型<select value={form.learningPracticeKind} onChange={(event) => setForm({ ...form, learningPracticeKind: event.target.value as TaskForm["learningPracticeKind"] })}><option value="GENERAL">一般任务</option><option value="NEW_CONTENT">学习新内容</option><option value="REVIEW">复习巩固</option><option value="MIXED">新学与复习混合</option></select></label>
            <label>每周目标次数<input type="number" min={1} max={7} value={form.targetSessionsPerWeek} onChange={(event) => setForm({ ...form, targetSessionsPerWeek: Number(event.target.value) })} /></label>
            <label>至少间隔天数<input type="number" min={0} max={6} value={form.minimumGapDays} onChange={(event) => setForm({ ...form, minimumGapDays: Number(event.target.value) })} /></label>
          </>}
          <label className="checkbox field-span"><input type="checkbox" checked={form.isEnabled} onChange={(event) => setForm({ ...form, isEnabled: event.target.checked })} />立即启用</label>
          {error && <div className="field-span"><Notice kind="error">{error}</Notice></div>}
          <div className="form-actions field-span">{editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setForm(EMPTY_TASK); }}>取消编辑</button>}<button className="primary-button" disabled={busy}>{busy ? "保存中…" : editingId ? "保存修改" : "添加任务"}</button></div>
        </form>
      </Panel>
      <Panel title={`任务模板（${templates.length}）`}>
        <div className="admin-list">
          {systemTemplates.map((template) => (
            <article className="list-card" key={template.id}>
              <div className="list-card__main">
                <div className={`category-dot category-dot--${template.category.toLowerCase()}`} />
                <div>
                  <h3>{template.title}</h3>
                  <p>
                    {template.experienceKind === "POEM_LEARNING"
                      ? "古诗学习"
                      : "古诗复习"}{" "}
                    · 建议 {(template.suggestedSeconds ?? 0) / 60} 分钟 · +
                    {template.baseStars}
                  </p>
                  <small>
                    {template.scheduleKind === "DAILY"
                      ? "每天"
                      : `每周 ${template.weekdays.join("、")}`}{" "}
                    · {template.isEnabled ? "已启用" : "已停用"}
                  </small>
                </div>
              </div>
              <div className="list-card__actions">
                <span className="status status--arranged">请在古诗学习中配置</span>
              </div>
            </article>
          ))}
          {editableTemplates.map((template, index) => (
            <article
              className={`list-card list-card--draggable${draggingId === template.id ? " list-card--dragging" : ""}${dragOverId === template.id && draggingId !== template.id ? " list-card--drag-over" : ""}`}
              data-task-id={template.id}
              draggable
              key={template.id}
              onDragStart={(event) => startDragging(event, template.id)}
              onDragOver={(event) => dragOver(event, template.id)}
              onDrop={(event) => dropTask(event, template.id)}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
            >
              <div className="list-card__main"><button
                type="button"
                className="task-drag-handle"
                title="拖动调整顺序"
                aria-label={`拖动“${template.title}”调整顺序`}
                onPointerDown={(event) => startPointerDragging(event, template.id)}
                onPointerMove={pointerDragOver}
                onPointerUp={finishPointerDragging}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onClick={(event) => event.preventDefault()}
              >⋮⋮</button><div className={`category-dot category-dot--${template.category.toLowerCase()}`} /><div><h3>{template.title}</h3><p>{template.experienceKind === "HANZI_LEARNING" ? "汉字学习" : template.experienceKind === "HANZI_REVIEW" ? "汉字复习（自动）" : template.experienceKind === "CLOCK_LEARNING" ? "时钟学习" : template.experienceKind === "MAKE_TEN" ? "凑十训练" : CATEGORY_LABELS[template.category]} · {template.mode === "TIMED" ? `限时 ${(template.timeLimitSeconds ?? 0) / 60} 分钟` : `建议 ${(template.suggestedSeconds ?? 0) / 60} 分钟`} · +{template.baseStars}{template.earlyBonusEnabled ? ` + ${template.earlyBonusStars} 加奖` : ""}</p><small>{template.scheduleKind === "DAILY" ? "每天" : template.scheduleKind === "WORKDAYS" ? "工作日" : template.scheduleKind === "ONE_TIME" ? `一次性 ${template.oneTimeDate?.slice(0, 10)}` : `每周 ${template.weekdays.join("、")}`} · {template.repeatableDaily ? "当天可重复领取 · " : ""}{template.isEnabled ? "已启用" : "已停用"}{template.aiSchedulingEnabled ? " · AI 排班" : ""}</small></div></div>
              <div className="list-card__actions">
                <button title="上移" disabled={index === 0} onClick={() => void move(index, -1)}>↑</button>
                <button title="下移" disabled={index === editableTemplates.length - 1} onClick={() => void move(index, 1)}>↓</button>
                <button onClick={() => { setEditingId(template.id); setForm(taskFormFrom(template)); }}>编辑</button>
                <button onClick={() => void parentApi.updateTemplate(child.id, template.id, { isEnabled: !template.isEnabled }).then(load)}>{template.isEnabled ? "停用" : "启用"}</button>
                <button className="danger-text" onClick={() => window.confirm("归档这个任务模板？历史任务不会删除。") && void parentApi.archiveTemplate(child.id, template.id).then(load)}>归档</button>
              </div>
            </article>
          ))}
          {!templates.length && <div className="empty-state">还没有任务模板</div>}
        </div>
      </Panel>
    </div>
  );
}

const DEFAULT_HANZI_SETTINGS: HanziLearningSettings = {
  newCharactersPerDay: 3,
  reviewDailyLimit: 25,
  consolidationQuestionCount: 3,
  reviewTaskStars: 1,
};

type HanziCharacterForm = {
  character: string;
  internalPinyin: string;
  meaning: string;
  shapeHint: string;
  sentence: string;
  wordsText: string;
  wordAudioUrls: string[];
  imageKey: string;
  characterAudioUrl: string;
  sentenceAudioUrl: string;
  sortOrder: number;
};

const EMPTY_HANZI_CHARACTER: HanziCharacterForm = {
  character: "",
  internalPinyin: "",
  meaning: "",
  shapeHint: "",
  sentence: "",
  wordsText: "",
  wordAudioUrls: [],
  imageKey: "default-hanzi",
  characterAudioUrl: "",
  sentenceAudioUrl: "",
  sortOrder: 0,
};

function hanziFormFrom(item: HanziCharacterResource): HanziCharacterForm {
  return {
    character: item.character,
    internalPinyin: item.internalPinyin,
    meaning: item.meaning,
    shapeHint: item.shapeHint,
    sentence: item.sentence.replace("__", item.character),
    wordsText: item.words.join("、"),
    wordAudioUrls: [...item.wordAudioUrls],
    imageKey: item.imageKey,
    characterAudioUrl: item.characterAudioUrl ?? "",
    sentenceAudioUrl: item.sentenceAudioUrl ?? "",
    sortOrder: item.sortOrder,
  };
}

function hanziPayload(form: HanziCharacterForm) {
  const character = form.character.trim();
  const readableSentence = form.sentence.trim();
  const sentence = readableSentence.includes("__")
    ? readableSentence
    : readableSentence.includes(character)
      ? readableSentence.replace(character, "__")
      : "";
  if (!sentence) throw new Error("例句中必须包含当前汉字");
  const words = form.wordsText
    .split(/[、,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!words.length) throw new Error("请至少填写一个词组");
  return {
    character,
    internalPinyin: form.internalPinyin.trim(),
    meaning: form.meaning.trim(),
    shapeHint: form.shapeHint.trim(),
    sentence,
    words,
    wordAudioUrls: words.map(
      (_, index) => form.wordAudioUrls[index]?.trim() ?? "",
    ),
    imageKey: form.imageKey.trim() || "default-hanzi",
    characterAudioUrl: form.characterAudioUrl.trim() || null,
    sentenceAudioUrl: form.sentenceAudioUrl.trim() || null,
    sortOrder: form.sortOrder,
    isEnabled: true,
  };
}

function HanziAudioButton({
  mediaKey,
  label,
  url,
  fallbackText,
  playingMediaKey,
  onToggle,
}: {
  mediaKey: string;
  label: string;
  url: string | null;
  fallbackText: string;
  playingMediaKey: string | null;
  onToggle: (
    mediaKey: string,
    url: string | null,
    fallbackText: string,
  ) => void;
}) {
  const playing = playingMediaKey === mediaKey;
  return (
    <button
      type="button"
      className={`hanzi-audio-button${playing ? " hanzi-audio-button--playing" : ""}`}
      title={playing ? `停止${label}` : `播放${label}`}
      onClick={() => onToggle(mediaKey, url, fallbackText)}
    >
      <span aria-hidden="true">{playing ? "■" : "▶"}</span>
      {playing ? "停止" : label}
    </button>
  );
}

function HanziUploadControl({
  label,
  accept,
  disabled,
  onSelect,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  return (
    <label
      className={`hanzi-upload-button${disabled ? " hanzi-upload-button--disabled" : ""}`}
    >
      <span aria-hidden="true">↑</span>
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onSelect(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function HanziLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState<HanziLearningSettings>(DEFAULT_HANZI_SETTINGS);
  const [characters, setCharacters] = useState<HanziCharacterResource[]>([]);
  const [characterCount, setCharacterCount] = useState(0);
  const [progress, setProgress] = useState<Partial<Record<"LEARNING" | "MASTERED", number>>>({});
  const [characterForm, setCharacterForm] = useState<HanziCharacterForm>(EMPTY_HANZI_CHARACTER);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [libraryMessage, setLibraryMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingMediaKey, setUploadingMediaKey] = useState<string | null>(null);
  const [playingMediaKey, setPlayingMediaKey] = useState<string | null>(null);
  const activeAudio = useRef<HTMLAudioElement | null>(null);
  const pageSize = 30;

  function stopMediaPlayback() {
    activeAudio.current?.pause();
    activeAudio.current = null;
    window.speechSynthesis?.cancel();
    setPlayingMediaKey(null);
  }

  useEffect(
    () => () => {
      activeAudio.current?.pause();
      activeAudio.current = null;
      window.speechSynthesis?.cancel();
    },
    [child.id],
  );

  function toggleMediaPlayback(
    mediaKey: string,
    url: string | null,
    fallbackText: string,
  ) {
    if (playingMediaKey === mediaKey) {
      stopMediaPlayback();
      return;
    }
    stopMediaPlayback();
    setError("");
    setPlayingMediaKey(mediaKey);
    if (!url) {
      if (!window.speechSynthesis) {
        setPlayingMediaKey(null);
        setError("当前浏览器不支持朗读");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(fallbackText);
      utterance.lang = "zh-CN";
      utterance.rate = 0.82;
      utterance.onend = () => setPlayingMediaKey(null);
      utterance.onerror = () => {
        setPlayingMediaKey(null);
        setError("暂时无法播放朗读");
      };
      window.speechSynthesis.speak(utterance);
      return;
    }

    const audio = new Audio(url);
    activeAudio.current = audio;
    audio.onended = () => {
      if (activeAudio.current === audio) activeAudio.current = null;
      setPlayingMediaKey(null);
    };
    audio.onerror = () => {
      if (activeAudio.current === audio) activeAudio.current = null;
      setPlayingMediaKey(null);
      setError("音频加载失败，请上传新的音频文件");
    };
    void audio.play().catch(() => {
      if (activeAudio.current === audio) activeAudio.current = null;
      setPlayingMediaKey(null);
      setError("暂时无法播放音频");
    });
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    void parentApi.hanziSettings(child.id)
      .then((result) => {
        setSettings(result.settings);
        setCharacterCount(result.characterCount);
        setProgress(result.progress);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "汉字学习配置加载失败"))
      .finally(() => setLoading(false));
  }, [child.id]);

  async function loadCharacters(nextPage = page, nextQuery = searchQuery) {
    const result = await parentApi.hanziCharacters(child.id, {
      q: nextQuery,
      page: nextPage,
      pageSize,
    });
    setCharacters(result.characters);
    setTotalCharacters(result.total);
    setPage(result.page);
  }

  useEffect(() => {
    setLibraryBusy(true);
    setError("");
    void loadCharacters(page, searchQuery)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "基础字库加载失败"))
      .finally(() => setLibraryBusy(false));
  }, [child.id, page, searchQuery]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await parentApi.updateHanziSettings(child.id, settings);
      setSettings(result.settings);
      setMessage("汉字学习参数已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitCharacter(event: FormEvent) {
    event.preventDefault();
    setLibraryBusy(true);
    setError("");
    setLibraryMessage("");
    try {
      const payload = hanziPayload(characterForm);
      if (editingCharacterId) {
        await parentApi.updateHanziCharacter(
          child.id,
          editingCharacterId,
          payload,
        );
        setLibraryMessage(`“${payload.character}”已经更新`);
      } else {
        await parentApi.createHanziCharacter(child.id, payload);
        setLibraryMessage(`“${payload.character}”已经加入基础字库`);
      }
      setCharacterForm(EMPTY_HANZI_CHARACTER);
      setEditingCharacterId(null);
      const settingsResult = await parentApi.hanziSettings(child.id);
      setCharacterCount(settingsResult.characterCount);
      if (page !== 1) setPage(1);
      else await loadCharacters(1, searchQuery);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "汉字保存失败");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function removeCharacter(item: HanziCharacterResource) {
    if (!window.confirm(`从基础字库删除“${item.character}”？已经产生的学习历史会保留。`)) return;
    setLibraryBusy(true);
    setError("");
    setLibraryMessage("");
    try {
      await parentApi.deleteHanziCharacter(child.id, item.id);
      setLibraryMessage(`“${item.character}”已经从基础字库删除`);
      if (editingCharacterId === item.id) {
        setEditingCharacterId(null);
        setCharacterForm(EMPTY_HANZI_CHARACTER);
      }
      const settingsResult = await parentApi.hanziSettings(child.id);
      setCharacterCount(settingsResult.characterCount);
      const targetPage = characters.length === 1 && page > 1 ? page - 1 : page;
      if (targetPage !== page) setPage(targetPage);
      else await loadCharacters(targetPage, searchQuery);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "汉字删除失败");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function uploadMedia(
    kind: HanziMediaKind,
    file: File,
    wordIndex?: number,
  ) {
    if (!editingCharacterId) {
      setError("请先保存汉字，再上传图片或音频");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("单个媒体文件不能超过 5MB");
      return;
    }
    const mediaKey = `${kind}-${wordIndex ?? ""}`;
    setUploadingMediaKey(mediaKey);
    setError("");
    setLibraryMessage("");
    stopMediaPlayback();
    try {
      const result = await parentApi.uploadHanziMedia(
        child.id,
        editingCharacterId,
        kind,
        file,
        wordIndex,
      );
      setCharacters((current) =>
        current.map((item) =>
          item.id === result.character.id ? result.character : item,
        ),
      );
      setCharacterForm((current) => ({
        ...current,
        imageKey: result.character.imageKey,
        characterAudioUrl: result.character.characterAudioUrl ?? "",
        sentenceAudioUrl: result.character.sentenceAudioUrl ?? "",
        wordAudioUrls: [...result.character.wordAudioUrls],
      }));
      setLibraryMessage(
        `“${result.character.character}”的${
          kind === "image"
            ? "图片"
            : kind === "character-audio"
              ? "字音"
              : kind === "sentence-audio"
                ? "例句音频"
                : `词语“${result.character.words[wordIndex ?? 0]}”读音`
        }已经替换`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "媒体上传失败");
    } finally {
      setUploadingMediaKey(null);
    }
  }

  async function generateMedia(
    kind: HanziMediaKind,
    wordIndex?: number,
  ) {
    if (!editingCharacterId) {
      setError("请先保存汉字，再自动生成图片或音频");
      return;
    }
    const mediaKey = `${kind}-${wordIndex ?? ""}`;
    setUploadingMediaKey(mediaKey);
    setError("");
    setLibraryMessage("");
    stopMediaPlayback();
    try {
      const result = await parentApi.generateHanziMedia(
        child.id,
        editingCharacterId,
        kind,
        wordIndex,
      );
      setCharacters((current) =>
        current.map((item) =>
          item.id === result.character.id ? result.character : item,
        ),
      );
      setCharacterForm((current) => ({
        ...current,
        imageKey: result.character.imageKey,
        characterAudioUrl: result.character.characterAudioUrl ?? "",
        sentenceAudioUrl: result.character.sentenceAudioUrl ?? "",
        wordAudioUrls: [...result.character.wordAudioUrls],
      }));
      setLibraryMessage(
        `“${result.character.character}”的${
          kind === "image"
            ? "图片"
            : kind === "character-audio"
              ? "字音"
              : kind === "sentence-audio"
                ? "例句音频"
                : `词语“${result.character.words[wordIndex ?? 0]}”读音`
        }已由 MiniMax 生成并替换`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动生成失败");
    } finally {
      setUploadingMediaKey(null);
    }
  }

  function searchCharacters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  const editingCharacter = editingCharacterId
    ? characters.find((item) => item.id === editingCharacterId) ?? null
    : null;

  return (
    <div className="admin-stack">
      <div className="admin-two-column">
        <Panel title="每日学习参数">
          {loading ? <div className="empty-state">正在读取设置…</div> : (
            <form className="admin-form" onSubmit={submit}>
              <label>每日新字数量<input type="number" min={1} max={10} value={settings.newCharactersPerDay} onChange={(event) => setSettings({ ...settings, newCharactersPerDay: Number(event.target.value) })} /></label>
              <label>每日复习上限<input type="number" min={1} max={50} value={settings.reviewDailyLimit} onChange={(event) => setSettings({ ...settings, reviewDailyLimit: Number(event.target.value) })} /></label>
              <label>听句挑战题数<input type="number" min={1} max={10} value={settings.consolidationQuestionCount} onChange={(event) => setSettings({ ...settings, consolidationQuestionCount: Number(event.target.value) })} /></label>
              <label>汉字复习任务星星<input type="number" min={1} max={999} value={settings.reviewTaskStars} onChange={(event) => setSettings({ ...settings, reviewTaskStars: Number(event.target.value) })} /></label>
              <div className="field-span admin-help">新字学习任务仍按任务配置中的星期出现；汉字复习任务根据到期汉字每天自动出现，不受学习日限制。</div>
              {message && <div className="field-span"><Notice>{message}</Notice></div>}
              <div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存设置"}</button></div>
            </form>
          )}
        </Panel>
      </div>
      <div className="admin-two-column hanzi-library-layout">
        <Panel title={editingCharacterId ? "编辑汉字" : "新增汉字"}>
          <form className="admin-form" onSubmit={submitCharacter}>
            <label>汉字<input required maxLength={2} value={characterForm.character} onChange={(event) => setCharacterForm({ ...characterForm, character: event.target.value })} /></label>
            <label>拼音<input required maxLength={50} placeholder="例如：shuǐ" value={characterForm.internalPinyin} onChange={(event) => setCharacterForm({ ...characterForm, internalPinyin: event.target.value })} /></label>
            <label className="field-span">含义<input required maxLength={120} placeholder="例如：流动的水" value={characterForm.meaning} onChange={(event) => setCharacterForm({ ...characterForm, meaning: event.target.value })} /></label>
            <label className="field-span">字形联想提示<input required maxLength={240} placeholder="例如：像水流向两边散开" value={characterForm.shapeHint} onChange={(event) => setCharacterForm({ ...characterForm, shapeHint: event.target.value })} /></label>
            <label className="field-span">统一例句<input required maxLength={300} placeholder="例如：小鱼在水里游来游去。" value={characterForm.sentence} onChange={(event) => setCharacterForm({ ...characterForm, sentence: event.target.value })} /><small>例句必须包含当前汉字，系统会自动标记听句挑战的填空位置。</small></label>
            <label className="field-span">词组<textarea required placeholder="使用顿号、逗号或换行分隔，例如：河水、水杯、雨水" value={characterForm.wordsText} onChange={(event) => setCharacterForm({ ...characterForm, wordsText: event.target.value })} /></label>
            <section className="field-span hanzi-media-editor" aria-label="图片和音频资源">
              <div className="hanzi-media-editor__heading">
                <div>
                  <h3>图片与朗读资源</h3>
                  <p>{editingCharacterId ? "可使用 MiniMax 自动生成，也可上传文件替换；完成后立即更新线上资源。" : "新增汉字保存后即可生成或上传图片和音频。"}</p>
                </div>
                {uploadingMediaKey ? <span>正在处理，请不要关闭页面…</span> : null}
              </div>
              <div className="hanzi-media-row hanzi-media-row--image">
                <div className="hanzi-media-preview">
                  {characterForm.imageKey !== "default-hanzi" ? (
                    <img
                      src={characterForm.imageKey}
                      alt={`${characterForm.character || "汉字"}配图`}
                      decoding="async"
                    />
                  ) : (
                    <strong>{characterForm.character || "字"}</strong>
                  )}
                </div>
                <div>
                  <strong>汉字配图</strong>
                  <small>支持 JPEG、PNG、WebP，最大 5MB</small>
                </div>
                <div className="hanzi-media-actions">
                  <button
                    type="button"
                    className="minimax-generate-button"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onClick={() => void generateMedia("image")}
                  >
                    {uploadingMediaKey === "image-" ? "生成中…" : "自动生成"}
                  </button>
                  <HanziUploadControl
                    label={characterForm.imageKey === "default-hanzi" ? "上传图片" : "替换图片"}
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onSelect={(file) => void uploadMedia("image", file)}
                  />
                </div>
              </div>
              <div className="hanzi-media-row">
                <div>
                  <strong>汉字发音</strong>
                  <small>{characterForm.characterAudioUrl ? "已上传专属音频" : "当前使用浏览器朗读"}</small>
                </div>
                <HanziAudioButton
                  mediaKey="editor-character"
                  label="试听字音"
                  url={characterForm.characterAudioUrl || null}
                  fallbackText={characterForm.character || ""}
                  playingMediaKey={playingMediaKey}
                  onToggle={toggleMediaPlayback}
                />
                <div className="hanzi-media-actions">
                  <button
                    type="button"
                    className="minimax-generate-button"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onClick={() => void generateMedia("character-audio")}
                  >
                    {uploadingMediaKey === "character-audio-" ? "生成中…" : "自动生成"}
                  </button>
                  <HanziUploadControl
                    label={characterForm.characterAudioUrl ? "替换字音" : "上传字音"}
                    accept="audio/mpeg,audio/mp4,audio/wav"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onSelect={(file) => void uploadMedia("character-audio", file)}
                  />
                </div>
              </div>
              <div className="hanzi-media-row">
                <div>
                  <strong>例句朗读</strong>
                  <small>{characterForm.sentenceAudioUrl ? "已上传专属音频" : "当前使用浏览器朗读"}</small>
                </div>
                <HanziAudioButton
                  mediaKey="editor-sentence"
                  label="试听例句"
                  url={characterForm.sentenceAudioUrl || null}
                  fallbackText={characterForm.sentence}
                  playingMediaKey={playingMediaKey}
                  onToggle={toggleMediaPlayback}
                />
                <div className="hanzi-media-actions">
                  <button
                    type="button"
                    className="minimax-generate-button"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onClick={() => void generateMedia("sentence-audio")}
                  >
                    {uploadingMediaKey === "sentence-audio-" ? "生成中…" : "自动生成"}
                  </button>
                  <HanziUploadControl
                    label={characterForm.sentenceAudioUrl ? "替换例句" : "上传例句"}
                    accept="audio/mpeg,audio/mp4,audio/wav"
                    disabled={!editingCharacterId || uploadingMediaKey !== null}
                    onSelect={(file) => void uploadMedia("sentence-audio", file)}
                  />
                </div>
              </div>
              {(editingCharacter?.words ?? [])
                .map((word, index) => (
                  <div className="hanzi-media-row" key={`${word}-${index}`}>
                    <div>
                      <strong>词语：{word}</strong>
                      <small>{characterForm.wordAudioUrls[index] ? "已上传专属音频" : "当前使用浏览器朗读"}</small>
                    </div>
                    <HanziAudioButton
                      mediaKey={`editor-word-${index}`}
                      label="试听词语"
                      url={characterForm.wordAudioUrls[index] || null}
                      fallbackText={word}
                      playingMediaKey={playingMediaKey}
                      onToggle={toggleMediaPlayback}
                    />
                    <div className="hanzi-media-actions">
                      <button
                        type="button"
                        className="minimax-generate-button"
                        disabled={!editingCharacterId || uploadingMediaKey !== null}
                        onClick={() => void generateMedia("word-audio", index)}
                      >
                        {uploadingMediaKey === `word-audio-${index}` ? "生成中…" : "自动生成"}
                      </button>
                      <HanziUploadControl
                        label={characterForm.wordAudioUrls[index] ? "替换词音" : "上传词音"}
                        accept="audio/mpeg,audio/mp4,audio/wav"
                        disabled={!editingCharacterId || uploadingMediaKey !== null}
                        onSelect={(file) => void uploadMedia("word-audio", file, index)}
                      />
                    </div>
                  </div>
                ))}
            </section>
            <label>学习顺序<input type="number" min={0} max={1000000} value={characterForm.sortOrder} onChange={(event) => setCharacterForm({ ...characterForm, sortOrder: Number(event.target.value) })} /></label>
            <div className="form-actions field-span">
              {editingCharacterId ? <button type="button" className="ghost-button" onClick={() => { setEditingCharacterId(null); setCharacterForm(EMPTY_HANZI_CHARACTER); }}>取消编辑</button> : null}
              <button className="primary-button" disabled={libraryBusy}>{libraryBusy ? "保存中…" : editingCharacterId ? "保存修改" : "加入字库"}</button>
            </div>
          </form>
        </Panel>
        <Panel title={`基础汉字库（${totalCharacters}${searchQuery ? " 条搜索结果" : " 个"}）`}>
          <p className="admin-help">每个汉字都可以直接试听。进入资源编辑后，可以使用 MiniMax 自动生成，也可以上传文件替换。</p>
          <form className="hanzi-library-search" onSubmit={searchCharacters}>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索汉字、拼音、含义或例句" />
            <button type="submit">搜索</button>
            {searchQuery ? <button type="button" onClick={() => { setSearchInput(""); setPage(1); setSearchQuery(""); }}>清除</button> : null}
          </form>
          {libraryMessage ? <Notice>{libraryMessage}</Notice> : null}
          <div className="admin-list hanzi-library-list">
            {characters.map((item) => (
              <article className="list-card" key={item.id}>
                <div className="list-card__main">
                  <div className="hanzi-admin-media">
                    {item.imageKey !== "default-hanzi" ? (
                      <img src={item.imageKey} alt={`${item.character}配图`} loading="lazy" />
                    ) : (
                      <div className="hanzi-admin-glyph">{item.character}</div>
                    )}
                  </div>
                  <div>
                    <h3>{item.character}（{item.internalPinyin}）· {item.meaning}</h3>
                    <p>{item.words.join("、")}</p>
                    <small>{item.sentence.replace("__", item.character)}</small>
                  </div>
                </div>
                <div className="hanzi-resource-actions">
                  <div className="hanzi-resource-status">
                    <HanziAudioButton
                      mediaKey={`list-character-${item.id}`}
                      label="播放字音"
                      url={item.characterAudioUrl}
                      fallbackText={item.character}
                      playingMediaKey={playingMediaKey}
                      onToggle={toggleMediaPlayback}
                    />
                    <HanziAudioButton
                      mediaKey={`list-sentence-${item.id}`}
                      label="播放例句"
                      url={item.sentenceAudioUrl}
                      fallbackText={item.sentence.replace("__", item.character)}
                      playingMediaKey={playingMediaKey}
                      onToggle={toggleMediaPlayback}
                    />
                  </div>
                  <div className="list-card__actions">
                    <button type="button" onClick={() => { stopMediaPlayback(); setEditingCharacterId(item.id); setCharacterForm(hanziFormFrom(item)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>编辑资源</button>
                    <button type="button" className="danger-text" disabled={libraryBusy} onClick={() => void removeCharacter(item)}>删除</button>
                  </div>
                </div>
              </article>
            ))}
            {!characters.length && !libraryBusy ? <div className="empty-state">没有找到符合条件的汉字</div> : null}
            {libraryBusy && !characters.length ? <div className="empty-state">正在读取基础字库…</div> : null}
          </div>
          {totalCharacters > pageSize ? (
            <div className="hanzi-library-pagination">
              <button type="button" disabled={page <= 1 || libraryBusy} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
              <span>第 {page} / {Math.ceil(totalCharacters / pageSize)} 页</span>
              <button type="button" disabled={page >= Math.ceil(totalCharacters / pageSize) || libraryBusy} onClick={() => setPage((value) => value + 1)}>下一页</button>
            </div>
          ) : null}
        </Panel>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
    </div>
  );
}

const DEFAULT_POEM_SETTINGS: PoemLearningSettings = {
  enabled: false,
  learningWeekdays: [2, 4],
  learningTaskStars: 2,
  reviewTaskStars: 2,
};

const POEM_WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

function PoemLearning({ child }: { child: Child }) {
  const [settings, setSettings] = useState<PoemLearningSettings>(
    DEFAULT_POEM_SETTINGS,
  );
  const [progress, setProgress] = useState<
    Partial<Record<"LEARNING" | "MASTERED", number>>
  >({});
  const [poemCount, setPoemCount] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [poems, setPoems] = useState<PoemResource[]>([]);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generatingMediaKey, setGeneratingMediaKey] = useState<string | null>(
    null,
  );
  const [playingPoemId, setPlayingPoemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const activePoemAudio = useRef<HTMLAudioElement | null>(null);

  async function loadSettings() {
    const result = await parentApi.poemSettings(child.id);
    setSettings(result.settings);
    setProgress(result.progress);
    setPoemCount(result.poemCount);
    setDueCount(result.dueCount);
  }

  async function loadPoems(nextQuery = query, nextGrade = grade) {
    const result = await parentApi.poems(child.id, {
      q: nextQuery || undefined,
      grade: nextGrade || undefined,
    });
    setPoems(result.poems);
  }

  useEffect(() => {
    setError("");
    void Promise.all([loadSettings(), loadPoems("", 0)]).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "古诗学习配置加载失败"),
    );
  }, [child.id]);

  useEffect(
    () => () => {
      activePoemAudio.current?.pause();
      activePoemAudio.current = null;
    },
    [child.id],
  );

  function toggleWeekday(value: number) {
    const selected = settings.learningWeekdays.includes(value);
    const learningWeekdays = selected
      ? settings.learningWeekdays.filter((weekday) => weekday !== value)
      : [...settings.learningWeekdays, value];
    setSettings({ ...settings, learningWeekdays });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await parentApi.updatePoemSettings(child.id, settings);
      setSettings(result.settings);
      setMessage("古诗学习设置已保存");
      await loadSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "古诗学习设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await loadPoems();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "古诗库读取失败");
    } finally {
      setBusy(false);
    }
  }

  function togglePoemAudio(poem: PoemResource) {
    if (!poem.audioUrl) return;
    if (playingPoemId === poem.id) {
      activePoemAudio.current?.pause();
      activePoemAudio.current = null;
      setPlayingPoemId(null);
      return;
    }
    activePoemAudio.current?.pause();
    const audio = new Audio(poem.audioUrl);
    activePoemAudio.current = audio;
    setPlayingPoemId(poem.id);
    audio.onended = () => {
      if (activePoemAudio.current === audio) activePoemAudio.current = null;
      setPlayingPoemId(null);
    };
    audio.onerror = () => {
      if (activePoemAudio.current === audio) activePoemAudio.current = null;
      setPlayingPoemId(null);
      setError("古诗朗读加载失败，请重新生成或稍后再试");
    };
    void audio.play().catch(() => {
      if (activePoemAudio.current === audio) activePoemAudio.current = null;
      setPlayingPoemId(null);
      setError("暂时无法播放古诗朗读");
    });
  }

  async function generatePoemMedia(
    poem: PoemResource,
    kind: "image" | "audio",
  ) {
    const mediaKey = `${poem.id}-${kind}`;
    setGeneratingMediaKey(mediaKey);
    setError("");
    setMessage("");
    activePoemAudio.current?.pause();
    activePoemAudio.current = null;
    setPlayingPoemId(null);
    try {
      const result = await parentApi.generatePoemMedia(
        child.id,
        poem.id,
        kind,
      );
      setPoems((current) =>
        current.map((item) =>
          item.id === poem.id ? { ...item, ...result.poem } : item,
        ),
      );
      setMessage(
        `《${poem.title}》的${kind === "image" ? "配图" : "朗读"}已由 MiniMax 生成并替换`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动生成失败");
    } finally {
      setGeneratingMediaKey(null);
    }
  }

  return (
    <div className="admin-stack">
      <Panel title="古诗学习设置">
        <form className="admin-form poem-settings-form" onSubmit={save}>
          <label className="checkbox field-span">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                setSettings({ ...settings, enabled: event.target.checked })
              }
            />
            开启古诗学习任务
          </label>
          <div className="field-span">
            <span className="poem-settings-label">每周学习日（可多选）</span>
            <div className="poem-weekday-picker">
              {POEM_WEEKDAYS.map((weekday) => {
                const selected = settings.learningWeekdays.includes(weekday.value);
                return (
                  <button
                    type="button"
                    key={weekday.value}
                    className={selected ? "active" : ""}
                    onClick={() => toggleWeekday(weekday.value)}
                  >
                    {weekday.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label>
            学习任务星星
            <input
              type="number"
              min={1}
              max={999}
              value={settings.learningTaskStars}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  learningTaskStars: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            复习任务星星
            <input
              type="number"
              min={1}
              max={999}
              value={settings.reviewTaskStars}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  reviewTaskStars: Number(event.target.value),
                })
              }
            />
          </label>
          <div className="field-span admin-help">
            每个学习日自动安排 1 首新诗。复习按学习后第 2、4、7、15、30、60 天出现；同一天到期的古诗合并为一个复习任务。
          </div>
          <div className="form-actions field-span">
            <button className="primary-button" disabled={busy}>
              {busy ? "保存中…" : "保存设置"}
            </button>
          </div>
        </form>
        {message ? <Notice>{message}</Notice> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
      </Panel>

      <Panel title={`古诗库（${poems.length} 首）`}>
        <form className="poem-library-toolbar" onSubmit={search}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、作者或诗句"
          />
          <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
            <option value={0}>全部年级</option>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option value={value} key={value}>{value} 年级</option>
            ))}
          </select>
          <button className="ghost-button" disabled={busy}>查询</button>
        </form>
        {message ? <Notice>{message}</Notice> : null}
        <div className="table-wrap poem-library-table">
          <table>
            <thead><tr><th>年级</th><th>古诗</th><th>作者</th><th>学习状态</th><th>媒体</th></tr></thead>
            <tbody>
              {poems.map((poem) => (
                <tr key={poem.id}>
                  <td>{poem.grade} 年级{poem.semester}</td>
                  <td><strong>《{poem.title}》</strong><small>{poem.content}</small></td>
                  <td>{poem.dynasty} · {poem.author}</td>
                  <td>
                    <span className={`status status--${poem.progress?.status === "MASTERED" ? "completed" : poem.progress ? "pending" : "cancelled"}`}>
                      {poem.progress?.status === "MASTERED"
                        ? "已掌握"
                        : poem.progress
                          ? `复习 ${poem.progress.reviewStage}/6`
                          : "未学习"}
                    </span>
                    {poem.progress?.nextReviewDate ? <small>下次 {poem.progress.nextReviewDate.slice(0, 10)}</small> : null}
                  </td>
                  <td>
                    <div className="poem-media-cell">
                      {poem.imageUrl ? (
                        <img
                          src={poem.imageUrl}
                          alt={`《${poem.title}》配图`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="poem-media-placeholder">暂无配图</div>
                      )}
                      <div className="poem-media-actions">
                        <button
                          type="button"
                          className="minimax-generate-button"
                          disabled={generatingMediaKey !== null}
                          onClick={() => void generatePoemMedia(poem, "image")}
                        >
                          {generatingMediaKey === `${poem.id}-image`
                            ? "配图生成中…"
                            : poem.imageUrl
                              ? "重新生成配图"
                              : "生成配图"}
                        </button>
                        <button
                          type="button"
                          className="minimax-generate-button"
                          disabled={generatingMediaKey !== null}
                          onClick={() => void generatePoemMedia(poem, "audio")}
                        >
                          {generatingMediaKey === `${poem.id}-audio`
                            ? "朗读生成中…"
                            : poem.audioUrl
                              ? "重新生成朗读"
                              : "生成朗读"}
                        </button>
                        <button
                          type="button"
                          className="hanzi-audio-button"
                          disabled={!poem.audioUrl || generatingMediaKey !== null}
                          onClick={() => togglePoemAudio(poem)}
                        >
                          {playingPoemId === poem.id ? "停止" : "试听朗读"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!poems.length ? <div className="empty-state">没有找到符合条件的古诗</div> : null}
        </div>
      </Panel>
    </div>
  );
}

type WishForm = {
  category: Wish["category"];
  title: string;
  costStars: number;
  redemptionType: Wish["redemptionType"];
  recurrenceKind: Wish["recurrenceKind"];
  recurrenceIntervalDays: number | null;
  stockRemaining: number | null;
  isEnabled: boolean;
};
const EMPTY_WISH: WishForm = {
  category: "SPORTS",
  title: "",
  costStars: 12,
  redemptionType: "ONE_TIME",
  recurrenceKind: null,
  recurrenceIntervalDays: null,
  stockRemaining: null,
  isEnabled: true,
};

function wishRuleLabel(wish: Wish) {
  if (wish.redemptionType === "ONE_TIME") return "一次性兑换";
  if (wish.redemptionType === "STOCK") return `库存兑换 · 剩余 ${wish.stockRemaining ?? 0} 份`;
  if (wish.recurrenceKind === "DAILY") return "循环兑换 · 每天一次";
  if (wish.recurrenceKind === "WEEKLY") return "循环兑换 · 每周一次";
  return `循环兑换 · 每 ${wish.recurrenceIntervalDays ?? 1} 天一次`;
}

function wishRuleHelp(form: WishForm) {
  if (form.redemptionType === "ONE_TIME") {
    return "家长确认完成后显示“已兑换”，保留 7 天后自动从孩子端隐藏。";
  }
  if (form.redemptionType === "STOCK") {
    return "孩子申请时预占 1 份，取消兑换会自动归还；库存不会按天清零。";
  }
  return "周期从家长确认兑换完成后计算；每周以周一作为新周期起点。";
}

function Wishes({ child }: { child: Child }) {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [form, setForm] = useState<WishForm>(EMPTY_WISH);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { setWishes((await parentApi.wishes(child.id)).wishes); }
  useEffect(() => { void load(); }, [child.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (editingId) await parentApi.updateWish(child.id, editingId, form);
      else await parentApi.createWish(child.id, { ...form, sortOrder: wishes.length * 10 });
      setForm(EMPTY_WISH); setEditingId(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return (
    <div className="admin-two-column">
      <Panel title={editingId ? "编辑星愿" : "添加星愿"}>
        <form className="admin-form" onSubmit={submit}>
          <label>分类<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Wish["category"] })}><option value="SPORTS">活动体验</option><option value="TELEVISION">娱乐时间</option><option value="TOYS">物品消费</option></select></label>
          <label>兑换星数<input type="number" min={1} required value={form.costStars} onChange={(event) => setForm({ ...form, costStars: Number(event.target.value) })} /></label>
          <label className="field-span">星愿名称<input required maxLength={80} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>兑换类型
            <select
              value={form.redemptionType}
              onChange={(event) => {
                const redemptionType = event.target.value as Wish["redemptionType"];
                setForm({
                  ...form,
                  redemptionType,
                  recurrenceKind: redemptionType === "RECURRING" ? "DAILY" : null,
                  recurrenceIntervalDays: redemptionType === "RECURRING" ? 1 : null,
                  stockRemaining: redemptionType === "STOCK" ? (form.stockRemaining ?? 1) : null,
                });
              }}
            >
              <option value="ONE_TIME">一次性兑换</option>
              <option value="RECURRING">循环兑换</option>
              <option value="STOCK">库存兑换</option>
            </select>
          </label>
          {form.redemptionType === "RECURRING" && (
            <label>兑换周期
              <select
                value={form.recurrenceKind ?? "DAILY"}
                onChange={(event) => {
                  const recurrenceKind = event.target.value as NonNullable<Wish["recurrenceKind"]>;
                  setForm({
                    ...form,
                    recurrenceKind,
                    recurrenceIntervalDays:
                      recurrenceKind === "DAILY" ? 1 : recurrenceKind === "WEEKLY" ? 7 : Math.max(2, form.recurrenceIntervalDays ?? 2),
                  });
                }}
              >
                <option value="DAILY">每天一次</option>
                <option value="WEEKLY">每周一次</option>
                <option value="INTERVAL">每 N 天一次</option>
              </select>
            </label>
          )}
          {form.redemptionType === "RECURRING" && form.recurrenceKind === "INTERVAL" && (
            <label>间隔天数
              <input
                type="number"
                min={1}
                max={365}
                required
                value={form.recurrenceIntervalDays ?? 2}
                onChange={(event) => setForm({ ...form, recurrenceIntervalDays: Number(event.target.value) })}
              />
            </label>
          )}
          {form.redemptionType === "STOCK" && (
            <label>剩余库存
              <input
                type="number"
                min={0}
                max={99999}
                required
                value={form.stockRemaining ?? 0}
                onChange={(event) => setForm({ ...form, stockRemaining: Number(event.target.value) })}
              />
            </label>
          )}
          <p className="field-span wish-rule-help">{wishRuleHelp(form)}</p>
          <label className="checkbox"><input type="checkbox" checked={form.isEnabled} onChange={(event) => setForm({ ...form, isEnabled: event.target.checked })} />启用</label>
          {error && <div className="field-span"><Notice kind="error">{error}</Notice></div>}
          <div className="form-actions field-span">{editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setForm(EMPTY_WISH); }}>取消</button>}<button className="primary-button" disabled={busy}>{busy ? "保存中…" : editingId ? "保存修改" : "添加星愿"}</button></div>
        </form>
      </Panel>
      <Panel title={`星愿列表（${wishes.length}）`}>
        <div className="wish-admin-grid">
          {wishes.map((wish) => <article key={wish.id} className={`wish-admin-card wish-admin-card--${wish.category.toLowerCase()}`}><div className="wish-admin-card__art"><img src={WISH_IMAGES[wish.category]} alt="" loading="lazy" decoding="async" /></div><h3>{wish.title}</h3><p>★ {wish.costStars}</p><small>{wishRuleLabel(wish)} · {wish.isEnabled ? "已启用" : "已停用"}</small><div><button onClick={() => { setEditingId(wish.id); setForm({ category: wish.category, title: wish.title, costStars: wish.costStars, redemptionType: wish.redemptionType, recurrenceKind: wish.recurrenceKind, recurrenceIntervalDays: wish.recurrenceIntervalDays, stockRemaining: wish.stockRemaining, isEnabled: wish.isEnabled }); }}>编辑</button><button onClick={() => void parentApi.updateWish(child.id, wish.id, { isEnabled: !wish.isEnabled }).then(load)}>{wish.isEnabled ? "停用" : "启用"}</button><button className="danger-text" onClick={() => window.confirm("归档这个星愿？") && void parentApi.archiveWish(child.id, wish.id).then(load)}>归档</button></div></article>)}
        </div>
      </Panel>
    </div>
  );
}

function Redemptions({ child }: { child: Child }) {
  const [items, setItems] = useState<Redemption[]>([]);
  const [error, setError] = useState("");
  async function load() { setItems((await parentApi.redemptions(child.id)).redemptions); }
  useEffect(() => { void load(); }, [child.id]);
  async function refund(item: Redemption) {
    const reason = window.prompt("请输入退款原因，星星会自动退还") ?? undefined;
    if (!reason) return;
    try { await parentApi.updateRedemption(child.id, item.id, "CANCELLED", reason); await load(); }
    catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "处理失败"); }
  }
  return <Panel title="兑换记录">{error && <Notice kind="error">{error}</Notice>}<div className="table-wrap"><table><thead><tr><th>星愿</th><th>花费</th><th>兑换时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.titleSnapshot}</td><td>★ {item.costStarsSnapshot}</td><td>{formatDate(item.requestedAt)}</td><td><span className={`status status--${item.status.toLowerCase()}`}>{item.status === "CANCELLED" ? "已退款" : item.status === "COMPLETED" ? "已完成" : "历史待处理"}</span></td><td className="table-actions">{item.status !== "CANCELLED" && <button className="danger-text" onClick={() => void refund(item)}>退款</button>}</td></tr>)}</tbody></table>{!items.length && <div className="empty-state">还没有兑换记录</div>}</div></Panel>;
}

function Stars({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { setEntries((await parentApi.ledger(child.id)).entries); }
  useEffect(() => { void load(); }, [child.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await parentApi.adjustStars(child.id, amount, reason); setReason(""); await load(); onChanged(); }
    catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "调整失败"); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack"><Panel title="手动调整星星"><form className="inline-form" onSubmit={submit}><label>增减数量<input type="number" min={-9999} max={9999} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><label className="inline-form__wide">调整原因<input required minLength={2} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：补发线下活动奖励" /></label><button className="primary-button" disabled={busy}>{busy ? "调整中…" : "确认调整"}</button></form>{error && <Notice kind="error">{error}</Notice>}<p className="muted">正数补发会计入累计获得星星；负数扣减只影响当前余额，不会倒扣历史累计。</p></Panel><Panel title={`星星流水 · 当前余额 ${child.starBalance}`}><div className="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>变化</th><th>余额</th><th>原因</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{LEDGER_LABELS[entry.type]}</td><td className={entry.amount >= 0 ? "positive" : "negative"}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</td><td>{entry.balanceAfter}</td><td>{entry.reason ?? "—"}</td></tr>)}</tbody></table></div></Panel></div>;
}

function Planets({
  child,
  onChanged,
}: {
  child: Child;
  onChanged: () => void;
}) {
  const [planets, setPlanets] = useState<PlanetSetting[]>([]);
  const [lifetimeStars, setLifetimeStars] = useState(child.lifetimeStarsEarned);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    setError("");
    void parentApi
      .planets(child.id)
      .then((result) => {
        if (cancelled) return;
        setPlanets(result.planets);
        setLifetimeStars(result.lifetimeStarsEarned);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "航图设置读取失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [child.id]);

  function updatePlanet(
    key: PlanetKey,
    field: "requiredLifetimeStars" | "bonusStars",
    value: number,
  ) {
    setPlanets((current) =>
      current.map((planet) =>
        planet.planet === key
          ? { ...planet, [field]: Math.max(0, value || 0) }
          : planet,
      ),
    );
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const hasDescendingThreshold = planets.some(
      (planet, index) =>
        index > 0 &&
        planet.requiredLifetimeStars <
          planets[index - 1].requiredLifetimeStars,
    );
    if (hasDescendingThreshold) {
      setError("后续星球的点亮门槛不能低于前一颗星球");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await parentApi.savePlanets(
        child.id,
        planets.map(({ planet, requiredLifetimeStars, bonusStars }) => ({
          planet,
          requiredLifetimeStars,
          bonusStars,
        })),
      );
      setPlanets(result.planets);
      setLifetimeStars(result.lifetimeStarsEarned);
      setMessage("航图规则已保存。达到新门槛的星球会自动点亮。");
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "航图设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-stack">
      <Panel title="星球点亮规则">
        <div className="planet-settings-intro">
          <div>
            <span>当前永久航行能量</span>
            <strong>{lifetimeStars}</strong>
          </div>
          <p>
            点亮门槛依据孩子“历史累计获得星星”计算。星球一旦点亮就会永久保留，
            并且只发放一次加成星星；修改已点亮星球的奖励不会重复补发。
          </p>
        </div>
        {loading ? (
          <div className="empty-state">正在读取航图设置…</div>
        ) : (
          <form onSubmit={save}>
            <div className="planet-settings-grid">
              {planets.map((planet) => {
                const meta = PLANET_META[planet.planet];
                return (
                  <article
                    className={`planet-setting-card${
                      planet.unlocked ? " planet-setting-card--unlocked" : ""
                    }`}
                    key={planet.planet}
                  >
                    <div className="planet-setting-card__visual">
                      <img
                        src={meta.image}
                        alt={meta.name}
                        loading="lazy"
                        decoding="async"
                      />
                      <span>{planet.unlocked ? "已点亮" : "未点亮"}</span>
                    </div>
                    <div className="planet-setting-card__heading">
                      <h3>{meta.name}</h3>
                      <small>{meta.englishName}</small>
                    </div>
                    <label>
                      点亮所需历史星星
                      <input
                        type="number"
                        min={0}
                        max={1_000_000}
                        value={planet.requiredLifetimeStars}
                        onChange={(event) =>
                          updatePlanet(
                            planet.planet,
                            "requiredLifetimeStars",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      点亮加送星星
                      <input
                        type="number"
                        min={0}
                        max={10_000}
                        value={planet.bonusStars}
                        onChange={(event) =>
                          updatePlanet(
                            planet.planet,
                            "bonusStars",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    {planet.unlocked && (
                      <small className="planet-setting-card__awarded">
                        已实际发放 {planet.awardedBonusStars ?? 0} 颗
                        · {formatDate(planet.unlockedAt)}
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="form-actions planet-settings-actions">
              <button className="primary-button" disabled={busy}>
                {busy ? "保存中…" : "保存航图规则"}
              </button>
            </div>
          </form>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </Panel>
    </div>
  );
}

function ChildProfileSettings({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [nickname, setNickname] = useState(child.nickname ?? "");
  const [dailyStarGoal, setDailyStarGoal] = useState(child.dailyStarGoal);
  const [dailyGoalBonusEnabled, setDailyGoalBonusEnabled] = useState(child.dailyGoalBonusEnabled);
  const [dailyGoalBonusStars, setDailyGoalBonusStars] = useState(child.dailyGoalBonusStars || 1);
  const [pet, setPet] = useState(child.petType ?? "TUANTUAN");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setNickname(child.nickname ?? "");
    setDailyStarGoal(child.dailyStarGoal);
    setDailyGoalBonusEnabled(child.dailyGoalBonusEnabled);
    setDailyGoalBonusStars(child.dailyGoalBonusStars || 1);
    setPet(child.petType ?? "TUANTUAN");
  }, [child.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    await parentApi.updateChild(child.id, {
      nickname,
      dailyStarGoal,
      dailyGoalBonusEnabled,
      dailyGoalBonusStars: dailyGoalBonusEnabled ? dailyGoalBonusStars : 0,
      petType: pet
    });
    setMessage("孩子档案与每日达标奖已保存");
    onChanged();
  }

  return (
    <Panel title="孩子档案">
      <form className="admin-form" onSubmit={save}>
        <label>
          昵称
          <input minLength={2} maxLength={9} required value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <label>
          每日星星目标
          <input type="number" min={1} max={999} value={dailyStarGoal} onChange={(event) => setDailyStarGoal(Number(event.target.value))} />
        </label>
        <label>
          星宠
          <select value={pet} onChange={(event) => setPet(event.target.value)}>
            {Object.entries(PET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          达标后额外奖励
          <input
            type="number"
            min={1}
            max={999}
            disabled={!dailyGoalBonusEnabled}
            value={dailyGoalBonusStars}
            onChange={(event) => setDailyGoalBonusStars(Number(event.target.value))}
          />
        </label>
        <label className="checkbox field-span">
          <input
            type="checkbox"
            checked={dailyGoalBonusEnabled}
            onChange={(event) => setDailyGoalBonusEnabled(event.target.checked)}
          />
          启用每日目标达成奖（每天最多发放一次）
        </label>
        <p className="field-span form-help">
          当孩子当天通过任务获得的星星达到 {dailyStarGoal || 0} 颗时，自动额外奖励 {dailyGoalBonusStars || 0} 颗星。
        </p>
        <div className="form-actions"><button className="primary-button">保存档案</button></div>
      </form>
      {message && <Notice kind="success">{message}</Notice>}
      <div className="danger-zone">
        <h3>重置首次引导</h3>
        <p>孩子下次进入时会重新经历选择伙伴和产品介绍。</p>
        <button className="ghost-button" onClick={() => window.confirm("确定重置首次引导？") && void parentApi.updateChild(child.id, { resetOnboarding: true }).then(() => { setMessage("首次引导已重置"); onChanged(); })}>重置引导</button>
      </div>
    </Panel>
  );
}

function Settings({ child }: { child: Child }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void parentApi.devices(child.id)
      .then((result) => {
        if (!cancelled) setDevices(result.devices);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "登录设备读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, [child.id]);

  async function logoutAll() {
    if (!window.confirm("确定让这个孩子的所有设备退出登录？")) return;
    try {
      await parentApi.logoutAll(child.id);
      setDevices([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出设备失败");
    }
  }

  return (
    <div className="admin-stack">
      <Panel title={`登录设备（${devices.length}）`} actions={<button className="danger-button" type="button" onClick={() => void logoutAll()}>全部退出</button>}>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="device-list">
          {devices.map((device) => {
            const deviceLabel = getDeviceLabel(device);
            const browserLabel = getBrowserLabel(device.userAgent);
            return (
              <article className="device-card" key={device.id}>
                <div className="device-card__icon" aria-hidden="true">▣</div>
                <div className="device-card__body">
                  <div className="device-card__heading">
                    <strong title={deviceLabel}>{deviceLabel}</strong>
                    <span className="device-card__status">已登录</span>
                  </div>
                  <div className="device-card__meta">
                    <div><span>设备</span><strong title={deviceLabel}>{deviceLabel}</strong></div>
                    <div><span>最近活动</span><strong>{formatDate(device.lastSeenAt)}</strong></div>
                    <div><span>浏览器</span><strong title={browserLabel}>{browserLabel}</strong></div>
                  </div>
                </div>
              </article>
            );
          })}
          {!devices.length && <div className="empty-state">没有已登录设备</div>}
        </div>
      </Panel>
    </div>
  );
}

function LeaderboardSettings({ child }: { child: Child }) {
  const [settings, setSettings] = useState<LeaderboardSettingsValue>({
    competitorGrowthPercent: 100,
    dailyCompetitorStarDelta: 0,
    dailyAdjustmentDate: null,
  });
  const [preview, setPreview] = useState<LeaderboardPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    void parentApi.leaderboardSettings(child.id)
      .then((result) => {
        if (cancelled) return;
        setSettings(result.settings);
        setPreview(result.preview);
      })
      .catch((reason) => {
        if (!cancelled) {
          setMessage(reason instanceof Error ? reason.message : "排行榜设置读取失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [child.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await parentApi.updateLeaderboardSettings(child.id, {
        competitorGrowthPercent: settings.competitorGrowthPercent,
        dailyCompetitorStarDelta: settings.dailyCompetitorStarDelta,
      });
      setSettings(result.settings);
      setPreview(result.preview);
      setMessage("排行榜设置已保存，孩子端下次刷新后生效");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "排行榜设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-stack leaderboard-settings">
      <Panel title="排行榜设置">
        {loading ? <div className="empty-state">正在读取排行榜设置…</div> : (
          <form className="leaderboard-settings__form" onSubmit={save}>
            <label className="leaderboard-setting-control">
              <span><strong>对手得星速度</strong><small>调整虚拟小朋友随时间增长的速度，原有活动时间和递增过程保持不变。</small></span>
              <output>{settings.competitorGrowthPercent}%</output>
              <input type="range" min={25} max={200} step={5} value={settings.competitorGrowthPercent} onChange={(event) => setSettings({ ...settings, competitorGrowthPercent: Number(event.target.value) })} />
            </label>
            <label className="leaderboard-setting-control">
              <span><strong>今日对手星星修正</strong><small>统一增加或减少今天对手的星星，用于微调当前排名；上海时间 00:00 自动清零。</small></span>
              <output>{settings.dailyCompetitorStarDelta > 0 ? "+" : ""}{settings.dailyCompetitorStarDelta}</output>
              <input type="range" min={-50} max={50} step={1} value={settings.dailyCompetitorStarDelta} onChange={(event) => setSettings({ ...settings, dailyCompetitorStarDelta: Number(event.target.value) })} />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存并刷新预览"}</button>
              <button type="button" className="ghost-button" disabled={saving} onClick={() => setSettings({ ...settings, competitorGrowthPercent: 100, dailyCompetitorStarDelta: 0 })}>恢复默认参数</button>
            </div>
          </form>
        )}
        {message ? <Notice kind={message.includes("失败") ? "error" : "info"}>{message}</Notice> : null}
      </Panel>
      <Panel title={preview ? `当前榜单预览 · ${preview.self.rank === null ? "未上榜" : `第 ${preview.self.rank} 名`}` : "当前榜单预览"}>
        <div className="leaderboard-preview-list">
          {preview?.entries.map((entry) => (
            <div className={`leaderboard-preview-row${entry.isSelf ? " leaderboard-preview-row--self" : ""}`} key={`${entry.displayName}-${entry.rank}`}>
              <strong>{entry.rank ?? "..."}</strong>
              <span>{entry.displayName}{entry.isSelf ? "（我的孩子）" : ""}</span>
              <b>★ {entry.stars}</b>
            </div>
          ))}
          {!preview && !loading ? <div className="empty-state">暂无榜单数据</div> : null}
        </div>
      </Panel>
    </div>
  );
}

function RewardsHub({
  child,
  activeSection,
  onSelect,
  onChanged,
}: {
  child: Child;
  activeSection: Section;
  onSelect: (section: Section) => void;
  onChanged: () => void;
}) {
  const tabs: NavItem[] = NAV_GROUPS.find((group) => group.label === "奖励中心")?.items ?? [];

  return (
    <div className="admin-stack rewards-hub">
      <div className="workspace-intro">
        <div>
          <span className="workspace-intro__eyebrow">奖励中心</span>
          <h2>把星星、星愿和航图放在一起管理</h2>
          <p>先看孩子当前可用星星，再处理兑换请求或调整奖励规则。</p>
        </div>
        <div className="workspace-intro__balance">
          <span>当前可用</span>
          <strong>★ {child.starBalance}</strong>
          <small>累计获得 {child.lifetimeStarsEarned} 颗</small>
        </div>
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="奖励中心功能">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSection === tab.key}
            className={activeSection === tab.key ? "active" : ""}
            onClick={() => onSelect(tab.key)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      {activeSection === "wishes" && <Wishes child={child} />}
      {activeSection === "redemptions" && <Redemptions child={child} />}
      {activeSection === "stars" && <Stars child={child} onChanged={onChanged} />}
      {activeSection === "planets" && <Planets child={child} onChanged={onChanged} />}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [section, setSection] = useState<Section>(() => sectionFromLocation());
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.title = user === null
      ? "星宠-家长登录"
      : user === undefined
        ? "星宠-家长管理"
        : `星宠-${SECTION_LABELS[section]}`;
  }, [section, user]);

  async function loadChildren(preferredId?: string) {
    const result = await parentApi.children();
    setChildren(result.children);
    setSelectedChildId((current) =>
      preferredId ||
      (current && result.children.some((child) => child.id === current)
        ? current
        : result.children[0]?.id ?? ""),
    );
  }

  useEffect(() => {
    void staffApi.me()
      .then(({ user: current }) => {
        if (current.role !== "PARENT") throw new Error("账号角色不匹配");
        setUser(current);
        return loadChildren();
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const handleHashChange = () => setSection(sectionFromLocation());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setChildren([]);
      setSelectedChildId("");
      setError("");
    };
    window.addEventListener(PARENT_SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(PARENT_SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  useEffect(() => {
    const handleUnhandled = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      if (event.reason instanceof ApiError && event.reason.status === 401) {
        setUser(null);
        return;
      }
      setError(event.reason instanceof Error ? event.reason.message : "操作没有完成，请稍后重试");
    };
    window.addEventListener("unhandledrejection", handleUnhandled);
    return () => window.removeEventListener("unhandledrejection", handleUnhandled);
  }, []);

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) ?? children[0],
    [children, selectedChildId],
  );

  const selectSection = (nextSection: Section) => {
    setSection(nextSection);
    setMobileMenuOpen(false);
    const nextHash = `#${nextSection}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  };

  const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => item.key === section));
  const mobilePrimarySection = REWARD_SECTIONS.includes(section) ? "wishes" : section;

  if (user === undefined) return <main className="admin-loading">正在进入家长端…</main>;
  if (!user) return <LoginPage onLogin={(loggedIn) => { setUser(loggedIn); void loadChildren(); }} />;

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span>★</span><div><strong>星宠成长基地</strong><small>家长管理平台</small></div></div>
        <label className="child-switcher">当前孩子<select value={selectedChild?.id ?? ""} onChange={(event) => setSelectedChildId(event.target.value)}>{children.map((child) => <option key={child.id} value={child.id}>{child.nickname ?? `孩子 · ${child.loginCodeLastFour}`}</option>)}</select></label>
        <nav className="admin-sidebar__nav">
          {NAV_GROUPS.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-group__label">{group.label}</span>
              {group.items.map((item) => (
                <button key={item.key} className={section === item.key ? "active" : ""} onClick={() => selectSection(item.key)}>
                  <span aria-hidden="true">{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__account"><div><strong>{user.displayName}</strong><small>{user.username}</small></div><button onClick={() => void staffApi.logout().then(() => setUser(null))}>退出</button></div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <button className="mobile-menu-button" type="button" aria-label="打开管理菜单" onClick={() => setMobileMenuOpen(true)}>☰</button>
          <div className="admin-topbar__title">
            <p>{activeGroup?.label ?? "家长管理平台"} / {SECTION_LABELS[section]}</p>
            <h1>{selectedChild?.nickname ?? "孩子档案"}</h1>
            <label className="mobile-child-switcher">
              <span>当前孩子</span>
              <select value={selectedChild?.id ?? ""} onChange={(event) => setSelectedChildId(event.target.value)}>
                {children.map((child) => <option key={child.id} value={child.id}>{child.nickname ?? `孩子 · ${child.loginCodeLastFour}`}</option>)}
              </select>
            </label>
          </div>
          {selectedChild && <div className="topbar-balance"><span>当前星星</span><strong>★ {selectedChild.starBalance}</strong></div>}
        </header>
        <div className="admin-content">
          {error && <Notice kind="error">{error}</Notice>}
          {!selectedChild ? <Panel title="尚未绑定孩子"><p>请联系超级管理员创建并绑定孩子账号。</p></Panel> : <>
            {section === "overview" && <GrowthOverview child={selectedChild} />}
            {section === "history" && <History child={selectedChild} onChanged={() => void loadChildren(selectedChild.id)} />}
            {section === "tasks" && <Tasks child={selectedChild} />}
            {section === "hanzi" && <ParentHanziLearning child={selectedChild} />}
            {section === "clock" && <ParentClockLearning child={selectedChild} />}
            {section === "make-ten" && <ParentMakeTenLearning child={selectedChild} />}
            {section === "poems" && <ParentPoemLearning child={selectedChild} />}
            {REWARD_SECTIONS.includes(section) && <RewardsHub child={selectedChild} activeSection={section} onSelect={selectSection} onChanged={() => void loadChildren(selectedChild.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "刷新失败"))} />}
            {section === "ai" && <AiAssistant child={selectedChild} />}
            {section === "leaderboard" && <LeaderboardSettings child={selectedChild} />}
            {section === "profile" && <div className="admin-stack"><ChildProfileSettings child={selectedChild} onChanged={() => void loadChildren(selectedChild.id)} /></div>}
            {section === "settings" && <Settings child={selectedChild} />}
          </>}
        </div>
      </main>
      <nav className="admin-mobile-nav" aria-label="主要管理入口">
        {PRIMARY_MOBILE_NAV.map((item) => (
          <button key={item.key} type="button" className={mobilePrimarySection === item.key ? "active" : ""} onClick={() => selectSection(item.key)}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
        <button type="button" className={mobileMenuOpen ? "active" : ""} onClick={() => setMobileMenuOpen((open) => !open)}>
          <span aria-hidden="true">☰</span>更多
        </button>
      </nav>
      {mobileMenuOpen && (
        <div className="mobile-menu-layer" role="presentation" onClick={() => setMobileMenuOpen(false)}>
          <section className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="全部管理功能" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><strong>全部管理</strong><span>选择一个工作区</span></div>
              <button type="button" aria-label="关闭菜单" onClick={() => setMobileMenuOpen(false)}>×</button>
            </header>
            {NAV_GROUPS.slice(1).map((group) => (
              <div className="mobile-menu-group" key={group.label}>
                <h2>{group.label}</h2>
                <div>
                  {group.items.map((item) => (
                    <button type="button" className={section === item.key ? "active" : ""} key={item.key} onClick={() => selectSection(item.key)}>
                      <span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong><small>进入管理</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="mobile-menu-logout" onClick={() => void staffApi.logout().then(() => setUser(null))}>退出家长账号</button>
          </section>
        </div>
      )}
    </div>
  );
}
