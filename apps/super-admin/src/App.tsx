import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  ControlOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  HeartOutlined,
  MenuOutlined,
  PictureOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Input, Layout, Menu, Modal, Pagination } from "antd";
import {
  adminApi,
  staffApi,
  type AuditLog,
  type Family,
  type FamilyDataOverview,
  type Metrics,
  type StaffUser,
} from "./api";
import { AiUsageMonitoring } from "./AiUsageMonitoring";
import { PerformanceMonitoring } from "./PerformanceMonitoring";
import {
  HanziLibrary,
  MascotDialogueLibrary,
  MinimaxSettings,
  PoemLibrary,
} from "./LearningResources";
import { PetGrowthManagement } from "./PetGrowthManagement";
import { MascotAssetManagement } from "./MascotAssetManagement";
import { AiPlatformSettings } from "./AiPlatformSettings";
import { PlatformFeatureSettings } from "./PlatformFeatureSettings";
import { SystemOperations } from "./SystemOperations";
import { GrowthDataGovernance } from "./GrowthDataGovernance";

type Section =
  | "metrics"
  | "performance"
  | "ai-usage"
  | "families"
  | "children"
  | "growth-data"
  | "hanzi"
  | "poems"
  | "mascot-dialogues"
  | "minimax"
  | "pet-growth"
  | "mascot-assets"
  | "ai-settings"
  | "platform-features"
  | "system-operations"
  | "audit";

const SECTION_LABELS: Record<Section, string> = {
  metrics: "运营概览",
  performance: "性能诊断",
  "ai-usage": "模型调用",
  families: "家庭与账号",
  children: "孩子账号",
  "growth-data": "成长数据",
  hanzi: "汉字资源库",
  poems: "古诗资源库",
  "mascot-dialogues": "星宠话术",
  minimax: "MiniMax 配置",
  "pet-growth": "星宠成长",
  "mascot-assets": "星宠素材",
  "ai-settings": "AI 平台配置",
  "platform-features": "平台功能开关",
  "system-operations": "运维中心",
  audit: "审计日志",
};

const NAV_GROUPS = [
  {
    key: "operations",
    label: "运营工作台",
    icon: <DashboardOutlined />,
    children: [
      { key: "metrics", label: "运营概览", icon: <BarChartOutlined /> },
      { key: "families", label: "家庭与账号", icon: <TeamOutlined /> },
      {
        key: "children",
        label: "孩子账号",
        icon: <SafetyCertificateOutlined />,
      },
      { key: "growth-data", label: "成长数据", icon: <HeartOutlined /> },
    ],
  },
  {
    key: "content",
    label: "学习内容",
    icon: <BookOutlined />,
    children: [
      { key: "hanzi", label: "汉字资源库", icon: <ReadOutlined /> },
      { key: "poems", label: "古诗资源库", icon: <BookOutlined /> },
    ],
  },
  {
    key: "pets",
    label: "星宠运营",
    icon: <HomeOutlined />,
    children: [
      { key: "pet-growth", label: "成长与旅行", icon: <AppstoreOutlined /> },
      { key: "mascot-assets", label: "形态与动画", icon: <PictureOutlined /> },
      {
        key: "mascot-dialogues",
        label: "星宠话术",
        icon: <FileTextOutlined />,
      },
    ],
  },
  {
    key: "ai",
    label: "AI 与模型",
    icon: <RobotOutlined />,
    children: [
      { key: "ai-settings", label: "DeepSeek 配置", icon: <RobotOutlined /> },
      { key: "minimax", label: "MiniMax 配置", icon: <ControlOutlined /> },
      { key: "ai-usage", label: "调用统计", icon: <BarChartOutlined /> },
    ],
  },
  {
    key: "system",
    label: "系统运维",
    icon: <SettingOutlined />,
    children: [
      { key: "system-operations", label: "运维中心", icon: <ToolOutlined /> },
      { key: "performance", label: "性能诊断", icon: <DashboardOutlined /> },
      {
        key: "platform-features",
        label: "功能开关",
        icon: <SettingOutlined />,
      },
      { key: "audit", label: "审计日志", icon: <SafetyCertificateOutlined /> },
    ],
  },
] as const;

function readSection(): Section {
  const candidate = window.location.hash.slice(1) as Section;
  if (window.location.hash.slice(1) === "resources") return "hanzi";
  return candidate in SECTION_LABELS ? candidate : "metrics";
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

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "从未";
}

function formatLastActive(value: string | null | undefined) {
  return value ? formatDate(value) : "暂无记录";
}

function Login({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await staffApi.login(username, password);
      if (user.role !== "SUPER_ADMIN") {
        await staffApi.logout();
        throw new Error("这个账号不是超级管理员");
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
        <div className="admin-login__brand">
          <span>★</span> 星宠成长基地
        </div>
        <h1>超级管理后台</h1>
        <p>管理家庭、账号和全产品运营数据</p>
        <form onSubmit={submit}>
          <label>
            管理员用户名
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div className="admin-notice admin-notice--error">{error}</div>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? "登录中…" : "登录后台"}
          </button>
        </form>
      </section>
    </main>
  );
}

