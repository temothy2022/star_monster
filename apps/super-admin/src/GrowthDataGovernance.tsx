import { paginationSizeChanger } from "./pagination";
import { useEffect, useState } from "react";
import { Pagination } from "antd";
import { adminApi, type GrowthDataOverview } from "./api";

export function GrowthDataGovernance() {
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<GrowthDataOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    void adminApi.growthDataOverview(days, page, pageSize)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "成长数据概览读取失败"));
  }, [days, page, pageSize]);

  return (
    <div className="growth-governance-page">
      <section className="admin-panel growth-governance-header">
        <div><h2>成长数据治理</h2><p>查看记录覆盖率和资料完整度。身体数值、生活备注等敏感内容仅对所属家长开放。</p></div>
        <label>统计范围<select value={days} onChange={(event) => { setDays(Number(event.target.value)); setPage(1); }}><option value={7}>近 7 天</option><option value={30}>近 30 天</option><option value={90}>近 90 天</option></select></label>
      </section>
      {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
      {!data ? <div className="admin-section-loading">正在汇总成长数据…</div> : <>
        <section className="metric-grid growth-governance-metrics">
          <article><span>参与孩子</span><strong>{data.summary.participatingChildren}</strong><small>共 {data.summary.totalChildren} 个启用孩子</small></article>
          <article><span>记录覆盖率</span><strong>{Math.round(data.summary.participationRate * 100)}%</strong><small>统计周期内至少一条记录</small></article>
          <article><span>日常记录</span><strong>{data.summary.recordCount}</strong><small>近 {data.summary.days} 天</small></article>
          <article><span>成长里程碑</span><strong>{data.summary.milestoneCount}</strong><small>近 {data.summary.days} 天新增</small></article>
        </section>
        <section className="admin-panel growth-governance-table-panel">
          <header><div><h2>家庭记录覆盖</h2><p>用于发现尚未开始使用或基础资料缺失的家庭，不展示健康数值。</p></div></header>
          <div className="responsive-table-wrap"><table className="responsive-card-table growth-governance-table"><thead><tr><th>家庭</th><th>孩子</th><th>出生日期</th><th>周期内记录</th><th>里程碑总数</th><th>状态</th></tr></thead><tbody>{data.families.flatMap((family) => family.children.length ? family.children.map((child, index) => <tr key={child.id}><td data-label="家庭">{index === 0 ? family.name : ""}</td><td data-label="孩子">{child.nickname ?? "未设置昵称"}</td><td data-label="出生日期"><span className={child.birthDateConfigured ? "growth-data-status is-ready" : "growth-data-status is-missing"}>{child.birthDateConfigured ? "已配置" : "缺失"}</span></td><td data-label="周期内记录">{child.recordCount}</td><td data-label="里程碑总数">{child.milestoneCount}</td><td data-label="状态">{child.recordCount ? "正常记录" : "尚未开始"}</td></tr>) : [<tr key={`${family.id}-empty`}><td data-label="家庭">{family.name}</td><td colSpan={5}>该家庭还没有孩子</td></tr>])}</tbody></table></div>
          <Pagination className="admin-pagination" current={data.page} pageSize={pageSize} total={data.total} showSizeChanger={paginationSizeChanger} pageSizeOptions={[10, 20, 50, 100]} showTotal={(total) => `共 ${total} 个家庭`} onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} onChange={(nextPage, nextPageSize) => { setPage(nextPage); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }} />
        </section>
      </>}
    </div>
  );
}
