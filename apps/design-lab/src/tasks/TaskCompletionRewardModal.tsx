import rewardHalo from "@star-monsters/assets/images/task-completion/reward-halo.webp";
import rewardStar from "@star-monsters/assets/icons/wishes/star.svg";
import arrowIcon from "@star-monsters/assets/icons/untimed-task/arrow.svg";

export const taskCompletionRewardHalo = rewardHalo;

type TaskCompletionRewardModalProps = {
  baseStars: number;
  bonusStars?: number;
  mascotImage: string;
  mascotName: string;
  backgroundImage: string;
  onContinue: () => void;
};

export function TaskCompletionRewardModal({
  baseStars,
  bonusStars = 0,
  mascotImage,
  mascotName,
  backgroundImage,
  onContinue,
}: TaskCompletionRewardModalProps) {
  const totalStars = Math.max(0, baseStars + bonusStars);

  return (
    <main className="task-reward-page">
      <img className="task-reward-page__background" src={backgroundImage} alt="" aria-hidden="true" />
      <span className="task-reward-page__shade" aria-hidden="true" />
      <div className="task-reward-confetti" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </div>

      <section className="task-reward-modal" role="dialog" aria-modal="true" aria-label="任务奖励">
        <div className="task-reward-stage">
          <img className="task-reward-stage__halo" src={rewardHalo} alt="" />
          <span className="task-reward-stage__orbit task-reward-stage__orbit--one" aria-hidden="true" />
          <span className="task-reward-stage__orbit task-reward-stage__orbit--two" aria-hidden="true" />
          <img className="task-reward-stage__mascot" src={mascotImage} alt={`庆祝的${mascotName}`} />
        </div>

        <div className="task-reward-total" aria-label={`本次获得 ${totalStars} 颗星星`}>
          <span>本次获得</span>
          <strong>+{totalStars}</strong>
          <img src={rewardStar} alt="星星" />
        </div>

        {bonusStars > 0 ? (
          <div className="task-reward-breakdown" aria-label={`任务奖励 ${baseStars} 颗，速度加奖 ${bonusStars} 颗`}>
            <span>任务奖励 <strong>+{baseStars}</strong></span>
            <i />
            <span className="task-reward-breakdown__bonus">速度加奖 <strong>+{bonusStars}</strong></span>
          </div>
        ) : null}

        <button className="task-reward-modal__continue" type="button" onClick={onContinue}>
          <span>收下星星</span>
          <img src={arrowIcon} alt="" aria-hidden="true" />
        </button>
      </section>
    </main>
  );
}
