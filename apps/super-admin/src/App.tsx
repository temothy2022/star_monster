import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  adminApi,
  staffApi,
  type AuditLog,
  type Family,
  type Metrics,
  type StaffUser,
} from "./api";
import { PerformanceMonitoring } from "./PerformanceMonitoring";

type Section = "metrics" | "performance" | "families" | "audit";

function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return <section className="admin-panel"><header className="admin-panel__header"><h2>{title}</h2>{actions}</header>{children}</section>;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "从未";
}

function Login({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { user } = await staffApi.login(username, password);
      if (user.role !== "SUPER_ADMIN") { await staffApi.logout(); throw new Error("这个账号不是超级管理员"); }
      onLogin(user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); }
    finally { setBusy(false); }
  }
  return <main className="admin-login"><section className="admin-login__card"><div className="admin-login__brand"><span>★</span> 星宠成长基地</div><h1>超级管理后台</h1><p>管理家庭、账号和全产品运营数据</p><form onSubmit={submit}><label>管理员用户名<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <div className="admin-notice admin-notice--error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? "登录中…" : "登录后台"}</button></form></section></main>;
}

function MetricsView() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  useEffect(() => { void adminApi.metrics().then(setMetrics); }, []);
  if (!metrics) return <Panel title="产品数据"><div className="empty-state">正在读取统计数据…</div></Panel>;
  const starsIssued = metrics.stars.TASK_REWARD ?? 0;
  const starsSpent = Math.abs(metrics.stars.WISH_SPEND ?? 0);
  const starsRefunded = metrics.stars.WISH_REFUND ?? 0;
  const generatedTasks = Object.values(metrics.dailyTasks).reduce((sum, value) => sum + value, 0);
  const completedDailyTasks = metrics.dailyTasks.COMPLETED ?? 0;
  const completionRate = generatedTasks ? Math.round((completedDailyTasks / generatedTasks) * 100) : 0;
  const onboardingRate = metrics.children ? Math.round((metrics.onboardingCompleted / metrics.children) * 100) : 0;
  const timedAttempts = metrics.attempts.timedCompleted + metrics.attempts.timedOut;
  const timedSuccessRate = timedAttempts ? Math.round((metrics.attempts.timedCompleted / timedAttempts) * 100) : 0;
  return <div className="admin-stack"><div className="metric-grid"><article><span>家庭数</span><strong>{metrics.families}</strong><small>有效家庭</small></article><article><span>家长账号</span><strong>{metrics.parents}</strong><small>有效账号</small></article><article><span>孩子账号</span><strong>{metrics.children}</strong><small>有效孩子</small></article><article><span>今日活跃孩子</span><strong>{metrics.activeChildren.daily}</strong><small>WAU {metrics.activeChildren.weekly} · MAU {metrics.activeChildren.monthly}</small></article><article><span>引导完成率</span><strong>{onboardingRate}%</strong><small>{metrics.onboardingCompleted}/{metrics.children} 个孩子</small></article><article><span>任务完成率</span><strong>{completionRate}%</strong><small>{completedDailyTasks}/{generatedTasks} 个每日任务</small></article><article><span>限时成功率</span><strong>{timedSuccessRate}%</strong><small>{metrics.attempts.timedCompleted} 成功 · {metrics.attempts.timedOut} 超时</small></article><article><span>放弃尝试</span><strong>{metrics.attempts.abandoned}</strong><small>累计主动放弃</small></article><article><span>发放星星</span><strong>{starsIssued}</strong><small>任务奖励</small></article><article><span>消耗 / 退款</span><strong>{starsSpent}</strong><small>退款 {starsRefunded}</small></article></div><Panel title="兑换状态"><div className="summary-row"><div><span>待安排</span><strong>{metrics.redemptions.PENDING ?? 0}</strong></div><div><span>已安排</span><strong>{metrics.redemptions.ARRANGED ?? 0}</strong></div><div><span>已完成</span><strong>{metrics.redemptions.COMPLETED ?? 0}</strong></div><div><span>已取消</span><strong>{metrics.redemptions.CANCELLED ?? 0}</strong></div></div></Panel></div>;
}

