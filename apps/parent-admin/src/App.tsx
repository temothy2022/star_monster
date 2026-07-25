import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  PARENT_SESSION_EXPIRED_EVENT,
  parentApi,
  staffApi,
  type Child,
  type Device,
  type LedgerEntry,
  type PlanetKey,
  type PlanetSetting,
  type Redemption,
  type StaffUser,
  type TaskHistoryItem,
  type TaskTemplate,
  type Wish,
} from "./api";
import { AiAssistant } from "./AiAssistant";
import sportsReward from "../../design-lab/src/assets/reward-categories/sports.png";
import gamesReward from "../../design-lab/src/assets/reward-categories/games.png";
import televisionReward from "../../design-lab/src/assets/reward-categories/television.png";
import toysReward from "../../design-lab/src/assets/reward-categories/toys.png";
import earthPlanet from "../../design-lab/src/assets/planets/earth.png";
import jupiterPlanet from "../../design-lab/src/assets/planets/jupiter.png";
import marsPlanet from "../../design-lab/src/assets/planets/mars.png";
import mercuryPlanet from "../../design-lab/src/assets/planets/mercury.png";
import neptunePlanet from "../../design-lab/src/assets/planets/neptune.png";
import saturnPlanet from "../../design-lab/src/assets/planets/saturn.png";
import uranusPlanet from "../../design-lab/src/assets/planets/uranus.png";
import venusPlanet from "../../design-lab/src/assets/planets/venus.png";

type Section =
  | "overview"
  | "history"
  | "tasks"
  | "wishes"
  | "redemptions"
  | "stars"
  | "planets"
  | "ai"
  | "settings";

const SECTION_LABELS: Record<Section, string> = {
  overview: "数据概览",
  history: "任务历史",
  tasks: "任务管理",
  wishes: "星愿管理",
  redemptions: "兑换处理",
  stars: "星星流水",
  planets: "航图设置",
  ai: "AI 育儿助手",
  settings: "孩子设置",
};

