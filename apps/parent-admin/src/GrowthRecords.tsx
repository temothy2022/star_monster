import { paginationSizeChanger } from "./pagination";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, Pagination, Tabs } from "antd";
import {
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  HeartOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  parentApi,
  type Child,
  type GrowthDashboard,
  type GrowthRecord,
} from "./api";
import { FeverRecords } from "./FeverRecords";

type RangeDays = 30 | 90 | 365;
type RecordDraft = {
  recordDate: string;
  heightCm: string;
  weightKg: string;
  sleepStart: string;
  wakeTime: string;
  napMinutes: string;
  sleepQuality: string;
  outdoorMinutes: string;
  exerciseMinutes: string;
  screenMinutes: string;
  moodScore: string;
  energyScore: string;
  appetiteScore: string;
  note: string;
};

function todayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function blankRecord(date = todayKey()): RecordDraft {
  return {
    recordDate: date,
    heightCm: "",
    weightKg: "",
    sleepStart: "",
    wakeTime: "",
    napMinutes: "",
    sleepQuality: "",
    outdoorMinutes: "",
    exerciseMinutes: "",
    screenMinutes: "",
    moodScore: "",
    energyScore: "",
    appetiteScore: "",
    note: "",
  };
}

function minuteToTime(value: number | null) {
  if (value === null) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordDraft(record: GrowthRecord): RecordDraft {
  return {
    recordDate: record.recordDate,
    heightCm: record.heightCm?.toString() ?? "",
    weightKg: record.weightKg?.toString() ?? "",
    sleepStart: minuteToTime(record.sleepStartMinute),
    wakeTime: minuteToTime(record.wakeMinute),
    napMinutes: record.napMinutes?.toString() ?? "",
    sleepQuality: record.sleepQuality?.toString() ?? "",
    outdoorMinutes: record.outdoorMinutes?.toString() ?? "",
    exerciseMinutes: record.exerciseMinutes?.toString() ?? "",
    screenMinutes: record.screenMinutes?.toString() ?? "",
    moodScore: record.moodScore?.toString() ?? "",
    energyScore: record.energyScore?.toString() ?? "",
    appetiteScore: record.appetiteScore?.toString() ?? "",
    note: record.note ?? "",
  };
}

function minutesLabel(value: number | null) {
  if (value === null) return "—";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}小时${minutes ? `${minutes}分` : ""}` : `${minutes}分钟`;
}

function signed(value: number | null, unit: string) {
  if (value === null) return "样本不足";
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

function MetricCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: string }) {
  return <article className={`growth-record-metric growth-record-metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function TrendChart({
  records,
  valueKey,
  label,
  unit,
  color,
}: {
  records: GrowthRecord[];
  valueKey: "heightCm" | "weightKg";
  label: string;
  unit: string;
  color: string;
}) {
  const points = records.filter((record) => record[valueKey] !== null);
  if (points.length < 2) return <div className="growth-record-empty">再记录一次{label}后，这里会显示连续曲线。</div>;
  const values = points.map((record) => record[valueKey] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.2, valueKey === "heightCm" ? 1 : 0.5);
  const low = min - padding;
  const high = max + padding;
  const width = Math.max(560, points.length * 64);
  const plotLeft = 46;
  const plotRight = width - 22;
  const plotTop = 22;
  const plotBottom = 188;
  const coords = points.map((record, index) => {
    const x = plotLeft + (index / Math.max(1, points.length - 1)) * (plotRight - plotLeft);
    const y = plotBottom - (((record[valueKey] as number) - low) / (high - low)) * (plotBottom - plotTop);
    return { record, x, y };
  });
  return (
    <div className="growth-record-chart-scroll">
      <svg className="growth-record-chart" viewBox={`0 0 ${width} 224`} style={{ minWidth: width }} role="img" aria-label={`${label}变化曲线`}>
        {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={plotLeft} x2={plotRight} y1={plotBottom - ratio * (plotBottom - plotTop)} y2={plotBottom - ratio * (plotBottom - plotTop)} className="growth-record-chart__grid" />)}
        <polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map(({ record, x, y }) => <g key={record.id}><circle cx={x} cy={y} r="5" fill="#fff" stroke={color} strokeWidth="3" /><text x={x} y={y - 11} textAnchor="middle" className="growth-record-chart__value">{record[valueKey]}{unit}</text><text x={x} y="214" textAnchor="middle" className="growth-record-chart__date">{record.recordDate.slice(5).replace("-", "/")}</text></g>)}
      </svg>
    </div>
  );
}