function CreateFamily({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [parentUsername, setParentUsername] = useState("");
  const [parentDisplayName, setParentDisplayName] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [childNickname, setChildNickname] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setCodes([]);
    try {
      const result = await adminApi.createFamily({
        name,
        parent: { username: parentUsername, displayName: parentDisplayName, password: parentPassword },
        children: [{ nickname: childNickname || undefined }],
      });
      setCodes(result.children.map((child) => child.loginCode));
      setName(""); setParentUsername(""); setParentDisplayName(""); setParentPassword(""); setChildNickname("");
      onCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败"); }
    finally { setBusy(false); }
  }
  return <Panel title="创建家庭"><form className="admin-form" onSubmit={submit}><label className="field-span">家庭名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>家长用户名<input required minLength={2} value={parentUsername} onChange={(event) => setParentUsername(event.target.value)} /></label><label>家长显示名<input required value={parentDisplayName} onChange={(event) => setParentDisplayName(event.target.value)} /></label><label>初始密码<input required type="password" minLength={8} value={parentPassword} onChange={(event) => setParentPassword(event.target.value)} /></label><label>第一个孩子昵称<input minLength={2} maxLength={9} value={childNickname} onChange={(event) => setChildNickname(event.target.value)} placeholder="可稍后由家长修改" /></label>{error && <div className="field-span admin-notice admin-notice--error">{error}</div>}<div className="form-actions field-span"><button className="primary-button" disabled={busy}>{busy ? "创建中…" : "创建家庭与账号"}</button></div></form>{codes.length > 0 && <div className="super-create-result"><strong>孩子登录代码只在此时完整显示，请立即交给家长：</strong>{codes.map((code) => <code key={code}>{code}</code>)}</div>}</Panel>;
}

function FamilyCard({
  family,
  onChanged,
  onCode,
}: {
  family: Family;
  onChanged: () => void;
  onCode: (title: string, code: string) => void;
}) {
  async function createChild() {
    const answer = window.prompt("请输入孩子昵称（2–9 个字符，留空可稍后设置）");
    if (answer === null) return;
    const nickname = answer.trim();
    if (nickname.length > 0 && (nickname.length < 2 || nickname.length > 9)) {
      window.alert("昵称需要 2–9 个字符");
      return;
    }
    const result = await adminApi.createChild(family.id, nickname || undefined);
    onCode("新孩子登录代码", result.loginCode);
    onChanged();
  }
  async function createParent() {
    const username = window.prompt("家长用户名");
    if (!username) return;
    const displayName = window.prompt("家长显示名称");
    if (!displayName) return;
    const password = window.prompt("初始密码（至少 8 位）");
    if (!password || password.length < 8) return;
    await adminApi.createParent(family.id, { username, displayName, password });
    onChanged();
  }
  return <article className="super-family-card"><header><div><h3>{family.name}</h3><p>创建于 {formatDate(family.createdAt)} · {family.users.length} 位家长 · {family.children.length} 个孩子</p></div><div className="super-account__actions"><span className={`status status--${family.status === "ACTIVE" ? "completed" : "cancelled"}`}>{family.status === "ACTIVE" ? "正常" : "已停用"}</span><button onClick={() => { const name = window.prompt("修改家庭名称", family.name); if (name?.trim()) void adminApi.updateFamily(family.id, { name: name.trim() }).then(onChanged); }}>改名</button><button onClick={() => void adminApi.updateFamily(family.id, { status: family.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }).then(onChanged)}>{family.status === "ACTIVE" ? "停用家庭" : "恢复家庭"}</button><button onClick={createParent}>添加家长</button><button className="primary-button" onClick={createChild}>添加孩子</button></div></header><div className="super-family-card__body"><section><h4>家长账号</h4><div className="super-account-list">{family.users.map((parent) => <div className="super-account" key={parent.id}><div><strong>{parent.displayName}</strong><p>{parent.username} · 最近登录 {formatDate(parent.lastLoginAt)}</p></div><div className="super-account__actions"><button onClick={() => { const name = window.prompt("修改家长显示名称", parent.displayName); if (name?.trim()) void adminApi.updateUser(parent.id, { displayName: name.trim() }).then(onChanged); }}>编辑</button><button onClick={() => void adminApi.updateUser(parent.id, { status: parent.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }).then(onChanged)}>{parent.status === "ACTIVE" ? "停用" : "启用"}</button><button onClick={() => { const password = window.prompt("输入新的家长密码（至少 8 位），确认后现有设备会退出"); if (password && password.length >= 8) void adminApi.resetPassword(parent.id, password).then(() => window.alert("密码已重置")); }}>重置密码</button></div></div>)}{!family.users.length && <div className="empty-state">没有家长账号</div>}</div></section><section><h4>孩子账号</h4><div className="super-account-list">{family.children.map((child) => <div className="super-account" key={child.id}><div><strong>{child.nickname ?? "尚未设置昵称"}</strong><p>代码尾号 {child.loginCodeLastFour} · {child.petType ?? "未选星宠"} · 最近登录 {formatDate(child.lastLoginAt)}</p></div><div className="super-account__actions"><button onClick={() => { const nickname = window.prompt("修改孩子昵称（2–9 个字符）", child.nickname ?? ""); if (nickname?.trim() && nickname.trim().length >= 2 && nickname.trim().length <= 9) void adminApi.updateChild(child.id, nickname.trim()).then(onChanged); }}>编辑</button><button onClick={() => void adminApi.setChildStatus(child.id, child.status === "ACTIVE" ? "DISABLED" : "ACTIVE").then(onChanged)}>{child.status === "ACTIVE" ? "停用" : "启用"}</button><button onClick={() => window.confirm("重新生成后旧登录代码立即失效，但已登录设备不会退出。继续吗？") && void adminApi.regenerateCode(child.id).then((result) => onCode(`${child.nickname ?? "孩子"}的新登录代码`, result.loginCode))}>重置代码</button><button onClick={() => window.confirm("让这个孩子的所有设备退出登录？") && void adminApi.logoutChild(child.id).then(() => window.alert("所有设备已退出"))}>设备全退</button></div></div>)}{!family.children.length && <div className="empty-state">没有孩子账号</div>}</div></section></div></article>;
}

function FamiliesView() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState("");
  const [codeResult, setCodeResult] = useState<{ title: string; code: string } | null>(null);
  async function load() { setFamilies((await adminApi.families()).families); }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return families;
    return families.filter((family) => family.name.toLowerCase().includes(keyword) || family.users.some((user) => `${user.username}${user.displayName}`.toLowerCase().includes(keyword)) || family.children.some((child) => (child.nickname ?? "").toLowerCase().includes(keyword)));
  }, [families, search]);
  return <div className="admin-stack"><CreateFamily onCreated={() => void load()} />{codeResult && <div className="super-create-result"><strong>{codeResult.title}</strong><code>{codeResult.code}</code><button className="ghost-button" onClick={() => void navigator.clipboard.writeText(codeResult.code)}>复制代码</button><button className="ghost-button" onClick={() => setCodeResult(null)}>关闭</button></div>}<Panel title={`家庭与账号（${families.length}）`}><div className="super-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索家庭、家长或孩子" /><button className="ghost-button" onClick={() => void load()}>刷新</button></div><div className="super-family-grid">{filtered.map((family) => <FamilyCard key={family.id} family={family} onChanged={() => void load()} onCode={(title, code) => setCodeResult({ title, code })} />)}{!filtered.length && <div className="empty-state">没有匹配的家庭</div>}</div></Panel></div>;
}