const LEDGER_LABELS: Record<LedgerEntry["type"], string> = {
  TASK_REWARD: "任务奖励",
  DAILY_GOAL_BONUS: "每日达标奖",
  PLANET_BONUS: "星球点亮奖",
  WISH_SPEND: "兑换支出",
  WISH_REFUND: "兑换退款",
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
  READING: "阅读",
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "家务",
  ORGANIZING: "整理",
  MUSIC: "音乐",
  CHINESE: "语文",
  ENGLISH: "英语",
  PE: "体育",
  OTHER: "其他",
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

function Overview({ child }: { child: Child }) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof parentApi.stats>> | null>(null);
  useEffect(() => {
    void parentApi.stats(child.id).then(setStats).catch(() => setStats(null));
  }, [child.id]);

  const completed = stats?.taskInstances.completed ?? 0;
  const expired = stats?.tasks.EXPIRED ?? 0;
  const total = stats?.taskInstances.total ?? 0;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const timeout = stats?.attempts.find((item) => item.status === "TIMED_OUT")?.count ?? 0;
  const abandoned = stats?.attempts.find((item) => item.status === "ABANDONED")?.count ?? 0;

  return (
    <div className="admin-stack">
      <div className="metric-grid">
        <article><span>当前星星</span><strong>{child.starBalance}</strong><small>可用于兑换</small></article>
        <article><span>累计获得星星</span><strong>{child.lifetimeStarsEarned}</strong><small>只增不减</small></article>
        <article><span>近 30 天完成率</span><strong>{completionRate}%</strong><small>{completed}/{total} 个任务</small></article>
        <article><span>每日目标</span><strong>{child.dailyStarGoal}</strong><small>星星/天</small></article>
      </div>
      <Panel title="任务状态摘要">
        <div className="summary-row">
          <div><span>已完成</span><strong>{completed}</strong></div>
          <div><span>未完成/过期</span><strong>{expired}</strong></div>
          <div><span>限时超时</span><strong>{timeout}</strong></div>
          <div><span>主动放弃</span><strong>{abandoned}</strong></div>
        </div>
      </Panel>
      <Panel title="孩子档案">
        <dl className="detail-list">
          <div><dt>昵称</dt><dd>{child.nickname ?? "尚未设置"}</dd></div>
          <div><dt>星宠</dt><dd>{child.petType ? PET_LABELS[child.petType] : "尚未选择"}</dd></div>
          <div><dt>首次引导</dt><dd>{child.onboardingCompletedAt ? "已完成" : "未完成"}</dd></div>
          <div><dt>最近登录</dt><dd>{formatDate(child.lastLoginAt)}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}

function History({ child }: { child: Child }) {
  const [days, setDays] = useState(30);
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          <p>包含完成、未完成、限时超时、放弃、执行时长和奖励明细</p>
        </div>
        <div>{[7, 30, 90].map((range) => <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>近 {range} 天</button>)}</div>
      </div>
      <div className="metric-grid">
        <article><span>已完成</span><strong>{completed}</strong><small>共 {tasks.length} 个每日任务</small></article>
        <article><span>限时超时 / 放弃</span><strong>{timedOut + abandoned}</strong><small>{timedOut} 超时 · {abandoned} 放弃</small></article>
        <article><span>任务奖励</span><strong>{stars}</strong><small>基础与加成星星</small></article>
        <article><span>累计执行</span><strong>{Math.round(elapsed / 60)}</strong><small>分钟</small></article>
      </div>
      <Panel title={`任务明细 · 近 ${days} 天`}>
        {error && <Notice kind="error">{error}</Notice>}
        {loading ? <div className="empty-state">正在读取任务历史…</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>日期</th><th>任务</th><th>分类 / 类型</th><th>结果</th><th>尝试</th><th>完成用时 / 总执行</th><th>奖励</th></tr></thead>
              <tbody>{tasks.map((task) => {
                const taskElapsed = task.attempts.reduce((sum, attempt) => sum + (attempt.elapsedSeconds ?? 0), 0);
                const taskStars = task.attempts.reduce((sum, attempt) => sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded, 0);
                const exception = task.attempts.some((attempt) => attempt.status === "TIMED_OUT")
                  ? " · 有超时"
                  : task.attempts.some((attempt) => attempt.status === "ABANDONED")
                    ? " · 有放弃"
                    : "";
                const hasCompletion = task.attempts.some((attempt) => attempt.status === "COMPLETED");
                return <tr key={task.id}><td>{task.taskDate.slice(0, 10)}</td><td><strong>{task.titleSnapshot}</strong></td><td>{CATEGORY_LABELS[task.categorySnapshot] ?? task.categorySnapshot} · {task.modeSnapshot === "TIMED" ? "限时" : "不限时"}{task.repeatableDailySnapshot ? " · 可重复" : ""}</td><td><span className={`status status--${hasCompletion ? "completed" : task.status === "EXPIRED" ? "cancelled" : "pending"}`}>{outcomeLabel(task)}{exception}</span></td><td>{task.attempts.length}</td><td>{formatElapsed(task.completionDurationSeconds)} / {formatElapsed(taskElapsed)}</td><td className={taskStars > 0 ? "positive" : ""}>{taskStars > 0 ? `+${taskStars}` : "—"}</td></tr>;
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
  return {
    title: form.title,
    category: form.category,
    iconKey: form.category.toLowerCase(),
    mode: form.mode,
    suggestedSeconds: form.mode === "UNTIMED" ? form.durationMinutes * 60 : null,
    timeLimitSeconds: form.mode === "TIMED" ? form.durationMinutes * 60 : null,
    baseStars: form.baseStars,
    earlyBonusEnabled: form.mode === "TIMED" && form.earlyBonusEnabled,
    earlyThresholdSeconds: form.mode === "TIMED" && form.earlyBonusEnabled ? form.earlyThresholdMinutes * 60 : null,
    earlyBonusStars: form.mode === "TIMED" && form.earlyBonusEnabled ? form.earlyBonusStars : null,
    repeatableDaily: form.repeatableDaily,
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        await parentApi.createTemplate(child.id, taskPayload(form, templates.length * 10));
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

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= templates.length) return;
    const reordered = [...templates];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    await parentApi.reorderTemplates(child.id, reordered.map((item, order) => ({ id: item.id, sortOrder: order * 10 })));
    await load();
  }

  return (
    <div className="admin-two-column">
      <Panel title={editingId ? "编辑任务" : "添加任务"}>
        <form className="admin-form" onSubmit={submit}>
          <label className="field-span">任务名称<input required maxLength={80} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>分类<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>任务类型<select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as TaskForm["mode"] })}><option value="UNTIMED">不限时</option><option value="TIMED">限时任务</option></select></label>
          <label>{form.mode === "TIMED" ? "倒计时（分钟）" : "建议时长（分钟）"}<input type="number" min={1} max={1440} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>
          <label>基础星星<input type="number" min={1} max={999} value={form.baseStars} onChange={(event) => setForm({ ...form, baseStars: Number(event.target.value) })} /></label>
          {form.mode === "TIMED" && <label className="checkbox field-span"><input type="checkbox" checked={form.earlyBonusEnabled} onChange={(event) => setForm({ ...form, earlyBonusEnabled: event.target.checked })} />启用提前完成加奖</label>}
          {form.mode === "TIMED" && form.earlyBonusEnabled && <>
            <label>剩余至少（分钟）<input type="number" min={1} value={form.earlyThresholdMinutes} onChange={(event) => setForm({ ...form, earlyThresholdMinutes: Number(event.target.value) })} /></label>
            <label>额外星星<input type="number" min={1} value={form.earlyBonusStars} onChange={(event) => setForm({ ...form, earlyBonusStars: Number(event.target.value) })} /></label>
          </>}
          <label className="checkbox field-span"><input type="checkbox" checked={form.repeatableDaily} onChange={(event) => setForm({ ...form, repeatableDaily: event.target.checked })} />当天可反复完成并领取奖励（不限制次数）</label>
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
          {templates.map((template, index) => (
            <article className="list-card" key={template.id}>
              <div className="list-card__main"><div className={`category-dot category-dot--${template.category.toLowerCase()}`} /><div><h3>{template.title}</h3><p>{CATEGORY_LABELS[template.category]} · {template.mode === "TIMED" ? `限时 ${(template.timeLimitSeconds ?? 0) / 60} 分钟` : `建议 ${(template.suggestedSeconds ?? 0) / 60} 分钟`} · +{template.baseStars}{template.earlyBonusEnabled ? ` + ${template.earlyBonusStars} 加奖` : ""}</p><small>{template.scheduleKind === "DAILY" ? "每天" : template.scheduleKind === "WORKDAYS" ? "工作日" : template.scheduleKind === "ONE_TIME" ? `一次性 ${template.oneTimeDate?.slice(0, 10)}` : `每周 ${template.weekdays.join("、")}`} · {template.repeatableDaily ? "当天可重复领取 · " : ""}{template.isEnabled ? "已启用" : "已停用"}{template.aiSchedulingEnabled ? " · AI 排班" : ""}</small></div></div>
              <div className="list-card__actions">
                <button title="上移" disabled={index === 0} onClick={() => void move(index, -1)}>↑</button>
                <button title="下移" disabled={index === templates.length - 1} onClick={() => void move(index, 1)}>↓</button>
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
          <label>固定分类<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Wish["category"] })}><option value="SPORTS">运动</option><option value="GAMES">游戏</option><option value="TELEVISION">电视</option><option value="TOYS">玩具</option></select></label>
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
          {wishes.map((wish) => <article key={wish.id} className={`wish-admin-card wish-admin-card--${wish.category.toLowerCase()}`}><div className="wish-admin-card__art"><img src={WISH_IMAGES[wish.category]} alt="" /></div><h3>{wish.title}</h3><p>★ {wish.costStars}</p><small>{wishRuleLabel(wish)} · {wish.isEnabled ? "已启用" : "已停用"}</small><div><button onClick={() => { setEditingId(wish.id); setForm({ category: wish.category, title: wish.title, costStars: wish.costStars, redemptionType: wish.redemptionType, recurrenceKind: wish.recurrenceKind, recurrenceIntervalDays: wish.recurrenceIntervalDays, stockRemaining: wish.stockRemaining, isEnabled: wish.isEnabled }); }}>编辑</button><button onClick={() => void parentApi.updateWish(child.id, wish.id, { isEnabled: !wish.isEnabled }).then(load)}>{wish.isEnabled ? "停用" : "启用"}</button><button className="danger-text" onClick={() => window.confirm("归档这个星愿？") && void parentApi.archiveWish(child.id, wish.id).then(load)}>归档</button></div></article>)}
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
  async function update(item: Redemption, status: "ARRANGED" | "COMPLETED" | "CANCELLED") {
    let reason: string | undefined;
    if (status === "CANCELLED") {
      reason = window.prompt("请输入取消原因，星星会自动退还") ?? undefined;
      if (!reason) return;
    }
    try { await parentApi.updateRedemption(child.id, item.id, status, reason); await load(); }
    catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "处理失败"); }
  }
  return <Panel title="兑换申请">{error && <Notice kind="error">{error}</Notice>}<div className="table-wrap"><table><thead><tr><th>星愿</th><th>花费</th><th>申请时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.titleSnapshot}</td><td>★ {item.costStarsSnapshot}</td><td>{formatDate(item.requestedAt)}</td><td><span className={`status status--${item.status.toLowerCase()}`}>{item.status === "PENDING" ? "待安排" : item.status === "ARRANGED" ? "已安排" : item.status === "COMPLETED" ? "已完成" : "已取消"}</span></td><td className="table-actions">{item.status === "PENDING" && <button onClick={() => void update(item, "ARRANGED")}>标记已安排</button>}{item.status === "ARRANGED" && <button onClick={() => void update(item, "COMPLETED")}>完成</button>}{!["COMPLETED","CANCELLED"].includes(item.status) && <button className="danger-text" onClick={() => void update(item, "CANCELLED")}>取消并退款</button>}</td></tr>)}</tbody></table>{!items.length && <div className="empty-state">还没有兑换申请</div>}</div></Panel>;
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
  return <div className="admin-stack"><Panel title="手动调整星星"><form className="inline-form" onSubmit={submit}><label>增减数量<input type="number" min={-9999} max={9999} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><label className="inline-form__wide">调整原因<input required minLength={2} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：补发线下活动奖励" /></label><button className="primary-button" disabled={busy}>{busy ? "调整中…" : "确认调整"}</button></form>{error && <Notice kind="error">{error}</Notice>}<p className="muted">手动调整只影响当前余额，不会修改累计获得星星。</p></Panel><Panel title={`星星流水 · 当前余额 ${child.starBalance}`}><div className="table-wrap"><table><thead><tr><th>时间</th><th>类型</th><th>变化</th><th>余额</th><th>原因</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{LEDGER_LABELS[entry.type]}</td><td className={entry.amount >= 0 ? "positive" : "negative"}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</td><td>{entry.balanceAfter}</td><td>{entry.reason ?? "—"}</td></tr>)}</tbody></table></div></Panel></div>;
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
                      <img src={meta.image} alt={meta.name} />
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

