import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parentApi,
  type Child,
  type GrowthAnalytics,
  type WeeklyGrowthReport,
} from "./api";

type RangeDays = 7 | 30 | 90;

function DashboardSection({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-panel growth-section ${className}`.trim()}>
      <header className="growth-section__header">
        <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function fullDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function shouldShowTick(index: number, length: number) {
  if (length <= 10) return true;
  if (length <= 35) return index % 5 === 0 || index === length - 1;
  return index % 15 === 0 || index === length - 1;
}

function ActivityTrend({ data }: { data: GrowthAnalytics["daily"] }) {
  const width = Math.max(620, data.length * 28 + 56);
  const height = 228;
  const plotTop = 18;
  const plotBottom = 184;
  const maxValue = Math.max(1, ...data.map((item) => item.scheduledTasks));
  const slotWidth = (width - 56) / Math.max(1, data.length);
  const scale = (plotBottom - plotTop) / maxValue;
  return (
    <div className="growth-chart-scroll">
      <svg className="growth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每天任务安排与完成数量柱状图">
        {[0, 0.5, 1].map((ratio) => {
          const y = plotBottom - (plotBottom - plotTop) * ratio;
          return <line key={ratio} x1="38" x2={width - 12} y1={y} y2={y} className="growth-chart__grid" />;
        })}
        {data.map((item, index) => {
          const x = 42 + index * slotWidth;
          const scheduledHeight = item.scheduledTasks * scale;
          const completedHeight = item.completedTasks * scale;
          return (
            <g key={item.date}>
              <title>{`${item.date}：安排 ${item.scheduledTasks} 项，完成 ${item.completedTasks} 项，成功练习 ${item.completedAttempts} 次`}</title>
              <rect x={x} y={plotBottom - scheduledHeight} width={Math.max(8, slotWidth * 0.58)} height={scheduledHeight} rx="3" className="growth-chart__bar growth-chart__bar--scheduled" />
              <rect x={x} y={plotBottom - completedHeight} width={Math.max(8, slotWidth * 0.58)} height={completedHeight} rx="3" className="growth-chart__bar growth-chart__bar--completed" />
              {shouldShowTick(index, data.length) ? <text x={x + Math.max(8, slotWidth * 0.58) / 2} y="211" textAnchor="middle" className="growth-chart__label">{shortDate(item.date)}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StarTrend({ data }: { data: GrowthAnalytics["daily"] }) {
  const width = Math.max(620, data.length * 30 + 56);
  const height = 228;
  const plotTop = 18;
  const plotBottom = 184;
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [
      item.taskStarsEarned + item.bonusStarsEarned,
      item.starsSpent,
    ]),
  );
  const slotWidth = (width - 56) / Math.max(1, data.length);
  const scale = (plotBottom - plotTop) / maxValue;
  return (
    <div className="growth-chart-scroll">
      <svg className="growth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每天获得和消费星星柱状图">
        {[0, 0.5, 1].map((ratio) => {
          const y = plotBottom - (plotBottom - plotTop) * ratio;
          return <line key={ratio} x1="38" x2={width - 12} y1={y} y2={y} className="growth-chart__grid" />;
        })}
        {data.map((item, index) => {
          const earned = item.taskStarsEarned + item.bonusStarsEarned;
          const x = 42 + index * slotWidth;
          const barWidth = Math.max(4, slotWidth * 0.28);
          return (
            <g key={item.date}>
              <title>{`${item.date}：获得 ${earned} 星，兑换支出 ${item.starsSpent} 星${item.starsRefunded ? `，退款 ${item.starsRefunded} 星` : ""}`}</title>
              <rect x={x} y={plotBottom - earned * scale} width={barWidth} height={earned * scale} rx="3" className="growth-chart__bar growth-chart__bar--earned" />
              <rect x={x + barWidth + 2} y={plotBottom - item.starsSpent * scale} width={barWidth} height={item.starsSpent * scale} rx="3" className="growth-chart__bar growth-chart__bar--spent" />
              {shouldShowTick(index, data.length) ? <text x={x + barWidth} y="211" textAnchor="middle" className="growth-chart__label">{shortDate(item.date)}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartLegend({ items }: { items: Array<{ label: string; tone: string }> }) {
  return <div className="growth-chart-legend">{items.map((item) => <span key={item.label}><i className={`growth-chart-legend__dot growth-chart-legend__dot--${item.tone}`} />{item.label}</span>)}</div>;
}

function TaskPerformance({ analytics }: { analytics: GrowthAnalytics }) {
  const strongIds = new Set(analytics.insights.strongTaskIds);
  const focusIds = new Set(analytics.insights.focusTaskIds);
  if (!analytics.tasks.length) return <div className="empty-state">这个时间范围内还没有任务数据</div>;
  return (
    <div className="growth-performance-list">
      {analytics.tasks.slice(0, 12).map((task) => (
        <article key={task.templateId}>
          <div className="growth-performance-list__heading">
            <div><strong>{task.title}</strong><span>{task.categoryLabel} · 安排 {task.scheduledDays} 天{task.repeatableDaily ? ` · 成功练习 ${task.completedAttempts} 次` : ""}</span></div>
            <div><strong>{percent(task.completionRate)}</strong>{strongIds.has(task.templateId) ? <em className="growth-tag growth-tag--strong">保持很好</em> : focusIds.has(task.templateId) ? <em className="growth-tag growth-tag--focus">需要关注</em> : null}</div>
          </div>
          <div className="growth-progress"><span style={{ width: `${task.completionRate * 100}%` }} /></div>
          <p>完成 {task.completedDays}/{task.scheduledDays} 天{task.failedAttempts ? ` · 未达标或超时 ${task.failedAttempts} 次` : ""}{task.abandonedAttempts ? ` · 放弃 ${task.abandonedAttempts} 次` : ""}{task.averageMinutes !== null ? ` · 平均 ${task.averageMinutes} 分钟` : ""}</p>
        </article>
      ))}
    </div>
  );
}

const SPENDING_COLORS: Record<string, string> = {
  SPORTS: "#4cae9b",
  TELEVISION: "#6f8dd8",
  TOYS: "#f0a24a",
};

function SpendingPreference({ analytics }: { analytics: GrowthAnalytics }) {
  if (!analytics.spending.length) {
    return <div className="empty-state">这个时间范围内还没有星愿消费</div>;
  }
  let offset = 0;
  const segments = analytics.spending.map((item) => {
    const start = offset;
    offset += item.share * 100;
    return `${SPENDING_COLORS[item.category]} ${start}% ${offset}%`;
  });
  return (
    <div className="growth-spending">
      <div className="growth-donut" style={{ background: `conic-gradient(${segments.join(",")})` }} aria-label="星愿消费分类占比"><div><strong>{analytics.summary.starsSpent}</strong><span>消费星星</span></div></div>
      <div className="growth-spending__legend">
        {analytics.spending.map((item) => <div key={item.category}><i style={{ background: SPENDING_COLORS[item.category] }} /><span>{item.label}</span><strong>{percent(item.share)}</strong><small>{item.redemptionCount} 次 · {item.starsSpent} 星</small></div>)}
      </div>
      {analytics.spendingItems.length ? <div className="growth-spending__items"><span>常兑换</span>{analytics.spendingItems.slice(0, 3).map((item) => <strong key={item.title}>{item.title} <small>{item.redemptionCount} 次</small></strong>)}</div> : null}
    </div>
  );
}

function InstantInsights({ analytics }: { analytics: GrowthAnalytics }) {
  const taskById = new Map(analytics.tasks.map((task) => [task.templateId, task]));
  const strong = analytics.insights.strongTaskIds.map((id) => taskById.get(id)).filter(Boolean);
  const focus = analytics.insights.focusTaskIds.map((id) => taskById.get(id)).filter(Boolean);
  const preference = analytics.spending.find((item) => item.category === analytics.insights.preferredWishCategory);
  return (
    <div className="growth-insight-grid">
      <div><span className="growth-insight-grid__eyebrow">表现稳定</span>{strong.length ? strong.map((task) => <p key={task!.templateId}><strong>{task!.title}</strong><span>{percent(task!.completionRate)} 完成率</span></p>) : <p><span>需要至少 2 个安排日才能判断</span></p>}</div>
      <div><span className="growth-insight-grid__eyebrow">优先关注</span>{focus.length ? focus.map((task) => <p key={task!.templateId}><strong>{task!.title}</strong><span>{percent(task!.completionRate)} 完成率</span></p>) : <p><span>目前没有明显薄弱任务</span></p>}</div>
      <div><span className="growth-insight-grid__eyebrow">兑换偏好</span>{preference ? <p><strong>{preference.label}</strong><span>占消费星星的 {percent(preference.share)}</span></p> : <p><span>暂无足够兑换数据</span></p>}</div>
    </div>
  );
}

function WeeklyReportPanel({ childId }: { childId: string }) {
  const [configured, setConfigured] = useState(false);
  const [report, setReport] = useState<WeeklyGrowthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void parentApi.weeklyGrowth(childId)
      .then((result) => {
        if (cancelled) return;
        setConfigured(result.configured);
        setReport(result.report);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "成长周报读取失败");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [childId]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await parentApi.generateWeeklyGrowth(childId);
      setReport(result.report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "成长周报生成失败");
    } finally {
      setBusy(false);
    }
  }

  const analysis = report?.analysis;
  return (
    <DashboardSection
      title="AI 成长周报"
      subtitle="每周自动分析上一完整周，只使用匿名化的任务与兑换统计"
      className="weekly-growth-report"
      actions={configured ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void generate()}>{busy ? "分析中…" : report ? "重新分析" : "立即生成"}</button> : null}
    >
      {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
      {loading ? <div className="empty-state">正在读取成长周报…</div> : !configured ? <div className="weekly-growth-report__empty"><strong>尚未启用 DeepSeek</strong><p>请先到“智能与设置 → AI 助手”保存并启用 DeepSeek 密钥，系统之后会每周自动生成报告。</p></div> : !analysis ? <div className="weekly-growth-report__empty"><strong>还没有可展示的周报</strong><p>系统会自动分析上一完整周，也可以现在生成第一份报告。</p></div> : <>
        <div className="weekly-growth-report__summary"><div><span>{fullDate(report.weekStart)} – {fullDate(report.weekEnd)}</span><h3>{analysis.summary}</h3></div><small>{report.generatedAt ? `${fullDate(report.generatedAt)}生成` : ""}</small></div>
        <div className="weekly-growth-report__columns">
          <div><h4>本周亮点</h4>{analysis.progressHighlights.length ? analysis.progressHighlights.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.evidence}</p></article>) : <p className="muted">本周数据不足，暂不判断。</p>}</div>
          <div><h4>需要关注</h4>{analysis.focusAreas.length ? analysis.focusAreas.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.suggestion}</small></article>) : <p className="muted">本周没有明显需要关注的项目。</p>}</div>
          <div><h4>下周建议</h4>{analysis.nextWeekSuggestions.length ? analysis.nextWeekSuggestions.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.action}</p><small>{item.reason}</small></article>) : <p className="muted">保持当前节奏并继续观察。</p>}</div>
        </div>
        <div className="weekly-growth-report__footer"><p><strong>兑换观察：</strong>{analysis.consumptionInsight.summary}</p><p>{analysis.parentMessage}</p><small>{analysis.disclaimer}</small></div>
      </>}
    </DashboardSection>
  );
}

export function GrowthOverview({ child }: { child: Child }) {
  const [days, setDays] = useState<RangeDays>(30);
  const [analytics, setAnalytics] = useState<GrowthAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [learning, setLearning] = useState<{
    hanzi: Awaited<ReturnType<typeof parentApi.hanziSettings>>;
    clock: Awaited<ReturnType<typeof parentApi.clockSettings>>;
    makeTen: Awaited<ReturnType<typeof parentApi.makeTenSettings>>;
    poems: Awaited<ReturnType<typeof parentApi.poemSettings>>;
  } | null>(null);
  const [learningError, setLearningError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setAnalyticsError("");
    void parentApi.growthAnalytics(child.id, days)
      .then((result) => { if (!cancelled) setAnalytics(result); })
      .catch((reason) => { if (!cancelled) setAnalyticsError(reason instanceof Error ? reason.message : "成长数据读取失败"); });
    return () => { cancelled = true; };
  }, [child.id, days]);

  useEffect(() => {
    let cancelled = false;
    setLearning(null);
    setLearningError("");
    void Promise.all([
      parentApi.hanziSettings(child.id),
      parentApi.clockSettings(child.id),
      parentApi.makeTenSettings(child.id),
      parentApi.poemSettings(child.id),
    ]).then(([hanzi, clock, makeTen, poems]) => {
      if (!cancelled) setLearning({ hanzi, clock, makeTen, poems });
    }).catch((reason) => {
      if (!cancelled) setLearningError(reason instanceof Error ? reason.message : "学习状态读取失败");
    });
    return () => { cancelled = true; };
  }, [child.id]);

  const summary = analytics?.summary;
  const netTone = (summary?.netStars ?? 0) >= 0 ? "positive" : "negative";
  const completionDescription = useMemo(() => {
    if (!summary?.scheduledTasks) return "暂无安排任务";
    return `${summary.completedTasks}/${summary.scheduledTasks} 个安排日完成`;
  }, [summary]);

  return (
    <div className="admin-stack growth-dashboard">
      <div className="growth-toolbar">
        <div><h2>成长数据</h2><p>从任务完成、学习表现与星愿兑换了解孩子近期状态</p></div>
        <div className="range-switch" aria-label="统计范围">{([7, 30, 90] as const).map((range) => <button type="button" key={range} className={days === range ? "active" : ""} onClick={() => setDays(range)}>近 {range} 天</button>)}</div>
      </div>
      {analyticsError ? <div className="admin-notice admin-notice--error">{analyticsError}</div> : null}
      <div className="metric-grid growth-metrics">
        <article><span>任务完成率</span><strong>{summary ? percent(summary.completionRate) : "—"}</strong><small>{completionDescription}</small></article>
        <article><span>活跃天数</span><strong>{summary?.activeDays ?? "—"}</strong><small>完成任务或兑换星愿</small></article>
        <article><span>任务与奖励所得</span><strong>{summary ? summary.taskStarsEarned + summary.bonusStarsEarned : "—"}</strong><small>当前余额 {child.starBalance} 星</small></article>
        <article><span>星愿消费</span><strong>{summary?.starsSpent ?? "—"}</strong><small className={netTone}>本期净变化 {summary ? `${summary.netStars >= 0 ? "+" : ""}${summary.netStars}` : "—"}</small></article>
      </div>

      <WeeklyReportPanel childId={child.id} />

      {analytics ? <>
        <InstantInsights analytics={analytics} />
        <div className="growth-chart-grid">
          <DashboardSection title="任务完成趋势" subtitle="按安排日统计，重复完成不会抬高完成率"><ChartLegend items={[{ label: "安排任务", tone: "scheduled" }, { label: "完成任务", tone: "completed" }]} /><ActivityTrend data={analytics.daily} /></DashboardSection>
          <DashboardSection title="星星获得与消费" subtitle="任务奖励、达标奖励与星愿支出"><ChartLegend items={[{ label: "获得", tone: "earned" }, { label: "消费", tone: "spent" }]} /><StarTrend data={analytics.daily} /></DashboardSection>
        </div>
        <div className="growth-analysis-grid">
          <DashboardSection title="各任务完成表现" subtitle="优先关注持续出现但完成率偏低的任务"><TaskPerformance analytics={analytics} /></DashboardSection>
          <DashboardSection title="星愿消费偏好" subtitle="退款的兑换不会计入偏好"><SpendingPreference analytics={analytics} /></DashboardSection>
        </div>
        <DashboardSection title="任务分类表现" subtitle="按安排任务日计算分类完成率">
          {analytics.categories.length ? <div className="growth-category-grid">{analytics.categories.map((category) => <article key={category.category}><div><strong>{category.label}</strong><span>{category.completedTasks}/{category.scheduledTasks} 个安排日</span></div><b>{percent(category.completionRate)}</b><div className="growth-progress"><span style={{ width: `${category.completionRate * 100}%` }} /></div><small>成功练习 {category.completedAttempts} 次 · 获得 {category.starsEarned} 星{category.failedAttempts ? ` · 未达标 ${category.failedAttempts} 次` : ""}</small></article>)}</div> : <div className="empty-state">暂无分类数据</div>}
        </DashboardSection>
      </> : <div className="admin-panel empty-state">正在整理成长数据…</div>}

      <DashboardSection title="学习状态概览" subtitle="汉字、古诗、时钟与凑十训练的累计掌握情况">
        {learning ? <div className="learning-overview-grid">
          <article className="learning-overview-card"><div className="learning-overview-card__header"><strong>汉字学习</strong><span>当前字库 {learning.hanzi.characterCount} 字</span></div><div className="learning-overview-card__metrics"><div><span>学习中</span><strong>{learning.hanzi.progress.LEARNING ?? 0}</strong><small>个汉字</small></div><div><span>已掌握</span><strong>{learning.hanzi.progress.MASTERED ?? 0}</strong><small>个汉字</small></div></div></article>
          <article className="learning-overview-card"><div className="learning-overview-card__header"><strong>古诗学习</strong><span>{learning.poems.settings.enabled ? "任务已开启" : "任务未开启"}</span></div><div className="learning-overview-card__metrics"><div><span>学习中</span><strong>{learning.poems.progress.LEARNING ?? 0}</strong><small>首古诗</small></div><div><span>已掌握</span><strong>{learning.poems.progress.MASTERED ?? 0}</strong><small>首古诗</small></div><div><span>待复习</span><strong>{learning.poems.dueCount}</strong><small>首古诗</small></div></div></article>
          <article className="learning-overview-card"><div className="learning-overview-card__header"><strong>时钟学习</strong><span>{learning.clock.stats.mastery.label}</span></div><div className="learning-overview-card__metrics"><div><span>总体正确率</span><strong>{percent(learning.clock.stats.accuracy)}</strong><small>{learning.clock.stats.totalQuestions} 道题</small></div><div><span>近 30 天</span><strong>{percent(learning.clock.stats.recentAccuracy)}</strong><small>近期正确率</small></div><div><span>完整练习</span><strong>{learning.clock.stats.completedSessions}</strong><small>次任务</small></div></div></article>
          <article className="learning-overview-card"><div className="learning-overview-card__header"><strong>凑十训练</strong><span>{learning.makeTen.stats.mastery.label}</span></div><div className="learning-overview-card__metrics"><div><span>总体正确率</span><strong>{percent(learning.makeTen.stats.accuracy)}</strong><small>{learning.makeTen.stats.totalQuestions} 道题</small></div><div><span>近 30 天</span><strong>{percent(learning.makeTen.stats.recentAccuracy)}</strong><small>近期正确率</small></div><div><span>完整练习</span><strong>{learning.makeTen.stats.completedSessions}</strong><small>次任务</small></div></div></article>
        </div> : <div className="empty-state">{learningError || "正在读取学习状态…"}</div>}
      </DashboardSection>
    </div>
  );
}
