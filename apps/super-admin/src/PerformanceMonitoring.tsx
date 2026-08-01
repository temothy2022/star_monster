import { useEffect, useState, type ReactNode } from "react";
import {
  adminApi,
  type PerformanceDashboard,
  type PerformanceDiagnosis,
} from "./api";

const PERFORMANCE_OPERATION_LABELS: Record<string, string> = {
  "open_tasks-partial": "打开任务页",
  open_map: "打开航图",
  "open_wishes-requested": "打开星愿",
  open_footprints: "打开足迹",
  complete_task: "完成普通任务",
  complete_hanzi_task: "完成汉字学习",
  complete_poem_task: "完成古诗任务",
  complete_poem_learning: "提交古诗学习",
  startup_html: "首次打开：HTML",
  startup_main_css: "首次打开：主样式",
  startup_main_js: "首次打开：主程序",
  startup_first_contentful_paint: "首次打开：首屏出现",
  startup_module_loaded: "首次打开：程序开始运行",
  startup_tasks_ready: "首次打开：任务可操作",
  start_task: "开始任务",
  pause_task: "暂停任务",
  resume_task: "继续任务",
  abandon_task: "放弃任务",
  start_hanzi_session: "打开汉字学习",
  start_poem_session: "打开古诗学习",
  save_hanzi_review: "保存汉字复习",
  save_hanzi_character: "保存新字进度",
  save_hanzi_answer: "保存听句答案",
  chunk_load_failed: "页面资源加载失败",
  render_failed: "页面渲染失败",
};

const PERFORMANCE_DIAGNOSIS: Record<
  PerformanceDiagnosis,
  { label: string; detail: string }
> = {
  server: { label: "服务端", detail: "API 或数据库处理时间占主要部分" },
  network: { label: "网络", detail: "设备到服务器的传输等待占主要部分" },
  frontend: { label: "前端渲染", detail: "接口返回后页面资源或渲染耗时较高" },
  mixed: { label: "混合原因", detail: "没有单一环节占据大部分时间" },
};

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel">
      <header className="admin-panel__header"><h2>{title}</h2></header>
      {children}
    </section>
  );
}

