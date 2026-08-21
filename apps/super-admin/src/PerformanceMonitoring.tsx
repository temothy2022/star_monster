import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  adminApi,
  type PerformanceDashboard,
  type PerformanceDiagnosis,
  type PerformanceOperation,
} from "./api";
import { Pagination } from "antd";

const PERFORMANCE_OPERATION_LABELS: Record<string, string> = {
  "open_tasks-partial": "打开任务页",
  open_map: "打开航图",
  "open_wishes-requested": "打开星愿",
  open_footprints: "打开足迹",
  "open_pet-growth": "打开星宠小屋",
  complete_task: "完成普通任务",
  complete_hanzi_task: "完成汉字学习",
  complete_poem_task: "完成古诗任务",
  complete_poem_learning: "提交古诗学习",
  complete_clock_task: "完成时钟学习",
  complete_make_ten_task: "完成凑十训练",
  startup_html: "首次打开：HTML",
  startup_main_css: "首次打开：主样式",
  startup_main_js: "首次打开：主程序",
  startup_first_contentful_paint: "首次打开：首屏出现",
  startup_module_loaded: "首次打开：程序运行",
  startup_tasks_ready: "首次打开：任务可操作",
  start_task: "开始任务",
  pause_task: "暂停任务",
  resume_task: "继续任务",
  abandon_task: "放弃任务",
  start_hanzi_session: "打开汉字学习",
  start_poem_session: "打开古诗学习",
  start_clock_session: "打开时钟学习",
  start_make_ten_session: "打开凑十训练",
  save_hanzi_review: "保存汉字复习",
  save_hanzi_character: "保存新字进度",
  save_hanzi_answer: "保存听句答案",
  save_clock_answer: "保存时钟答案",
  save_make_ten_answer: "保存凑十答案",
  save_poem_review: "保存古诗复习",
  redeem_wish: "兑换星愿",
  feed_pet: "喂点心",
  give_pet_water: "喂水",
  open_pet_red_packet: "拆开星宠红包",
  start_pet_trip: "开始旅行",
  reveal_postcard: "拆开明信片",
  celebrate_planet: "确认星球点亮",
  acknowledge_planet: "读取星球提醒",
  hanzi_assets_preload_complete: "汉字资源预加载",
  hanzi_assets_preload_partial: "汉字资源部分失败",
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-panel">
      <header className="admin-panel__header"><h2>{title}</h2></header>
      {children}
    </section>
  );
}