function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  async function load(next?: string, append = false) {
    const result = await adminApi.auditLogs(next);
    setLogs((current) => append ? [...current, ...result.logs] : result.logs);
    setCursor(result.nextCursor);
  }
  useEffect(() => { void load(); }, []);
  return <Panel title="审计日志" actions={<button className="ghost-button" onClick={() => void load()}>刷新</button>}><div className="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>资源</th><th>家庭</th><th>IP</th><th>详情</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.actorType} · {log.actorId?.slice(-6) ?? "系统"}</td><td>{log.action}</td><td>{log.resourceType} · {log.resourceId?.slice(-6) ?? "—"}</td><td>{log.familyId?.slice(-6) ?? "—"}</td><td>{log.ipAddress ?? "—"}</td><td><span className="audit-json">{log.metadata ? JSON.stringify(log.metadata) : "—"}</span></td></tr>)}</tbody></table></div>{cursor && <div className="form-actions"><button className="ghost-button" onClick={() => void load(cursor, true)}>加载更多</button></div>}</Panel>;
}

export function App() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [section, setSection] = useState<Section>("metrics");
  const [error, setError] = useState("");
  useEffect(() => { void staffApi.me().then(({ user: current }) => current.role === "SUPER_ADMIN" ? setUser(current) : setUser(null)).catch(() => setUser(null)); }, []);
  useEffect(() => {
    const handleUnhandled = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setError(event.reason instanceof Error ? event.reason.message : "操作没有完成，请稍后重试");
    };
    window.addEventListener("unhandledrejection", handleUnhandled);
    return () => window.removeEventListener("unhandledrejection", handleUnhandled);
  }, []);
  if (user === undefined) return <main className="admin-loading">正在进入超级后台…</main>;
  if (!user) return <Login onLogin={setUser} />;
  const labels: Record<Section, string> = { metrics: "运营概览", performance: "性能诊断", families: "家庭与账号", audit: "审计日志" };
  return <div className="admin-app super-app"><aside className="admin-sidebar"><div className="admin-brand"><span>★</span><div><strong>星宠成长基地</strong><small>超级管理后台</small></div></div><nav><button className={section === "metrics" ? "active" : ""} onClick={() => setSection("metrics")}><span>▦</span>运营概览</button><button className={section === "performance" ? "active" : ""} onClick={() => setSection("performance")}><span>◷</span>性能诊断</button><button className={section === "families" ? "active" : ""} onClick={() => setSection("families")}><span>♟</span>家庭与账号</button><button className={section === "audit" ? "active" : ""} onClick={() => setSection("audit")}><span>≡</span>审计日志</button></nav><div className="admin-sidebar__account"><div><strong>{user.displayName}</strong><small>{user.username}</small></div><button onClick={() => void staffApi.logout().then(() => setUser(null))}>退出</button></div></aside><main className="admin-main"><header className="admin-topbar"><div><p>超级后台 / {labels[section]}</p><h1>{labels[section]}</h1></div><div className="topbar-balance"><span>系统状态</span><strong>● 正常</strong></div></header><div className="admin-content">{error && <div className="admin-notice admin-notice--error" onClick={() => setError("")}>{error} · 点击关闭</div>}{section === "metrics" && <MetricsView />}{section === "performance" && <PerformanceMonitoring />}{section === "families" && <FamiliesView />}{section === "audit" && <AuditView />}</div></main></div>;
}
