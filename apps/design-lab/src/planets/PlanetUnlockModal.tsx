import type { ChildPlanet } from "../api/child-api";
import rewardStar from "@star-monsters/assets/icons/onboarding/step4-star.svg";
import { useMascot } from "../mascots";
import { PLANET_BY_KEY } from "./planet-data";

export function PlanetUnlockModal({
  progress,
  busy,
  onOpenMap,
  onStay,
}: {
  progress: ChildPlanet;
  busy: boolean;
  onOpenMap: () => void;
  onStay: () => void;
}) {
  const { mascot } = useMascot();
  const planet = PLANET_BY_KEY[progress.planet];
  const awardedStars = progress.awardedBonusStars ?? progress.bonusStars;

  return (
    <div className="planet-unlock-overlay">
      <section
        className="planet-unlock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planet-unlock-title"
        data-figma-node="92:156"
      >
        <span className="planet-unlock-modal__sparkle planet-unlock-modal__sparkle--one" aria-hidden="true">★</span>
        <span className="planet-unlock-modal__sparkle planet-unlock-modal__sparkle--two" aria-hidden="true">★</span>
        <span className="planet-unlock-modal__sparkle planet-unlock-modal__sparkle--three" aria-hidden="true">★</span>

        <div className="planet-unlock-modal__mascot">
          <img src={mascot.images.celebrate} alt={`星宠${mascot.name}`} />
        </div>

        <h2 id="planet-unlock-title">{planet.name}点亮啦！</h2>

        <div className="planet-unlock-modal__planet">
          <img src={planet.image} alt={planet.name} />
        </div>

        <div className="planet-unlock-modal__reward" aria-label={`加赠 ${awardedStars} 颗可用能量星`}>
          <img src={rewardStar} alt="" />
          <strong>+{awardedStars} 可用能量星</strong>
        </div>

        <div className="planet-unlock-modal__actions">
          <button
            className="planet-unlock-modal__map"
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onOpenMap}
          >
            去航图看看
          </button>
          <button
            className="planet-unlock-modal__stay"
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onStay}
          >
            留在任务页
          </button>
        </div>
      </section>
    </div>
  );
}
