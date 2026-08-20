import { useEffect, useMemo, useState } from "react";
import {
  getChildGrowthSummary,
  saveChildGrowthRecord,
  type ChildGrowthRecordInput,
  type ChildGrowthSummary,
} from "../api/child-api";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { ChildDataState } from "../components/ChildDataState";
import growthJourney from "@star-monsters/assets/images/growth/growth-journey.webp";
import healthThermometer from "@star-monsters/assets/images/task-dashboard/health-thermometer.webp";

const CATEGORY_LABELS: Record<ChildGrowthSummary["milestones"][number]["category"], string> = {
  SELF_CARE: "我会自己做",
  LEARNING: "学习进步",
  LANGUAGE: "表达成长",
  PHYSICAL: "运动成长",
  SOCIAL: "交到朋友",
  EMOTIONAL: "认识情绪",
  CREATIVE: "创意时刻",
  FAMILY: "家庭记忆",
  OTHER: "成长记忆",
};

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

function draftFromSummary(growth: ChildGrowthSummary): GrowthDraft {
  const record = growth.todayRecord;
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

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<GrowthDraft>(EMPTY_DRAFT);

  const loadGrowth = () => getChildGrowthSummary()
    .then((nextGrowth) => {
      setGrowth(nextGrowth);
      setDraft(draftFromSummary(nextGrowth));
      return nextGrowth;
    });

  useEffect(() => {
    void loadGrowth()
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "成长档案暂时无法读取"));
  }, []);

  const setField = <K extends keyof GrowthDraft>(key: K, value: GrowthDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveToday = async () => {
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
      await saveChildGrowthRecord(todayKey(), input);
      await loadGrowth();
      setEditing(false);
      setMessage("今天的成长记录保存好了");
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

  if (!growth) {
    return <main className="child-growth-page"><ChildDataState error={Boolean(message)} message={message || "正在打开我的成长…"} /></main>;
  }

  return (
    <main className="child-growth-page">
      <header className="child-growth-page__header">
        <button type="button" className="child-profile-page__back" onClick={onBack} aria-label="返回个人中心"><ChildControlIcon kind="back" /></button>
        <div><span>我的探险档案</span><h1>我的成长</h1><p>每一次坚持和第一次做到，都值得被记住。</p></div>
        <button type="button" className="child-growth-page__record" onClick={() => setEditing((value) => !value)}>{editing ? "收起记录" : growth.todayRecord ? "修改今天" : "记录今天"}</button>
      </header>

      {message ? <div className={`child-growth-message${message.includes("失败") || message.includes("请填写") || message.includes("至少") ? " is-error" : ""}`} role="status">{message}</div> : null}

      {editing ? (
        <section className="child-growth-recorder" aria-label="记录今天的成长情况">
          <header><div><span>今天的成长日记</span><h2>我今天怎么样</h2></div><time>{todayKey().slice(5).replace("-", "月")}日</time></header>
          <div className="child-growth-recorder__section">
            <h3>身体记录 <small>不测量可以留空</small></h3>
            <div className="child-growth-recorder__measurements">
              <label><span>身高</span><div><input type="number" inputMode="decimal" min="40" max="230" step="0.1" value={draft.heightCm} onChange={(event) => setField("heightCm", event.target.value)} placeholder="例如 118.5" /><b>厘米</b></div></label>
              <label><span>体重</span><div><input type="number" inputMode="decimal" min="2" max="250" step="0.1" value={draft.weightKg} onChange={(event) => setField("weightKg", event.target.value)} placeholder="例如 22.5" /><b>千克</b></div></label>
            </div>
          </div>
          <div className="child-growth-recorder__section">
            <h3>作息与活动 <small>按今天实际情况记录</small></h3>
            <div className="child-growth-recorder__grid">
              <label><span>昨晚入睡</span><input type="time" value={draft.sleepStart} onChange={(event) => setField("sleepStart", event.target.value)} /></label>
              <label><span>今天起床</span><input type="time" value={draft.wakeTime} onChange={(event) => setField("wakeTime", event.target.value)} /></label>
              <label><span>午睡</span><div><input type="number" inputMode="numeric" min="0" max="600" value={draft.napMinutes} onChange={(event) => setField("napMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
              <label><span>户外活动</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.outdoorMinutes} onChange={(event) => setField("outdoorMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
              <label><span>运动</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.exerciseMinutes} onChange={(event) => setField("exerciseMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
              <label><span>看屏幕</span><div><input type="number" inputMode="numeric" min="0" max="1440" value={draft.screenMinutes} onChange={(event) => setField("screenMinutes", event.target.value)} placeholder="0" /><b>分钟</b></div></label>
            </div>
          </div>
          <div className="child-growth-recorder__section">
            <h3>今天的状态 <small>点一下最接近的感觉</small></h3>
            <div className="child-growth-recorder__scores">
              <ScoreChoice label="睡眠" value={draft.sleepQuality} onChange={(value) => setField("sleepQuality", value)} />
              <ScoreChoice label="心情" value={draft.moodScore} onChange={(value) => setField("moodScore", value)} />
              <ScoreChoice label="精神" value={draft.energyScore} onChange={(value) => setField("energyScore", value)} />
              <ScoreChoice label="食欲" value={draft.appetiteScore} onChange={(value) => setField("appetiteScore", value)} />
            </div>
            <label className="child-growth-recorder__note"><span>还想记下什么</span><textarea rows={3} maxLength={1000} value={draft.note} onChange={(event) => setField("note", event.target.value)} placeholder="今天发生的事情、哪里不舒服，或者值得记住的小进步……" /></label>
          </div>
          <footer><button type="button" className="child-growth-recorder__cancel" onClick={() => { setDraft(draftFromSummary(growth)); setEditing(false); }}>取消</button><button type="button" className="child-growth-recorder__save" disabled={saving} onClick={() => void saveToday()}>{saving ? "正在保存" : "保存今天"}</button></footer>
        </section>
      ) : null}

      <section className="child-growth-summary" aria-label="最近的生活习惯记录">
        <article><span>睡眠</span><strong>{duration(growth.averageSleepMinutes)}</strong><small>{sleepHint}</small></article>
        <article><span>运动</span><strong>{duration(growth.averageExerciseMinutes)}</strong><small>近 7 次记录的平均值</small></article>
        <article><span>户外</span><strong>{duration(growth.averageOutdoorMinutes)}</strong><small>去阳光下活动一下吧</small></article>
        <article><span>记录</span><strong>{growth.recentDaysRecorded} 天</strong><small>家长最近记录的成长日记</small></article>
      </section>

      <button type="button" className="child-growth-health-entry" onClick={onFever}>
        <img className="child-growth-health-entry__mark" src={healthThermometer} alt="" />
        <span><small>健康记录</small><strong>记录体温和发热病程</strong><b>出现发热时，连续记录变化和用药情况</b></span>
        <ChildControlIcon kind="next" />
      </button>

      <section className="child-growth-milestones">
        <header><div><span>我的成长记忆</span><h2>我又学会了什么</h2></div><b>{growth.milestones.length}</b></header>
        {growth.milestones.length ? <div className="child-growth-milestones__list">{growth.milestones.map((item) => (
          <article key={item.id}>
            <time>{item.happenedOn.slice(5).replace("-", "月")}日</time>
            <div><span>{CATEGORY_LABELS[item.category]}</span><h3>{item.title}</h3>{item.description ? <p>{item.description}</p> : null}</div>
          </article>
        ))}</div> : <div className="child-growth-milestones__empty"><img src={growthJourney} alt="" /><span>你的成长故事正在开始。家长记录新的里程碑后，会在这里出现。</span></div>}
      </section>
    </main>
  );
}