function formatPerformanceMs(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} 秒`;
  return `${Math.round(value)} ms`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function performanceOperationLabel(operation: string) {
  if (operation.startsWith("render_")) {
    return `页面呈现：${operation.slice(7).replaceAll("-", " ")}`;
  }
  return PERFORMANCE_OPERATION_LABELS[operation] ?? operation.replaceAll("_", " ");
}

export function PerformanceMonitoring() {
  const [days, setDays] = useState(7);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void adminApi.performance(days)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "性能数据读取失败");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, refreshKey]);

  const summary = data?.summary;
  const trendMaximum = Math.max(
    1,
    ...(data?.trend.map((item) => item.p95Ms ?? item.averageMs ?? 0) ?? []),
  );
  const hasData = (summary?.pageOpenCount ?? 0) + (summary?.completionCount ?? 0) > 0;

  return (
    <div className="admin-stack performance-admin-page">
      <div className="performance-toolbar">
        <div>
          <h2>全局性能诊断</h2>
          <p>汇总全部家庭和孩子端数据，判断等待发生在服务端、网络，还是页面渲染。</p>
          {data && <small className="performance-scope">当前覆盖 {data.childCount} 个孩子 · 数据保留 30 天</small>}
        </div>
        <div className="performance-toolbar__actions">
          <div className="range-switch" aria-label="数据时间范围">
            {[1, 7, 30].map((range) => (
              <button type="button" className={days === range ? "active" : ""} key={range} onClick={() => setDays(range)}>
                {range === 1 ? "24 小时" : `${range} 天`}
              </button>
            ))}
          </div>
          <button type="button" className="ghost-button" onClick={() => setRefreshKey((value) => value + 1)}>刷新</button>
        </div>
      </div>

      {error && <div className="admin-notice admin-notice--error">{error}</div>}
      {loading ? (
        <div className="empty-state">正在汇总全部用户的性能数据…</div>
      ) : !data || !hasData ? (
        <Panel title="等待采集数据">
          <div className="performance-empty">
            <strong>暂时还没有可分析的孩子端数据</strong>
            <p>孩子打开任务、航图、星愿、足迹或完成任务后，这里会自动形成全局耗时趋势和原因判断。</p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="metric-grid performance-metrics">
            <article><span>页面平均打开</span><strong>{formatPerformanceMs(summary?.pageOpenAverageMs ?? null)}</strong><small>{summary?.pageOpenCount ?? 0} 次真实打开</small></article>
            <article><span>页面 P95</span><strong>{formatPerformanceMs(summary?.pageOpenP95Ms ?? null)}</strong><small>95% 的打开不超过此时间</small></article>
            <article><span>慢页面比例</span><strong>{summary?.slowPageRate ?? 0}%</strong><small>超过 1 秒：{summary?.slowPageCount ?? 0} 次</small></article>
            <article><span>完成任务平均等待</span><strong>{formatPerformanceMs(summary?.completionAverageMs ?? null)}</strong><small>{summary?.completionCount ?? 0} 次提交</small></article>
          </div>

          <Panel title="平均耗时构成">
            <div className="performance-breakdown">
              <div><span>服务端处理</span><strong>{formatPerformanceMs(summary?.serverAverageMs ?? null)}</strong><small>API 与数据库</small></div>
              <div><span>网络等待</span><strong>{formatPerformanceMs(summary?.networkAverageMs ?? null)}</strong><small>设备到服务器</small></div>
              <div><span>前端渲染</span><strong>{formatPerformanceMs(summary?.frontendAverageMs ?? null)}</strong><small>接口返回后到页面可用</small></div>
              <div><span>任务提交 P95</span><strong>{formatPerformanceMs(summary?.completionP95Ms ?? null)}</strong><small>包含按钮到结果页等待</small></div>
            </div>
          </Panel>

          <Panel title="慢事件原因">
            <div className="performance-diagnosis">
              {(Object.keys(PERFORMANCE_DIAGNOSIS) as PerformanceDiagnosis[]).map((key) => (
                <div className={`performance-diagnosis__item performance-diagnosis__item--${key}`} key={key}>
                  <span>{PERFORMANCE_DIAGNOSIS[key].label}</span><strong>{data.diagnosis[key]}</strong><small>{PERFORMANCE_DIAGNOSIS[key].detail}</small>
                </div>
              ))}
            </div>
          </Panel>

          {!!data.trend.length && <Panel title="每日页面打开趋势"><div className="performance-trend">{data.trend.map((item) => <div className="performance-trend__row" key={item.date}><time>{item.date.slice(5)}</time><div className="performance-trend__track"><span style={{ width: `${Math.max(3, ((item.averageMs ?? 0) / trendMaximum) * 100)}%` }} /></div><strong>{formatPerformanceMs(item.averageMs)}</strong><small>P95 {formatPerformanceMs(item.p95Ms)} · {item.samples} 次</small></div>)}</div></Panel>}

          <Panel title="功能耗时对比">
            <div className="table-wrap"><table><thead><tr><th>操作</th><th>次数</th><th>平均</th><th>P95</th><th>慢事件</th><th>服务端</th><th>网络</th><th>前端</th></tr></thead><tbody>{data.operations.map((item) => <tr key={item.operation}><td><strong>{performanceOperationLabel(item.operation)}</strong></td><td>{item.samples}</td><td>{formatPerformanceMs(item.averageMs)}</td><td>{formatPerformanceMs(item.p95Ms)}</td><td>{item.slowCount}</td><td>{formatPerformanceMs(item.serverAverageMs)}</td><td>{formatPerformanceMs(item.networkAverageMs)}</td><td>{formatPerformanceMs(item.frontendAverageMs)}</td></tr>)}</tbody></table></div>
          </Panel>

          <Panel title="最近慢事件">
            <div className="table-wrap"><table><thead><tr><th>时间</th><th>家庭</th><th>孩子</th><th>操作</th><th>总耗时</th><th>主要原因</th><th>服务端</th><th>网络</th><th>前端</th><th>请求编号</th></tr></thead><tbody>{data.recentSlowEvents.map((item) => <tr key={item.id}><td>{formatDate(item.createdAt)}</td><td>{item.familyName ?? "—"}</td><td>{item.childNickname ?? item.childId?.slice(-6) ?? "—"}</td><td>{performanceOperationLabel(item.operation)}</td><td><strong>{formatPerformanceMs(item.totalMs)}</strong></td><td><span className={`performance-cause performance-cause--${item.diagnosis}`}>{PERFORMANCE_DIAGNOSIS[item.diagnosis].label}</span></td><td>{formatPerformanceMs(item.serverMs)}</td><td>{formatPerformanceMs(item.clientOverheadMs)}</td><td>{formatPerformanceMs(item.nonApiMs)}</td><td className="performance-request-id" title={item.requestId ?? ""}>{item.requestId?.slice(0, 10) ?? "—"}</td></tr>)}</tbody></table>{!data.recentSlowEvents.length && <div className="empty-state">当前范围内没有超过 1 秒的慢事件</div>}</div>
            <p className="performance-collected">当前范围最早记录 {formatDate(data.collectedFrom)} · 最新记录 {formatDate(data.collectedTo)}</p>
          </Panel>
        </>
      )}
    </div>
  );
}
