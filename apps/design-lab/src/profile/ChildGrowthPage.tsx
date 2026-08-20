import { useEffect, useMemo, useState } from "react";
import { getChildGrowthSummary, type ChildGrowthSummary } from "../api/child-api";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { ChildDataState } from "../components/ChildDataState";
import growthJourney from "@star-monsters/assets/images/growth/growth-journey.webp";

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

export function ChildGrowthPage({ onBack }: { onBack: () => void }) {
  const [growth, setGrowth] = useState<ChildGrowthSummary | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getChildGrowthSummary()
      .then(setGrowth)
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "成长档案暂时无法读取"));
  }, []);

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
      </header>

      <section className="child-growth-summary" aria-label="最近的生活习惯记录">
        <article><span>睡眠</span><strong>{duration(growth.averageSleepMinutes)}</strong><small>{sleepHint}</small></article>
        <article><span>运动</span><strong>{duration(growth.averageExerciseMinutes)}</strong><small>近 7 次记录的平均值</small></article>
        <article><span>户外</span><strong>{duration(growth.averageOutdoorMinutes)}</strong><small>去阳光下活动一下吧</small></article>
        <article><span>记录</span><strong>{growth.recentDaysRecorded} 天</strong><small>家长最近记录的成长日记</small></article>
      </section>

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