function SleepChart({ dashboard }: { dashboard: GrowthDashboard }) {
  const values = dashboard.records.filter((record) => record.sleepMinutes !== null).slice(-14);
  if (!values.length) return <div className="growth-record-empty">记录入睡和起床时间后，这里会显示睡眠趋势。</div>;
  const reference = dashboard.summary.recommendedSleepMinutes;
  const max = Math.max(14 * 60, reference?.max ?? 0, ...values.map((record) => record.sleepMinutes ?? 0));
  return (
    <div className="growth-sleep-chart" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(30px, 1fr))` }}>
      {values.map((record) => {
        const duration = record.sleepMinutes ?? 0;
        const inRange = reference ? duration >= reference.min && duration <= reference.max : true;
        return <article key={record.id}><div className="growth-sleep-chart__track"><span className={inRange ? "is-in-range" : "is-outside"} style={{ height: `${Math.max(8, duration / max * 100)}%` }} title={`${record.recordDate} ${minutesLabel(duration)}`} /></div><b>{(duration / 60).toFixed(1)}h</b><small>{record.recordDate.slice(5).replace("-", "/")}</small></article>;
      })}
    </div>
  );
}

function RecordModal({ open, draft, busy, onChange, onCancel, onSave }: { open: boolean; draft: RecordDraft; busy: boolean; onChange: (draft: RecordDraft) => void; onCancel: () => void; onSave: () => void }) {
  const field = (key: keyof RecordDraft, value: string) => onChange({ ...draft, [key]: value });
  return (
    <Modal title={draft.recordDate === todayKey() ? "记录今天" : "编辑成长记录"} open={open} onCancel={onCancel} footer={null} width={760} destroyOnHidden>
      <form className="growth-record-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <section><h3>日期与身体测量</h3><div className="growth-record-form__grid"><label>记录日期<input type="date" value={draft.recordDate} max={todayKey()} required onChange={(event) => field("recordDate", event.target.value)} /></label><label>身高（cm）<input type="number" inputMode="decimal" min="40" max="230" step="0.1" value={draft.heightCm} onChange={(event) => field("heightCm", event.target.value)} /></label><label>体重（kg）<input type="number" inputMode="decimal" min="2" max="250" step="0.01" value={draft.weightKg} onChange={(event) => field("weightKg", event.target.value)} /></label></div></section>
        <section><h3>睡眠与作息</h3><div className="growth-record-form__grid"><label>前一晚入睡<input type="time" value={draft.sleepStart} onChange={(event) => field("sleepStart", event.target.value)} /></label><label>当天起床<input type="time" value={draft.wakeTime} onChange={(event) => field("wakeTime", event.target.value)} /></label><label>午睡（分钟）<input type="number" min="0" max="600" value={draft.napMinutes} onChange={(event) => field("napMinutes", event.target.value)} /></label><label>睡眠质量<select value={draft.sleepQuality} onChange={(event) => field("sleepQuality", event.target.value)}><option value="">未记录</option><option value="1">1 · 很不安稳</option><option value="2">2 · 较差</option><option value="3">3 · 一般</option><option value="4">4 · 较好</option><option value="5">5 · 很安稳</option></select></label></div></section>
        <section><h3>活动与状态</h3><div className="growth-record-form__grid"><label>户外（分钟）<input type="number" min="0" max="1440" value={draft.outdoorMinutes} onChange={(event) => field("outdoorMinutes", event.target.value)} /></label><label>运动（分钟）<input type="number" min="0" max="1440" value={draft.exerciseMinutes} onChange={(event) => field("exerciseMinutes", event.target.value)} /></label><label>屏幕（分钟）<input type="number" min="0" max="1440" value={draft.screenMinutes} onChange={(event) => field("screenMinutes", event.target.value)} /></label><label>情绪<select value={draft.moodScore} onChange={(event) => field("moodScore", event.target.value)}><option value="">未记录</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label><label>精力<select value={draft.energyScore} onChange={(event) => field("energyScore", event.target.value)}><option value="">未记录</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label><label>食欲<select value={draft.appetiteScore} onChange={(event) => field("appetiteScore", event.target.value)}><option value="">未记录</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label></div></section>
        <label className="growth-record-form__note">家长备注<textarea rows={3} maxLength={1000} value={draft.note} placeholder="记录特殊情况或当天值得关注的变化" onChange={(event) => field("note", event.target.value)} /></label>
        <footer><Button onClick={onCancel}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>保存记录</Button></footer>
      </form>
    </Modal>
  );
}

export function GrowthRecords({ child }: { child: Child }) {
  const [days, setDays] = useState<RangeDays>(90);
  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null);
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordState, setRecordState] = useState<RecordDraft>(blankRecord());
  const [recordBusy, setRecordBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [birthDate, setBirthDate] = useState(child.birthDate ?? "");
  const [biologicalSex, setBiologicalSex] = useState<Child["biologicalSex"]>(child.biologicalSex);
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    const response = await parentApi.growthRecordDashboard(child.id, days);
    setDashboard(response.dashboard);
    setBirthDate(response.dashboard.profile.birthDate ?? "");
    setBiologicalSex(response.dashboard.profile.biologicalSex);
  }, [child.id, days]);

  const loadRecords = useCallback(async () => {
    const response = await parentApi.growthRecords(child.id, recordsPage, recordsPageSize);
    setRecords(response.records);
    setRecordsTotal(response.total);
  }, [child.id, recordsPage, recordsPageSize]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([loadDashboard(), loadRecords()])
      .catch((reason) => setError(reason instanceof Error ? reason.message : "健康数据暂时无法读取"))
      .finally(() => setLoading(false));
  }, [loadDashboard, loadRecords]);

  const latest = dashboard?.latest;
  const rangeLabel = days === 365 ? "近一年" : `近 ${days} 天`;
  const methodology = dashboard?.methodology;
  const sleepReference = dashboard?.summary.recommendedSleepMinutes;

  async function saveRecord() {
    setRecordBusy(true);
    setError("");
    try {
      await parentApi.saveGrowthRecord(child.id, recordState.recordDate, {
        heightCm: numberOrNull(recordState.heightCm),
        weightKg: numberOrNull(recordState.weightKg),
        sleepStartMinute: timeToMinute(recordState.sleepStart),
        wakeMinute: timeToMinute(recordState.wakeTime),
        napMinutes: numberOrNull(recordState.napMinutes),
        sleepQuality: numberOrNull(recordState.sleepQuality),
        outdoorMinutes: numberOrNull(recordState.outdoorMinutes),
        exerciseMinutes: numberOrNull(recordState.exerciseMinutes),
        screenMinutes: numberOrNull(recordState.screenMinutes),
        moodScore: numberOrNull(recordState.moodScore),
        energyScore: numberOrNull(recordState.energyScore),
        appetiteScore: numberOrNull(recordState.appetiteScore),
        note: recordState.note.trim() || null,
      });
      setRecordOpen(false);
      setRecordsPage(1);
      await Promise.all([loadDashboard(), parentApi.growthRecords(child.id, 1, recordsPageSize).then((response) => { setRecords(response.records); setRecordsTotal(response.total); })]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "记录保存失败");
    } finally {
      setRecordBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    try {
      await parentApi.saveGrowthProfile(child.id, { birthDate: birthDate || null, biologicalSex });
      setProfileOpen(false);
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "基础资料保存失败");
    } finally {
      setBusy(false);
    }
  }

  const trendTab = useMemo(() => (
    <div className="growth-record-stack">
      <div className="growth-record-metrics">
        <MetricCard label="最新身高" value={latest?.heightCm ? `${latest.heightCm} cm` : "未记录"} hint={`${rangeLabel}变化 ${signed(dashboard?.summary.heightDeltaCm ?? null, " cm")}`} tone="mint" />
        <MetricCard label="最新体重" value={latest?.weightKg ? `${latest.weightKg} kg` : "未记录"} hint={`${rangeLabel}变化 ${signed(dashboard?.summary.weightDeltaKg ?? null, " kg")}`} tone="blue" />
        <MetricCard label="BMI 趋势值" value={latest?.bmi?.toString() ?? "—"} hint="仅用于连续观察，不作诊断" tone="yellow" />
        <MetricCard label="近 7 次平均睡眠" value={minutesLabel(dashboard?.summary.averageSleepMinutes ?? null)} hint={sleepReference ? `参考 ${minutesLabel(sleepReference.min)}-${minutesLabel(sleepReference.max)}` : "补充出生日期后显示参考"} tone="coral" />
      </div>
      <section className="admin-panel growth-record-section"><header><div><h2>身体成长曲线</h2><p>相同时间、相同设备和相同测量方式更有利于观察趋势。</p></div></header><div className="growth-record-chart-grid"><article><h3>身高</h3><TrendChart records={dashboard?.records ?? []} valueKey="heightCm" label="身高" unit="" color="#48a68f" /></article><article><h3>体重</h3><TrendChart records={dashboard?.records ?? []} valueKey="weightKg" label="体重" unit="" color="#5d83c4" /></article></div></section>
      <section className="admin-panel growth-record-section"><header><div><h2>关注提示</h2><p>提示来自连续记录和年龄参考范围，不替代专业评估。</p></div></header><div className="growth-attention-list">{dashboard?.attention.map((item) => <article key={`${item.title}-${item.detail}`} className={`growth-attention growth-attention--${item.level}`}><HeartOutlined /><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div></section>
      {methodology ? <details className="growth-methodology"><summary>查看计算口径与科学边界</summary><p>{methodology.growth}</p><p>{methodology.bmi}</p><p>{methodology.sleep}</p><p>{methodology.activity}</p><strong>{methodology.disclaimer}</strong></details> : null}
    </div>
  ), [dashboard, latest, methodology, rangeLabel, sleepReference]);

  const routineTab = (
    <div className="growth-record-stack">
      <div className="growth-record-metrics"><MetricCard label="平均睡眠" value={minutesLabel(dashboard?.summary.averageSleepMinutes ?? null)} hint="近 7 次有效记录" tone="blue" /><MetricCard label="平均运动" value={minutesLabel(dashboard?.summary.averageExerciseMinutes ?? null)} hint="5-17 岁参考目标 60 分钟/天" tone="coral" /><MetricCard label="平均户外" value={minutesLabel(dashboard?.summary.averageOutdoorMinutes ?? null)} hint="关注长期趋势，不比较单日" tone="mint" /><MetricCard label="近期记录" value={`${dashboard?.summary.recentDaysRecorded ?? 0} 天`} hint="近 7 条记录覆盖情况" tone="yellow" /></div>
      <section className="admin-panel growth-record-section"><header><div><h2>睡眠时长</h2><p>{sleepReference ? `浅绿色表示处于该年龄 ${minutesLabel(sleepReference.min)}-${minutesLabel(sleepReference.max)} 的参考范围。` : "补充出生日期后，可显示年龄参考范围。"}</p></div></header><SleepChart dashboard={dashboard ?? { profile: { childId: child.id, nickname: child.nickname, birthDate: null, biologicalSex: null, ageYears: null }, latest: null, summary: { recordCount: 0, recentDaysRecorded: 0, averageSleepMinutes: null, recommendedSleepMinutes: null, averageExerciseMinutes: null, averageOutdoorMinutes: null, heightDeltaCm: null, weightDeltaKg: null }, attention: [], records: [], methodology: { bmi: "", growth: "", sleep: "", activity: "", disclaimer: "" } }} /></section>
      <section className="admin-panel growth-record-section"><header><div><h2>最近作息记录</h2><p>睡眠、活动和日常状态放在同一时间轴中观察。</p></div></header><div className="growth-routine-list">{(dashboard?.records ?? []).slice(-10).reverse().map((record) => <article key={record.id}><time>{record.recordDate}</time><span>入睡 <b>{minuteToTime(record.sleepStartMinute) || "—"}</b></span><span>起床 <b>{minuteToTime(record.wakeMinute) || "—"}</b></span><span>运动 <b>{record.exerciseMinutes ?? "—"} 分</b></span><span>户外 <b>{record.outdoorMinutes ?? "—"} 分</b></span></article>)}</div></section>
    </div>
  );

  const recordsTab = (
    <section className="admin-panel growth-record-section"><header><div><h2>记录管理</h2><p>每个日期保留一条记录，再次保存同一天会更新原记录。</p></div><Button type="primary" icon={<PlusOutlined />} onClick={() => { setRecordState(blankRecord()); setRecordOpen(true); }}>记录今天</Button></header>{records.length ? <div className="responsive-table-wrap"><table className="responsive-card-table growth-record-table"><thead><tr><th>日期</th><th>身高 / 体重</th><th>睡眠</th><th>活动</th><th>状态</th><th>操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td data-label="日期">{record.recordDate}</td><td data-label="身高 / 体重">{record.heightCm ?? "—"} cm / {record.weightKg ?? "—"} kg</td><td data-label="睡眠">{minutesLabel(record.sleepMinutes)}</td><td data-label="活动">运动 {record.exerciseMinutes ?? "—"} · 户外 {record.outdoorMinutes ?? "—"}</td><td data-label="状态">情绪 {record.moodScore ?? "—"} · 精力 {record.energyScore ?? "—"}</td><td data-label="操作"><Button type="text" icon={<EditOutlined />} onClick={() => { setRecordState(recordDraft(record)); setRecordOpen(true); }}>编辑</Button><Button danger type="text" icon={<DeleteOutlined />} onClick={() => { if (window.confirm(`确定删除 ${record.recordDate} 的记录吗？`)) void parentApi.deleteGrowthRecord(child.id, record.recordDate).then(() => Promise.all([loadDashboard(), loadRecords()])); }}>删除</Button></td></tr>)}</tbody></table></div> : <div className="growth-record-empty">还没有日常记录。点击“记录今天”开始建立成长时间线。</div>}<Pagination className="admin-pagination" current={recordsPage} pageSize={recordsPageSize} total={recordsTotal} showSizeChanger={paginationSizeChanger} pageSizeOptions={[10, 20, 50, 100]} onShowSizeChange={(_, size) => { setRecordsPage(1); setRecordsPageSize(size); }} onChange={(nextPage, nextPageSize) => { setRecordsPage(nextPage); if (nextPageSize !== recordsPageSize) setRecordsPageSize(nextPageSize); }} /></section>
  );

  return (
    <div className="growth-record-page">
      <section className="growth-record-header">
        <div><h2>健康数据</h2></div>
        <div className="growth-record-header__actions"><label>观察范围<select value={days} onChange={(event) => setDays(Number(event.target.value) as RangeDays)}><option value={30}>近 30 天</option><option value={90}>近 90 天</option><option value={365}>近一年</option></select></label><Button icon={<CalendarOutlined />} onClick={() => setProfileOpen(true)}>基础资料</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { setRecordState(blankRecord()); setRecordOpen(true); }}>记录今天</Button></div>
      </section>
      {error ? <div className="admin-notice admin-notice--error">{error}</div> : null}
      {loading && !dashboard ? <div className="admin-section-loading">正在整理健康数据…</div> : <Tabs className="admin-workspace-tabs growth-record-tabs" items={[{ key: "trend", label: "身体趋势", children: trendTab }, { key: "routine", label: "生活习惯", children: routineTab }, { key: "records", label: "数据记录", children: recordsTab }, { key: "fever", label: "发热记录", children: <FeverRecords child={child} /> }]} />}

      <RecordModal open={recordOpen} draft={recordState} busy={recordBusy} onChange={setRecordState} onCancel={() => setRecordOpen(false)} onSave={() => void saveRecord()} />
      <Modal title="成长参考基础资料" open={profileOpen} onCancel={() => setProfileOpen(false)} onOk={() => void saveProfile()} confirmLoading={busy} okText="保存" cancelText="取消"><div className="growth-profile-form"><p>出生日期只用于选择年龄相关参考范围；生理性别用于后续匹配儿童生长参考曲线，不会展示给孩子。</p><label>出生日期<input type="date" value={birthDate} max={todayKey()} onChange={(event) => setBirthDate(event.target.value)} /></label><label>生理性别<select value={biologicalSex ?? ""} onChange={(event) => setBiologicalSex((event.target.value || null) as Child["biologicalSex"])}><option value="">暂不设置</option><option value="MALE">男</option><option value="FEMALE">女</option><option value="UNSPECIFIED">不指定</option></select></label></div></Modal>
    </div>
  );
}