function MetricsView() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  useEffect(() => {
    void adminApi.metrics().then(setMetrics);
  }, []);
  if (!metrics)
    return (
      <Panel title="产品数据">
        <div className="empty-state">正在读取统计数据…</div>
      </Panel>
    );
  const starsIssued = metrics.stars.TASK_REWARD ?? 0;
  const starsSpent = Math.abs(metrics.stars.WISH_SPEND ?? 0);
  const starsRefunded = metrics.stars.WISH_REFUND ?? 0;
  const generatedTasks = Object.values(metrics.dailyTasks).reduce(
    (sum, value) => sum + value,
    0,
  );
  const completedDailyTasks = metrics.dailyTasks.COMPLETED ?? 0;
  const completionRate = generatedTasks
    ? Math.round((completedDailyTasks / generatedTasks) * 100)
    : 0;
  const onboardingRate = metrics.children
    ? Math.round((metrics.onboardingCompleted / metrics.children) * 100)
    : 0;
  const timedAttempts =
    metrics.attempts.timedCompleted + metrics.attempts.timedOut;
  const timedSuccessRate = timedAttempts
    ? Math.round((metrics.attempts.timedCompleted / timedAttempts) * 100)
    : 0;
  return (
    <div className="admin-stack">
      <div className="metric-grid">
        <article>
          <span>家庭数</span>
          <strong>{metrics.families}</strong>
          <small>有效家庭</small>
        </article>
        <article>
          <span>家长账号</span>
          <strong>{metrics.parents}</strong>
          <small>有效账号</small>
        </article>
        <article>
          <span>孩子账号</span>
          <strong>{metrics.children}</strong>
          <small>有效孩子</small>
        </article>
        <article>
          <span>今日活跃孩子</span>
          <strong>{metrics.activeChildren.daily}</strong>
          <small>
            WAU {metrics.activeChildren.weekly} · MAU{" "}
            {metrics.activeChildren.monthly}
          </small>
        </article>
        <article>
          <span>引导完成率</span>
          <strong>{onboardingRate}%</strong>
          <small>
            {metrics.onboardingCompleted}/{metrics.children} 个孩子
          </small>
        </article>
        <article>
          <span>任务完成率</span>
          <strong>{completionRate}%</strong>
          <small>
            {completedDailyTasks}/{generatedTasks} 个每日任务
          </small>
        </article>
        <article>
          <span>限时成功率</span>
          <strong>{timedSuccessRate}%</strong>
          <small>
            {metrics.attempts.timedCompleted} 成功 · {metrics.attempts.timedOut}{" "}
            超时
          </small>
        </article>
        <article>
          <span>放弃尝试</span>
          <strong>{metrics.attempts.abandoned}</strong>
          <small>累计主动放弃</small>
        </article>
        <article>
          <span>发放星星</span>
          <strong>{starsIssued}</strong>
          <small>任务奖励</small>
        </article>
        <article>
          <span>消耗 / 退款</span>
          <strong>{starsSpent}</strong>
          <small>退款 {starsRefunded}</small>
        </article>
      </div>
      <Panel title="兑换状态">
        <div className="summary-row">
          <div>
            <span>待安排</span>
            <strong>{metrics.redemptions.PENDING ?? 0}</strong>
          </div>
          <div>
            <span>已安排</span>
            <strong>{metrics.redemptions.ARRANGED ?? 0}</strong>
          </div>
          <div>
            <span>已完成</span>
            <strong>{metrics.redemptions.COMPLETED ?? 0}</strong>
          </div>
          <div>
            <span>已取消</span>
            <strong>{metrics.redemptions.CANCELLED ?? 0}</strong>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function CreateFamily({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [parentUsername, setParentUsername] = useState("");
  const [parentDisplayName, setParentDisplayName] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [childNickname, setChildNickname] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCodes([]);
    try {
      const result = await adminApi.createFamily({
        name,
        parent: {
          username: parentUsername,
          displayName: parentDisplayName,
          password: parentPassword,
        },
        children: [{ nickname: childNickname || undefined }],
      });
      setCodes(result.children.map((child) => child.loginCode));
      setName("");
      setParentUsername("");
      setParentDisplayName("");
      setParentPassword("");
      setChildNickname("");
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="创建家庭与首个账号"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <form className="admin-form super-create-family-form" onSubmit={submit}>
        <label className="field-span">
          家庭名称
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          家长用户名
          <input
            required
            minLength={2}
            value={parentUsername}
            onChange={(event) => setParentUsername(event.target.value)}
          />
        </label>
        <label>
          家长显示名
          <input
            required
            value={parentDisplayName}
            onChange={(event) => setParentDisplayName(event.target.value)}
          />
        </label>
        <label>
          初始密码
          <input
            required
            type="password"
            minLength={8}
            value={parentPassword}
            onChange={(event) => setParentPassword(event.target.value)}
          />
        </label>
        <label>
          第一个孩子昵称
          <input
            minLength={2}
            maxLength={9}
            value={childNickname}
            onChange={(event) => setChildNickname(event.target.value)}
            placeholder="可稍后由家长修改"
          />
        </label>
        {error && (
          <div className="field-span admin-notice admin-notice--error">
            {error}
          </div>
        )}
        <div className="form-actions field-span">
          <button className="primary-button" disabled={busy}>
            {busy ? "创建中…" : "创建家庭与账号"}
          </button>
        </div>
      </form>
      {codes.length > 0 && (
        <div className="super-create-result">
          <strong>孩子登录代码已创建：</strong>
          {codes.map((code) => (
            <code key={code}>{code}</code>
          ))}
          <button type="button" className="ghost-button" onClick={onClose}>
            完成
          </button>
        </div>
      )}
    </Modal>
  );
}

type FamilyEditor =
  | { kind: "rename-family"; value: string }
  | {
      kind: "add-parent";
      username: string;
      displayName: string;
      password: string;
    }
  | { kind: "edit-parent"; id: string; value: string }
  | { kind: "reset-parent-password"; id: string; value: string }
  | null;

function FamilyCard({
  family,
  onChanged,
  onViewData,
}: {
  family: Family;
  onChanged: () => void;
  onViewData: () => void;
}) {
  const [editor, setEditor] = useState<FamilyEditor>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState("");
  async function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setEditorBusy(true);
    setEditorError("");
    try {
      if (editor.kind === "rename-family") {
        await adminApi.updateFamily(family.id, { name: editor.value.trim() });
      } else if (editor.kind === "add-parent") {
        await adminApi.createParent(family.id, {
          username: editor.username.trim(),
          displayName: editor.displayName.trim(),
          password: editor.password,
        });
      } else if (editor.kind === "edit-parent") {
        await adminApi.updateUser(editor.id, {
          displayName: editor.value.trim(),
        });
      } else {
        await adminApi.resetPassword(editor.id, editor.value);
      }
      setEditor(null);
      onChanged();
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setEditorBusy(false);
    }
  }
  const editorTitle =
    editor?.kind === "rename-family"
      ? "修改家庭名称"
      : editor?.kind === "add-parent"
        ? "添加家长账号"
        : editor?.kind === "edit-parent"
          ? "编辑家长资料"
          : "重置家长密码";
  return (
    <>
      <Modal
        title={editorTitle}
        open={Boolean(editor)}
        footer={null}
        destroyOnHidden
        onCancel={() => {
          if (editorBusy) return;
          setEditor(null);
          setEditorError("");
        }}
      >
        {editor ? (
          <form
            className="admin-form super-account-editor"
            onSubmit={submitEditor}
          >
            {editor.kind === "add-parent" ? (
              <>
                <label>
                  用户名
                  <input
                    required
                    minLength={2}
                    value={editor.username}
                    onChange={(event) =>
                      setEditor({ ...editor, username: event.target.value })
                    }
                  />
                </label>
                <label>
                  显示名称
                  <input
                    required
                    value={editor.displayName}
                    onChange={(event) =>
                      setEditor({ ...editor, displayName: event.target.value })
                    }
                  />
                </label>
                <label className="field-span">
                  初始密码
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={editor.password}
                    onChange={(event) =>
                      setEditor({ ...editor, password: event.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <label className="field-span">
                {editor.kind === "rename-family"
                  ? "家庭名称"
                  : editor.kind === "reset-parent-password"
                    ? "新密码"
                    : "显示名称"}
                <input
                  required
                  type={
                    editor.kind === "reset-parent-password"
                      ? "password"
                      : "text"
                  }
                  minLength={editor.kind === "reset-parent-password" ? 8 : 1}
                  value={editor.value}
                  onChange={(event) =>
                    setEditor({ ...editor, value: event.target.value })
                  }
                />
              </label>
            )}
            {editor.kind === "reset-parent-password" ? (
              <p className="admin-help field-span">
                保存后，该家长当前已登录的设备会退出。
              </p>
            ) : null}
            {editorError ? (
              <div className="admin-notice admin-notice--error field-span">
                {editorError}
              </div>
            ) : null}
            <div className="form-actions field-span">
              <button
                type="button"
                className="ghost-button"
                disabled={editorBusy}
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button className="primary-button" disabled={editorBusy}>
                {editorBusy ? "保存中…" : "确认保存"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
      <article className="super-family-card">
        <header>
          <div>
            <h3>{family.name}</h3>
            <p>
              创建于 {formatDate(family.createdAt)} · {family.users.length}{" "}
              位家长 · {family.children.length} 个孩子
            </p>
          </div>
          <div className="super-account__actions">
            <span
              className={`status status--${family.status === "ACTIVE" ? "completed" : "cancelled"}`}
            >
              {family.status === "ACTIVE" ? "正常" : "已停用"}
            </span>
            <button className="primary-button" onClick={onViewData}>
              查看数据
            </button>
            <button
              onClick={() =>
                setEditor({ kind: "rename-family", value: family.name })
              }
            >
              改名
            </button>
            <button
              onClick={() =>
                void adminApi
                  .updateFamily(family.id, {
                    status: family.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                  })
                  .then(onChanged)
              }
            >
              {family.status === "ACTIVE" ? "停用家庭" : "恢复家庭"}
            </button>
            <button
              onClick={() =>
                setEditor({
                  kind: "add-parent",
                  username: "",
                  displayName: "",
                  password: "",
                })
              }
            >
              添加家长
            </button>
          </div>
        </header>
        <div className="super-family-card__body">
          <section>
            <h4>家长账号</h4>
            <div className="super-account-list">
              {family.users.map((parent) => (
                <div className="super-account" key={parent.id}>
                  <div>
                    <strong>{parent.displayName}</strong>
                    <p>
                      {parent.username} · 最后活跃{" "}
                      {formatLastActive(parent.lastActiveAt)}
                    </p>
                  </div>
                  <div className="super-account__actions">
                    <button
                      onClick={() =>
                        setEditor({
                          kind: "edit-parent",
                          id: parent.id,
                          value: parent.displayName,
                        })
                      }
                    >
                      编辑
                    </button>
                    <button
                      onClick={() =>
                        void adminApi
                          .updateUser(parent.id, {
                            status:
                              parent.status === "ACTIVE"
                                ? "DISABLED"
                                : "ACTIVE",
                          })
                          .then(onChanged)
                      }
                    >
                      {parent.status === "ACTIVE" ? "停用" : "启用"}
                    </button>
                    <button
                      onClick={() =>
                        setEditor({
                          kind: "reset-parent-password",
                          id: parent.id,
                          value: "",
                        })
                      }
                    >
                      重置密码
                    </button>
                  </div>
                </div>
              ))}
              {!family.users.length && (
                <div className="empty-state">没有家长账号</div>
              )}
            </div>
          </section>
        </div>
      </article>
    </>
  );
}

const SUPER_CATEGORY_LABELS: Record<string, string> = {
  MATH: "数学",
  EXERCISE: "运动",
  CHORES: "生活习惯",
  CHINESE: "语文",
  ENGLISH: "英语",
  OTHER: "综合任务",
};
const SUPER_WISH_CATEGORY_LABELS: Record<string, string> = {
  SPORTS: "运动",
  TELEVISION: "娱乐时间",
  TOYS: "物品消费",
  GAMES: "娱乐时间",
};
const SUPER_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  ARRANGED: "已安排",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

function FamilyOverview({
  overview,
  onBack,
}: {
  overview: FamilyDataOverview;
  onBack: () => void;
}) {
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const sectionPageSize = 8;
  function sectionPage(key: string) {
    return sectionPages[key] ?? 1;
  }
  function pageItems<T>(key: string, items: T[]) {
    const start = (sectionPage(key) - 1) * sectionPageSize;
    return items.slice(start, start + sectionPageSize);
  }
  function changeSectionPage(key: string, page: number) {
    setSectionPages((current) => ({ ...current, [key]: page }));
  }
  const totalTasks = overview.children.reduce(
    (sum, child) => sum + child.taskStats.periodTotal,
    0,
  );
  const completedTasks = overview.children.reduce(
    (sum, child) => sum + child.taskStats.periodCompleted,
    0,
  );
  const totalRedemptions = overview.children.reduce(
    (sum, child) => sum + child.redemptions.length,
    0,
  );
  return (
    <div className="admin-stack super-family-overview">
      <div className="super-detail-toolbar">
        <button className="ghost-button" type="button" onClick={onBack}>
          返回家庭列表
        </button>
        <div>
          <h2>{overview.family.name} · 数据概览</h2>
          <p>
            统计范围：{overview.from.slice(0, 10)} 至 {overview.to.slice(0, 10)}
            ，任务配置展示当前全部内容
          </p>
        </div>
      </div>
      <div className="metric-grid">
        <article>
          <span>孩子</span>
          <strong>{overview.children.length}</strong>
          <small>家庭成员</small>
        </article>
        <article>
          <span>近 30 天任务完成</span>
          <strong>
            {completedTasks}/{totalTasks}
          </strong>
          <small>
            {totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%
            完成率
          </small>
        </article>
        <article>
          <span>星星余额</span>
          <strong>
            {overview.children.reduce(
              (sum, child) => sum + child.starBalance,
              0,
            )}
          </strong>
          <small>所有孩子合计</small>
        </article>
        <article>
          <span>近 30 天兑换</span>
          <strong>{totalRedemptions}</strong>
          <small>包含已完成和已取消</small>
        </article>
      </div>
      {overview.children.map((child) => (
        <section className="super-family-overview__child" key={child.id}>
          <header>
            <div>
              <h3>{child.nickname ?? "尚未设置昵称"}</h3>
              <p>
                {child.petType ?? "未选择星宠"} · 最后活跃{" "}
                {formatLastActive(child.lastActiveAt)}
              </p>
            </div>
            <div className="super-family-overview__balances">
              <strong>★ {child.starBalance}</strong>
              <span>累计获得 {child.lifetimeStarsEarned} 星</span>
            </div>
          </header>
          <div className="super-family-overview__stats">
            <div>
              <span>今日任务</span>
              <strong>
                {child.taskStats.todayCompleted}/{child.taskStats.todayTotal}
              </strong>
            </div>
            <div>
              <span>近 30 天完成率</span>
              <strong>
                {child.taskStats.completionRate === null
                  ? "—"
                  : `${child.taskStats.completionRate}%`}
              </strong>
            </div>
            <div>
              <span>近 30 天得星</span>
              <strong>+{child.starStats.periodEarned}</strong>
            </div>
            <div>
              <span>近 30 天消费</span>
              <strong>-{child.starStats.periodSpent}</strong>
            </div>
            <div>
              <span>完成尝试</span>
              <strong>{child.taskStats.attemptsCompleted}</strong>
            </div>
            <div>
              <span>放弃尝试</span>
              <strong>{child.taskStats.attemptsAbandoned}</strong>
            </div>
          </div>
          <div className="super-family-overview__columns">
            <div>
              <h4>任务配置（{child.taskTemplates.length}）</h4>
              <div className="super-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>任务</th>
                      <th>分类</th>
                      <th>周期</th>
                      <th>星星</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems(`${child.id}-tasks`, child.taskTemplates).map((task) => (
                      <tr key={task.id}>
                        <td>{task.title}</td>
                        <td>
                          {SUPER_CATEGORY_LABELS[task.category] ??
                            task.category}
                        </td>
                        <td>
                          {task.scheduleKind === "DAILY"
                            ? "每天"
                            : task.scheduleKind === "WORKDAYS"
                              ? "工作日"
                              : task.scheduleKind === "SELECTED_WEEKDAYS"
                                ? "指定星期"
                                : "一次性"}
                        </td>
                        <td>★ {task.baseStars}</td>
                        <td>{task.isEnabled ? "启用" : "停用"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!child.taskTemplates.length && (
                  <div className="empty-state">暂无任务配置</div>
                )}
                <Pagination className="admin-pagination" current={sectionPage(`${child.id}-tasks`)} pageSize={sectionPageSize} total={child.taskTemplates.length} showSizeChanger={false} onChange={(page) => changeSectionPage(`${child.id}-tasks`, page)} />
              </div>
            </div>
            <div>
              <h4>星愿配置（{child.wishes.length}）</h4>
              <div className="super-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>星愿</th>
                      <th>分类</th>
                      <th>价格</th>
                      <th>兑换次数</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems(`${child.id}-wishes`, child.wishes).map((wish) => (
                      <tr key={wish.id}>
                        <td>{wish.title}</td>
                        <td>
                          {SUPER_WISH_CATEGORY_LABELS[wish.category] ??
                            wish.category}
                        </td>
                        <td>★ {wish.costStars}</td>
                        <td>{wish.redemptionCount}</td>
                        <td>{wish.isEnabled ? "启用" : "停用"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!child.wishes.length && (
                  <div className="empty-state">暂无星愿配置</div>
                )}
                <Pagination className="admin-pagination" current={sectionPage(`${child.id}-wishes`)} pageSize={sectionPageSize} total={child.wishes.length} showSizeChanger={false} onChange={(page) => changeSectionPage(`${child.id}-wishes`, page)} />
              </div>
            </div>
          </div>
          <div className="super-family-overview__columns">
            <div>
              <h4>最近兑换记录</h4>
              <div className="super-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>星愿</th>
                      <th>星星</th>
                      <th>状态</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems(`${child.id}-redemptions`, child.redemptions).map((item) => (
                      <tr key={item.id}>
                        <td>{item.titleSnapshot}</td>
                        <td>★ {item.costStarsSnapshot}</td>
                        <td>
                          {SUPER_STATUS_LABELS[item.status] ?? item.status}
                        </td>
                        <td>{formatDate(item.requestedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!child.redemptions.length && (
                  <div className="empty-state">暂无兑换记录</div>
                )}
                <Pagination className="admin-pagination" current={sectionPage(`${child.id}-redemptions`)} pageSize={sectionPageSize} total={child.redemptions.length} showSizeChanger={false} onChange={(page) => changeSectionPage(`${child.id}-redemptions`, page)} />
              </div>
            </div>
            <div>
              <h4>星星流水</h4>
              <div className="super-data-table">
                <table>
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>变化</th>
                      <th>余额</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems(`${child.id}-ledger`, child.ledger).map((item) => (
                      <tr key={item.id}>
                        <td>{item.reason ?? item.type}</td>
                        <td
                          className={item.amount >= 0 ? "positive" : "negative"}
                        >
                          {item.amount >= 0 ? "+" : ""}
                          {item.amount}
                        </td>
                        <td>{item.balanceAfter}</td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!child.ledger.length && (
                  <div className="empty-state">暂无星星流水</div>
                )}
                <Pagination className="admin-pagination" current={sectionPage(`${child.id}-ledger`)} pageSize={sectionPageSize} total={child.ledger.length} showSizeChanger={false} onChange={(page) => changeSectionPage(`${child.id}-ledger`, page)} />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function FamiliesView() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 12;
  const [overview, setOverview] = useState<FamilyDataOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  async function load() {
    const result = await adminApi.families({ q: query, page, pageSize });
    setFamilies(result.families);
    setTotal(result.total);
  }
  useEffect(() => {
    void load();
  }, [page, query]);
  async function viewOverview(familyId: string) {
    setOverviewLoading(true);
    try {
      setOverview(await adminApi.familyOverview(familyId));
    } catch (reason) {
      window.alert(
        reason instanceof Error ? reason.message : "家庭数据读取失败",
      );
    } finally {
      setOverviewLoading(false);
    }
  }
  if (overviewLoading)
    return (
      <Panel title="家庭数据">
        <div className="empty-state">正在读取家庭数据…</div>
      </Panel>
    );
  if (overview)
    return (
      <FamilyOverview overview={overview} onBack={() => setOverview(null)} />
    );
  return (
    <div className="admin-stack">
      <CreateFamily
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void load()}
      />
      <Panel
        title={`家庭与账号（${total}）`}
        actions={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            新增家庭
          </Button>
        }
      >
        <div className="super-toolbar">
          <Input.Search
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={(value) => { setPage(1); setQuery(value.trim()); }}
            placeholder="搜索家庭、家长或孩子"
            enterButton="搜索"
          />
          <button className="ghost-button" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <div className="super-family-grid">
          {families.map((family) => (
            <FamilyCard
              key={family.id}
              family={family}
              onChanged={() => void load()}
              onViewData={() => void viewOverview(family.id)}
            />
          ))}
          {!families.length && (
            <div className="empty-state">没有匹配的家庭</div>
          )}
        </div>
        <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger={false} showTotal={(value) => `共 ${value} 个家庭`} onChange={setPage} />
      </Panel>
    </div>
  );
}

function ChildrenView() {
  const [families, setFamilies] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<Array<{ family: { id: string; name: string }; child: Family["children"][number] }>>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    | { mode: "create"; familyId: string; nickname: string }
    | { mode: "edit"; childId: string; nickname: string }
    | null
  >(null);
  const [editorError, setEditorError] = useState("");
  const [codeResult, setCodeResult] = useState<{
    name: string;
    code: string;
  } | null>(null);
  async function load() {
    const [childrenResult, familyResult] = await Promise.all([
      adminApi.children({ q: query, page, pageSize }),
      adminApi.familyOptions(),
    ]);
    setRows(childrenResult.children);
    setTotal(childrenResult.total);
    setFamilies(familyResult.families);
  }
  useEffect(() => {
    void load();
  }, [page, query]);
  async function showCode(child: Family["children"][number]) {
    setBusyId(child.id);
    try {
      const result = await adminApi.childLoginCode(child.id);
      if (result.loginCode)
        setCodeResult({
          name: child.nickname ?? "孩子",
          code: result.loginCode,
        });
      else if (
        window.confirm(
          `旧账号目前只能确认尾号 ${result.loginCodeLastFour}。是否重置登录代码？`,
        )
      ) {
        const regenerated = await adminApi.regenerateCode(child.id);
        setCodeResult({
          name: child.nickname ?? "孩子",
          code: regenerated.loginCode,
        });
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }
  async function saveChild(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const nickname = editor.nickname.trim();
    setBusyId(editor.mode === "edit" ? editor.childId : "create");
    setEditorError("");
    try {
      if (editor.mode === "create") {
        const result = await adminApi.createChild(
          editor.familyId,
          nickname || undefined,
        );
        setCodeResult({ name: nickname || "新孩子", code: result.loginCode });
      } else {
        await adminApi.updateChild(editor.childId, nickname);
      }
      setEditor(null);
      await load();
    } catch (reason) {
      setEditorError(
        reason instanceof Error ? reason.message : "孩子账号保存失败",
      );
    } finally {
      setBusyId(null);
    }
  }
  async function resetCode(child: Family["children"][number]) {
    if (
      !window.confirm(
        "重新生成后旧登录代码立即失效，但已登录设备不会退出。继续吗？",
      )
    )
      return;
    setBusyId(child.id);
    try {
      const result = await adminApi.regenerateCode(child.id);
      setCodeResult({ name: child.nickname ?? "孩子", code: result.loginCode });
      await load();
    } finally {
      setBusyId(null);
    }
  }
  return (
    <>
      <Modal
        title={editor?.mode === "edit" ? "编辑孩子资料" : "新增孩子账号"}
        open={Boolean(editor)}
        footer={null}
        destroyOnHidden
        onCancel={() => {
          if (busyId) return;
          setEditor(null);
          setEditorError("");
        }}
      >
        {editor ? (
          <form
            className="admin-form super-account-editor"
            onSubmit={saveChild}
          >
            {editor.mode === "create" ? (
              <label className="field-span">
                所属家庭
                <select
                  required
                  value={editor.familyId}
                  onChange={(event) =>
                    setEditor({ ...editor, familyId: event.target.value })
                  }
                >
                  {families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field-span">
              孩子昵称
              <input
                required={editor.mode === "edit"}
                minLength={2}
                maxLength={9}
                value={editor.nickname}
                placeholder={
                  editor.mode === "create"
                    ? "可留空，稍后由家长设置"
                    : undefined
                }
                onChange={(event) =>
                  setEditor({ ...editor, nickname: event.target.value })
                }
              />
            </label>
            {editorError ? (
              <div className="admin-notice admin-notice--error field-span">
                {editorError}
              </div>
            ) : null}
            <div className="form-actions field-span">
              <button
                type="button"
                className="ghost-button"
                disabled={Boolean(busyId)}
                onClick={() => setEditor(null)}
              >
                取消
              </button>
              <button className="primary-button" disabled={Boolean(busyId)}>
                {busyId ? "保存中…" : "确认保存"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
      <Panel
        title={`孩子账号（${total}）`}
        actions={
          <div className="form-actions">
            <Button onClick={() => void load()}>刷新</Button>
            <Button
              type="primary"
              disabled={!families.length}
              onClick={() =>
                setEditor({
                  mode: "create",
                  familyId: families[0]?.id ?? "",
                  nickname: "",
                })
              }
            >
              新增孩子
            </Button>
          </div>
        }
      >
        <div className="super-toolbar">
          <Input.Search
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={(value) => { setPage(1); setQuery(value.trim()); }}
            placeholder="搜索家庭、昵称或代码尾号"
            enterButton="搜索"
          />
        </div>
        {codeResult ? (
          <div className="super-create-result">
            <strong>{codeResult.name}的探险代码</strong>
            <code>{codeResult.code}</code>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                void navigator.clipboard.writeText(codeResult.code)
              }
            >
              复制
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setCodeResult(null)}
            >
              关闭
            </button>
          </div>
        ) : null}
        <div className="table-wrap responsive-card-table">
          <table>
            <thead>
              <tr>
                <th>孩子</th>
                <th>所属家庭</th>
                <th>星宠</th>
                <th>登录代码</th>
                <th>最后活跃</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ family, child }) => (
                <tr key={child.id}>
                  <td data-label="孩子">
                    <strong>{child.nickname ?? "未设置昵称"}</strong>
                  </td>
                  <td data-label="所属家庭">{family.name}</td>
                  <td data-label="星宠">{child.petType ?? "未选择"}</td>
                  <td data-label="登录代码">尾号 {child.loginCodeLastFour}</td>
                  <td data-label="最后活跃">
                    {formatLastActive(child.lastActiveAt)}
                  </td>
                  <td data-label="状态">
                    <span
                      className={`status status--${child.status === "ACTIVE" ? "completed" : "cancelled"}`}
                    >
                      {child.status === "ACTIVE" ? "正常" : "已停用"}
                    </span>
                  </td>
                  <td data-label="操作">
                    <div className="list-card__actions">
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyId === child.id}
                        onClick={() =>
                          setEditor({
                            mode: "edit",
                            childId: child.id,
                            nickname: child.nickname ?? "",
                          })
                        }
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyId === child.id}
                        onClick={() => void showCode(child)}
                      >
                        查看代码
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyId === child.id}
                        onClick={() =>
                          void adminApi
                            .setChildStatus(
                              child.id,
                              child.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                            )
                            .then(load)
                        }
                      >
                        {child.status === "ACTIVE" ? "停用" : "启用"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busyId === child.id}
                        onClick={() => void resetCode(child)}
                      >
                        重置代码
                      </button>
                      <button
                        type="button"
                        className="danger-text"
                        disabled={busyId === child.id}
                        onClick={() =>
                          window.confirm("让这个孩子的所有设备退出登录？") &&
                          void adminApi.logoutChild(child.id)
                        }
                      >
                        设备全退
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <div className="empty-state">没有匹配的孩子账号</div>
          ) : null}
        </div>
        <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger={false} showTotal={(value) => `共 ${value} 个孩子`} onChange={setPage} />
      </Panel>
    </>
  );
}

function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  async function load() {
    const result = await adminApi.auditLogs(page, pageSize);
    setLogs(result.logs);
    setTotal(result.total);
  }
  useEffect(() => {
    void load();
  }, [page]);
  return (
    <Panel
      title="审计日志"
      actions={
        <button className="ghost-button" onClick={() => void load()}>
          刷新
        </button>
      }
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>资源</th>
              <th>家庭</th>
              <th>IP</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.createdAt)}</td>
                <td>
                  {log.actorType} · {log.actorId?.slice(-6) ?? "系统"}
                </td>
                <td>{log.action}</td>
                <td>
                  {log.resourceType} · {log.resourceId?.slice(-6) ?? "—"}
                </td>
                <td>{log.familyId?.slice(-6) ?? "—"}</td>
                <td>{log.ipAddress ?? "—"}</td>
                <td>
                  <span className="audit-json">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination className="admin-pagination" current={page} pageSize={pageSize} total={total} showSizeChanger={false} showTotal={(value) => `共 ${value} 条记录`} onChange={setPage} />
    </Panel>
  );
}

export function App() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [section, setSection] = useState<Section>(readSection);
  const [error, setError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    document.title =
      user === null
        ? "星宠-超级后台登录"
        : user === undefined
          ? "星宠-超级后台"
          : `星宠-${SECTION_LABELS[section]}`;
  }, [section, user]);
  useEffect(() => {
    window.history.replaceState({ section }, "", `#${section}`);
  }, [section]);
  useEffect(() => {
    const onHashChange = () => setSection(readSection());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    void staffApi
      .me()
      .then(({ user: current }) =>
        current.role === "SUPER_ADMIN" ? setUser(current) : setUser(null),
      )
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    const handleUnhandled = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setError(
        event.reason instanceof Error
          ? event.reason.message
          : "操作没有完成，请稍后重试",
      );
    };
    window.addEventListener("unhandledrejection", handleUnhandled);
    return () =>
      window.removeEventListener("unhandledrejection", handleUnhandled);
  }, []);
  if (user === undefined)
    return <main className="admin-loading">正在进入超级后台…</main>;
  if (!user) return <Login onLogin={setUser} />;
  const selectSection = (value: Section) => {
    setSection(value);
    setMobileMenuOpen(false);
    if (window.location.hash !== `#${value}`) window.location.hash = value;
  };
  const menuItems = NAV_GROUPS.map((group) => ({
    key: group.key,
    icon: group.icon,
    label: group.label,
    children: group.children.map((item) => ({ ...item })),
  }));
  const content = (
    <>
      {error && (
        <div
          className="admin-notice admin-notice--error"
          onClick={() => setError("")}
        >
          {error} · 点击关闭
        </div>
      )}
      {section === "metrics" && <MetricsView />}
      {section === "performance" && <PerformanceMonitoring />}
      {section === "ai-usage" && <AiUsageMonitoring />}
      {section === "families" && <FamiliesView />}
      {section === "children" && <ChildrenView />}
      {section === "growth-data" && <GrowthDataGovernance />}
      {section === "hanzi" && <HanziLibrary />}
      {section === "poems" && <PoemLibrary />}
      {section === "mascot-dialogues" && <MascotDialogueLibrary />}
      {section === "minimax" && <MinimaxSettings />}
      {section === "pet-growth" && <PetGrowthManagement />}
      {section === "mascot-assets" && <MascotAssetManagement />}
      {section === "ai-settings" && <AiPlatformSettings />}
      {section === "platform-features" && <PlatformFeatureSettings />}
      {section === "system-operations" && <SystemOperations />}
      {section === "audit" && <AuditView />}
    </>
  );
  return (
    <Layout className="admin-app super-app super-admin-framework">
      <Layout.Sider
        className="admin-sidebar"
        width={272}
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
      >
        <div className="admin-brand">
          <span>★</span>
          <div>
            <strong>星宠成长基地</strong>
            <small>超级管理后台</small>
          </div>
        </div>
        <Menu
          className="admin-sidebar__nav"
          theme="dark"
          mode="inline"
          selectedKeys={[section]}
          defaultOpenKeys={NAV_GROUPS.map((group) => group.key)}
          items={menuItems}
          onClick={({ key }) => selectSection(key as Section)}
        />
        <div className="admin-sidebar__account">
          <div>
            <strong>{user.displayName}</strong>
            <small>{user.username}</small>
          </div>
          <button
            onClick={() => void staffApi.logout().then(() => setUser(null))}
          >
            退出
          </button>
        </div>
      </Layout.Sider>
      <Layout className="admin-main">
        <Layout.Header className="admin-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="打开管理菜单"
            onClick={() => setMobileMenuOpen(true)}
          >
            <MenuOutlined />
          </button>
          <div>
            <p>超级后台 / {SECTION_LABELS[section]}</p>
            <h1>{SECTION_LABELS[section]}</h1>
          </div>
          <div className="topbar-balance">
            <span>系统状态</span>
            <strong>正常</strong>
          </div>
        </Layout.Header>
        <Layout.Content className="admin-content">{content}</Layout.Content>
      </Layout>
      <Drawer
        title="超级后台"
        placement="left"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        width={300}
      >
        <Menu
          mode="inline"
          selectedKeys={[section]}
          defaultOpenKeys={NAV_GROUPS.map((group) => group.key)}
          items={menuItems}
          onClick={({ key }) => selectSection(key as Section)}
        />
      </Drawer>
    </Layout>
  );
}
