import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, message, Modal, Pagination } from "antd";
import { MedicineBoxOutlined, PlusOutlined } from "@ant-design/icons";
import {
  parentApi,
  type Child,
  type FeverAntipyreticKind,
  type FeverEpisode,
  type FeverObservationLevel,
  type FeverThermometerType,
} from "./api";

const thermometerLabels: Record<FeverThermometerType, string> = { EAR: "耳温枪", FOREHEAD: "额温枪", MERCURY: "水银体温计" };
const medicineLabels: Record<FeverAntipyreticKind, string> = { IBUPROFEN: "美林（布洛芬）", ACETAMINOPHEN: "泰诺（对乙酰氨基酚）", OTHER: "其他退烧药" };
const observationLabels: Record<FeverObservationLevel, string> = { GOOD: "良好", FAIR: "一般", POOR: "欠佳" };

function localDateTimeValue() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
  return hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function FeverTrend({ episode }: { episode: FeverEpisode }) {
  const points = useMemo(() => {
    if (!episode.readings.length) return [];
    const times = episode.readings.map((item) => new Date(item.recordedAt).getTime());
    const minTime = Math.min(...times);
    const range = Math.max(60 * 60_000, Math.max(...times) - minTime);
    return episode.readings.map((item) => ({
      item,
      x: 52 + ((new Date(item.recordedAt).getTime() - minTime) / range) * 646,
      y: 190 - ((item.temperatureCelsius - 35) / 7) * 160,
    }));
  }, [episode]);
  if (!points.length) return <div className="growth-record-empty">还没有体温记录。</div>;
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  return <div className="fever-admin-chart-scroll"><svg viewBox="0 0 730 232" className="fever-admin-chart" role="img" aria-label="本次发热体温曲线">{[36, 37, 38, 39, 40, 41].map((temperature) => { const y = 190 - ((temperature - 35) / 7) * 160; return <g key={temperature}><line x1="52" x2="700" y1={y} y2={y} /><text x="42" y={y + 4} textAnchor="end">{temperature}°</text></g>; })}<path d={path} />{points.map(({ item, x, y }) => <g key={item.id}><circle cx={x} cy={y} r="5" /><text x={x} y={y - 10} textAnchor="middle">{item.temperatureCelsius.toFixed(1)}</text>{item.antipyreticUsed ? <text x={x} y="215" textAnchor="middle" className="is-medicine">用药</text> : null}</g>)}</svg></div>;
}

type Draft = {
  temperature: string;
  recordedAt: string;
  thermometerType: FeverThermometerType | "";
  medicationUsed: boolean;
  antipyreticUsed: boolean;
  antipyreticKind: FeverAntipyreticKind | "";
  medicationNote: string;
  respiratoryRate: string;
  mentalState: FeverObservationLevel | "";
  sleepState: FeverObservationLevel | "";
  appetiteState: FeverObservationLevel | "";
  hydrationState: FeverObservationLevel | "";
  note: string;
};

function blankDraft(): Draft {
  return { temperature: "", recordedAt: localDateTimeValue(), thermometerType: "EAR", medicationUsed: false, antipyreticUsed: false, antipyreticKind: "", medicationNote: "", respiratoryRate: "", mentalState: "", sleepState: "", appetiteState: "", hydrationState: "", note: "" };
}

