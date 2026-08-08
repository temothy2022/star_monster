import { lazy, useEffect, useState } from "react";
import type { TaskView } from "./tasks/TaskListPages";
import type { PlanetKey } from "./planets/planet-data";
import type { PageIndexRoute } from "./PageIndex";
import { useMascot } from "./mascots";
import { ChildLoginPage } from "./auth/ChildLoginPage";
import { ChildDataState } from "./components/ChildDataState";
import {
  markChildNavigation,
  reportChildRouteRendered,
} from "./api/performance-telemetry";
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
import type { TaskAttempt, TodayTaskExperience } from "./api/child-api";

const loadUntimedTaskPages = () => import("./tasks/UntimedTaskPages");
const loadTimedTaskPages = () => import("./tasks/TimedTaskPages");

const OnboardingStep1 = lazy(() =>
  import("./onboarding/OnboardingStep1").then((module) => ({
    default: module.OnboardingStep1,
  })),
);
const OnboardingStep2 = lazy(() =>
  import("./onboarding/OnboardingStep2").then((module) => ({
    default: module.OnboardingStep2,
  })),
);
const OnboardingStep3 = lazy(() =>
  import("./onboarding/OnboardingStep3").then((module) => ({
    default: module.OnboardingStep3,
  })),
);
const OnboardingStep4 = lazy(() =>
  import("./onboarding/OnboardingStep4").then((module) => ({
    default: module.OnboardingStep4,
  })),
);
const TaskExperience = lazy(() =>
  import("./tasks/TaskListPages").then((module) => ({
    default: module.TaskExperience,
  })),
);
const PoemLearningExperience = lazy(() =>
  import("./poem/PoemLearningExperience").then((module) => ({
    default: module.PoemLearningExperience,
  })),
);
const ClockLearningExperience = lazy(() =>
  import("./clock/ClockLearningExperience").then((module) => ({
    default: module.ClockLearningExperience,
  })),
);
const MakeTenExperience = lazy(() =>
  import("./make-ten/MakeTenExperience").then((module) => ({
    default: module.MakeTenExperience,
  })),
);
const UntimedTaskActive = lazy(() =>
  loadUntimedTaskPages().then((module) => ({
    default: module.UntimedTaskActive,
  })),
);
const UntimedTaskComplete = lazy(() =>
  loadUntimedTaskPages().then((module) => ({
    default: module.UntimedTaskComplete,
  })),
);
const TimedTaskActive = lazy(() =>
  loadTimedTaskPages().then((module) => ({
    default: module.TimedTaskActive,
  })),
);
const TimedTaskComplete = lazy(() =>
  loadTimedTaskPages().then((module) => ({
    default: module.TimedTaskComplete,
  })),
);
const TimedTaskTimeout = lazy(() =>
  loadTimedTaskPages().then((module) => ({
    default: module.TimedTaskTimeout,
  })),
);
const WishesRequested = lazy(() =>
  import("./progress/WishesAndFootprints").then((module) => ({
    default: module.WishesRequested,
  })),
);
const Footprints = lazy(() =>
  import("./progress/WishesAndFootprints").then((module) => ({
    default: module.Footprints,
  })),
);
const PlanetMap = lazy(() =>
  import("./planets/PlanetMap").then((module) => ({
    default: module.PlanetMap,
  })),
);
const PetGrowthPage = lazy(() =>
  import("./pet/PetGrowthPage").then((module) => ({
    default: module.PetGrowthPage,
  })),
);
const PlanetJourneyPage = lazy(() =>
  import("./planets/PlanetMap").then((module) => ({
    default: module.PlanetJourneyPage,
  })),
);
const HanziLearningHome = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziLearningHome,
  })),
);
const HanziReviewFront = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziReviewFront,
  })),
);
const HanziCardBack = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziCardBack,
  })),
);
const HanziKnowFeedback = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziKnowFeedback,
  })),
);
const HanziDontKnowFeedback = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziDontKnowFeedback,
  })),
);
const HanziNewShape = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziNewShape,
  })),
);
const HanziNewSound = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziNewSound,
  })),
);
const HanziNewMeaning = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziNewMeaning,
  })),
);
const HanziLearningResult = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziLearningResult,
  })),
);
const HanziLearningExperience = lazy(() =>
  import("./hanzi/HanziLearningExperience").then((module) => ({
    default: module.HanziLearningExperience,
  })),
);
const PoemRecitationPage = lazy(() =>
  import("./poem/PoemRecitationPage").then((module) => ({
    default: module.PoemRecitationPage,
  })),
);
const HanziListenQuestion = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziListenQuestion,
  })),
);
const HanziListenCorrect = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziListenCorrect,
  })),
);
const HanziListenWrong = lazy(() =>
  import("./hanzi/HanziLearningPages").then((module) => ({
    default: module.HanziListenWrong,
  })),
);
const PageIndex = lazy(() =>
  import("./PageIndex").then((module) => ({ default: module.PageIndex })),
);

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
  | "footprints"
  | "pet-growth"
  | "hanzi-home"
  | "hanzi-review-front"
  | "hanzi-card-back"
  | "hanzi-know-feedback"
  | "hanzi-dont-know-feedback"
  | "hanzi-new-shape"
  | "hanzi-new-sound"
  | "hanzi-new-meaning"
  | "hanzi-listen-question"
  | "hanzi-listen-correct"
  | "hanzi-listen-wrong"
  | "hanzi-result"
  | "hanzi-session"
  | "clock-session"
  | "make-ten-session"
  | "poem-session"
  | "poem-recitation";

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
    "pet-growth",
    "hanzi-home",
    "hanzi-review-front",
    "hanzi-card-back",
    "hanzi-know-feedback",
    "hanzi-dont-know-feedback",
    "hanzi-new-shape",
    "hanzi-new-sound",
    "hanzi-new-meaning",
    "hanzi-listen-question",
    "hanzi-listen-correct",
    "hanzi-listen-wrong",
    "hanzi-result",
    "hanzi-session",
    "clock-session",
    "make-ten-session",
    "poem-session",
    "poem-recitation",
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
    route === "timed-active" ||
    route === "hanzi-session" ||
    route === "clock-session" ||
    route === "make-ten-session" ||
    route === "poem-session"
  );
}

