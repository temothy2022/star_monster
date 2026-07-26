import { useEffect, useState } from "react";
import { OnboardingStep1 } from "./onboarding/OnboardingStep1";
import { OnboardingStep2 } from "./onboarding/OnboardingStep2";
import { OnboardingStep3 } from "./onboarding/OnboardingStep3";
import { OnboardingStep4 } from "./onboarding/OnboardingStep4";
import { TaskExperience, TaskView } from "./tasks/TaskListPages";
import { UntimedTaskActive, UntimedTaskComplete } from "./tasks/UntimedTaskPages";
import {
  TimedTaskActive,
  TimedTaskComplete,
  TimedTaskTimeout,
} from "./tasks/TimedTaskPages";
import { Footprints, WishesRequested } from "./progress/WishesAndFootprints";
import { PlanetJourneyPage, PlanetMap } from "./planets/PlanetMap";
import type { PlanetKey } from "./planets/planet-data";
import { PageIndex } from "./PageIndex";
import type { PageIndexRoute } from "./PageIndex";
import { useMascot } from "./mascots";
import { ChildLoginPage } from "./auth/ChildLoginPage";
import { ChildDataState } from "./components/ChildDataState";
import {
  ApiError,
  abandonAttempt,
  completeAttempt,
  getChildProfile,
  getTodayTasks,
  pauseAttempt,
  resumeAttempt,
  saveOnboarding,
} from "./api/child-api";
import type { TaskAttempt } from "./api/child-api";

type AppRoute =
  | "login"
  | "pages"
  | "step-1"
  | "step-2"
  | "step-3"
  | "step-4"
  | "tasks-partial"
  | "tasks-complete"
  | "tasks-empty"
  | "untimed-active"
  | "untimed-menu"
  | "untimed-abandon"
  | "untimed-complete"
  | "timed-active"
  | "timed-complete"
  | "timed-timeout"
  | "map"
  | "planet-mercury"
  | "planet-venus"
  | "planet-earth"
  | "planet-mars"
  | "planet-jupiter"
  | "planet-saturn"
  | "planet-uranus"
  | "planet-neptune"
  | "wishes-requested"
  | "footprints";

const PLANET_ROUTE_BY_KEY: Record<PlanetKey, AppRoute> = {
  MERCURY: "planet-mercury",
  VENUS: "planet-venus",
  EARTH: "planet-earth",
  MARS: "planet-mars",
  JUPITER: "planet-jupiter",
  SATURN: "planet-saturn",
  URANUS: "planet-uranus",
  NEPTUNE: "planet-neptune",
};

const PLANET_KEY_BY_ROUTE = Object.fromEntries(
  Object.entries(PLANET_ROUTE_BY_KEY).map(([planet, route]) => [route, planet]),
) as Partial<Record<AppRoute, PlanetKey>>;

function readRouteFromHash(): AppRoute {
  const route = window.location.hash.slice(1) as AppRoute;
  const routes: AppRoute[] = [
    "login",
    "pages",
    "step-1",
    "step-2",
    "step-3",
    "step-4",
    "tasks-partial",
    "tasks-complete",
    "tasks-empty",
    "untimed-active",
    "untimed-menu",
    "untimed-abandon",
    "untimed-complete",
    "timed-active",
    "timed-complete",
    "timed-timeout",
    "map",
    "planet-mercury",
    "planet-venus",
    "planet-earth",
    "planet-mars",
    "planet-jupiter",
    "planet-saturn",
    "planet-uranus",
    "planet-neptune",
    "wishes-requested",
    "footprints",
  ];

  return routes.includes(route) ? route : "login";
}

function reportActionError(reason: unknown) {
  window.alert(reason instanceof Error ? reason.message : "操作没有完成，请稍后再试");
}

const STALE_ATTEMPT_ERROR_CODES = new Set([
  "ATTEMPT_NOT_ACTIVE",
  "ATTEMPT_NOT_FOUND",
  "TASK_NOT_FOUND",
  "TASK_ALREADY_COMPLETED",
]);

