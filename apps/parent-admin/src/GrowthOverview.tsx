import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parentApi,
  type Child,
  type GrowthAdvisorAnswer,
  type GrowthAnalytics,
  type MathMasteryResponse,
  type WeeklyGrowthAnalysis,
  type WeeklyGrowthReport,
} from "./api";

type RangeDays = 7 | 30 | 90;
type GrowthTab = "learning" | "tasks" | "spending" | "ai";
type AdvisorView = "insight" | "plan" | "ask";
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

function GrowthDomainGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="growth-domain-group">
      <header className="growth-domain-group__header">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
      </header>
      <div className="growth-domain-group__body">{children}</div>
    </section>
  );
}


function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function responseSeconds(value: number | null) {
  if (value === null) return "—";
  return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}s`;
}

const MATH_TREND_LABELS = {
  INSUFFICIENT: "样本不足",
  IMPROVING: "近期提升",
  STABLE: "近期稳定",
  DECLINING: "近期回落",
} as const;

function MathMasteryTable({ data }: { data: MathMasteryResponse }) {
  if (!data.types.length) {
    return <div className="empty-state">完成数学练习后，这里会按具体题型显示正确率、速度和掌握情况。</div>;
  }
  return (
    <>
      <div className="math-mastery-summary">
        <article><span>已分析题目</span><strong>{data.summary.totalQuestions}</strong><small>{data.summary.practiceSessions} 次练习</small></article>
        <article><span>整体正确率</span><strong>{percent(data.summary.accuracy)}</strong><small>首次答对 {percent(data.summary.firstTryAccuracy)}</small></article>
        <article><span>平均答题时间</span><strong>{responseSeconds(data.summary.averageResponseMs)}</strong><small>按题型基准约 {responseSeconds(data.summary.expectedResponseMs)}</small></article>
        <article><span>综合掌握度</span><strong>{data.summary.mastery.label}</strong><small>{data.summary.mastery.score} 分 · {MATH_TREND_LABELS[data.summary.trend]}</small></article>
      </div>
      <div className="math-mastery-table-wrap">
        <table className="math-mastery-table">
          <thead><tr><th>具体题型</th><th>答题数</th><th>正确率</th><th>平均耗时</th><th>合理基准</th><th>近期表现</th><th>掌握情况</th></tr></thead>
          <tbody>{data.types.map((item) => (
            <tr key={item.questionTypeId}>
              <td><strong>{item.name}</strong><small>{item.questionTypeId} · {item.categoryName} / {item.familyName}</small></td>
              <td>{item.totalQuestions}<small>{item.practiceSessions} 次练习</small></td>
              <td>{percent(item.accuracy)}<small>首次 {percent(item.firstTryAccuracy)}</small></td>
              <td>{responseSeconds(item.averageResponseMs)}</td>
              <td>{responseSeconds(item.expectedResponseMs)}</td>
              <td><span className={`math-mastery-trend math-mastery-trend--${item.trend.toLowerCase()}`}>{MATH_TREND_LABELS[item.trend]}</span><small>{item.recentQuestions ? `近 14 天 ${percent(item.recentAccuracy)}` : "近 14 天暂无题目"}</small></td>
              <td><b className={`math-mastery-level math-mastery-level--${item.mastery.level.toLowerCase()}`}>{item.mastery.label}</b><small>{item.mastery.score} 分</small></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
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

function dailyStarNet(item: GrowthAnalytics["daily"][number]) {
  return item.taskStarsEarned
    + item.bonusStarsEarned
    - item.rewardStarsReversed
    - item.starsSpent
    + item.starsRefunded;
}

function formatSignedStars(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
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
  const maxAbsNet = Math.max(1, ...data.map((item) => Math.abs(dailyStarNet(item))));
  const netBaseline = (plotTop + plotBottom) / 2;
  const netScale = ((plotBottom - plotTop) / 2 - 8) / maxAbsNet;
  const netPoints = data
    .map((item, index) => {
      const x = 42 + index * slotWidth + slotWidth / 2;
      const y = netBaseline - dailyStarNet(item) * netScale;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="growth-chart-scroll">
      <svg className="growth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每天获得、消费和收支差值星星图表">
        {[0, 0.5, 1].map((ratio) => {
          const y = plotBottom - (plotBottom - plotTop) * ratio;
          return <line key={ratio} x1="38" x2={width - 12} y1={y} y2={y} className="growth-chart__grid" />;
        })}
        <line x1="38" x2={width - 12} y1={netBaseline} y2={netBaseline} className="growth-chart__net-axis" />
        {netPoints && <polyline points={netPoints} className="growth-chart__net-line" />}
        {data.map((item, index) => {
          const earned = item.taskStarsEarned + item.bonusStarsEarned;
          const x = 42 + index * slotWidth;
          const barWidth = Math.max(4, slotWidth * 0.28);
          return (
            <g key={item.date}>
              <title>{`${item.date}：获得 ${earned} 星，消费 ${item.starsSpent} 星，净结余 ${formatSignedStars(dailyStarNet(item))}`}</title>
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

function StarBalanceSummary({ analytics }: { analytics: GrowthAnalytics }) {
  const earned = analytics.summary.taskStarsEarned
    + analytics.summary.bonusStarsEarned
    - analytics.summary.rewardStarsReversed;
  const spent = analytics.summary.starsSpent - analytics.summary.starsRefunded;
  return (
    <div className="growth-star-summary" aria-label="星星收支差值">
      <div><span>获得星星</span><strong>{earned} ⭐</strong></div>
      <div><span>消费星星</span><strong>{spent} ⭐</strong></div>
      <div className={analytics.summary.netStars >= 0 ? "is-positive" : "is-negative"}>
        <span>星星收支差值</span><strong>{formatSignedStars(analytics.summary.netStars)} ⭐</strong>
      </div>
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
  if (!analytics.spending.length) {
    return <div className="empty-state">这个时间范围内还没有星星消费</div>;
  }
  const totalSpent = analytics.spending.reduce((sum, item) => sum + item.starsSpent, 0);
  let offset = 0;
  const items = analytics.spending.map((item, index) => ({
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
      <div className="growth-donut" style={{ background: `conic-gradient(${segments.join(",")})` }} aria-label="按消费类型统计的消费占比"><div><strong>{totalSpent}</strong><span>消费星星</span></div></div>
      <div className="growth-spending__legend">
        {items.map((item) => {
          const details = analytics.spendingItems
            .filter((detail) => detail.category === item.category)
            .sort((left, right) => right.starsSpent - left.starsSpent)
            .slice(0, 3);
          return (
            <div key={item.category}>
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
              <strong>{percent(item.share)}</strong>
              <small>{item.redemptionCount} 次 · {item.starsSpent} 星</small>
              {details.length > 0 && <em title={details.map((detail) => detail.title).join("、")}>明细：{details.map((detail) => detail.title).join("、")}</em>}
            </div>
          );
        })}
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

const DIMENSION_TREND_LABELS = {
  IMPROVING: "正在提升",
  STABLE: "保持稳定",
  DECLINING: "近期回落",
  INSUFFICIENT: "样本有限",
} as const;

const ADVISOR_DECISION_LABELS = {
  KEEP: "保持",
  REDUCE: "减少",
  INCREASE: "增加",
  RESCHEDULE: "调整日期",
  SPLIT: "拆短",
  OBSERVE: "继续观察",
} as const;

function WeeklyReportPanel({ childId }: { childId: string }) {
  const [configured, setConfigured] = useState(false);
  const [report, setReport] = useState<WeeklyGrowthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [advisorView, setAdvisorView] = useState<AdvisorView>("insight");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GrowthAdvisorAnswer | null>(null);
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
      setAnswer(null);
      setAdvisorView("insight");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "成长周报生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function askAdvisor(nextQuestion: string) {
    const normalized = nextQuestion.trim();
    if (!report || normalized.length < 2 || asking) return;
    setAsking(true);
    setError("");
    setQuestion(normalized);
    setAdvisorView("ask");
    try {
      const result = await parentApi.askGrowthAdvisor(
        childId,
        report.id,
        normalized,
      );
      setAnswer(result.answer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 顾问暂时无法回答");
    } finally {
      setAsking(false);
    }
  }

  const analysis = report?.analysis;
  return (
    <DashboardSection
      title="AI 成长顾问"
      subtitle="综合学习掌握、任务习惯、学科平衡和家庭执行负担，形成可持续的培养方案"
      className="weekly-growth-report growth-advisor"
      actions={configured ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void generate()}>{busy ? "分析中…" : report ? "重新分析" : "立即生成"}</button> : null}
    >
      {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
      {loading ? <div className="empty-state">正在读取成长分析…</div> : !configured ? <div className="weekly-growth-report__empty"><strong>平台 AI 暂未启用</strong><p>请联系超级管理员配置并启用 DeepSeek，之后系统会每周自动形成成长分析。</p></div> : !analysis ? <div className="weekly-growth-report__empty"><strong>还没有可展示的分析</strong><p>AI 会分析最近四个完整周，也可以现在生成第一份成长分析。</p></div> : <>
        <div className="weekly-growth-report__summary">
          <div><span>{fullDate(report.analysisStart)} – {fullDate(report.analysisEnd)}</span><h3>{analysis.developmentProfile?.headline ?? analysis.summary}</h3><p>{analysis.developmentProfile?.rationale ?? analysis.summary}</p></div>
          <div className="weekly-growth-report__meta"><em className={analysis.dataQuality === "SUFFICIENT" ? "is-ready" : "is-limited"}>{analysis.dataQuality === "SUFFICIENT" ? "数据充分" : "样本较少"}</em><small>{report.generatedAt ? `${fullDate(report.generatedAt)}生成` : ""}</small></div>
        </div>

        {analysis.developmentProfile ? <section className="growth-advisor__priority"><span>未来两周首要目标</span><strong>{analysis.developmentProfile.primaryGoal}</strong></section> : null}

        {analysis.suggestedQuestions.length ? <section className="growth-advisor__question-strip"><span>你可能还想问</span><div>{analysis.suggestedQuestions.slice(0, 4).map((item) => <button type="button" key={item.id} disabled={asking} onClick={() => void askAdvisor(item.question)}>{item.question}</button>)}</div></section> : null}

        <nav className="growth-advisor__tabs" aria-label="AI 成长顾问内容">
          {([['insight', '成长诊断'], ['plan', '两周行动方案'], ['ask', '继续问 AI']] as const).map(([key, label]) => <button type="button" key={key} className={advisorView === key ? "active" : ""} onClick={() => setAdvisorView(key)}>{label}</button>)}
        </nav>

        {advisorView === "insight" ? <div className="growth-advisor__view">
          {analysis.dimensions.length ? <section className="growth-advisor__dimensions">{analysis.dimensions.map((item) => <article key={item.key} className={`is-${item.status.toLowerCase()}`}><header><strong>{item.label}</strong><b>{item.score}</b></header><div><span style={{ width: `${item.score}%` }} /></div><small>{DIMENSION_TREND_LABELS[item.trend]}</small><p>{item.evidence}</p><em>{item.nextStep}</em></article>)}</section> : null}
          {analysis.balanceInsight ? <section className="growth-advisor__balance"><div><span>学科与能力平衡</span><strong>{analysis.balanceInsight.summary}</strong></div><p>{analysis.balanceInsight.recommendation}</p><dl><div><dt>保持投入</dt><dd>{analysis.balanceInsight.wellRepresented.join("、") || "继续观察"}</dd></div><div><dt>优先关注</dt><dd>{analysis.balanceInsight.needsMoreAttention.join("、") || "暂无明显缺位"}</dd></div></dl></section> : null}
          <div className="weekly-growth-report__diagnosis">
            <section className="weekly-growth-report__finding weekly-growth-report__finding--strong"><header><span>坚持得好</span><small>{analysis.doingWell.length} 项</small></header>{analysis.doingWell.length ? analysis.doingWell.map((item) => <article key={item.templateId}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.nextStep}</small></article>) : <p className="weekly-growth-report__placeholder">暂时没有样本足够、表现稳定的任务。</p>}</section>
            <section className="weekly-growth-report__finding weekly-growth-report__finding--focus"><header><span>需要调整</span><small>{analysis.needsAdjustment.length} 项</small></header>{analysis.needsAdjustment.length ? analysis.needsAdjustment.map((item) => <article key={item.templateId}><strong>{item.title}</strong><p>{item.evidence}</p><small>{item.nextStep}</small></article>) : <p className="weekly-growth-report__placeholder">当前没有明显需要优先调整的任务。</p>}</section>
          </div>
          {analysis.riskSignals.length ? <section className="growth-advisor__signals"><header><span>接下来要留意</span><small>仅是记录信号，不是对孩子的诊断</small></header><div>{analysis.riskSignals.map((item) => <article key={`${item.title}-${item.observation}`}><b>{item.level === "ATTENTION" ? "优先" : "观察"}</b><div><strong>{item.title}</strong><p>{item.observation}</p><small>{item.action}</small></div></article>)}</div></section> : null}
        </div> : null}

        {advisorView === "plan" ? <div className="growth-advisor__view">
          {analysis.weeklyPlan ? <section className="growth-advisor__weekly-plan"><header><span>两周试行主题</span><strong>{analysis.weeklyPlan.theme}</strong></header><p>{analysis.weeklyPlan.loadGuidance}</p><div><section><span>重点</span>{analysis.weeklyPlan.focusAreas.map((item) => <b key={item}>{item}</b>)}</section><section><span>轻松日</span>{analysis.weeklyPlan.lightDays.map((item) => <b key={item}>{item}</b>)}</section></div></section> : null}
          {analysis.habitPlan ? <section className="growth-advisor__habit"><header><span>本期习惯目标</span><strong>{analysis.habitPlan.focus}</strong></header><ol><li><b>触发</b><span>{analysis.habitPlan.cue}</span></li><li><b>行动</b><span>{analysis.habitPlan.routine}</span></li><li><b>反馈</b><span>{analysis.habitPlan.reinforcement}</span></li><li><b>判断有效</b><span>{analysis.habitPlan.successSignal}</span></li></ol></section> : null}
          {analysis.cadenceChanges.length ? <section className="weekly-growth-report__cadence"><header><div><span>建议调整任务频率</span><small>综合实际负担、完成情况和掌握度</small></div></header><div>{analysis.cadenceChanges.map((item) => <article key={item.templateId}><strong>{item.title}</strong><div><del>{item.currentCadence}</del><i>→</i><b>{item.recommendedCadence}</b></div><p>{item.reason}</p></article>)}</div></section> : null}
          {analysis.recommendedSchedule.length ? <section className="weekly-growth-report__schedule"><header><span>推荐任务排布</span><small>家长确认后再到任务管理中调整</small></header><div>{analysis.recommendedSchedule.map((item) => <article key={item.templateId}><div><strong>{item.title}</strong><b>{recommendedCadence(item)}</b></div><p>{item.reason}</p></article>)}</div></section> : null}
          <section className="weekly-growth-report__actions"><span>先做这三件事</span><ol>{analysis.parentActions.map((item) => <li key={item}>{item}</li>)}</ol></section>
        </div> : null}

        {advisorView === "ask" ? <div className="growth-advisor__view growth-advisor__ask">
          <form onSubmit={(event) => { event.preventDefault(); void askAdvisor(question); }}><label htmlFor="growth-advisor-question">结合这份报告继续提问</label><div><input id="growth-advisor-question" value={question} maxLength={300} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：英语任务应该怎样调整，才更容易坚持？" /><button type="submit" disabled={asking || question.trim().length < 2}>{asking ? "分析中…" : "提问"}</button></div></form>
          {!answer && !asking ? <section className="growth-advisor__suggestions">{analysis.suggestedQuestions.map((item) => <button type="button" key={item.id} onClick={() => void askAdvisor(item.question)}><strong>{item.question}</strong><small>{item.reason}</small></button>)}</section> : null}
          {asking ? <div className="growth-advisor__thinking"><strong>正在结合任务、掌握度和负担分析</strong><span>通常需要几秒，请不要重复提交。</span></div> : null}
          {answer && !asking ? <article className="growth-advisor__answer"><header><span>AI 顾问回答</span><h3>{answer.title}</h3><p>{answer.directAnswer}</p></header>{answer.evidence.length ? <section><h4>判断依据</h4><ul>{answer.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}<section><h4>可以这样做</h4><ol>{answer.actionPlan.slice().sort((left, right) => left.order - right.order).map((item) => <li key={`${item.order}-${item.title}`}><b>{item.order}</b><div><strong>{item.title}</strong><p>{item.action}</p><small>{item.frequency} · 判断标准：{item.successSignal}</small></div></li>)}</ol></section>{answer.taskAdjustments.length ? <section><h4>任务调整建议</h4><div className="growth-advisor__adjustments">{answer.taskAdjustments.map((item) => <article key={`${item.templateId ?? 'system'}-${item.title}`}><span>{ADVISOR_DECISION_LABELS[item.decision]}</span><strong>{item.title}</strong><p>{item.suggestion}</p><small>{item.reason}</small></article>)}</div></section> : null}<footer><p>{answer.boundaryNote}</p>{answer.followUpQuestions.map((item) => <button type="button" key={item} onClick={() => void askAdvisor(item)}>{item}</button>)}</footer></article> : null}
        </div> : null}
      </>}
    </DashboardSection>
  );
}

export function GrowthOverview({ child }: { child: Child }) {
  const [days, setDays] = useState<RangeDays>(30);
  const [activeTab, setActiveTab] = useState<GrowthTab>("learning");
  const [analytics, setAnalytics] = useState<GrowthAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [learning, setLearning] = useState<LearningOverviewData | null>(null);
  const [learningError, setLearningError] = useState("");
  const [mathMastery, setMathMastery] = useState<MathMasteryResponse | null>(null);
  const [mathMasteryError, setMathMasteryError] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    setMathMastery(null);
    setMathMasteryError("");
    void parentApi.mathMastery(child.id, days)
      .then((result) => { if (!cancelled) setMathMastery(result); })
      .catch((reason) => { if (!cancelled) setMathMasteryError(reason instanceof Error ? reason.message : "数学掌握度读取失败"); });
    return () => { cancelled = true; };
  }, [child.id, days]);

  const summary = analytics?.summary;
  const completionDescription = useMemo(() => {
    if (!summary?.scheduledTasks) return "暂无安排任务";
    return `${summary.completedTasks}/${summary.scheduledTasks} 个安排日完成`;
  }, [summary]);

  return (
    <div className="admin-stack growth-dashboard">
      <div className="growth-toolbar">
        <div><h2>成长数据</h2><p>从任务完成、学习表现与星愿兑换了解孩子近期状态</p></div>
        {activeTab !== "ai" ? <div className="range-switch" aria-label="统计范围">{([7, 30, 90] as const).map((range) => <button type="button" key={range} className={days === range ? "active" : ""} onClick={() => setDays(range)}>近 {range} 天</button>)}</div> : null}
      </div>
      {analyticsError ? <div className="admin-notice admin-notice--error">{analyticsError}</div> : null}

      <nav className="growth-tabs" aria-label="成长数据分类">
        {([
          ["learning", "学习掌握"],
          ["tasks", "任务完成"],
          ["spending", "消费与收入"],
          ["ai", "AI 成长顾问"],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)} aria-selected={activeTab === key}>{label}</button>
        ))}
      </nav>

      {activeTab === "learning" ? <GrowthDomainGroup title="学习掌握" subtitle="集中查看汉字、古诗、凑十、时钟和数学题型的学习表现">
        <DashboardSection title="专项学习掌握度" subtitle="直观看孩子在汉字、古诗、凑十和时钟训练中的当前状态">
          {learning ? <LearningMastery learning={learning} /> : <div className="empty-state">{learningError || "正在读取学习状态…"}</div>}
        </DashboardSection>
        <DashboardSection title="数学题型掌握度" subtitle="综合正确率、答题速度、样本量与近 14 天趋势；不同题型使用各自的合理耗时基准">
          {mathMastery ? <MathMasteryTable data={mathMastery} /> : <div className="empty-state">{mathMasteryError || "正在整理数学答题记录…"}</div>}
        </DashboardSection>
      </GrowthDomainGroup> : null}

      {activeTab === "tasks" ? <GrowthDomainGroup title="任务完成" subtitle="单独查看孩子完成任务的稳定性、表现较好和需要加强的任务">
        <div className="metric-grid growth-metrics growth-task-metrics">
          <article><span>任务完成率</span><strong>{summary ? percent(summary.completionRate) : "—"}</strong><small>{completionDescription}</small></article>
          <article><span>活跃天数</span><strong>{summary?.activeDays ?? "—"}</strong><small>完成任务、兑换星愿或使用星宠功能</small></article>
        </div>
        {analytics ? <>
          <DashboardSection title="任务完成概括" subtitle="只比较有足够安排记录的任务，分别按完成度排序"><TaskCompletionSummary analytics={analytics} /></DashboardSection>
          <DashboardSection title="任务完成趋势" subtitle="按安排日统计，重复完成不会抬高完成率"><ChartLegend items={[{ label: "安排任务", tone: "scheduled" }, { label: "完成任务", tone: "completed" }]} /><ActivityTrend data={analytics.daily} /></DashboardSection>
        </> : <div className="admin-panel empty-state">正在整理任务完成数据…</div>}
      </GrowthDomainGroup> : null}

      {activeTab === "spending" ? <GrowthDomainGroup title="消费与收入分析" subtitle="把星星获得、消费和净结余放在一起，并按消费类型查看偏好">
        {analytics ? <>
          <DashboardSection title="星星获得与消费" subtitle="任务奖励、达标奖励、星愿与星宠支出"><StarBalanceSummary analytics={analytics} /><ChartLegend items={[{ label: "获得", tone: "earned" }, { label: "消费", tone: "spent" }, { label: "每日净结余", tone: "net" }]} /><StarTrend data={analytics.daily} /></DashboardSection>
          <DashboardSection title="消费偏好" subtitle="一级按消费类型合并，具体星愿和旅行目的地作为明细"><SpendingPreference analytics={analytics} /></DashboardSection>
        </> : <div className="admin-panel empty-state">正在整理消费与收入数据…</div>}
      </GrowthDomainGroup> : null}

      {activeTab === "ai" ? <WeeklyReportPanel childId={child.id} /> : null}
    </div>
  );
}
