import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parentApi,
  type Child,
  type GrowthAnalytics,
  type WeeklyGrowthAnalysis,
  type WeeklyGrowthReport,
} from "./api";

type RangeDays = 7 | 30 | 90;
type LearningOverviewData = {
  hanzi: Awaited<ReturnType<typeof parentApi.hanziSettings>>;
  clock: Awaited<ReturnType<typeof parentApi.clockSettings>>;
  makeTen: Awaited<ReturnType<typeof parentApi.makeTenSettings>>;
  poems: Awaited<ReturnType<typeof parentApi.poemSettings>>;
};

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

function TaskCompletionSummary({ analytics }: { analytics: GrowthAnalytics }) {
  const taskById = new Map(analytics.tasks.map((task) => [task.templateId, task]));
  const strong = analytics.insights.strongTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is GrowthAnalytics["tasks"][number] => Boolean(task))
    .sort((left, right) => right.completionRate - left.completionRate);
  const focus = analytics.insights.focusTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is GrowthAnalytics["tasks"][number] => Boolean(task))
    .sort((left, right) => left.completionRate - right.completionRate);

  const renderTasks = (
    tasks: GrowthAnalytics["tasks"],
    emptyText: string,
    tone: "strong" | "focus",
  ) => tasks.length ? tasks.map((task) => (
    <article className="growth-task-summary__item" key={task.templateId}>
      <div><strong>{task.title}</strong><span>{task.completedDays}/{task.scheduledDays} 个安排日</span></div>
      <b>{percent(task.completionRate)}</b>
      <div className={`growth-progress growth-progress--${tone}`}><span style={{ width: `${task.completionRate * 100}%` }} /></div>
    </article>
  )) : <div className="growth-task-summary__empty">{emptyText}</div>;

  return (
    <div className="growth-task-summary">
      <section className="growth-task-summary__column growth-task-summary__column--strong">
        <header><span>完成较好</span><small>按完成度从高到低</small></header>
        {renderTasks(strong, "积累至少 2 个安排日后显示", "strong")}
      </section>
      <section className="growth-task-summary__column growth-task-summary__column--focus">
        <header><span>完成度较低</span><small>按完成度从低到高</small></header>
        {renderTasks(focus, "目前没有明显需要加强的任务", "focus")}
      </section>
    </div>
  );
}

const SPENDING_ITEM_COLORS = [
  "#4cae9b",
  "#6f8dd8",
  "#f0a24a",
  "#e47465",
  "#8c72c7",
  "#59a6c8",
  "#78a85a",
  "#d985ae",
];

function SpendingPreference({ analytics }: { analytics: GrowthAnalytics }) {
  if (!analytics.spendingItems.length) {
    return <div className="empty-state">这个时间范围内还没有星星消费</div>;
  }
  const totalSpent = analytics.spendingItems.reduce(
    (sum, item) => sum + item.starsSpent,
    0,
  );
  let offset = 0;
  const items = analytics.spendingItems.map((item, index) => ({
    ...item,
    color: SPENDING_ITEM_COLORS[index % SPENDING_ITEM_COLORS.length],
    share: totalSpent > 0 ? item.starsSpent / totalSpent : 0,
  }));
  const segments = items.map((item) => {
    const start = offset;
    offset += item.share * 100;
    return `${item.color} ${start}% ${offset}%`;
  });
  return (
    <div className="growth-spending">
      <div className="growth-donut" style={{ background: `conic-gradient(${segments.join(",")})` }} aria-label="具体星愿项目消费占比"><div><strong>{totalSpent}</strong><span>消费星星</span></div></div>
      <div className="growth-spending__legend">
        {items.map((item) => <div key={item.title}><i style={{ background: item.color }} /><span>{item.title}</span><strong>{percent(item.share)}</strong><small>{item.redemptionCount} 次 · {item.starsSpent} 星</small></div>)}
      </div>
    </div>
  );
}

function masteryPercent(mastered: number, total: number) {
  return total > 0 ? mastered / total : null;
}

