import { useEffect, useState } from "react";
import ongoingBackground from "../assets/untimed-task/ongoing-bg.png";
import ongoingStar from "../assets/wishes/star.svg";
import backIcon from "../assets/untimed-task/back.svg";
import moreIcon from "../assets/untimed-task/more.svg";
import pauseIcon from "../assets/untimed-task/pause.svg";
import cancelIcon from "../assets/untimed-task/cancel.svg";
import abandonBackground from "../assets/untimed-task/abandon-bg.png";
import spaceship from "../assets/untimed-task/spaceship.png";
import playIcon from "../assets/untimed-task/play.svg";
import exitIcon from "../assets/untimed-task/exit.svg";
import helpIcon from "../assets/untimed-task/help.svg";
import sparkleIcon from "../assets/untimed-task/sparkle.svg";
import completeBackground from "../assets/untimed-task/complete-bg.svg";
import completeSpark from "../assets/untimed-task/complete-spark.svg";
import outlineStar from "../assets/untimed-task/outline-star.svg";
import heartIcon from "../assets/untimed-task/heart.svg";
import centerStar from "../assets/untimed-task/star-center.svg";
import bookIcon from "../assets/untimed-task/book.svg";
import arrowIcon from "../assets/untimed-task/arrow.svg";
import { useMascot } from "../mascots";
import {
  playCompletionSound,
  prepareCompletionSound,
} from "../audio/completion-sound";

export type UntimedOverlay = "menu" | "abandon" | null;

type ActiveTaskProps = {
  onBack: () => void;
  onComplete: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onAbandon?: () => void;
  paused?: boolean;
  taskTitle?: string;
  rewardStars?: number;
  initialOverlay?: UntimedOverlay;
};

export function MoreMenu({
  onClose,
  onPause,
  onAbandon,
  paused = false,
}: {
  onClose: () => void;
  onPause: () => void;
  onAbandon: () => void;
  paused?: boolean;
}) {
  return (
    <div
      className="untimed-overlay untimed-overlay--menu"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="untimed-more-menu"
        role="dialog"
        aria-modal="true"
        aria-label="更多菜单"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="untimed-more-menu__panel">
          <button type="button" onClick={onPause}>
            <span className="untimed-more-menu__icon untimed-more-menu__icon--pause">
              <img src={pauseIcon} alt="" />
            </span>
            <span>{paused ? "继续任务" : "暂停一下"}</span>
          </button>
          <button type="button" onClick={onAbandon}>
            <span className="untimed-more-menu__icon">
              <img src={cancelIcon} alt="" />
            </span>
            <span>放弃这次</span>
          </button>
        </div>
        <p>点击空白处返回探索</p>
      </div>
    </div>
  );
}

export function AbandonDialog({
  onContinue,
  onAbandon,
}: {
  onContinue: () => void;
  onAbandon: () => void;
}) {
  return (
    <div className="untimed-overlay untimed-overlay--abandon">
      <section
        className="untimed-abandon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="untimed-abandon-title"
      >
        <img className="untimed-abandon-dialog__texture" src={abandonBackground} alt="" />
        <img className="untimed-abandon-dialog__sparkle" src={sparkleIcon} alt="" />
        <div className="untimed-abandon-dialog__art">
          <span className="untimed-abandon-dialog__art-bg" />
          <img src={spaceship} alt="迷你飞船" />
          <span className="untimed-abandon-dialog__help">
            <img src={helpIcon} alt="" />
          </span>
        </div>
        <h2 id="untimed-abandon-title">要放弃这次吗？</h2>
        <p>不会扣掉已经得到的星星。你可以随时回来重新探索。</p>
        <div className="untimed-abandon-dialog__actions">
          <button className="untimed-abandon-dialog__continue" type="button" onClick={onContinue}>
            <img src={playIcon} alt="" />
            <span>继续任务</span>
          </button>
          <button className="untimed-abandon-dialog__exit" type="button" onClick={onAbandon}>
            <img src={exitIcon} alt="" />
            <span>放弃这次</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function UntimedTaskActive({
  onBack,
  onComplete,
  onPause,
  onResume,
  onAbandon,
  paused = false,
  taskTitle = "指读 3 本 RAZ",
  rewardStars = 1,
  initialOverlay = null,
}: ActiveTaskProps) {
  const [overlay, setOverlay] = useState<UntimedOverlay>(
    initialOverlay === "abandon" ? null : initialOverlay,
  );
  const leaveTask = onAbandon ?? onBack;

  return (
    <main className="untimed-page untimed-page--active">
      <section className="untimed-scene" aria-labelledby="untimed-task-title">
        <img className="untimed-scene__texture" src={ongoingBackground} alt="" />
        <div className="untimed-topbar">
          <button type="button" aria-label="放弃任务并返回" onClick={leaveTask}>
            <img src={backIcon} alt="" />
          </button>
          <button type="button" aria-label="更多" onClick={() => setOverlay("menu")}>
            <img src={moreIcon} alt="" />
          </button>
        </div>

        <section className="untimed-active-card">
          <h1 id="untimed-task-title">{taskTitle}</h1>
          <div className="untimed-active-card__reward" aria-label={`奖励 ${rewardStars} 颗星星`}>
            <span className="untimed-active-card__reward-stars">
              {Array.from({ length: rewardStars }, (_, index) => (
                <img key={index} src={ongoingStar} alt="" />
              ))}
            </span>
            <strong>奖励 {rewardStars} 颗星星</strong>
          </div>
          <button
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
            {paused ? "继续任务" : `完成啦 +${rewardStars}★`}
          </button>
          {paused && <p>任务已暂停，准备好再继续</p>}
        </section>
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
          onAbandon={leaveTask}
        />
      )}
    </main>
  );
}

export function UntimedTaskComplete({
  onContinue,
  taskTitle = "3 本 RAZ 阅读",
  rewardStars = 3,
}: {
  onContinue: () => void;
  taskTitle?: string;
  rewardStars?: number;
}) {
  const { mascot } = useMascot();

  useEffect(() => {
    playCompletionSound();
  }, []);

  return (
    <main className="untimed-page untimed-page--complete">
      <img className="untimed-complete-bg" src={completeBackground} alt="" />
      <span className="untimed-complete-blob untimed-complete-blob--left" />
      <span className="untimed-complete-blob untimed-complete-blob--right" />

      <section className="untimed-complete-card" aria-labelledby="untimed-complete-title">
        <img className="untimed-complete-card__spark" src={completeSpark} alt="" />
        <img className="untimed-complete-card__outline-star" src={outlineStar} alt="" />
        <img className="untimed-complete-card__heart" src={heartIcon} alt="" />

        <h1 id="untimed-complete-title">任务已完成！</h1>
        <div className="untimed-complete-card__stars" aria-label={`获得 ${rewardStars} 颗星星`}>
          {Array.from({ length: rewardStars }, (_, index) => (
            <img key={index} src={centerStar} alt="" />
          ))}
        </div>
        <div className="untimed-complete-card__badge">
          <img src={bookIcon} alt="" />
          <span>{taskTitle}</span>
        </div>
        <img className="untimed-complete-card__mascot" src={mascot.images.celebrate} alt={`庆祝的${mascot.name}`} />
        <button type="button" onClick={onContinue}>
          <span>继续</span>
          <img src={arrowIcon} alt="" />
        </button>
      </section>
    </main>
  );
}
