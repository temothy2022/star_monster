import { useEffect, useState } from "react";
import ongoingBackground from "@star-monsters/assets/images/untimed-task/ongoing-bg.webp";
import ongoingStar from "@star-monsters/assets/icons/wishes/star.svg";
import backIcon from "@star-monsters/assets/icons/untimed-task/back.svg";
import moreIcon from "@star-monsters/assets/icons/untimed-task/more.svg";
import completeBackground from "@star-monsters/assets/icons/untimed-task/complete-bg.svg";
import completeSpark from "@star-monsters/assets/icons/untimed-task/complete-spark.svg";
import outlineStar from "@star-monsters/assets/icons/untimed-task/outline-star.svg";
import heartIcon from "@star-monsters/assets/icons/untimed-task/heart.svg";
import centerStar from "@star-monsters/assets/icons/untimed-task/star-center.svg";
import bookIcon from "@star-monsters/assets/icons/untimed-task/book.svg";
import arrowIcon from "@star-monsters/assets/icons/untimed-task/arrow.svg";
import { useMascot } from "../mascots";
import {
  playCompletionSound,
  prepareCompletionSound,
} from "../audio/completion-sound";
import { LoadingDots } from "../components/LoadingDots";
import {
  AbandonDialog,
  MoreMenu,
  type UntimedOverlay,
} from "./TaskOverlays";

type ActiveTaskProps = {
  onBack: () => void;
  onComplete: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onAbandon?: () => void;
  paused?: boolean;
  completing?: boolean;
  taskTitle: string;
  rewardStars: number;
  initialOverlay?: UntimedOverlay;
};

export function UntimedTaskActive({
  onBack,
  onComplete,
  onPause,
  onResume,
  onAbandon,
  paused = false,
  completing = false,
  taskTitle,
  rewardStars,
  initialOverlay = null,
}: ActiveTaskProps) {
  const [overlay, setOverlay] = useState<UntimedOverlay>(
    initialOverlay === "abandon" ? null : initialOverlay,
  );
  const leaveTask = onAbandon ?? onBack;

  useEffect(() => {
    [
      completeBackground,
      completeSpark,
      outlineStar,
      heartIcon,
      centerStar,
      bookIcon,
      arrowIcon,
    ].forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

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
            className={completing ? "child-submit-button--loading" : undefined}
            type="button"
            disabled={completing}
            aria-busy={completing}
            onClick={
              paused
                ? onResume
                : () => {
                    prepareCompletionSound();
                    onComplete();
                  }
            }
          >
            {completing ? (
              <LoadingDots label="正在完成" />
            ) : paused ? (
              "继续任务"
            ) : (
              `完成啦 +${rewardStars}★`
            )}
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