function childPageTitle(route: AppRoute) {
  if (route.startsWith("tasks-")) return "任务列表";
  if (route.startsWith("planet-") || route === "map") return "航图";
  if (route.startsWith("hanzi-")) return "汉字学习";
  if (route === "clock-session") return "时钟学习";
  if (route === "make-ten-session") return "凑十训练";
  if (route === "poem-session") return "古诗学习";
  if (route === "poem-recitation") return "古诗朗读";
  if (route === "pet-growth") return "星宠小屋";

  const titles: Partial<Record<AppRoute, string>> = {
    login: "孩子登录",
    pages: "页面清单",
    "step-1": "新手引导",
    "step-2": "新手引导",
    "step-3": "新手引导",
    "step-4": "新手引导",
    "untimed-active": "任务进行中",
    "untimed-menu": "任务进行中",
    "untimed-abandon": "任务进行中",
    "untimed-complete": "任务完成",
    "timed-active": "限时任务",
    "timed-complete": "限时任务完成",
    "timed-timeout": "限时任务超时",
    "wishes-requested": "星愿",
    footprints: "足迹",
  };
  return titles[route] ?? "孩子端";
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => {
    const initialRoute = readRouteFromHash();
    markChildNavigation(initialRoute);
    return initialRoute;
  });
  const [nickname, setNickname] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<TaskAttempt | null>(null);
  const [taskExperienceCache, setTaskExperienceCache] =
    useState<TodayTaskExperience | null>(null);
  const [optimisticallyAbandonedAttemptId, setOptimisticallyAbandonedAttemptId] =
    useState<string | null>(null);
  const [attemptRestoreError, setAttemptRestoreError] = useState("");
  const [lastCompletion, setLastCompletion] = useState<{
    taskTitle: string;
    baseStars: number;
    bonusStars: number;
    totalStars: number;
  } | null>(null);
  const [isCompletingAttempt, setIsCompletingAttempt] = useState(false);
  const { mascot, selectedPet, selectPet } = useMascot();

  useEffect(() => {
    document.title = `星宠-${childPageTitle(route)}`;
  }, [route]);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState({ route: "login" }, "", "#login");
    }

    const handlePopState = () => {
      const nextRoute = readRouteFromHash();
      markChildNavigation(nextRoute);
      setRoute(nextRoute);
    };
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
    markChildNavigation(nextRoute);
    window.history.pushState({ route: nextRoute }, "", `#${nextRoute}`);
    setRoute(nextRoute);
  }

  useEffect(() => {
    reportChildRouteRendered(route);
  }, [route]);

  useEffect(() => {
    if (route === "untimed-active" || route === "untimed-menu" || route === "untimed-abandon") {
      void loadUntimedTaskPages();
    }
    if (route === "timed-active") {
      void loadTimedTaskPages();
    }
  }, [route]);

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

  function leaveActiveAttempt() {
    const attemptId = activeAttempt?.id;
    if (!attemptId) {
      navigate("tasks-partial");
      return;
    }

    setOptimisticallyAbandonedAttemptId(attemptId);
    setActiveAttempt(null);
    navigate("tasks-partial");

    void (async () => {
      let lastError: unknown;
      for (let retry = 0; retry < 3; retry += 1) {
        try {
          await abandonAttempt(attemptId);
          setOptimisticallyAbandonedAttemptId((current) =>
            current === attemptId ? null : current,
          );
          return;
        } catch (reason) {
          if (
            reason instanceof ApiError &&
            (reason.status === 404 ||
              STALE_ATTEMPT_ERROR_CODES.has(reason.code ?? ""))
          ) {
            setOptimisticallyAbandonedAttemptId((current) =>
              current === attemptId ? null : current,
            );
            return;
          }
          lastError = reason;
          if (retry < 2) {
            await new Promise((resolve) =>
              window.setTimeout(resolve, 500 * 2 ** retry),
            );
          }
        }
      }
      setOptimisticallyAbandonedAttemptId((current) =>
        current === attemptId ? null : current,
      );
      reportActionError(lastError);
    })();
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
          (active.dailyTask.experienceKindSnapshot === "HANZI_LEARNING" || active.dailyTask.experienceKindSnapshot === "HANZI_REVIEW")
            ? "hanzi-session"
            : active.dailyTask.experienceKindSnapshot === "CLOCK_LEARNING"
              ? "clock-session"
            : active.dailyTask.experienceKindSnapshot === "MAKE_TEN"
              ? "make-ten-session"
            : active.dailyTask.experienceKindSnapshot === "POEM_LEARNING" ||
                active.dailyTask.experienceKindSnapshot === "POEM_REVIEW"
              ? "poem-session"
            : active.dailyTask.modeSnapshot === "TIMED"
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

  useEffect(() => {
    setIsCompletingAttempt(false);
  }, [activeAttempt?.id]);

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
        initialExperience={taskExperienceCache}
        onExperienceChange={setTaskExperienceCache}
        onNavigate={navigate}
        onStartAttempt={(attempt) => {
          if (attempt.id === optimisticallyAbandonedAttemptId) return;
          setActiveAttempt(attempt);
          navigate(
            (attempt.dailyTask.experienceKindSnapshot === "HANZI_LEARNING" || attempt.dailyTask.experienceKindSnapshot === "HANZI_REVIEW")
              ? "hanzi-session"
              : attempt.dailyTask.experienceKindSnapshot === "CLOCK_LEARNING"
                ? "clock-session"
              : attempt.dailyTask.experienceKindSnapshot === "MAKE_TEN"
                ? "make-ten-session"
              : attempt.dailyTask.experienceKindSnapshot === "POEM_LEARNING" ||
                  attempt.dailyTask.experienceKindSnapshot === "POEM_REVIEW"
                ? "poem-session"
              : attempt.dailyTask.modeSnapshot === "TIMED"
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
          setTaskExperienceCache(null);
          if (petType) selectPet(petType);
          if (savedNickname) setNickname(savedNickname);
          navigate(onboardingCompleted ? "tasks-partial" : "step-1");
        }}
      />
    );
  }

  if (route === "hanzi-session") {
    return (
      <HanziLearningExperience
        attemptId={activeAttempt!.id}
        onExit={leaveActiveAttempt}
        onCompleted={(reward) => {
          setLastCompletion({
            taskTitle: activeAttempt!.dailyTask.titleSnapshot,
            ...reward,
          });
          setActiveAttempt(null);
          navigate("untimed-complete");
        }}
      />
    );
  }

  if (route === "clock-session") {
    return (
      <ClockLearningExperience
        attemptId={activeAttempt!.id}
        onExit={leaveActiveAttempt}
        onCompleted={(reward) => {
          setLastCompletion({
            taskTitle: activeAttempt!.dailyTask.titleSnapshot,
            ...reward,
          });
          setActiveAttempt(null);
          navigate("untimed-complete");
        }}
      />
    );
  }

  if (route === "make-ten-session") {
    return (
      <MakeTenExperience
        attemptId={activeAttempt!.id}
        onExit={leaveActiveAttempt}
        onFailed={() => {
          setActiveAttempt(null);
          navigate("tasks-partial");
        }}
        onCompleted={(reward) => {
          setLastCompletion({
            taskTitle: activeAttempt!.dailyTask.titleSnapshot,
            ...reward,
          });
          setActiveAttempt(null);
          navigate("untimed-complete");
        }}
      />
    );
  }

  if (route === "poem-session") {
    return (
      <PoemLearningExperience
        attemptId={activeAttempt!.id}
        onExit={leaveActiveAttempt}
        onCompleted={(reward) => {
          setLastCompletion({
            taskTitle: activeAttempt!.dailyTask.titleSnapshot,
            ...reward,
          });
          setActiveAttempt(null);
          navigate("untimed-complete");
        }}
      />
    );
  }

  if (route === "pages") {
    return <PageIndex onNavigate={(nextRoute: PageIndexRoute) => navigate(nextRoute)} />;
  }

  if (route === "poem-recitation") {
    return <PoemRecitationPage onNavigate={navigate} />;
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
        completing={isCompletingAttempt}
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
          leaveActiveAttempt();
        }}
        onComplete={() => {
          if (isCompletingAttempt) return;
          if (!activeAttempt) {
            navigate("untimed-complete");
            return;
          }
          setIsCompletingAttempt(true);
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                setIsCompletingAttempt(false);
                navigate("tasks-partial");
                return;
              }
              setLastCompletion({
                taskTitle: activeAttempt.dailyTask.titleSnapshot,
                ...reward,
              });
              setActiveAttempt(null);
              setIsCompletingAttempt(false);
              navigate("untimed-complete");
            })
            .catch((reason: unknown) => {
              setIsCompletingAttempt(false);
              handleAttemptActionError(reason);
            });
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
        completing={isCompletingAttempt}
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
          leaveActiveAttempt();
        }}
        onComplete={() => {
          if (isCompletingAttempt) return;
          if (!activeAttempt) {
            navigate("timed-complete");
            return;
          }
          setIsCompletingAttempt(true);
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                setIsCompletingAttempt(false);
                navigate("tasks-partial");
                return;
              }
              setLastCompletion({
                taskTitle: activeAttempt.dailyTask.titleSnapshot,
                ...reward,
              });
              setActiveAttempt(null);
              setIsCompletingAttempt(false);
              navigate("timed-complete");
            })
            .catch((reason: unknown) => {
              setIsCompletingAttempt(false);
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
        taskTitle={lastCompletion?.taskTitle}
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
        onBack={() => navigate("pet-growth")}
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

  if (route === "pet-growth") {
    return <PetGrowthPage onNavigate={navigate} />;
  }

  if (route === "hanzi-home") {
    return <HanziLearningHome onNavigate={navigate} />;
  }

  if (route === "hanzi-review-front") {
    return <HanziReviewFront onNavigate={navigate} />;
  }

  if (route === "hanzi-card-back") {
    return <HanziCardBack onNavigate={navigate} />;
  }

  if (route === "hanzi-know-feedback") {
    return <HanziKnowFeedback onNavigate={navigate} />;
  }

  if (route === "hanzi-dont-know-feedback") {
    return <HanziDontKnowFeedback onNavigate={navigate} />;
  }

  if (route === "hanzi-new-shape") {
    return <HanziNewShape onNavigate={navigate} />;
  }

  if (route === "hanzi-new-sound") {
    return <HanziNewSound onNavigate={navigate} />;
  }

  if (route === "hanzi-new-meaning") {
    return <HanziNewMeaning onNavigate={navigate} />;
  }

  if (route === "hanzi-listen-question") {
    return <HanziListenQuestion onNavigate={navigate} />;
  }

  if (route === "hanzi-listen-correct") {
    return <HanziListenCorrect onNavigate={navigate} />;
  }

  if (route === "hanzi-listen-wrong") {
    return <HanziListenWrong onNavigate={navigate} />;
  }

  if (route === "hanzi-result") {
    return <HanziLearningResult onNavigate={navigate} />;
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