function Settings({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const [nickname, setNickname] = useState(child.nickname ?? "");
  const [dailyStarGoal, setDailyStarGoal] = useState(child.dailyStarGoal);
  const [dailyGoalBonusEnabled, setDailyGoalBonusEnabled] = useState(child.dailyGoalBonusEnabled);
  const [dailyGoalBonusStars, setDailyGoalBonusStars] = useState(child.dailyGoalBonusStars || 1);
  const [pet, setPet] = useState(child.petType ?? "TUANTUAN");
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setNickname(child.nickname ?? "");
    setDailyStarGoal(child.dailyStarGoal);
    setDailyGoalBonusEnabled(child.dailyGoalBonusEnabled);
    setDailyGoalBonusStars(child.dailyGoalBonusStars || 1);
    setPet(child.petType ?? "TUANTUAN");
    void parentApi.devices(child.id).then((result) => setDevices(result.devices));
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
    <div className="admin-two-column">
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
              {Object.entries(PET_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
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
      <Panel title={`登录设备（${devices.length}）`} actions={<button className="danger-button" onClick={() => window.confirm("确定让这个孩子的所有设备退出登录？") && void parentApi.logoutAll(child.id).then(() => setDevices([]))}>全部退出</button>}>
        <div className="admin-list">
          {devices.map((device) => <article className="device-card" key={device.id}><strong>{device.deviceName ?? "未知设备"}</strong><p>{device.userAgent ?? "无浏览器信息"}</p><small>{device.ipAddress ?? "未知 IP"} · 最近活动 {formatDate(device.lastSeenAt)}</small></article>)}
          {!devices.length && <div className="empty-state">没有已登录设备</div>}
        </div>
      </Panel>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [section, setSection] = useState<Section>("overview");
  const [error, setError] = useState("");

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

  if (user === undefined) return <main className="admin-loading">正在进入家长端…</main>;
  if (!user) return <LoginPage onLogin={(loggedIn) => { setUser(loggedIn); void loadChildren(); }} />;

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span>★</span><div><strong>星宠成长基地</strong><small>家长管理平台</small></div></div>
        <label className="child-switcher">当前孩子<select value={selectedChild?.id ?? ""} onChange={(event) => setSelectedChildId(event.target.value)}>{children.map((child) => <option key={child.id} value={child.id}>{child.nickname ?? `孩子 · ${child.loginCodeLastFour}`}</option>)}</select></label>
        <nav>{(Object.keys(SECTION_LABELS) as Section[]).map((key) => <button key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)}><span>{key === "overview" ? "⌂" : key === "history" ? "≡" : key === "tasks" ? "✓" : key === "wishes" ? "☆" : key === "redemptions" ? "↔" : key === "stars" ? "★" : key === "planets" ? "◎" : key === "ai" ? "✦" : "⚙"}</span>{SECTION_LABELS[key]}</button>)}</nav>
        <div className="admin-sidebar__account"><div><strong>{user.displayName}</strong><small>{user.username}</small></div><button onClick={() => void staffApi.logout().then(() => setUser(null))}>退出</button></div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar"><div><p>家长管理平台 / {SECTION_LABELS[section]}</p><h1>{selectedChild?.nickname ?? "孩子档案"}</h1></div>{selectedChild && <div className="topbar-balance"><span>当前星星</span><strong>★ {selectedChild.starBalance}</strong></div>}</header>
        <div className="admin-content">
          {error && <Notice kind="error">{error}</Notice>}
          {!selectedChild ? <Panel title="尚未绑定孩子"><p>请联系超级管理员创建并绑定孩子账号。</p></Panel> : <>
            {section === "overview" && <Overview child={selectedChild} />}
            {section === "history" && <History child={selectedChild} />}
            {section === "tasks" && <Tasks child={selectedChild} />}
            {section === "wishes" && <Wishes child={selectedChild} />}
            {section === "redemptions" && <Redemptions child={selectedChild} />}
            {section === "stars" && <Stars child={selectedChild} onChanged={() => void loadChildren(selectedChild.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "刷新失败"))} />}
            {section === "planets" && <Planets child={selectedChild} onChanged={() => void loadChildren(selectedChild.id).catch((reason) => setError(reason instanceof ApiError ? reason.message : "刷新失败"))} />}
            {section === "ai" && <AiAssistant child={selectedChild} />}
            {section === "settings" && <Settings child={selectedChild} onChanged={() => void loadChildren(selectedChild.id)} />}
          </>}
        </div>
      </main>
    </div>
  );
}
