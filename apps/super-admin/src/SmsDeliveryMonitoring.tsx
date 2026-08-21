import { useEffect, useState } from "react";
import { Button, Pagination, Select } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { adminApi, type SmsLogsDashboard } from "./api";

const STATUS_LABELS: Record<string, string> = {
  STARTED: "已发起",
  SUCCESS: "提交成功",
  FAILED: "发送失败",
  NOT_CONFIGURED: "未配置",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "处理中";
  const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return `${Math.max(0, duration)} ms`;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function SmsDeliveryMonitoring() {
  const [data, setData] = useState<SmsLogsDashboard | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void adminApi.smsLogs(page, pageSize, status || undefined)
      .then(setData)
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(reason instanceof Error ? reason.message : "短信调用记录读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, pageSize, status, refreshKey]);

  const summary = data?.summary ?? {};

  return (
    <div className="admin-stack sms-delivery-page">
      <section className="admin-panel sms-delivery-toolbar">
        <div>
          <h2>短信验证码调用</h2>
          <p>查看后端是否真正向短信供应商发起请求。仅超级管理员可见，验证码不会保存。</p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setRefreshKey((value) => value + 1)}>
          刷新
        </Button>
      </section>

      <div className="metric-grid sms-delivery-metrics">
        <article><span>最近 30 天成功</span><strong>{summary.SUCCESS ?? 0}</strong><small>供应商返回成功</small></article>
        <article><span>最近 30 天失败</span><strong>{summary.FAILED ?? 0}</strong><small>HTTP 或业务返回失败</small></article>
        <article><span>未配置记录</span><strong>{summary.NOT_CONFIGURED ?? 0}</strong><small>服务端没有短信配置</small></article>
        <article><span>最近调用</span><strong>{data?.lastCallAt ? formatDate(data.lastCallAt) : "—"}</strong><small>所有验证码请求</small></article>
      </div>

      {error && <div className="admin-notice admin-notice--error">{error}</div>}

      {data && (
        <section className="admin-panel">
          <header className="admin-panel__header">
            <div>
              <h2>供应商配置状态</h2>
              <p className="muted-text">手机号仅在超级后台展示；短信密钥和验证码不会回显或保存。</p>
            </div>
            <span className={`sms-config-status ${data.configuration.configured ? "is-ready" : "is-missing"}`}>
              {data.configuration.configured ? "已配置" : "未配置"}
            </span>
          </header>
          <div className="sms-config-grid">
            <div><span>供应商</span><strong>{data.configuration.providerHost ?? "—"}</strong></div>
            <div><span>模板路径</span><strong>{data.configuration.providerPath ?? "—"}</strong></div>
            <div><span>请求超时</span><strong>{data.configuration.timeoutMs} ms</strong></div>
          </div>
        </section>
      )}

      <section className="admin-panel">
        <header className="admin-panel__header sms-delivery-list-header">
          <div>
            <h2>调用明细</h2>
            <p className="muted-text">如果这里没有记录，说明请求没有进入短信发送服务。</p>
          </div>
          <Select
            aria-label="短信调用状态"
            value={status || undefined}
            placeholder="全部状态"
            allowClear
            style={{ minWidth: 140 }}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(value) => { setStatus(value ?? ""); setPage(1); }}
          />
        </header>
        <div className="table-wrap sms-delivery-table-wrap">
          <table>
            <thead>
              <tr><th>时间</th><th>手机号</th><th>结果</th><th>供应商返回</th><th>请求编号</th><th>消息</th><th>耗时</th></tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td>{log.phoneNumber}</td>
                  <td><span className={`sms-status sms-status--${log.status.toLowerCase()}`}>{statusLabel(log.status)}</span></td>
                  <td>{[log.providerHttpStatus && `HTTP ${log.providerHttpStatus}`, log.providerCode && `业务码 ${log.providerCode}`].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{log.providerRequestId ?? "—"}</td>
                  <td className={log.errorMessage ? "sms-error" : ""}>{log.errorMessage ?? log.providerMessage ?? "—"}</td>
                  <td>{formatDuration(log.startedAt, log.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !data?.logs.length && <div className="empty-state">暂无短信调用记录</div>}
          {loading && <div className="empty-state">正在读取短信调用记录…</div>}
        </div>
        {data && <Pagination
          className="admin-pagination"
          current={page}
          pageSize={pageSize}
          total={data.total}
          showSizeChanger
          pageSizeOptions={[10, 20, 50, 100]}
          showTotal={(value) => `共 ${value} 条记录`}
          onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }}
          onChange={(nextPage, nextPageSize) => { setPage(nextPage); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }}
        />}
      </section>
    </div>
  );
}
