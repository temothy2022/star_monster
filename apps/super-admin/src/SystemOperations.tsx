import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircleOutlined,
  ClearOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileSyncOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Modal, Progress, Table, Tag, Tooltip } from "antd";
import { adminApi, type SystemDashboard, type SystemOperationKey } from "./api";

const OPERATION_ICONS: Record<SystemOperationKey, ReactNode> = {
  RECONCILE_DAILY_TASKS: <SyncOutlined />,
  CLEAN_EXPIRED_DATA: <ClearOutlined />,
  GENERATE_WEEKLY_REPORTS: <FileSyncOutlined />,
};

const OPERATION_LABELS: Record<string, string> = {
  RECONCILE_DAILY_TASKS: "修复今日任务",
  CLEAN_EXPIRED_DATA: "清理过期数据",
  GENERATE_WEEKLY_REPORTS: "补生成成长周报",
  DATABASE_BACKUP: "下载数据库备份",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days} 天` : "", hours ? `${hours} 小时` : "", `${minutes} 分钟`].filter(Boolean).join(" ");
}

function operationFromLog(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("operation" in metadata)) return "未知操作";
  const operation = String((metadata as { operation: unknown }).operation);
  return OPERATION_LABELS[operation] ?? operation;
}

export function SystemOperations() {
  const [data, setData] = useState<SystemDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<SystemOperationKey | "backup" | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.systemDashboard());
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "系统状态加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const execute = (operation: SystemDashboard["operations"][number]) => {
    Modal.confirm({
      title: `确认${operation.label}？`,
      icon: <ExclamationCircleOutlined />,
      content: <div className="system-confirm"><p>{operation.description}</p><strong>执行过程会记录到审计日志，请等待结果后再离开页面。</strong></div>,
      okText: `确认${operation.label}`,
      cancelText: "取消",
      okButtonProps: operation.risk === "high" ? { danger: true } : undefined,
      onOk: async () => {
        setRunning(operation.key);
        setNotice(null);
        try {
          const response = await adminApi.runSystemOperation(operation.key, operation.confirmation);
          const details = Object.entries(response.result).map(([key, value]) => `${key}: ${value}`).join("，");
          setNotice({ kind: "success", text: `${operation.label}完成${details ? `：${details}` : ""}` });
          await load();
        } catch (error) {
          setNotice({ kind: "error", text: error instanceof Error ? error.message : `${operation.label}失败` });
        } finally {
          setRunning(null);
        }
      },
    });
  };

  const backup = () => {
    Modal.confirm({
      title: "下载数据库备份？",
      icon: <DatabaseOutlined />,
      content: "系统将实时生成 PostgreSQL 自包含备份。文件包含全部家庭和孩子数据，请妥善保管，不要通过公共渠道发送。",
      okText: "生成并下载",
      cancelText: "取消",
      onOk: async () => {
        setRunning("backup");
        setNotice(null);
        try {
          const result = await adminApi.downloadDatabaseBackup();
          const url = URL.createObjectURL(result.blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = result.fileName;
          anchor.click();
          URL.revokeObjectURL(url);
          setNotice({ kind: "success", text: `数据库备份已生成：${result.fileName}` });
          await load();
        } catch (error) {
          setNotice({ kind: "error", text: error instanceof Error ? error.message : "数据库备份失败" });
        } finally {
          setRunning(null);
        }
      },
    });
  };

  if (!data && loading) return <section className="admin-panel"><p>正在检查服务、数据库和媒体目录…</p></section>;
  if (!data) return <Alert type="error" showIcon message="系统状态暂时不可用" action={<Button onClick={() => void load()}>重试</Button>} />;

  const heapPercent = data.service.memory.heapTotalBytes
    ? Math.round((data.service.memory.heapUsedBytes / data.service.memory.heapTotalBytes) * 100)
    : 0;
  const unhealthy = data.database.status !== "ready" || data.migrations.status !== "ready" || data.storages.some((item) => item.status !== "ready");

  return <div className="admin-stack system-operations-page">
    <div className="system-operations-toolbar">
      <div><h2>系统运行与维护</h2><p>只提供经过校验的固定操作，不允许从网页执行任意服务器命令。</p></div>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>重新检查</Button>
    </div>
    {notice ? <Alert closable showIcon type={notice.kind} message={notice.text} onClose={() => setNotice(null)} /> : null}
    {unhealthy ? <Alert showIcon type="warning" message="发现需要处理的系统状态" description="请先查看数据库迁移和媒体目录。运维操作不能代替发布流程中的迁移、Nginx 检查与服务重启。" /> : null}

    <div className="system-health-grid">
      <Card title={<><CloudServerOutlined /> API 服务</>} className="system-health-card">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="状态"><Tag color="success">运行中</Tag></Descriptions.Item>
          <Descriptions.Item label="线上版本"><Tooltip title={data.service.releaseVersion ?? "本地环境无发布标记"}><code>{data.service.releaseVersion?.slice(0, 12) ?? "本地开发"}</code></Tooltip></Descriptions.Item>
          <Descriptions.Item label="启动时间">{formatDate(data.service.startedAt)}</Descriptions.Item>
          <Descriptions.Item label="持续运行">{formatDuration(data.service.uptimeSeconds)}</Descriptions.Item>
          <Descriptions.Item label="Node">{data.service.nodeVersion}</Descriptions.Item>
        </Descriptions>
        <div className="system-memory"><span>Node 堆内存 {data.service.memory.heapDisplay}</span><Progress percent={heapPercent} showInfo={false} status={heapPercent >= 85 ? "exception" : "normal"} /></div>
      </Card>

      <Card title={<><DatabaseOutlined /> 数据库与迁移</>} className="system-health-card">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="连接">{data.database.status === "ready" ? <Tag color="success">正常</Tag> : <Tag color="error">异常</Tag>}</Descriptions.Item>
          <Descriptions.Item label="服务器时间">{formatDate(data.database.serverTime)}</Descriptions.Item>
          <Descriptions.Item label="迁移"><Tag color={data.migrations.status === "ready" ? "success" : "warning"}>{data.migrations.appliedCount} 已应用 / {data.migrations.localCount} 本地</Tag></Descriptions.Item>
          <Descriptions.Item label="待应用">{data.migrations.pending.length ? data.migrations.pending.join("、") : "无"}</Descriptions.Item>
          <Descriptions.Item label="失败记录">{data.migrations.failed.length ? data.migrations.failed.map((item) => item.name).join("、") : "无"}</Descriptions.Item>
        </Descriptions>
        <Button block icon={<CloudDownloadOutlined />} disabled={!data.backup.available} loading={running === "backup"} onClick={backup}>生成并下载数据库备份</Button>
      </Card>

      <Card title={<><FolderOpenOutlined /> 媒体存储</>} className="system-health-card">
        <div className="system-storage-list">{data.storages.map((storage) => <article key={storage.path}>
          <header><strong>{storage.label}</strong><Tag color={storage.status === "ready" ? "success" : "error"}>{storage.status === "ready" ? "可读写" : "异常"}</Tag></header>
          <p>{storage.fileCount} 个文件 · 已用 {storage.usedDisplay} · 可用 {storage.availableDisplay ?? "未知"}</p>
          <Tooltip title={storage.path}><code>{storage.path}</code></Tooltip>
          {storage.message ? <small>{storage.message}</small> : null}
        </article>)}</div>
      </Card>
    </div>

    <section className="admin-panel">
      <header className="admin-panel__header"><div><h2>白名单维护操作</h2><p className="muted-text">这些操作替代过去需要 SSH 执行的高频数据维护命令。</p></div></header>
      <div className="system-operation-grid">{data.operations.map((operation) => <article key={operation.key}>
        <span className="system-operation-icon">{OPERATION_ICONS[operation.key]}</span>
        <div><header><strong>{operation.label}</strong><Tag color={operation.risk === "high" ? "orange" : "blue"}>{operation.risk === "high" ? "会调用模型" : "数据维护"}</Tag></header><p>{operation.description}</p></div>
        <Button type="primary" danger={operation.risk === "high"} loading={running === operation.key} disabled={Boolean(running && running !== operation.key)} onClick={() => execute(operation)}>执行</Button>
      </article>)}</div>
    </section>

    <section className="admin-panel">
      <header className="admin-panel__header"><h2>最近执行记录</h2><span className="muted-text">最近 30 条</span></header>
      <div className="table-wrap"><Table rowKey="id" pagination={{ pageSize: 10, showSizeChanger: false }} dataSource={data.recentRuns} columns={[
        { title: "时间", dataIndex: "createdAt", render: (value: string) => formatDate(value) },
        { title: "操作", render: (_, row) => operationFromLog(row.metadata) },
        { title: "结果", dataIndex: "action", render: (value: string) => value === "SYSTEM_OPERATION_FAILED" ? <Tag color="error">失败</Tag> : <Tag color="success"><CheckCircleOutlined /> 成功</Tag> },
        { title: "操作者", dataIndex: "actorId", render: (value: string | null) => value?.slice(-8) ?? "系统" },
        { title: "详情", dataIndex: "metadata", render: (value: unknown) => <Tooltip title={<pre>{JSON.stringify(value, null, 2)}</pre>}><code className="system-run-metadata">{JSON.stringify(value)}</code></Tooltip> },
      ]} />{!data.recentRuns.length ? <div className="empty-state">还没有人工维护记录</div> : null}</div>
    </section>
  </div>;
}
