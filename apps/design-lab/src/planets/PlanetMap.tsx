import { useEffect, useState } from "react";
import {
  ApiError,
  getChildPlanets,
  markChildPlanetCelebrated,
  type ChildPlanet,
  type PlanetMapResponse,
} from "../api/child-api";
import energyIcon from "../assets/onboarding/step4-energy.svg";
import starIcon from "../assets/onboarding/step4-star.svg";
import lockIcon from "../assets/planets/lock.svg";
import {
  ChildBottomNav,
  type ChildRoute,
} from "../components/ChildBottomNav";
import { ChildDataState } from "../components/ChildDataState";
import { PlanetJourneyScreen } from "../onboarding/OnboardingStep4";
import { PLANET_BY_KEY, type PlanetKey } from "./planet-data";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { reportChildPageReady } from "../api/performance-telemetry";

function remainingEnergy(
  planet: ChildPlanet,
  lifetimeStarsEarned: number,
) {
  return Math.max(0, planet.requiredLifetimeStars - lifetimeStarsEarned);
}

export function PlanetMap({
  onNavigate,
  onOpenPlanet,
}: {
  onNavigate: (route: ChildRoute) => void;
  onOpenPlanet: (planet: PlanetKey) => void;
}) {
  const [data, setData] = useState<PlanetMapResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getChildPlanets()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "#login";
          return;
        }
        setError(reason instanceof Error ? reason.message : "航图暂时无法读取");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useLiveRefresh(
    async () => {
      try {
        setData(await getChildPlanets());
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.hash = "#login";
        }
      }
    },
    { enabled: Boolean(data) },
  );

  useEffect(() => {
    if (data) reportChildPageReady("map", "/api/child/planets");
  }, [data]);

  return (
    <main className="planet-map-page">
      <div className="planet-map-scroll">
        {!data ? (
          <ChildDataState
            error={Boolean(error)}
            message={error || "正在打开星际航图…"}
          />
        ) : (
          <section className="planet-map-content" aria-label="星际航图">
            <header className="planet-map-summary">
              <div className="planet-map-counter">
                <span className="planet-map-counter__icon planet-map-counter__icon--energy">
                  <img src={energyIcon} alt="" />
                </span>
                <span>
                  <small>航行能量</small>
                  <strong>{data.lifetimeStarsEarned}</strong>
                </span>
              </div>
              <div className="planet-map-counter">
                <span className="planet-map-counter__icon">
                  <img src={starIcon} alt="" />
                </span>
                <span>
                  <small>可用星星</small>
                  <strong>{data.starBalance}</strong>
                </span>
              </div>
            </header>

            <div className="planet-map-grid">
              {data.planets.map((progress) => {
                const planet = PLANET_BY_KEY[progress.planet];
                const locked = !progress.unlocked;
                return (
                  <button
                    type="button"
                    className={`planet-card${locked ? " planet-card--locked" : ""}`}
                    key={progress.planet}
                    disabled={locked}
                    onClick={() => onOpenPlanet(progress.planet)}
                    aria-label={
                      locked
                        ? `${planet.name}，还需 ${remainingEnergy(progress, data.lifetimeStarsEarned)} 点航行能量`
                        : `查看${planet.name}`
                    }
                  >
                    <span className="planet-card__corner">
                      {locked ? (
                        <span className="planet-card__lock">
                          <img src={lockIcon} alt="未点亮" />
                        </span>
                      ) : (
                        <span className="planet-card__bonus">
                          <span>+</span>
                          {progress.awardedBonusStars ?? progress.bonusStars}
                          <img src={starIcon} alt="颗星星" />
                        </span>
                      )}
                    </span>
                    <span className="planet-card__art">
                      <img
                        src={planet.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="planet-card__name">{planet.name}</span>
                    <span className="planet-card__english">
                      {planet.englishName}
                    </span>
                    {locked ? (
                      <span className="planet-card__requirement">
                        <img src={energyIcon} alt="" />
                        {progress.requiredLifetimeStars}
                      </span>
                    ) : (
                      <span className="planet-card__status">已点亮</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <ChildBottomNav active="map" onNavigate={onNavigate} />
    </main>
  );
}

export function PlanetJourneyPage({
  planetKey,
  onBack,
}: {
  planetKey: PlanetKey;
  onBack: () => void;
}) {
  const [data, setData] = useState<PlanetMapResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getChildPlanets()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "星球资料暂时无法读取");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = data?.planets.find((planet) => planet.planet === planetKey);
  const planet = PLANET_BY_KEY[planetKey];
  if (!data || !progress) {
    return (
      <main className="planet-journey-loading">
        <ChildDataState
          error={Boolean(error)}
          message={error || "正在抵达新的星球…"}
        />
      </main>
    );
  }

  if (!progress.unlocked) {
    return (
      <main className="planet-journey-loading">
        <ChildDataState error message="这颗星球还没有点亮，继续积攒航行能量吧！" />
        <button className="planet-journey-back" type="button" onClick={onBack}>
          返回航图
        </button>
      </main>
    );
  }

  const isNew = progress.celebratedAt === null;
  const awardedStars = progress.awardedBonusStars ?? progress.bonusStars;
  return (
    <PlanetJourneyScreen
      planetKey={planetKey}
      title={isNew ? `${planet.name}点亮啦！` : `欢迎回到${planet.name}！`}
      description={`${planet.name}（${planet.englishName}）${planet.description}${planet.discovery}`}
      starTitle={isNew ? "点亮奖励" : "星球奖励"}
      starDescription={
        isNew
          ? `${awardedStars} 颗加成星星已经放进你的星星口袋！`
          : `点亮这颗星球时，你获得了 ${awardedStars} 颗加成星星。`
      }
      energyTitle="永久航行能量"
      energyDescription={`现在已经积累 ${data.lifetimeStarsEarned} 点。继续完成任务，向下一颗星球出发！`}
      actionLabel={busy ? "正在记录…" : isNew ? "继续航行" : "返回航图"}
      onAction={() => {
        if (busy) return;
        if (!isNew) {
          onBack();
          return;
        }
        setBusy(true);
        void markChildPlanetCelebrated(planetKey)
          .then(onBack)
          .catch((reason: unknown) => {
            setBusy(false);
            window.alert(
              reason instanceof Error ? reason.message : "暂时无法记录点亮进度",
            );
          });
      }}
    />
  );
}
