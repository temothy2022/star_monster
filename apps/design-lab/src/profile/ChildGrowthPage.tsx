import { useEffect, useMemo, useState } from "react";
import {
  getChildGrowthRecords,
  getChildGrowthSummary,
  saveChildGrowthRecord,
  type ChildGrowthRecord,
  type ChildGrowthRecordInput,
  type ChildGrowthSummary,
} from "../api/child-api";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { ChildDataState } from "../components/ChildDataState";
import healthThermometer from "@star-monsters/assets/images/task-dashboard/health-thermometer.webp";
import bodyRecordIcon from "@star-monsters/assets/icons/growth-record/body.svg";
import sleepRecordIcon from "@star-monsters/assets/icons/growth-record/sleep.svg";
import exerciseRecordIcon from "@star-monsters/assets/icons/growth-record/exercise.svg";
import outdoorRecordIcon from "@star-monsters/assets/icons/growth-record/outdoor.svg";
import otherRecordIcon from "@star-monsters/assets/icons/growth-record/other.svg";

function duration(value: number | null) {
  if (value === null) return "还没记录";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}小时${minutes ? `${minutes}分` : ""}` : `${minutes}分钟`;
}

type GrowthDraft = {
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

type GrowthRecordCategory = "BODY" | "SLEEP" | "EXERCISE" | "OUTDOOR" | "OTHER";

const RECORD_CATEGORIES: ReadonlyArray<{
  key: GrowthRecordCategory;
  label: string;
  description: string;
  icon: string;
}> = [
  { key: "BODY", label: "身高体重", description: "记录身体的变化", icon: bodyRecordIcon },
  { key: "SLEEP", label: "睡眠作息", description: "记录入睡、起床和午睡", icon: sleepRecordIcon },
  { key: "EXERCISE", label: "运动", description: "记录今天运动了多久", icon: exerciseRecordIcon },
  { key: "OUTDOOR", label: "户外", description: "记录阳光下的活动", icon: outdoorRecordIcon },
  { key: "OTHER", label: "每日状态", description: "记录心情、精神和食欲", icon: otherRecordIcon },
];

const RECORD_CATEGORY_TITLES: Record<GrowthRecordCategory, string> = {
  BODY: "记录身高体重",
  SLEEP: "记录睡眠",
  EXERCISE: "记录运动",
  OUTDOOR: "记录户外活动",
  OTHER: "记录其他情况",
};

const EMPTY_DRAFT: GrowthDraft = {
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

const SCORE_OPTIONS = [
  { value: "1", label: "不太好" },
  { value: "2", label: "一般" },
  { value: "3", label: "还不错" },
  { value: "4", label: "很好" },
  { value: "5", label: "特别棒" },
];

function minuteToTime(value: number | null) {
  if (value === null) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function draftFromRecord(record: ChildGrowthRecord | null): GrowthDraft {
  if (!record) return EMPTY_DRAFT;
  return {
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

function draftFromSummary(growth: ChildGrowthSummary): GrowthDraft {
  return draftFromRecord(growth.todayRecord);
}

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function categoryHasValue(category: GrowthRecordCategory, draft: GrowthDraft) {
  const fields: Record<GrowthRecordCategory, Array<keyof GrowthDraft>> = {
    BODY: ["heightCm", "weightKg"],
    SLEEP: ["sleepStart", "wakeTime", "napMinutes", "sleepQuality"],
    EXERCISE: ["exerciseMinutes"],
    OUTDOOR: ["outdoorMinutes"],
    OTHER: ["screenMinutes", "moodScore", "energyScore", "appetiteScore", "note"],
  };
  return fields[category].some((key) => draft[key].trim() !== "");
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function recordDetails(record: ChildGrowthRecord) {
  const details: string[] = [];
  if (record.heightCm !== null || record.weightKg !== null) details.push(`身高 ${record.heightCm ?? "—"} cm · 体重 ${record.weightKg ?? "—"} kg`);
  if (record.sleepMinutes !== null) details.push(`睡眠 ${duration(record.sleepMinutes)}`);
  if (record.exerciseMinutes !== null) details.push(`运动 ${record.exerciseMinutes} 分钟`);
  if (record.outdoorMinutes !== null) details.push(`户外 ${record.outdoorMinutes} 分钟`);
  if (record.screenMinutes !== null) details.push(`屏幕 ${record.screenMinutes} 分钟`);
  if (record.note) details.push(record.note);
  if (!details.length && (record.moodScore !== null || record.energyScore !== null || record.appetiteScore !== null)) details.push("已记录今天的状态");
  return details.length ? details.join(" · ") : "这一天有记录，但没有填写具体数值";
}

function firstRecordCategory(record: ChildGrowthRecord): GrowthRecordCategory {
  if (record.heightCm !== null || record.weightKg !== null) return "BODY";
  if (record.sleepStartMinute !== null || record.wakeMinute !== null || record.napMinutes !== null || record.sleepQuality !== null) return "SLEEP";
  if (record.exerciseMinutes !== null) return "EXERCISE";
  if (record.outdoorMinutes !== null) return "OUTDOOR";
  return "OTHER";
}

function ScoreChoice({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="child-growth-recorder__score">
      <legend>{label}</legend>
      <div>{SCORE_OPTIONS.map((option) => (
        <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} aria-pressed={value === option.value} onClick={() => onChange(value === option.value ? "" : option.value)}>
          <b>{option.value}</b><span>{option.label}</span>
        </button>
      ))}</div>
    </fieldset>
  );
}

export function ChildGrowthPage({ onBack, onFever }: { onBack: () => void; onFever: () => void }) {
  const [growth, setGrowth] = useState<ChildGrowthSummary | null>(null);
  const [history, setHistory] = useState<ChildGrowthRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [recordCategory, setRecordCategory] = useState<GrowthRecordCategory | null>(null);
  const [editingDate, setEditingDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<GrowthDraft>(EMPTY_DRAFT);

  const loadAll = async (page = historyPage, preserveDraft = editing) => {
    const [nextGrowth, nextHistory] = await Promise.all([
      getChildGrowthSummary(),
      getChildGrowthRecords(page, 8),
    ]);
    setGrowth(nextGrowth);
    setDraft((current) => (preserveDraft ? current : draftFromSummary(nextGrowth)));
    setHistory(nextHistory.records);
    setHistoryPage(nextHistory.page);
    setHistoryTotal(nextHistory.total);
  };

  useEffect(() => {
    void loadAll(1)
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "成长档案暂时无法读取"));
  }, []);

  const setField = <K extends keyof GrowthDraft>(key: K, value: GrowthDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveRecord = async () => {
    if (!recordCategory || !categoryHasValue(recordCategory, draft)) {
      setMessage("请先填写当前记录中的一项内容");
      return;
    }
    const input: ChildGrowthRecordInput = {
      heightCm: optionalNumber(draft.heightCm),
      weightKg: optionalNumber(draft.weightKg),
      sleepStartMinute: timeToMinute(draft.sleepStart),
      wakeMinute: timeToMinute(draft.wakeTime),
      napMinutes: optionalNumber(draft.napMinutes),
      sleepQuality: optionalNumber(draft.sleepQuality),
      outdoorMinutes: optionalNumber(draft.outdoorMinutes),
      exerciseMinutes: optionalNumber(draft.exerciseMinutes),
      screenMinutes: optionalNumber(draft.screenMinutes),
      moodScore: optionalNumber(draft.moodScore),
      energyScore: optionalNumber(draft.energyScore),
      appetiteScore: optionalNumber(draft.appetiteScore),
      note: draft.note.trim() || null,
    };
    const values = Object.values(input).filter((value) => value !== null);
    if (!values.length) {
      setMessage("至少记录一项今天的情况");
      return;
    }
    const numericValues = Object.entries(input)
      .filter(([key, value]) => key !== "note" && value !== null)
      .map(([, value]) => value as number);
    if (numericValues.some((value) => !Number.isFinite(value))) {
      setMessage("数字记录中有一项格式不正确");
      return;
    }
    if (input.heightCm !== null && (input.heightCm < 40 || input.heightCm > 230)) {
      setMessage("身高请填写 40 到 230 厘米之间的数字");
      return;
    }
    if (input.weightKg !== null && (input.weightKg < 2 || input.weightKg > 250)) {
      setMessage("体重请填写 2 到 250 千克之间的数字");
      return;
    }
    if (input.napMinutes !== null && (input.napMinutes < 0 || input.napMinutes > 600)) {
      setMessage("午睡时长请填写 0 到 600 分钟之间的数字");
      return;
    }
    if ([input.outdoorMinutes, input.exerciseMinutes, input.screenMinutes].some((value) => value !== null && (value < 0 || value > 1440))) {
      setMessage("活动和时长请填写 0 到 1440 分钟之间的数字");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await saveChildGrowthRecord(editingDate, input);
      setEditing(false);
      setRecordCategory(null);
      await loadAll(historyPage, false);
      setMessage(editingDate === todayKey() ? "今天的成长记录保存好了" : "历史成长记录更新好了");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败，请再试一次");
    } finally {
      setSaving(false);
    }
  };

  const sleepHint = useMemo(() => {
    if (!growth?.recommendedSleepMinutes) return "和家长一起记录作息";
    return `参考 ${duration(growth.recommendedSleepMinutes.min)}-${duration(growth.recommendedSleepMinutes.max)}`;
  }, [growth]);

  const openRecorder = (category: GrowthRecordCategory, record: ChildGrowthRecord | null = null) => {
    setMessage("");
    setDraft(record ? draftFromRecord(record) : growth ? draftFromSummary(growth) : EMPTY_DRAFT);
    setEditingDate(record?.recordDate ?? todayKey());
    setRecordCategory(category);
    setEditing(true);
  };

  const todayActivityMinutes = growth?.todayRecord
    && (growth.todayRecord.exerciseMinutes !== null || growth.todayRecord.outdoorMinutes !== null)
    ? (growth.todayRecord.exerciseMinutes ?? 0) + (growth.todayRecord.outdoorMinutes ?? 0)
    : null;

  if (!growth) {
    return <main className="child-growth-page"><ChildDataState error={Boolean(message)} message={message || "正在打开我的成长…"} /></main>;
  }

  return (
    <main className="child-growth-page">
      <header className="child-growth-page__header">
        <button type="button" className="child-profile-page__back" onClick={onBack} aria-label="返回"><ChildControlIcon kind="back" /></button>
        <div><h1>我的成长</h1></div>
      </header>

      {message ? <div className={`child-growth-message${message.includes("失败") || message.includes("请填写") || message.includes("至少") ? " is-error" : ""}`} role="status">{message}</div> : null}

      <section className="child-growth-overview" aria-label="健康概览">
        <header><h2>健康概览</h2><span className={growth.todayRecord ? "is-recorded" : ""}>{growth.todayRecord ? "今天已记录" : "今天待记录"}</span></header>
        <div className="child-growth-summary">
          <article><span>身高体重</span><strong>{growth.todayRecord?.heightCm ? `${growth.todayRecord.heightCm} cm` : "还没记录"}</strong><small>{growth.todayRecord?.weightKg ? `体重 ${growth.todayRecord.weightKg} kg` : "记录身体变化"}</small></article>
          <article><span>睡眠作息</span><strong>{duration(growth.todayRecord?.sleepMinutes ?? growth.averageSleepMinutes)}</strong><small>{sleepHint}</small></article>
          <article><span>今日活动</span><strong>{duration(todayActivityMinutes)}</strong><small>运动和户外活动合计</small></article>
          <article><span>记录情况</span><strong>{growth.recentDaysRecorded} 天</strong><small>近 30 天有健康记录</small></article>
        </div>
      </section>

      <section className="child-growth-record-menu" aria-label="记录健康数据">
        <header><h2>记录健康数据</h2><time>{todayKey().slice(5).replace("-", "月")}日</time></header>
        <div className="child-growth-record-menu__grid">
          {RECORD_CATEGORIES.map((category) => (
            <button key={category.key} type="button" className={categoryHasValue(category.key, draft) ? "is-recorded" : ""} onClick={() => openRecorder(category.key)}>
              <img src={category.icon} alt="" />
              <span><strong>{category.label}</strong><small>{category.description}</small></span>
              <b>{categoryHasValue(category.key, draft) ? "已记录" : "去记录"}</b>
              <ChildControlIcon kind="next" />
            </button>
          ))}
        </div>
      </section>

      {editing && recordCategory ? (
        <section className="child-growth-recorder" aria-label="记录今天的成长情况">
          <header><div><span>{editingDate === todayKey() ? "今天的成长记录" : "历史成长记录"}</span><h2>{RECORD_CATEGORY_TITLES[recordCategory]}</h2></div><time>{dateLabel(editingDate)}</time></header>

          <nav className="child-growth-recorder__tabs" aria-label="选择要编辑的记录类型">
            {RECORD_CATEGORIES.map((category) => <button key={category.key} type="button" className={recordCategory === category.key ? "is-active" : ""} onClick={() => setRecordCategory(category.key)}>{category.label}</button>)}
          </nav>

          {recordCategory === "BODY" ? (
            <div className="child-growth-recorder__section">
              <h3>身体变化 <small>没有测量的项目可以留空</small></h3>
              <div className="child-growth-recorder__measurements">
                <label><span>身高</span><div><input type="number" inputMode="decimal" min="40" max="230" step="0.1" value={draft.heightCm} onChange={(event) => setField("heightCm", event.target.value)} placeholder="例如 118.5" /><b>厘米</b></div></label>
                <label><span>体重</span><div><input type="number" inputMode="decimal" min="2" max="250" step="0.1" value={draft.weightKg} onChange={(event) => setField("weightKg", event.target.value)} placeholder="例如 22.5" /><b>千克</b></div></label>
              </div>
            </div>
          ) : null}

          {recordCategory === "SLEEP" ? (
            <div className="child-growth-recorder__section">
              <h3>睡眠情况 <small>按实际情况记录</small></h3>
              <div className="child-growth-recorder__grid">
                <label><span>昨晚入睡</span><input type="time" value={draft.sleepStart} onChange={(event) => setField("sleepStart", event.target.value)} /></label>
                <label><span>今天起床</span><input type="time" value={draft.wakeTime} onChange={(event) => setField("wakeTime", event.target.value)} /></label>
                <label><span>午睡</span><div><input type="number" inputMode="numeric" min="0" max="600" value={draft.napMinutes} onChange={(event) => setField("napMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
              </div>
              <div className="child-growth-recorder__scores child-growth-recorder__scores--single">
                <ScoreChoice label="睡眠质量" value={draft.sleepQuality} onChange={(value) => setField("sleepQuality", value)} />
              </div>
            </div>
          ) : null}

          {recordCategory === "EXERCISE" ? (
            <div className="child-growth-recorder__section">
              <h3>运动情况 <small>跑跳、球类、游泳等都可以记录</small></h3>
              <div className="child-growth-recorder__measurements child-growth-recorder__measurements--single">
                <label><span>运动时长</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.exerciseMinutes} onChange={(event) => setField("exerciseMinutes", event.target.value)} placeholder="例如 45" /><b>分钟</b></div></label>
              </div>
            </div>
          ) : null}

          {recordCategory === "OUTDOOR" ? (
            <div className="child-growth-recorder__section">
              <h3>户外活动 <small>记录今天在户外活动的时间</small></h3>
              <div className="child-growth-recorder__measurements child-growth-recorder__measurements--single">
                <label><span>户外时长</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.outdoorMinutes} onChange={(event) => setField("outdoorMinutes", event.target.value)} placeholder="例如 60" /><b>分钟</b></div></label>
              </div>
            </div>
          ) : null}

          {recordCategory === "OTHER" ? (
            <div className="child-growth-recorder__section">
              <h3>今天的其他情况 <small>只填写想记录的内容</small></h3>
              <div className="child-growth-recorder__measurements child-growth-recorder__measurements--single">
                <label><span>看屏幕</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.screenMinutes} onChange={(event) => setField("screenMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
              </div>
              <div className="child-growth-recorder__scores">
                <ScoreChoice label="心情" value={draft.moodScore} onChange={(value) => setField("moodScore", value)} />
                <ScoreChoice label="精神" value={draft.energyScore} onChange={(value) => setField("energyScore", value)} />
                <ScoreChoice label="食欲" value={draft.appetiteScore} onChange={(value) => setField("appetiteScore", value)} />
              </div>
              <label className="child-growth-recorder__note"><span>还想记下什么</span><textarea rows={3} maxLength={1000} value={draft.note} onChange={(event) => setField("note", event.target.value)} placeholder="今天发生的事情、哪里不舒服，或者值得记住的小进步……" /></label>
            </div>
          ) : null}

          <footer>
            <button type="button" className="child-growth-recorder__cancel" onClick={() => { setMessage(""); setRecordCategory(null); setEditing(false); }}>取消</button>
            <button type="button" className="child-growth-recorder__save" disabled={saving} onClick={() => void saveRecord()}>{saving ? "正在保存" : "保存记录"}</button>
          </footer>
        </section>
      ) : null}

      <section className="child-growth-history" aria-labelledby="child-growth-history-title">
        <header>
          <div><span>按日期查看</span><h2 id="child-growth-history-title">历史成长记录</h2></div>
          <small>可以打开任意一天继续修改</small>
        </header>
        {history.length ? <div className="child-growth-history__list">{history.map((record) => <article key={record.id}>
          <div><time>{dateLabel(record.recordDate)}</time><p>{recordDetails(record)}</p></div>
          <button type="button" onClick={() => openRecorder(firstRecordCategory(record), record)}>编辑</button>
        </article>)}</div> : <div className="child-growth-history__empty">还没有历史记录，今天记录后会显示在这里。</div>}
        {Math.ceil(historyTotal / 8) > 1 ? <footer className="child-growth-history__pagination">
          <button type="button" disabled={historyPage <= 1} onClick={() => { const page = historyPage - 1; void loadAll(page); }}>上一页</button>
          <span>{historyPage} / {Math.ceil(historyTotal / 8)}</span>
          <button type="button" disabled={historyPage >= Math.ceil(historyTotal / 8)} onClick={() => { const page = historyPage + 1; void loadAll(page); }}>下一页</button>
        </footer> : null}
      </section>

      <button type="button" className="child-growth-health-entry" onClick={onFever}>
        <img className="child-growth-health-entry__mark" src={healthThermometer} alt="" />
        <span><strong>发热记录</strong><b>需要时记录体温、症状和用药</b></span>
        <ChildControlIcon kind="next" />
      </button>
    </main>
  );
}
