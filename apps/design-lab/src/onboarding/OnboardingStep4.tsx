import energyIcon from "@star-monsters/assets/icons/onboarding/step4-energy.svg";
import starIcon from "@star-monsters/assets/icons/onboarding/step4-star.svg";
import startIcon from "@star-monsters/assets/icons/onboarding/step4-start.svg";
import { PLANET_BY_KEY, type PlanetKey } from "../planets/planet-data";
import { OnboardingViewport } from "./OnboardingViewport";

interface OnboardingStep4Props {
  onStart: () => void;
}

export function OnboardingStep4({ onStart }: OnboardingStep4Props) {
  return (
    <PlanetJourneyScreen
      planetKey="MERCURY"
      title="点亮你的第一颗星球！"
      description="欢迎来到水星（Mercury）。在这里，你将通过完成任务收集能量，让这颗灰暗的星球重新焕发生机。"
      starTitle="可用能量星"
      starDescription="完成日常任务获得。用于兑换星愿，也会推动你的星际航程。"
      energyTitle="永久航行能量"
      energyDescription="累积的长期能量。积满后，即可开启飞往下一颗星球的旅程！"
      actionLabel="开始探索"
      onAction={onStart}
      dimPlanet
    />
  );
}

export function PlanetJourneyScreen({
  planetKey,
  title,
  description,
  starTitle,
  starDescription,
  energyTitle,
  energyDescription,
  actionLabel,
  onAction,
  dimPlanet = false,
}: {
  planetKey: PlanetKey;
  title: string;
  description: string;
  starTitle: string;
  starDescription: string;
  energyTitle: string;
  energyDescription: string;
  actionLabel: string;
  onAction: () => void;
  dimPlanet?: boolean;
}) {
  const planet = PLANET_BY_KEY[planetKey];

  return (
    <OnboardingViewport
      className="step4-page planet-journey-page"
      designWidth={1283}
      referenceNode="1:342"
    >
      <span className="step4-glow step4-glow--sun" aria-hidden="true" />
      <span className="step4-glow step4-glow--aqua" aria-hidden="true" />

      <div className="step4-layout" data-figma-node="1:346">
        <section
          className={`step4-planet${dimPlanet ? " step4-planet--dim" : ""}`}
          aria-label={planet.name}
          data-figma-node="1:347"
        >
          <img src={planet.image} alt={planet.name} />
        </section>

        <section className="step4-content" data-figma-node="1:349">
          <article className="step4-welcome" data-figma-node="1:350">
            <span className="step4-welcome__glow" aria-hidden="true" />
            <h1>{title}</h1>
            <p>{description}</p>
          </article>

          <div className="step4-legends" data-figma-node="1:356">
            <article className="step4-legend" data-figma-node="1:357">
              <span className="step4-legend__icon">
                <img src={starIcon} alt="能量星" />
              </span>
              <div>
                <h2>{starTitle}</h2>
                <p>{starDescription}</p>
              </div>
            </article>

            <article className="step4-legend step4-legend--sailing" data-figma-node="1:366">
              <span className="step4-legend__icon">
                <img src={energyIcon} alt="航行能量" />
              </span>
              <div>
                <h2>{energyTitle}</h2>
                <p>{energyDescription}</p>
              </div>
            </article>
          </div>

          <div className="step4-action" data-figma-node="1:376">
            <button type="button" onClick={onAction} data-figma-node="1:377">
              <span>{actionLabel}</span>
              <img src={startIcon} alt="" />
            </button>
          </div>
        </section>
      </div>
    </OnboardingViewport>
  );
}
