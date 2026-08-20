import { useEffect, useMemo, useState } from "react";
import {
  endChildFeverEpisode,
  getChildFeverRecords,
  saveChildFeverReading,
  type FeverAntipyreticKind,
  type FeverEpisode,
  type FeverObservationLevel,
  type FeverThermometerType,
} from "../api/child-api";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { ChildDataState } from "../components/ChildDataState";

const THERMOMETERS: Array<{ value: FeverThermometerType; label: string }> = [
  { value: "EAR", label: "耳温枪" },
  { value: "FOREHEAD", label: "额温枪" },
  { value: "MERCURY", label: "水银体温计" },
];
const THERMOMETER_LABELS = Object.fromEntries(THERMOMETERS.map((item) => [item.value, item.label])) as Record<FeverThermometerType, string>;
const MEDICINE_LABELS: Record<FeverAntipyreticKind, string> = {
  IBUPROFEN: "美林（布洛芬）",
  ACETAMINOPHEN: "泰诺（对乙酰氨基酚）",
  OTHER: "其他退烧药",
};
const OBSERVATION_LABELS: Record<FeverObservationLevel, string> = { GOOD: "良好", FAIR: "一般", POOR: "欠佳" };

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

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function freshDraft(): Draft {
  return {
    temperature: "",
    recordedAt: localDateTimeValue(),
    thermometerType: "EAR",
    medicationUsed: false,
    antipyreticUsed: false,
    antipyreticKind: "",
    medicationNote: "",
    respiratoryRate: "",
    mentalState: "",
    sleepState: "",
    appetiteState: "",
    hydrationState: "",
    note: "",
  };
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}天${hours % 24 ? `${hours % 24}小时` : ""}`;
  if (hours) return `${hours}小时${rest ? `${rest}分` : ""}`;
  return `${rest}分钟`;
}

function FeverChart({ episode }: { episode: FeverEpisode }) {
  const width = 760;
  const height = 280;
  const left = 58;
  const right = width - 22;
  const top = 22;
  const bottom = height - 48;
  const readings = episode.readings;
  if (!readings.length) return <div className="child-fever-empty">保存第一次体温后，这里会出现病程曲线。</div>;
  const times = readings.map((item) => new Date(item.recordedAt).getTime());
  const temperatures = readings.map((item) => item.temperatureCelsius);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = Math.max(60 * 60_000, maxTime - minTime);
  const minTemperature = Math.min(35, Math.floor((Math.min(...temperatures) - 0.5) * 2) / 2);
  const maxTemperature = Math.max(41, Math.ceil((Math.max(...temperatures) + 0.5) * 2) / 2);
  const temperatureRange = maxTemperature - minTemperature;
  const points = readings.map((reading) => {
    const x = left + ((new Date(reading.recordedAt).getTime() - minTime) / timeRange) * (right - left);
    const y = bottom - ((reading.temperatureCelsius - minTemperature) / temperatureRange) * (bottom - top);
    return { reading, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const guideValues = Array.from({ length: 5 }, (_, index) => minTemperature + (temperatureRange * index) / 4);
  return (
    <div className="child-fever-chart-scroll">
      <svg className="child-fever-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="本次发热体温曲线">
        {guideValues.map((value) => {
          const y = bottom - ((value - minTemperature) / temperatureRange) * (bottom - top);
          return <g key={value}><line x1={left} x2={right} y1={y} y2={y} className="child-fever-chart__grid" /><text x={left - 10} y={y + 4} textAnchor="end">{value.toFixed(1)}°</text></g>;
        })}
        <path d={path} className="child-fever-chart__line" />
        {points.map(({ reading, x, y }) => <g key={reading.id}><circle cx={x} cy={y} r="6" className="child-fever-chart__point" /><text x={x} y={y - 13} textAnchor="middle" className="child-fever-chart__temperature">{reading.temperatureCelsius.toFixed(1)}</text>{reading.antipyreticUsed ? <g><path d={`M${x - 7},${bottom + 9} h14 l-7,11 z`} className="child-fever-chart__medicine" /><text x={x} y={bottom + 34} textAnchor="middle" className="child-fever-chart__medicine-label">用药</text></g> : null}<text x={x} y={height - 8} textAnchor="middle" className="child-fever-chart__time">{dateTimeLabel(reading.recordedAt)}</text></g>)}
      </svg>
    </div>
  );
}

function ChoiceRow<T extends string>({ value, options, onChange, label }: { value: T | ""; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="child-fever-choice" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function ChildFeverPage({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [expanded, setExpanded] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState<FeverEpisode | null>(null);
  const [history, setHistory] = useState<FeverEpisode[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedEpisode = selectedHistoryId
    ? history.find((item) => item.id === selectedHistoryId) ?? activeEpisode ?? history[0] ?? null
    : activeEpisode ?? history[0] ?? null;

  async function load(page = historyPage) {
    const result = await getChildFeverRecords(page, 8);
    setActiveEpisode(result.activeEpisode);
    setHistory(result.history);
    setHistoryTotal(result.total);
    setSelectedHistoryId((current) => {
      if (current && result.history.some((item) => item.id === current)) return current;
      return result.activeEpisode ? null : result.history[0]?.id ?? null;
    });
  }

  useEffect(() => {
    setLoading(true);
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "发热记录暂时无法读取")).finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    if (saving) return;
    const temperature = Number(draft.temperature);
    const recordedAt = new Date(draft.recordedAt);
    const respiratoryRate = draft.respiratoryRate === "" ? null : Number(draft.respiratoryRate);
    if (!Number.isFinite(temperature) || temperature < 34 || temperature > 43) {
      setError("请输入 34.0°C 到 43.0°C 之间的体温");
      return;
    }
    if (Number.isNaN(recordedAt.getTime())) {
      setError("请选择正确的记录时间");
      return;
    }
    if (respiratoryRate !== null && (!Number.isInteger(respiratoryRate) || respiratoryRate < 5 || respiratoryRate > 120)) {
      setError("呼吸次数请输入 5 到 120 之间的整数");
      return;
    }
    if (draft.antipyreticUsed && !draft.antipyreticKind) {
      setError("请选择使用的退烧药");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveChildFeverReading({
        recordedAt: recordedAt.toISOString(),
        temperatureCelsius: Math.round(temperature * 10) / 10,
        thermometerType: draft.thermometerType || null,
        medicationUsed: draft.medicationUsed,
        antipyreticUsed: draft.antipyreticUsed,
        antipyreticKind: draft.antipyreticUsed ? draft.antipyreticKind || null : null,
        medicationNote: draft.medicationNote || null,
        respiratoryRate,
        mentalState: draft.mentalState || null,
        sleepState: draft.sleepState || null,
        appetiteState: draft.appetiteState || null,
        hydrationState: draft.hydrationState || null,
        note: draft.note || null,
      });
      setSelectedHistoryId(null);
      setDraft((current) => ({ ...freshDraft(), thermometerType: current.thermometerType }));
      setMessage("体温记录已保存");
      await load(1);
      window.setTimeout(() => setMessage(""), 2_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存没有完成，请稍后再试");
    } finally {
      setSaving(false);
    }
  }

  async function endEpisode() {
    if (!activeEpisode || saving || !window.confirm("确定结束本次发热记录吗？结束后，下一次保存体温会开启新的病程。")) return;
    setSaving(true);
    setError("");
    try {
      const result = await endChildFeverEpisode();
      setSelectedHistoryId(result.episode.id);
      setMessage("本次发热记录已结束");
      await load(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "病程暂时无法结束");
    } finally {
      setSaving(false);
    }
  }

  const historyPages = Math.max(1, Math.ceil(historyTotal / 8));

  if (loading) return <main className="child-fever-page"><ChildDataState message="正在整理发热记录…" /></main>;

  return (
    <main className="child-fever-page">
      <header className="child-fever-header">
        <button type="button" className="child-profile-page__back" onClick={onBack} aria-label="返回首页"><ChildControlIcon kind="back" /></button>
        <div><span>健康记录</span><h1>发热记录</h1><p>把每次测量放在同一条时间线上，方便家长和医生了解变化。</p></div>
      </header>

      {error ? <button type="button" className="child-fever-message child-fever-message--error" onClick={() => setError("")}>{error}</button> : null}
      {message ? <div className="child-fever-message">{message}</div> : null}

      <div className="child-fever-layout">
        <section className="child-fever-entry" aria-labelledby="fever-entry-title">
          <header><div><span>{activeEpisode ? "继续本次病程" : "新的病程"}</span><h2 id="fever-entry-title">记录体温</h2></div>{activeEpisode ? <b>记录中</b> : null}</header>
          <div className="child-fever-required">
            <label className="child-fever-temperature">体温<div><input required type="number" inputMode="decimal" min="34" max="43" step="0.1" value={draft.temperature} placeholder="38.5" onChange={(event) => update("temperature", event.target.value)} /><span>°C</span></div></label>
            <label>记录时间<input required type="datetime-local" max={localDateTimeValue()} value={draft.recordedAt} onChange={(event) => update("recordedAt", event.target.value)} /></label>
          </div>
          <button type="button" className="child-fever-expand" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span>{expanded ? "收起其他情况" : "展开更多症状和用药"}</span><b>{expanded ? "−" : "+"}</b></button>
          {expanded ? <div className="child-fever-optional">
            <label>温度计类型<ChoiceRow label="温度计类型" value={draft.thermometerType} options={THERMOMETERS} onChange={(value) => update("thermometerType", value)} /></label>
            <label>是否用药<ChoiceRow label="是否用药" value={draft.medicationUsed ? "YES" : "NO"} options={[{ value: "NO", label: "未用药" }, { value: "YES", label: "已用药" }]} onChange={(value) => { const used = value === "YES"; update("medicationUsed", used); if (!used) { update("antipyreticUsed", false); update("antipyreticKind", ""); } }} /></label>
            {draft.medicationUsed ? <><label>是否使用退烧药<ChoiceRow label="是否使用退烧药" value={draft.antipyreticUsed ? "YES" : "NO"} options={[{ value: "NO", label: "不是退烧药" }, { value: "YES", label: "使用了退烧药" }]} onChange={(value) => { update("antipyreticUsed", value === "YES"); if (value === "NO") update("antipyreticKind", ""); }} /></label>{draft.antipyreticUsed ? <label>退烧药<ChoiceRow label="退烧药" value={draft.antipyreticKind} options={Object.entries(MEDICINE_LABELS).map(([value, label]) => ({ value: value as FeverAntipyreticKind, label }))} onChange={(value) => update("antipyreticKind", value)} /></label> : null}<label>用药备注<input type="text" maxLength={200} value={draft.medicationNote} placeholder="可记录用药时间或医嘱，药量请按医生或说明书执行" onChange={(event) => update("medicationNote", event.target.value)} /></label></> : null}
            <div className="child-fever-observation-grid">
              <label>呼吸次数（次/分）<input type="number" inputMode="numeric" min="5" max="120" value={draft.respiratoryRate} onChange={(event) => update("respiratoryRate", event.target.value)} /></label>
              {(["mentalState", "sleepState", "appetiteState", "hydrationState"] as const).map((key) => <label key={key}>{({ mentalState: "精神状态", sleepState: "睡眠情况", appetiteState: "食欲", hydrationState: "饮水" })[key]}<select value={draft[key]} onChange={(event) => update(key, event.target.value as FeverObservationLevel | "")}><option value="">未记录</option><option value="GOOD">良好</option><option value="FAIR">一般</option><option value="POOR">欠佳</option></select></label>)}
            </div>
            <label>备注<textarea rows={3} maxLength={1000} value={draft.note} placeholder="记录咳嗽、皮疹、呕吐或其他需要告诉医生的变化" onChange={(event) => update("note", event.target.value)} /></label>
          </div> : null}
          <button type="button" className="child-fever-save" disabled={saving} onClick={() => void save()}>{saving ? "保存中" : "保存这次记录"}</button>
        </section>

        <section className="child-fever-course" aria-labelledby="fever-course-title">
          <header><div><span>{selectedEpisode && !selectedEpisode.endedAt ? "进行中" : "病程回顾"}</span><h2 id="fever-course-title">{selectedEpisode && !selectedEpisode.endedAt ? "本次发热" : selectedEpisode ? "历史发热" : "还没有发热记录"}</h2></div>{selectedEpisode && !selectedEpisode.endedAt ? <button type="button" disabled={saving} onClick={() => void endEpisode()}>结束本次发热</button> : activeEpisode ? <button type="button" onClick={() => setSelectedHistoryId(null)}>查看当前病程</button> : null}</header>
          {selectedEpisode ? <>
            <div className="child-fever-metrics"><article><span>已持续</span><strong>{durationLabel(selectedEpisode.durationMinutes)}</strong></article><article><span>最高体温</span><strong>{selectedEpisode.maximumTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong></article><article><span>{selectedEpisode.endedAt ? "最后体温" : "最近体温"}</span><strong>{selectedEpisode.latestTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong></article><article><span>测量次数</span><strong>{selectedEpisode.readingCount} 次</strong></article></div>
            <FeverChart episode={selectedEpisode} />
            <div className="child-fever-details"><h3>明细记录</h3>{[...selectedEpisode.readings].reverse().map((reading) => <article key={reading.id}><time>{dateTimeLabel(reading.recordedAt)}</time><strong>{reading.temperatureCelsius.toFixed(1)}°C</strong><span>{reading.thermometerType ? THERMOMETER_LABELS[reading.thermometerType] : "未记录温度计"}</span>{reading.antipyreticUsed && reading.antipyreticKind ? <b>{MEDICINE_LABELS[reading.antipyreticKind]}</b> : null}{reading.respiratoryRate ? <span>呼吸 {reading.respiratoryRate} 次/分</span> : null}{reading.mentalState ? <span>精神 {OBSERVATION_LABELS[reading.mentalState]}</span> : null}{reading.note ? <p>{reading.note}</p> : null}</article>)}</div>
          </> : <div className="child-fever-empty">输入第一次体温并保存，就会自动开始本次病程。</div>}
        </section>
      </div>

      <section className="child-fever-history">
        <header><div><span>过去的记录</span><h2>历史病程</h2></div><small>结束当前病程后，会自动保存在这里。</small></header>
        {history.length ? <div className="child-fever-history__list">{history.map((episode) => <button key={episode.id} type="button" className={selectedHistoryId === episode.id ? "is-active" : ""} onClick={() => { setSelectedHistoryId(episode.id); document.querySelector(".child-fever-course")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{dateTimeLabel(episode.startedAt)} 至 {episode.endedAt ? dateTimeLabel(episode.endedAt) : "进行中"}</span><strong>最高 {episode.maximumTemperatureCelsius?.toFixed(1) ?? "—"}°C</strong><small>{durationLabel(episode.durationMinutes)} · {episode.readingCount} 次记录</small></button>)}</div> : <div className="child-fever-empty">还没有已结束的病程。</div>}
        {historyPages > 1 ? <footer><button type="button" disabled={historyPage <= 1} onClick={() => { const page = historyPage - 1; setHistoryPage(page); void load(page); }}>上一页</button><span>{historyPage} / {historyPages}</span><button type="button" disabled={historyPage >= historyPages} onClick={() => { const page = historyPage + 1; setHistoryPage(page); void load(page); }}>下一页</button></footer> : null}
      </section>

      <aside className="child-fever-safety"><strong>需要及时就医的情况</strong><p>记录不能替代医生判断。如果孩子呼吸困难、难以唤醒、抽搐，或出现紫色/按压不褪色的皮疹，请立即寻求医疗帮助。</p></aside>
    </main>
  );
}