function responseTime(value: number | null) {
  return value === null ? "—" : `${(value / 1000).toFixed(2)} 秒`;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function recommendedCadence(
  item: WeeklyGrowthAnalysis["recommendedSchedule"][number],
) {
  if (item.frequency === "DAILY") return "每天";
  if (item.frequency === "WORKDAYS") return "工作日";
  if (item.frequency === "AUTOMATIC_DUE") return "按复习到期日";
  return item.weekdays.map((weekday) => WEEKDAY_LABELS[weekday] ?? `星期${weekday}`).join("、");
}

function LearningMastery({ learning }: { learning: LearningOverviewData }) {
  const hanziMastered = learning.hanzi.progress.MASTERED ?? 0;
  const hanziLearning = learning.hanzi.progress.LEARNING ?? 0;
  const poemMastered = learning.poems.progress.MASTERED ?? 0;
  const cards = [
    {
      key: "hanzi",
      title: "汉字",
      score: masteryPercent(hanziMastered, learning.hanzi.characterCount),
      label: `${hanziMastered} 个已掌握`,
      detail: `${hanziLearning} 个学习中`,
    },
    {
      key: "poem",
      title: "古诗",
      score: masteryPercent(poemMastered, learning.poems.poemCount),
      label: `${poemMastered} 首已掌握`,
      detail: `${learning.poems.dueCount} 首待复习`,
    },
    {
      key: "clock",
      title: "时钟",
      score: learning.clock.stats.accuracy,
      label: learning.clock.stats.mastery.label,
      detail: `${learning.clock.stats.totalQuestions} 道题`,
    },
    {
      key: "make-ten",
      title: "凑十",
      score: learning.makeTen.stats.accuracy,
      label: learning.makeTen.stats.mastery.label,
      detail: `平均反应 ${responseTime(learning.makeTen.stats.averageResponseMs)}`,
    },
  ];

  return (
    <div className="learning-mastery-grid">
      {cards.map((card) => (
        <article className={`learning-mastery-card learning-mastery-card--${card.key}`} key={card.key}>
          <header><span>{card.title}</span><small>{card.label}</small></header>
          <strong>{percent(card.score)}</strong>
          <div className="learning-mastery-card__bar"><span style={{ width: `${(card.score ?? 0) * 100}%` }} /></div>
          <p>{card.detail}</p>
        </article>
      ))}
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
      title="AI 任务诊断与排布"
      subtitle="由小学教育视角分析最近四个完整周，给出可直接执行的任务调整方案"
      className="weekly-growth-report"
      actions={configured ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void generate()}>{busy ? "分析中…" : report ? "重新分析" : "立即生成"}</button> : null}
    >
      {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
      {loading ? <div className="empty-state">正在读取任务诊断…</div> : !configured ? <div className="weekly-growth-report__empty"><strong>平台 AI 暂未启用</strong><p>请联系超级管理员配置并启用 DeepSeek，之后系统会每周自动分析任务安排。</p></div> : !analysis ? <div className="weekly-growth-report__empty"><strong>还没有可展示的分析</strong><p>系统会分析最近四个完整周，也可以现在生成第一份任务诊断。</p></div> : <>
        <div className="weekly-growth-report__summary">
          <div><span>{fullDate(report.analysisStart)} – {fullDate(report.analysisEnd)}</span><h3>{analysis.summary}</h3></div>
          <div className="weekly-growth-report__meta"><em className={analysis.dataQuality === "SUFFICIENT" ? "is-ready" : "is-limited"}>{analysis.dataQuality === "SUFFICIENT" ? "数据充分" : "样本较少"}</em><small>{report.generatedAt ? `${fullDate(report.generatedAt)}生成` : ""}</small></div>
        </div>

        <div className="weekly-growth-report__diagnosis">
          <section className="weekly-growth-report__finding weekly-growth-report__finding--strong">
            <header><span>坚持得好</span><small>{analysis.doingWell.length} 项</small></header>
            {analysis.doingWell.length ? analysis.doingWell.map((item) => <article key={item.templateId}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.nextStep}</small></article>) : <p className="weekly-growth-report__placeholder">暂时没有样本足够、表现稳定的任务。</p>}
          </section>
          <section className="weekly-growth-report__finding weekly-growth-report__finding--focus">
            <header><span>需要调整</span><small>{analysis.needsAdjustment.length} 项</small></header>
            {analysis.needsAdjustment.length ? analysis.needsAdjustment.map((item) => <article key={item.templateId}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.nextStep}</small></article>) : <p className="weekly-growth-report__placeholder">当前没有明显需要优先调整的任务。</p>}
          </section>
        </div>

        {analysis.cadenceChanges.length ? <section className="weekly-growth-report__cadence">
          <header><div><span>建议改为周期安排</span><small>这些任务不必保持当前出现频率</small></div></header>
          <div>{analysis.cadenceChanges.map((item) => <article key={item.templateId}><strong>{item.title}</strong><div><del>{item.currentCadence}</del><i>→</i><b>{item.recommendedCadence}</b></div><p>{item.reason}</p></article>)}</div>
        </section> : null}

        {analysis.recommendedSchedule.length ? <section className="weekly-growth-report__schedule">
          <header><span>推荐任务排布</span><small>可按此方案到任务管理中调整</small></header>
          <div>{analysis.recommendedSchedule.map((item) => <article key={item.templateId}><div><strong>{item.title}</strong><b>{recommendedCadence(item)}</b></div><p>{item.reason}</p></article>)}</div>
        </section> : null}

        <section className="weekly-growth-report__actions"><span>建议先做</span><ol>{analysis.parentActions.map((item) => <li key={item}>{item}</li>)}</ol></section>
      </>}
    </DashboardSection>
  );
}

