import { useEffect, useRef, useState, type CSSProperties } from "react";
import startBackground from "../assets/timed-task/start-bg.jpeg";
import fireIcon from "../assets/timed-task/start-icon-3.svg";
import bonusStarIcon from "../assets/timed-task/start-icon-4.svg";
import startCloseIcon from "../assets/timed-task/start-icon-5.svg";
import startArrowIcon from "../assets/timed-task/start-icon-2.svg";
import completeBackground from "../assets/timed-task/complete-bg.jpeg";
import completeCheckIcon from "../assets/timed-task/complete-icon-2.svg";
import completeLightningIcon from "../assets/timed-task/complete-icon-1.svg";
import completeArrowIcon from "../assets/timed-task/complete-icon-4.svg";
import timeoutCloseIcon from "../assets/timed-task/timeout-icon-1.svg";
import retryIcon from "../assets/timed-task/timeout-icon-2.svg";
import raceIcon from "../assets/timed-task/timeout-icon-5.svg";
import finishStarIcon from "../assets/timed-task/timeout-icon-3.svg";
import finishStarWhiteIcon from "../assets/timed-task/timeout-icon-6.svg";
import sparkleIcon from "../assets/timed-task/timeout-icon-7.svg";
import racerDoudou from "../assets/timed-task/racer-2.jpeg";
import racerYaya from "../assets/timed-task/racer-3.jpeg";
import racerBobo from "../assets/timed-task/timeout-extra.jpeg";
import { useMascot } from "../mascots";
import moreIcon from "../assets/untimed-task/more.svg";
import { AbandonDialog, MoreMenu, type UntimedOverlay } from "./UntimedTaskPages";
import {
  playCompletionSound,
  prepareCompletionSound,
} from "../audio/completion-sound";

type TimedTaskProps = {
  onBack: () => void;
};

type TimedTaskActiveProps = TimedTaskProps & {
  onComplete: () => void;
  onTimeout?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onAbandon?: () => void;
  title?: string;
  initialRemainingSeconds?: number;
  earlyThresholdSeconds?: number | null;
  paused?: boolean;
};

function CloseButton({
  onClick,
  icon,
}: {
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      className="timed-close-button"
      type="button"
      aria-label="返回任务列表"
      onClick={onClick}
    >
      <img src={icon} alt="" />
    </button>
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function TimedTaskActive({
  onBack,
  onComplete,
  onTimeout,
  onPause,
  onResume,
  onAbandon,
  title = "这里是任务的标题",
  initialRemainingSeconds = 275,
  earlyThresholdSeconds = 120,
  paused = false,
}: TimedTaskActiveProps) {
  const [remaining, setRemaining] = useState(initialRemainingSeconds);
  const [overlay, setOverlay] = useState<UntimedOverlay>(null);
  const timeoutSent = useRef(false);
  const lastTickAt = useRef(Date.now());

  useEffect(() => {
    setRemaining(initialRemainingSeconds);
    lastTickAt.current = Date.now();
  }, [initialRemainingSeconds]);
  useEffect(() => {
    lastTickAt.current = Date.now();
    if (paused || remaining <= 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastTickAt.current) / 1000);
      if (elapsedSeconds < 1) return;
      lastTickAt.current += elapsedSeconds * 1000;
      setRemaining((current) => Math.max(0, current - elapsedSeconds));
    }, 250);
    return () => window.clearInterval(timer);
  }, [paused, remaining <= 0]);
  useEffect(() => {
    if (remaining === 0 && !timeoutSent.current) {
      timeoutSent.current = true;
      onTimeout?.();
    }
  }, [onTimeout, remaining]);

  const bonusRemaining =
    earlyThresholdSeconds === null
      ? 0
      : Math.max(0, remaining - earlyThresholdSeconds);
  const bonusTotal =
    earlyThresholdSeconds === null
      ? 1
      : Math.max(1, initialRemainingSeconds - earlyThresholdSeconds);
  const bonusPercent = Math.round((bonusRemaining / bonusTotal) * 100);

  return (
    <main
      className="timed-page timed-page--active"
      style={{ "--timed-start-bg": `url(${startBackground})` } as CSSProperties}
    >
      <CloseButton onClick={() => setOverlay("abandon")} icon={startCloseIcon} />
      <button
        className="timed-more-button"
        type="button"
        aria-label="更多"
        onClick={() => setOverlay("menu")}
      >
        <img src={moreIcon} alt="" />
      </button>

      <section className="timed-active-card" aria-labelledby="timed-active-title">
        <div className="timed-task-title-pill">
          <img src={fireIcon} alt="" />
          <h1 id="timed-active-title">{title}</h1>
        </div>

        <div className="timed-countdown">
          <p>剩余时间</p>
          <strong>{formatCountdown(remaining)}</strong>
        </div>

        <section className="timed-bonus-card" aria-label="加奖时间">
          <h2>
            <img src={bonusStarIcon} alt="" />
            <span>加奖时间</span>
          </h2>
          <strong>还剩 {formatCountdown(bonusRemaining)}</strong>
          <div
            className="timed-bonus-progress"
            role="progressbar"
            aria-label="加奖时间进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={bonusPercent}
          >
            <span style={{ width: `${bonusPercent}%` }} />
          </div>
          <p>在加奖时间内完成可获额外星愿！</p>
        </section>

        <button
          className="timed-primary-button timed-primary-button--dark"
          type="button"
          onClick={
            paused
              ? onResume
              : () => {
                  prepareCompletionSound();
                  onComplete();
                }
          }
        >
          <span>{paused ? "继续任务" : "我做完啦"}</span>
          <img src={startArrowIcon} alt="" />
        </button>
      </section>
      {overlay === "menu" && (
        <MoreMenu
          onClose={() => setOverlay(null)}
          paused={paused}
          onPause={() => {
            setOverlay(null);
            if (paused) onResume?.();
            else onPause?.();
          }}
          onAbandon={() => setOverlay("abandon")}
        />
      )}
      {overlay === "abandon" && (
        <AbandonDialog
          onContinue={() => setOverlay(null)}
          onAbandon={onAbandon ?? onBack}
        />
      )}
    </main>
  );
}

