import { useEffect, useState } from "react";
import ongoingBackground from "@star-monsters/assets/images/untimed-task/ongoing-bg.webp";
import ongoingStar from "@star-monsters/assets/icons/wishes/star.svg";
import completeBackground from "@star-monsters/assets/icons/untimed-task/complete-bg.svg";
import { useMascot } from "../mascots";
import {
  playCompletionSound,
  prepareCompletionSound,
} from "../audio/completion-sound";
import { LoadingDots } from "../components/LoadingDots";
import { ChildControlIcon } from "../components/ChildControlIcon";
import {
  AbandonDialog,
  MoreMenu,
  type UntimedOverlay,
} from "./TaskOverlays";
import {
  TaskCompletionRewardModal,
  taskCompletionRewardHalo,
} from "./TaskCompletionRewardModal";

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
    const preload = () => {
      [
        completeBackground,
        taskCompletionRewardHalo,
      ].forEach((src) => {
        const image = new Image();
        image.decoding = "async";
        image.src = src;
      });
    };
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      const id = requestIdle(preload, { timeout: 2_000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="untimed-page untimed-page--active">
      <section className="untimed-scene" aria-labelledby="untimed-task-title">
        <img className="untimed-scene__texture" src={ongoingBackground} alt="" />
        <div className="untimed-topbar">
          <button type="button" aria-label="放弃任务并返回" onClick={leaveTask}>
            <ChildControlIcon kind="back" />
          </button>
          <button type="button" aria-label="更多" onClick={() => setOverlay("menu")}>
            <ChildControlIcon kind="menu" />
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
  rewardStars,
}: {
  onContinue: () => void;
  rewardStars: number;
}) {
  const { mascot } = useMascot();

  useEffect(() => {
    playCompletionSound();
  }, []);

  return (
    <TaskCompletionRewardModal
      baseStars={rewardStars}
      mascotImage={mascot.images.celebrate}
      mascotName={mascot.name}
      backgroundImage={completeBackground}
      onContinue={onContinue}
    />
  );
}