export function GrowthOverview({ child }: { child: Child }) {
  const [days, setDays] = useState<RangeDays>(30);
  const [analytics, setAnalytics] = useState<GrowthAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [learning, setLearning] = useState<LearningOverviewData | null>(null);
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

      <DashboardSection title="专项学习掌握度" subtitle="直观看孩子在汉字、古诗、凑十和时钟训练中的当前状态">
        {learning ? <LearningMastery learning={learning} /> : <div className="empty-state">{learningError || "正在读取学习状态…"}</div>}
      </DashboardSection>


      <div className="metric-grid growth-metrics">
        <article><span>任务完成率</span><strong>{summary ? percent(summary.completionRate) : "—"}</strong><small>{completionDescription}</small></article>
        <article><span>活跃天数</span><strong>{summary?.activeDays ?? "—"}</strong><small>完成任务、兑换星愿或使用星宠功能</small></article>
        <article><span>任务与奖励所得</span><strong>{summary ? summary.taskStarsEarned + summary.bonusStarsEarned : "—"}</strong><small>当前余额 {child.starBalance} 星</small></article>
        <article><span>星星消费</span><strong>{summary?.starsSpent ?? "—"}</strong><small className={netTone}>本期净变化 {summary ? `${summary.netStars >= 0 ? "+" : ""}${summary.netStars}` : "—"}</small></article>
      </div>

      {analytics ? <>
        <DashboardSection title="任务完成概括" subtitle="只比较有足够安排记录的任务，分别按完成度排序">
          <TaskCompletionSummary analytics={analytics} />
        </DashboardSection>
        <div className="growth-chart-grid">
          <DashboardSection title="任务完成趋势" subtitle="按安排日统计，重复完成不会抬高完成率"><ChartLegend items={[{ label: "安排任务", tone: "scheduled" }, { label: "完成任务", tone: "completed" }]} /><ActivityTrend data={analytics.daily} /></DashboardSection>
          <DashboardSection title="星星获得与消费" subtitle="任务奖励、达标奖励、星愿与星宠支出"><ChartLegend items={[{ label: "获得", tone: "earned" }, { label: "消费", tone: "spent" }]} /><StarTrend data={analytics.daily} /></DashboardSection>
        </div>
        <DashboardSection title="消费偏好" subtitle="按具体星愿和星宠项目统计，退款项目不会计入"><SpendingPreference analytics={analytics} /></DashboardSection>
      </> : <div className="admin-panel empty-state">正在整理成长数据…</div>}

      <WeeklyReportPanel childId={child.id} />
    </div>
  );
}