export function FeverRecords({ child }: { child: Child }) {
  const [active, setActive] = useState<FeverEpisode | null>(null);
  const [history, setHistory] = useState<FeverEpisode[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<FeverEpisode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetPage = page, targetPageSize = pageSize) => {
    const result = await parentApi.feverRecords(child.id, targetPage, targetPageSize);
    setActive(result.activeEpisode);
    setHistory(result.history);
    setHistoryTotal(result.total);
    setSelected((current) => result.activeEpisode ?? result.history.find((item) => item.id === current?.id) ?? result.history[0] ?? null);
  }, [child.id, page, pageSize]);

  useEffect(() => {
    setLoading(true);
    void load().catch((reason) => message.error(reason instanceof Error ? reason.message : "发热记录暂时无法读取")).finally(() => setLoading(false));
  }, [load]);

  const refreshFirstPage = async () => {
    if (page === 1) await load(1);
    else setPage(1);
  };

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    const temperature = Number(draft.temperature);
    const recordedAt = new Date(draft.recordedAt);
    const respiratoryRate = draft.respiratoryRate === "" ? null : Number(draft.respiratoryRate);
    if (!Number.isFinite(temperature) || temperature < 34 || temperature > 43) return void message.error("请输入 34.0°C 到 43.0°C 之间的体温");
    if (Number.isNaN(recordedAt.getTime())) return void message.error("请选择正确的记录时间");
    if (respiratoryRate !== null && (!Number.isInteger(respiratoryRate) || respiratoryRate < 5 || respiratoryRate > 120)) return void message.error("呼吸次数请输入 5 到 120 之间的整数");
    if (draft.antipyreticUsed && !draft.antipyreticKind) return void message.error("请选择使用的退烧药");
    setBusy(true);
    try {
      await parentApi.saveFeverReading(child.id, {
        recordedAt: recordedAt.toISOString(), temperatureCelsius: Math.round(temperature * 10) / 10,
        thermometerType: draft.thermometerType || null, medicationUsed: draft.medicationUsed, antipyreticUsed: draft.antipyreticUsed,
        antipyreticKind: draft.antipyreticUsed ? draft.antipyreticKind || null : null, medicationNote: draft.medicationNote || null,
        respiratoryRate, mentalState: draft.mentalState || null,
        sleepState: draft.sleepState || null, appetiteState: draft.appetiteState || null, hydrationState: draft.hydrationState || null, note: draft.note || null,
      });
      setModalOpen(false);
      setDraft(blankDraft());
      await refreshFirstPage();
      message.success("体温记录已保存");
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "保存失败"); } finally { setBusy(false); }
  }

  async function endEpisode() {
    setBusy(true);
    try { await parentApi.endFeverEpisode(child.id); await refreshFirstPage(); message.success("本次发热记录已结束"); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  }

  return <div className="fever-admin-stack">
    <section className="admin-panel growth-record-section fever-admin-overview">
      <header><div><h2>发热病程</h2><p>连续记录体温、用药和状态，便于回顾变化或就医时出示。</p></div><div className="fever-admin-actions"><Button icon={<PlusOutlined />} type="primary" onClick={() => { setDraft(blankDraft()); setModalOpen(true); }}>记录体温</Button>{active ? <Button danger loading={busy} onClick={() => { if (window.confirm("确定结束本次发热记录吗？")) void endEpisode(); }}>结束本次发热</Button> : null}</div></header>
      {loading ? <div className="admin-section-loading">正在整理发热记录…</div> : selected ? <><div className="fever-admin-metrics"><article><span>{selected.endedAt ? "病程时长" : "已持续"}</span><strong>{durationLabel(selected.durationMinutes)}</strong></article><article><span>最高温度</span><strong>{selected.maximumTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong></article><article><span>最近温度</span><strong>{selected.latestTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong></article><article><span>记录次数</span><strong>{selected.readingCount}</strong></article></div><FeverTrend episode={selected} /></> : <div className="growth-record-empty">还没有发热记录。第一次保存体温会自动开启本次病程。</div>}
    </section>
    {selected?.readings.length ? <section className="admin-panel growth-record-section"><header><div><h2>测温明细</h2><p>每次记录按时间倒序展示。</p></div></header><div className="responsive-table-wrap"><table className="responsive-card-table fever-admin-table"><thead><tr><th>时间</th><th>体温</th><th>温度计</th><th>用药</th><th>呼吸 / 状态</th><th>备注</th></tr></thead><tbody>{[...selected.readings].reverse().map((item) => <tr key={item.id}><td data-label="时间">{dateTimeLabel(item.recordedAt)}</td><td data-label="体温"><strong>{item.temperatureCelsius.toFixed(1)}°C</strong></td><td data-label="温度计">{item.thermometerType ? thermometerLabels[item.thermometerType] : "—"}</td><td data-label="用药">{item.antipyreticKind ? medicineLabels[item.antipyreticKind] : item.medicationUsed ? "已用药" : "未用药"}</td><td data-label="呼吸 / 状态">{item.respiratoryRate ? `${item.respiratoryRate} 次/分` : "—"}{item.mentalState ? ` · 精神${observationLabels[item.mentalState]}` : ""}</td><td data-label="备注">{item.note || item.medicationNote || "—"}</td></tr>)}</tbody></table></div></section> : null}
    <section className="admin-panel growth-record-section"><header><div><h2>历史病程</h2><p>点击一条病程可查看曲线和完整明细。</p></div></header>{history.length ? <div className="fever-admin-history">{history.map((episode) => <button type="button" className={selected?.id === episode.id ? "is-active" : ""} key={episode.id} onClick={() => setSelected(episode)}><span>{dateTimeLabel(episode.startedAt)}</span><strong>最高 {episode.maximumTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong><small>{durationLabel(episode.durationMinutes)} · {episode.readingCount} 次</small></button>)}</div> : <div className="growth-record-empty">还没有历史病程。</div>}<Pagination className="admin-pagination" current={page} pageSize={pageSize} total={historyTotal} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} onChange={(nextPage, nextPageSize) => { setPage(nextPage); if (nextPageSize !== pageSize) setPageSize(nextPageSize); }} /></section>
    <div className="admin-notice"><MedicineBoxOutlined /> 本功能只用于整理记录，不替代医生诊断或用药指导。呼吸困难、难以唤醒、抽搐或出现紫色皮疹时，应立即寻求医疗帮助。</div>
    <Modal width={720} title="记录体温" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => void save()} confirmLoading={busy} okText="保存记录" cancelText="取消"><div className="fever-admin-form"><div className="fever-admin-form__grid"><label>体温（°C）<input required type="number" inputMode="decimal" min="34" max="43" step="0.1" value={draft.temperature} onChange={(event) => update("temperature", event.target.value)} /></label><label>记录时间<input required type="datetime-local" max={localDateTimeValue()} value={draft.recordedAt} onChange={(event) => update("recordedAt", event.target.value)} /></label><label>温度计<select value={draft.thermometerType} onChange={(event) => update("thermometerType", event.target.value as FeverThermometerType)}>{Object.entries(thermometerLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><details><summary>更多症状和用药</summary><div className="fever-admin-form__grid"><label>是否用药<select value={draft.medicationUsed ? "yes" : "no"} onChange={(event) => { const used = event.target.value === "yes"; update("medicationUsed", used); if (!used) { update("antipyreticUsed", false); update("antipyreticKind", ""); } }}><option value="no">未用药</option><option value="yes">已用药</option></select></label>{draft.medicationUsed ? <label>是否使用退烧药<select value={draft.antipyreticUsed ? "yes" : "no"} onChange={(event) => { const used = event.target.value === "yes"; update("antipyreticUsed", used); if (!used) update("antipyreticKind", ""); }}><option value="no">不是退烧药</option><option value="yes">使用退烧药</option></select></label> : null}{draft.antipyreticUsed ? <label>退烧药<select value={draft.antipyreticKind} onChange={(event) => update("antipyreticKind", event.target.value as FeverAntipyreticKind)}><option value="">请选择</option>{Object.entries(medicineLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}<label>用药备注<input value={draft.medicationNote} maxLength={200} onChange={(event) => update("medicationNote", event.target.value)} /></label><label>呼吸次数（次/分）<input type="number" min="5" max="120" value={draft.respiratoryRate} onChange={(event) => update("respiratoryRate", event.target.value)} /></label>{(["mentalState", "sleepState", "appetiteState", "hydrationState"] as const).map((key) => <label key={key}>{({ mentalState: "精神状态", sleepState: "睡眠情况", appetiteState: "食欲", hydrationState: "饮水" })[key]}<select value={draft[key]} onChange={(event) => update(key, event.target.value as FeverObservationLevel | "")}><option value="">未记录</option><option value="GOOD">良好</option><option value="FAIR">一般</option><option value="POOR">欠佳</option></select></label>)}</div><label>备注<textarea rows={3} maxLength={1000} value={draft.note} onChange={(event) => update("note", event.target.value)} /></label></details></div></Modal>
  </div>;
}