function formatPerformanceMs(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} 秒`;
  }
  return `${Math.round(value)} ms`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function performanceOperationLabel(operation: string) {
  const knownLabel = PERFORMANCE_OPERATION_LABELS[operation];
  if (knownLabel) return knownLabel;
  if (operation.startsWith("render_")) {
    return `页面骨架呈现：${operation.slice(7).replaceAll("-", " ")}`;
  }
  return operation.replaceAll("_", " ");
}

function OperationTable({ rows, emptyText }: {
  rows: PerformanceOperation[];
  emptyText: string;
}) {
  if (!rows.length) return <div className="empty-state">{emptyText}</div>;
  return (
    <div className="table-wrap performance-table-wrap">
      <table>
        <thead><tr><th>操作</th><th>样本</th><th>中位数</th><th>P95</th><th>失败</th><th>服务端</th><th>网络</th><th>前端</th></tr></thead>
        <tbody>{rows.map((item) => (
          <tr key={`${item.kind}-${item.operation}`}>
            <td><strong>{performanceOperationLabel(item.operation)}</strong></td>
            <td>{item.samples}</td>
            <td>{formatPerformanceMs(item.p50Ms)}</td>
            <td>{formatPerformanceMs(item.p95Ms)}</td>
            <td className={item.failureCount > 0 ? "performance-failure" : ""}>{item.failureCount}</td>
            <td>{formatPerformanceMs(item.serverAverageMs)}</td>
            <td>{formatPerformanceMs(item.networkAverageMs)}</td>
            <td>{formatPerformanceMs(item.frontendAverageMs)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function PerformanceMonitoring() {
  const [days, setDays] = useState(7);
  const [familyId, setFamilyId] = useState("");
  const [childId, setChildId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [days, familyId, childId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void adminApi.performance(days, {
      familyId: familyId || undefined,
      childId: childId || undefined,
      page,
      pageSize,
    })
      .then(setData)
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "性能数据读取失败");
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, familyId, childId, page, pageSize, refreshKey]);

  const visibleChildren = useMemo(
    () => data?.filters.children.filter(
      (child) => !familyId || child.familyId === familyId,
    ) ?? [],
    [data?.filters.children, familyId],
  );
  const summary = data?.summary;
  const trendMaximum = Math.max(
    1,
    ...(data?.trend.map((item) => item.p95Ms ?? item.averageMs ?? 0) ?? []),
  );
  const hasData = (data?.dataQuality.usableCount ?? 0) > 0;

  return (
    <div className="admin-stack performance-admin-page">
      <div className="performance-toolbar">
        <div>
          <h2>孩子端性能分析</h2>
          <p>页面打开是用户体验指标；启动资源、媒体和运行错误单独用于定位，不混入慢页面比例。</p>
          {data && (
            <small className="performance-scope">
              覆盖 {data.childCount} 个孩子 · {data.dataQuality.usableCount} 条有效样本 · 数据保留 30 天
            </small>
          )}
        </div>
        <div className="performance-toolbar__actions">
          <div className="performance-filter-row">
            <select value={familyId} onChange={(event) => {
              setFamilyId(event.target.value);
              setChildId("");
            }} aria-label="筛选家庭">
              <option value="">全部家庭</option>
              {data?.filters.families.map((family) => (
                <option key={family.id} value={family.id}>{family.name}</option>
              ))}
            </select>
            <select value={childId} onChange={(event) => setChildId(event.target.value)} aria-label="筛选孩子">
              <option value="">全部孩子</option>
              {visibleChildren.map((child) => (
                <option key={child.id} value={child.id}>{child.nickname || "未命名"} · {child.familyName}</option>
              ))}
            </select>
          </div>
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
      {data?.truncated && <div className="admin-notice">当前结果超过 5 万条，仅分析最新记录。请缩短时间或筛选家庭。</div>}
      {loading ? (
        <div className="empty-state">正在汇总孩子端性能数据…</div>
      ) : !data || !hasData ? (
        <Panel title="等待采集数据">
          <div className="performance-empty">
            <strong>当前筛选范围暂时没有数据</strong>
            <p>孩子打开页面、完成任务或发生资源错误后，这里会自动形成趋势。</p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="metric-grid performance-metrics">
            <article><span>页面中位数</span><strong>{formatPerformanceMs(summary?.pageOpenP50Ms ?? null)}</strong><small>{summary?.pageOpenCount ?? 0} 次真实打开</small></article>
            <article><span>页面 P95</span><strong>{formatPerformanceMs(summary?.pageOpenP95Ms ?? null)}</strong><small>95% 的打开不超过此时间</small></article>
            <article><span>慢页面比例</span><strong>{summary?.slowPageRate ?? 0}%</strong><small>超过 1 秒：{summary?.slowPageCount ?? 0} 次</small></article>
            <article><span>交互 P95</span><strong>{formatPerformanceMs(summary?.interactionP95Ms ?? null)}</strong><small>{summary?.interactionCount ?? 0} 次网络交互</small></article>
            <article><span>交互失败</span><strong>{summary?.interactionFailureRate ?? 0}%</strong><small>{summary?.interactionFailureCount ?? 0} 次失败</small></article>
            <article><span>资源异常</span><strong>{(summary?.mediaFailureCount ?? 0) + (summary?.runtimeFailureCount ?? 0)}</strong><small>媒体回退 + 页面运行错误</small></article>
          </div>

          <Panel title="诊断结论">
            <div className="performance-recommendations">
              {data.recommendations.map((item) => (
                <article className={`performance-recommendation performance-recommendation--${item.level}`} key={item.title}>
                  <strong>{item.title}</strong><p>{item.detail}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="页面打开耗时构成">
            <div className="performance-breakdown">
              <div><span>服务端处理</span><strong>{formatPerformanceMs(summary?.serverAverageMs ?? null)}</strong><small>API 与数据库</small></div>
              <div><span>网络等待</span><strong>{formatPerformanceMs(summary?.networkAverageMs ?? null)}</strong><small>设备到服务器</small></div>
              <div><span>前端呈现</span><strong>{formatPerformanceMs(summary?.frontendAverageMs ?? null)}</strong><small>接口返回后到页面可用</small></div>
              <div><span>任务提交 P95</span><strong>{formatPerformanceMs(summary?.completionP95Ms ?? null)}</strong><small>{summary?.completionCount ?? 0} 次任务完成</small></div>
            </div>
          </Panel>

          <Panel title="慢页面主要原因">
            <div className="performance-diagnosis">
              {(Object.keys(PERFORMANCE_DIAGNOSIS) as PerformanceDiagnosis[]).map((key) => (
                <div className={`performance-diagnosis__item performance-diagnosis__item--${key}`} key={key}>
                  <span>{PERFORMANCE_DIAGNOSIS[key].label}</span><strong>{data.diagnosis[key]}</strong><small>{PERFORMANCE_DIAGNOSIS[key].detail}</small>
                </div>
              ))}
            </div>
          </Panel>

          {!!data.trend.length && (
            <Panel title="每日页面体验趋势">
              <div className="performance-trend">{data.trend.map((item) => (
                <div className="performance-trend__row" key={item.date}>
                  <time>{item.date.slice(5)}</time>
                  <div className="performance-trend__track"><span style={{ width: `${Math.max(3, ((item.p95Ms ?? 0) / trendMaximum) * 100)}%` }} /></div>
                  <strong>{formatPerformanceMs(item.p95Ms)}</strong>
                  <small>中位 {formatPerformanceMs(item.p50Ms)} · 慢 {item.slowRate}% · {item.samples} 次</small>
                </div>
              ))}</div>
            </Panel>
          )}

          <Panel title="各页面打开速度">
            <OperationTable rows={data.pageOperations} emptyText="当前没有页面打开样本" />
          </Panel>

          <Panel title="点击与提交接口">
            <OperationTable rows={data.interactionOperations} emptyText="当前没有交互样本" />
          </Panel>

          <Panel title="启动、媒体与运行诊断">
            <OperationTable rows={data.diagnosticOperations} emptyText="当前没有诊断样本" />
          </Panel>

          {!!data.networkBreakdown.length && (
            <Panel title="网络环境对比">
              <div className="table-wrap"><table><thead><tr><th>网络</th><th>样本</th><th>平均打开</th><th>P95</th><th>设备估算 RTT</th><th>估算下行</th></tr></thead><tbody>{data.networkBreakdown.map((item) => (
                <tr key={item.network}><td><strong>{item.network === "unknown" ? "未知" : item.network.toUpperCase()}</strong></td><td>{item.samples}</td><td>{formatPerformanceMs(item.averageMs)}</td><td>{formatPerformanceMs(item.p95Ms)}</td><td>{formatPerformanceMs(item.averageRttMs)}</td><td>{item.averageDownlinkMbps === null ? "—" : `${item.averageDownlinkMbps.toFixed(1)} Mbps`}</td></tr>
              ))}</tbody></table></div>
            </Panel>
          )}

          <Panel title="最近真实慢等待与失败">
            <div className="table-wrap"><table><thead><tr><th>时间</th><th>家庭</th><th>孩子</th><th>操作</th><th>耗时</th><th>状态</th><th>主要原因</th><th>错误详情</th><th>版本</th><th>服务端</th><th>网络</th><th>前端</th><th>请求编号</th></tr></thead><tbody>{data.recentSlowEvents.map((item) => (
              <tr key={item.id}><td>{formatDate(item.createdAt)}</td><td>{item.familyName ?? "—"}</td><td>{item.childNickname ?? item.childId?.slice(-6) ?? "—"}</td><td>{performanceOperationLabel(item.operation)}</td><td><strong>{formatPerformanceMs(item.totalMs)}</strong></td><td>{item.status ?? "—"}</td><td><span className={`performance-cause performance-cause--${item.diagnosis}`}>{PERFORMANCE_DIAGNOSIS[item.diagnosis].label}</span></td><td className="performance-request-id" title={item.errorMessage ?? ""}>{item.errorMessage ?? item.errorName ?? "—"}</td><td className="performance-request-id" title={item.appVersion ?? ""}>{item.appVersion?.slice(0, 10) ?? "—"}</td><td>{formatPerformanceMs(item.serverMs)}</td><td>{formatPerformanceMs(item.clientOverheadMs)}</td><td>{formatPerformanceMs(item.nonApiMs)}</td><td className="performance-request-id" title={item.requestId ?? ""}>{item.requestId?.slice(0, 10) ?? "—"}</td></tr>
            ))}</tbody></table>{!data.recentSlowEvents.length && <div className="empty-state">当前范围没有超过 1 秒的真实等待或失败</div>}</div>
            <Pagination
              className="admin-pagination"
              current={data.recentSlowEventsPage}
              pageSize={pageSize}
              total={data.recentSlowEventsTotal}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              showTotal={(value) => `共 ${value} 条慢事件`}
              onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }}
              onChange={setPage}
            />
            <p className="performance-collected">最早记录 {formatDate(data.collectedFrom)} · 最新记录 {formatDate(data.collectedTo)} · 忽略认证噪音和旧版异常样本 {data.dataQuality.ignoredNoiseCount} 条</p>
          </Panel>
        </>
      )}
    </div>
  );
}
