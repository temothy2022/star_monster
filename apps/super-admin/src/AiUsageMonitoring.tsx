import { useEffect, useMemo, useState } from "react";
import { adminApi, type AiModelUsageDashboard } from "./api";

const PROVIDER_LABELS: Record<string, string> = { DEEPSEEK: "DeepSeek", MINIMAX: "MiniMax" };
const OPERATION_LABELS: Record<string, string> = {
  "text-generation": "文本生成",
  "json-generation": "结构化生成",
  "list-models": "读取模型列表",
  "image-generation": "图片生成",
  "speech-generation": "语音生成",
};

function formatNumber(value: number) { return new Intl.NumberFormat("zh-CN").format(value); }
function shortDate(value: string) { return value.slice(5).replace("-", "/"); }

export function AiUsageMonitoring() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AiModelUsageDashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    void adminApi.aiUsage(days).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "模型统计读取失败"));
  }, [days]);
  const maxDailyCalls = useMemo(() => Math.max(1, ...(data?.trend.map((row) => row.calls) ?? [1])), [data]);
  if (error) return <section className="admin-panel"><header className="admin-panel__header"><h2>模型调用统计</h2></header><div className="admin-notice admin-notice--error">{error}</div></section>;
  if (!data) return <section className="admin-panel"><header className="admin-panel__header"><h2>模型调用统计</h2></header><div className="empty-state">正在读取模型调用数据…</div></section>;
  const deepseek = data.providers.find((provider) => provider.provider === "DEEPSEEK");
  const minimax = data.providers.find((provider) => provider.provider === "MINIMAX");
  return <div className="admin-stack ai-usage-page">
    <section className="admin-panel ai-usage-toolbar"><div><h2>模型调用统计</h2><p>统计真实发往供应商的请求，重试请求也会单独计数。</p></div><div className="segmented-control" aria-label="统计时间范围">{[7, 30, 90].map((option) => <button key={option} className={days === option ? "active" : ""} onClick={() => setDays(option)}>{option} 天</button>)}</div></section>
    <div className="metric-grid ai-usage-metrics">
      <article><span>调用总量</span><strong>{formatNumber(data.totals.calls)}</strong><small>近 {days} 天</small></article>
      <article><span>DeepSeek</span><strong>{formatNumber(deepseek?.calls ?? 0)}</strong><small>结构化、文本和模型列表</small></article>
      <article><span>MiniMax</span><strong>{formatNumber(minimax?.calls ?? 0)}</strong><small>图片和语音生成</small></article>
      <article><span>失败请求</span><strong>{formatNumber(data.totals.failed)}</strong><small>成功率 {data.totals.successRate === null ? "—" : `${data.totals.successRate}%`}</small></article>
      <article><span>Token 总量</span><strong>{formatNumber(data.totals.totalTokens)}</strong><small>供应商返回值</small></article>
    </div>
    <section className="admin-panel"><header className="admin-panel__header"><h2>每日调用趋势</h2><span className="muted-text">橙色 MiniMax · 蓝色 DeepSeek</span></header>{data.trend.every((row) => row.calls === 0) ? <div className="empty-state">这段时间还没有模型调用记录</div> : <div className="ai-usage-trend" role="img" aria-label="每日模型调用数量柱状图">{data.trend.map((row) => <div className="ai-usage-trend__item" key={row.date}><div className="ai-usage-trend__bar" title={`${row.date}: ${row.calls} 次`}><span className="ai-usage-trend__bar--deepseek" style={{ height: `${(row.deepseek / maxDailyCalls) * 100}%` }} /><span className="ai-usage-trend__bar--minimax" style={{ height: `${(row.minimax / maxDailyCalls) * 100}%` }} /></div><small>{shortDate(row.date)}</small><b>{row.calls || ""}</b></div>)}</div>}</section>
    <section className="admin-panel"><header className="admin-panel__header"><h2>按模型与用途</h2><span className="muted-text">耗时为供应商请求的平均耗时</span></header><div className="table-wrap"><table><thead><tr><th>服务商</th><th>模型</th><th>用途</th><th>调用</th><th>成功 / 失败</th><th>平均耗时</th><th>Token</th><th>最近调用</th></tr></thead><tbody>{data.operations.map((row) => <tr key={`${row.provider}-${row.operation}-${row.model}`}><td><span className={`ai-provider ai-provider--${row.provider.toLowerCase()}`}>{PROVIDER_LABELS[row.provider] ?? row.provider}</span></td><td>{row.model}</td><td>{OPERATION_LABELS[row.operation] ?? row.operation}</td><td><strong>{formatNumber(row.calls)}</strong></td><td>{row.success} / {row.failed}</td><td>{row.averageDurationMs === null ? "—" : `${Math.round(row.averageDurationMs)} ms`}</td><td>{formatNumber(row.totalTokens)}</td><td>{new Date(row.lastCalledAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>{!data.operations.length && <div className="empty-state">暂无明细</div>}</div>{data.truncated && <p className="muted-text">记录量较大，当前页面只展示最近 100,000 条调用记录。</p>}</section>
  </div>;
}