function isActiveTaskRoute(route: AppRoute) {
  return (
    route === "untimed-active" ||
    route === "untimed-menu" ||
    route === "untimed-abandon" ||
    route === "timed-active"
  );
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(readRouteFromHash);
  const [nickname, setNickname] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<TaskAttempt | null>(null);
  const [attemptRestoreError, setAttemptRestoreError] = useState("");
  const [lastCompletion, setLastCompletion] = useState<{
    taskTitle: string;
    baseStars: number;
    bonusStars: number;
    totalStars: number;
  } | null>(null);
  const { mascot, selectedPet, selectPet } = useMascot();

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState({ route: "login" }, "", "#login");
    }

    const handlePopState = () => setRoute(readRouteFromHash());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    void getChildProfile()
      .then((profile) => {
        if (profile.petType) selectPet(profile.petType);
        if (profile.nickname) setNickname(profile.nickname);
        if (route === "login") {
          navigate(profile.onboardingCompletedAt ? "tasks-partial" : "step-1");
        }
      })
      .catch(() => undefined);
  // Initial session restoration only; navigation owns later route changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(nextRoute: AppRoute) {
    if (nextRoute === route) return;
    window.history.pushState({ route: nextRoute }, "", `#${nextRoute}`);
    setRoute(nextRoute);
  }

  function handleAttemptActionError(reason: unknown) {
    if (
      reason instanceof ApiError &&
      (reason.status === 404 || STALE_ATTEMPT_ERROR_CODES.has(reason.code ?? ""))
    ) {
      setActiveAttempt(null);
      setLastCompletion(null);
      navigate("tasks-partial");
      return;
    }
    reportActionError(reason);
  }

  useEffect(() => {
    if (!isActiveTaskRoute(route) || activeAttempt) {
      setAttemptRestoreError("");
      return;
    }

    let cancelled = false;
    setAttemptRestoreError("");

    void getTodayTasks()
      .then(({ active }) => {
        if (cancelled) return;

        if (!active) {
          window.history.replaceState(
            { route: "tasks-partial" },
            "",
            "#tasks-partial",
          );
          setRoute("tasks-partial");
          return;
        }

        setActiveAttempt(active);
        const expectedRoute =
          active.dailyTask.modeSnapshot === "TIMED"
            ? "timed-active"
            : route === "untimed-menu" || route === "untimed-abandon"
              ? route
              : "untimed-active";

        if (expectedRoute !== route) {
          window.history.replaceState(
            { route: expectedRoute },
            "",
            `#${expectedRoute}`,
          );
          setRoute(expectedRoute);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401) {
          window.history.replaceState({ route: "login" }, "", "#login");
          setRoute("login");
          return;
        }
        setAttemptRestoreError(
          reason instanceof Error ? reason.message : "任务暂时无法读取",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeAttempt, route]);

  if (isActiveTaskRoute(route) && !activeAttempt) {
    return (
      <div className="task-page task-page--loading">
        <ChildDataState
          error={Boolean(attemptRestoreError)}
          message={attemptRestoreError || "正在恢复进行中的任务…"}
        />
      </div>
    );
  }

  if (route.startsWith("tasks-")) {
    const view = route.replace("tasks-", "") as TaskView;
    return (
      <TaskExperience
        view={view}
        onNavigate={navigate}
        onStartAttempt={(attempt) => {
          setActiveAttempt(attempt);
          navigate(
            attempt.dailyTask.modeSnapshot === "TIMED"
              ? "timed-active"
              : "untimed-active",
          );
        }}
      />
    );
  }

  if (route === "login") {
    return (
      <ChildLoginPage
        onAuthenticated={({ onboardingCompleted, nickname: savedNickname, petType }) => {
          if (petType) selectPet(petType);
          if (savedNickname) setNickname(savedNickname);
          navigate(onboardingCompleted ? "tasks-partial" : "step-1");
        }}
      />
    );
  }

  if (route === "pages") {
    return <PageIndex onNavigate={(nextRoute: PageIndexRoute) => navigate(nextRoute)} />;
  }

  if (route === "untimed-active" || route === "untimed-menu" || route === "untimed-abandon") {
    return (
      <UntimedTaskActive
        key={route}
        initialOverlay={
          route === "untimed-menu"
            ? "menu"
            : route === "untimed-abandon"
              ? "abandon"
              : null
        }
        onBack={() => navigate("tasks-partial")}
        taskTitle={activeAttempt!.dailyTask.titleSnapshot}
        rewardStars={activeAttempt!.dailyTask.baseStarsSnapshot}
        paused={activeAttempt?.status === "PAUSED"}
        onPause={() => {
          if (!activeAttempt) return;
          void pauseAttempt(activeAttempt.id)
            .then(({ attempt }) => setActiveAttempt(attempt))
            .catch(handleAttemptActionError);
        }}
        onResume={() => {
          if (!activeAttempt) return;
          void resumeAttempt(activeAttempt.id)
            .then(({ attempt }) => setActiveAttempt(attempt))
            .catch(handleAttemptActionError);
        }}
        onAbandon={() => {
          if (!activeAttempt) {
            navigate("tasks-partial");
            return;
          }
          void abandonAttempt(activeAttempt.id)
            .then(() => {
              setActiveAttempt(null);
              navigate("tasks-partial");
            })
            .catch(handleAttemptActionError);
        }}
        onComplete={() => {
          if (!activeAttempt) {
            navigate("untimed-complete");
            return;
          }
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                navigate("tasks-partial");
                return;
              }
              setLastCompletion({
                taskTitle: activeAttempt.dailyTask.titleSnapshot,
                ...reward,
              });
              setActiveAttempt(null);
              navigate("untimed-complete");
            })
            .catch(handleAttemptActionError);
        }}
      />
    );
  }

  if (route === "untimed-complete") {
    return (
      <UntimedTaskComplete
        taskTitle={lastCompletion?.taskTitle}
        rewardStars={lastCompletion?.totalStars}
        onContinue={() => navigate("tasks-partial")}
      />
    );
  }

  if (route === "timed-active") {
    return (
      <TimedTaskActive
        onBack={() => navigate("tasks-partial")}
        title={activeAttempt!.dailyTask.titleSnapshot}
        initialRemainingSeconds={
          activeAttempt!.remainingSeconds ??
          activeAttempt!.dailyTask.timeLimitSecondsSnapshot ??
          0
        }
        earlyThresholdSeconds={
          activeAttempt!.dailyTask.earlyThresholdSecsSnapshot
        }
        paused={activeAttempt?.status === "PAUSED"}
        onPause={() => {
          if (!activeAttempt) return;
          void pauseAttempt(activeAttempt.id)
            .then(({ attempt }) => setActiveAttempt(attempt))
            .catch(handleAttemptActionError);
        }}
        onResume={() => {
          if (!activeAttempt) return;
          void resumeAttempt(activeAttempt.id)
            .then(({ attempt }) => setActiveAttempt(attempt))
            .catch(handleAttemptActionError);
        }}
        onAbandon={() => {
          if (!activeAttempt) {
            navigate("tasks-partial");
            return;
          }
          void abandonAttempt(activeAttempt.id)
            .then(() => {
              setActiveAttempt(null);
              navigate("tasks-partial");
            })
            .catch(handleAttemptActionError);
        }}
        onComplete={() => {
          if (!activeAttempt) {
            navigate("timed-complete");
            return;
          }
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                navigate("tasks-partial");
                return;
              }
              setLastCompletion({
                taskTitle: activeAttempt.dailyTask.titleSnapshot,
                ...reward,
              });
              setActiveAttempt(null);
              navigate("timed-complete");
            })
            .catch((reason: unknown) => {
              if (
                reason instanceof ApiError &&
                reason.code === "TASK_TIMED_OUT"
              ) {
                setActiveAttempt(null);
                navigate("timed-timeout");
                return;
              }
              handleAttemptActionError(reason);
            });
        }}
        onTimeout={() => {
          if (!activeAttempt) {
            navigate("timed-timeout");
            return;
          }
          void completeAttempt(activeAttempt.id)
            .then(({ alreadyCompleted }) => {
              setActiveAttempt(null);
              setLastCompletion(null);
              navigate(alreadyCompleted ? "tasks-partial" : "timed-timeout");
            })
            .catch((reason: unknown) => {
              if (
                reason instanceof ApiError &&
                reason.code === "TASK_TIMED_OUT"
              ) {
                setActiveAttempt(null);
                navigate("timed-timeout");
                return;
              }
              handleAttemptActionError(reason);
            });
        }}
      />
    );
  }

  if (route === "timed-complete") {
    return (
      <TimedTaskComplete
        baseStars={lastCompletion?.baseStars}
        bonusStars={lastCompletion?.bonusStars}
        onBack={() => navigate("tasks-partial")}
      />
    );
  }

  if (route === "timed-timeout") {
    return <TimedTaskTimeout onBack={() => navigate("tasks-partial")} />;
  }

  if (route === "map") {
    return (
      <PlanetMap
        onNavigate={navigate}
        onOpenPlanet={(planet) => navigate(PLANET_ROUTE_BY_KEY[planet])}
      />
    );
  }

  const routePlanet = PLANET_KEY_BY_ROUTE[route];
  if (routePlanet) {
    return (
      <PlanetJourneyPage
        planetKey={routePlanet}
        onBack={() => navigate("map")}
      />
    );
  }

  if (route === "wishes-requested") {
    return <WishesRequested onNavigate={navigate} />;
  }

  if (route === "footprints") {
    return <Footprints onNavigate={navigate} />;
  }

  if (route === "step-2") {
    return (
      <OnboardingStep2
        selectedPetName={mascot.name}
        nickname={nickname}
        onNicknameChange={setNickname}
        onBack={() => navigate("step-1")}
        onNext={() => {
          void saveOnboarding({ petType: selectedPet, nickname })
            .then(() => navigate("step-3"))
            .catch(reportActionError);
        }}
      />
    );
  }

  if (route === "step-3") {
    return <OnboardingStep3 onNext={() => navigate("step-4")} />;
  }

  if (route === "step-4") {
    return (
      <OnboardingStep4
        onStart={() => {
          void saveOnboarding({ petType: selectedPet, nickname, complete: true })
            .then(() => navigate("tasks-partial"))
            .catch(reportActionError);
        }}
      />
    );
  }

  return (
    <OnboardingStep1
      selectedPet={selectedPet}
      onSelectPet={selectPet}
      onNext={() => navigate("step-2")}
    />
  );
}
