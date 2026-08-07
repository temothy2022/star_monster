import continueIcon from "@star-monsters/assets/icons/onboarding/step3-continue.svg";
import confettiA from "@star-monsters/assets/icons/onboarding/step3-confetti-a.svg";
import confettiB from "@star-monsters/assets/icons/onboarding/step3-confetti-b.svg";
import confettiC from "@star-monsters/assets/icons/onboarding/step3-confetti-c.svg";
import energyCluster from "@star-monsters/assets/images/onboarding/step3-energy-cluster.png";
import flowArrow from "@star-monsters/assets/images/onboarding/step3-flow-arrow.png";
import heading from "@star-monsters/assets/images/onboarding/step3-heading.webp";
import taskCard from "@star-monsters/assets/images/onboarding/step3-task-card.webp";
import { useMascot } from "../mascots";
import { OnboardingViewport } from "./OnboardingViewport";

interface OnboardingStep3Props {
  onNext: () => void;
}

export function OnboardingStep3({ onNext }: OnboardingStep3Props) {
  const { mascot } = useMascot();

  return (
    <OnboardingViewport className="step3-page" designWidth={1262} referenceNode="1:4">
      <h1 className="visually-hidden">完成小任务，得到能量星</h1>
      <img className="step3-figma-heading" src={heading} alt="" data-figma-node="1:7" />

      <section className="step3-figma-flow" aria-label={`完成阅读15分钟任务，获得三颗能量星，${mascot.name}开心庆祝`}>
        <img className="step3-figma-task" src={taskCard} alt="阅读15分钟，每天一点小进步，任务已完成" data-figma-node="1:10" />
        <img className="step3-figma-arrow step3-figma-arrow--first" src={flowArrow} alt="然后" data-figma-node="1:25" />
        <img className="step3-figma-energy" src={energyCluster} alt="获得三颗能量星" data-figma-node="1:27" />
        <img className="step3-figma-arrow step3-figma-arrow--second" src={flowArrow} alt="然后" data-figma-node="1:38" />
        <img className="step3-figma-mascot" src={mascot.images.celebrate} alt={`开心庆祝的${mascot.name}`} data-figma-node="1:40" />
        <span className="step3-figma-confetti" aria-hidden="true" data-figma-node="1:42">
          <img className="step3-figma-confetti--a" src={confettiA} alt="" />
          <img className="step3-figma-confetti--b" src={confettiB} alt="" />
          <img className="step3-figma-confetti--c" src={confettiC} alt="" />
        </span>
      </section>

      <button className="step3-continue" type="button" onClick={onNext} data-figma-node="1:50">
        <span>继续</span>
        <img src={continueIcon} alt="" />
      </button>
    </OnboardingViewport>
  );
}