export function TimedTaskComplete({
  onBack,
  baseStars = 2,
  bonusStars = 1,
}: TimedTaskProps & { baseStars?: number; bonusStars?: number }) {
  const { mascot } = useMascot();

  useEffect(() => {
    playCompletionSound({ bonus: bonusStars > 0 });
  }, [bonusStars]);

  return (
    <main className="timed-page timed-page--complete">
      <img className="timed-complete-background" src={completeBackground} alt="" />
      <span className="timed-complete-wash" />

      <section className="timed-complete-modal" aria-labelledby="timed-complete-title">
        <h1 id="timed-complete-title">{bonusStars > 0 ? "速度惊人！" : "完成任务！"}</h1>
        <img className="timed-complete-mascot" src={mascot.images.celebrate} alt={`高兴庆祝的${mascot.name}`} />

        <div className="timed-reward-pills">
          <div className="timed-reward-pill timed-reward-pill--task">
            <img src={completeCheckIcon} alt="" />
            <strong>任务 +{baseStars}</strong>
          </div>
          {bonusStars > 0 && (
            <div className="timed-reward-pill timed-reward-pill--bonus">
              <img src={completeLightningIcon} alt="" />
              <strong>加奖 +{bonusStars}</strong>
            </div>
          )}
        </div>

        <button className="timed-primary-button timed-primary-button--orange" type="button" onClick={onBack}>
          <span>继续</span>
          <img src={completeArrowIcon} alt="" />
        </button>
      </section>
    </main>
  );
}

type Racer = {
  name: string;
  percent: number;
  image: string;
  color: string;
  star: string;
};

const racers: Racer[] = [
  {
    name: "豆豆",
    percent: 75,
    image: racerDoudou,
    color: "#fec73c",
    star: finishStarIcon,
  },
  {
    name: "芽芽",
    percent: 100,
    image: racerYaya,
    color: "#72c78e",
    star: finishStarWhiteIcon,
  },
  {
    name: "波波",
    percent: 40,
    image: racerBobo,
    color: "#a78ae7",
    star: finishStarIcon,
  },
];

function RaceProgress({ racer }: { racer: Racer }) {
  return (
    <article className="timed-racer">
      <div className="timed-racer__heading">
        <div className="timed-racer__identity">
          <span className="timed-racer__avatar">
            <img src={racer.image} alt="" />
          </span>
          <strong>{racer.name}</strong>
        </div>
        <span>{racer.percent}%</span>
      </div>
      <div
        className="timed-racer__track"
        role="progressbar"
        aria-label={`${racer.name}竞速进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={racer.percent}
      >
        <span
          className="timed-racer__fill"
          style={{
            width: `${racer.percent}%`,
            backgroundColor: racer.color,
          }}
        />
        <img src={racer.star} alt="" />
      </div>
    </article>
  );
}

export function TimedTaskTimeout({ onBack }: TimedTaskProps) {
  return (
    <main className="timed-page timed-page--timeout">
      <div className="timed-timeout-layout">
        <section className="timed-timeout-panel timed-timeout-panel--summary" aria-labelledby="timed-timeout-title">
          <CloseButton onClick={onBack} icon={timeoutCloseIcon} />
          <div className="timed-timeout-summary">
            <p className="timed-timeout-badge">挑战失败</p>
            <h1 id="timed-timeout-title">00:00</h1>
            <p>这次挑战结束</p>
            <p>不会扣掉已经得到的星星</p>
            <button className="timed-timeout-back" type="button" onClick={onBack}>
              <img src={retryIcon} alt="" />
              <span>返回任务列表</span>
            </button>
          </div>
        </section>

        <section className="timed-timeout-panel timed-timeout-panel--race" aria-labelledby="timed-race-title">
          <header className="timed-race-header">
            <span>
              <img src={raceIcon} alt="" />
            </span>
            <h2 id="timed-race-title">全球星星竞速赛</h2>
          </header>

          <div className="timed-racers">
            {racers.map((racer) => (
              <RaceProgress key={racer.name} racer={racer} />
            ))}
          </div>

          <aside className="timed-race-message">
            <img src={sparkleIcon} alt="" />
            <div>
              <strong>差一点点！</strong>
              <p>芽芽已经到达终点了，下次我们再跑快一点吧！</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
