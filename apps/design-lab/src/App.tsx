import { lazy, useEffect, useRef, useState } from "react";
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
import { stopManagedHtmlAudio } from "./audio/queued-playback";

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
const MathPracticePreview = lazy(() =>
  import("./math-practice/MathPracticePreview").then((module) => ({
    default: module.MathPracticePreview,
  })),
);
const MathWorksheetPrintPage = lazy(() =>
  import("./math-practice/MathWorksheetPrintPage").then((module) => ({
    default: module.MathWorksheetPrintPage,
  })),
);
const MathPracticeExperience = lazy(() =>
  import("./math-practice/MathPracticeExperience").then((module) => ({
    default: module.MathPracticeExperience,
  })),
);
const BundleComposePracticePage = lazy(() =>
  import("./bundle-practice/BundleComposePracticePage").then((module) => ({
    default: module.BundleComposePracticePage,
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
const ChildProfilePage = lazy(() =>
  import("./profile/ChildProfilePage").then((module) => ({
    default: module.ChildProfilePage,
  })),
);
const ChildGrowthPage = lazy(() =>
  import("./profile/ChildGrowthPage").then((module) => ({
    default: module.ChildGrowthPage,
  })),
);
const ChildFeverPage = lazy(() =>
  import("./profile/ChildFeverPage").then((module) => ({
    default: module.ChildFeverPage,
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
const HanziLearningStaticPage = lazy(() =>
  import("./learning/LearningStaticPages").then((module) => ({
    default: module.HanziLearningStaticPage,
  })),
);
const HanziReviewStaticPage = lazy(() =>
  import("./learning/LearningStaticPages").then((module) => ({
    default: module.HanziReviewStaticPage,
  })),
);
const PoemLearningStaticPage = lazy(() =>
  import("./learning/LearningStaticPages").then((module) => ({
    default: module.PoemLearningStaticPage,
  })),
);
const PoemReviewStaticPage = lazy(() =>
  import("./learning/LearningStaticPages").then((module) => ({
    default: module.PoemReviewStaticPage,
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
const ReleaseNotesPage = lazy(() =>
  import("./ReleaseNotesPage").then((module) => ({ default: module.ReleaseNotesPage })),
);

type AppRoute =
  | "login"
  | "pages"
  | "release-notes"
  | "step-1"
  | "step-2"
  | "step-3"
  | "step-4"
  | "home"
  | "tasks"
  | "tasks-partial"
  | "tasks-dashboard"
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
  | "hanzi-learning-v2"
  | "hanzi-review-v2"
  | "hanzi-session"
  | "clock-session"
  | "make-ten-session"
  | "math-practice-session"
  | "poem-session"
  | "math-preview"
  | "math-print"
  | "bundle-practice"
  | "poem-recitation"
  | "poem-learning-v2"
  | "poem-review-v2"
  | "profile"
  | "growth-record"
  | "fever-record";

const DEFAULT_TASK_ROUTE: AppRoute = "home";

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
    "release-notes",
    "step-1",
    "step-2",
    "step-3",
    "step-4",
    "home",
    "tasks",
    "tasks-partial",
    "tasks-dashboard",
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
    "hanzi-learning-v2",
    "hanzi-review-v2",
    "hanzi-session",
    "clock-session",
    "make-ten-session",
    "math-practice-session",
    "poem-session",
    "math-preview",
    "math-print",
    "bundle-practice",
    "poem-recitation",
    "poem-learning-v2",
    "poem-review-v2",
    "profile",
    "growth-record",
    "fever-record",
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
    route === "math-practice-session" ||
    route === "poem-session"
  );
}

function childPageTitle(route: AppRoute) {
  if (route === "home") return "首页";
  if (route === "tasks") return "任务列表";
  if (route === "tasks-dashboard") return "任务桌面";
  if (route.startsWith("tasks-")) return "任务列表";
  if (route.startsWith("planet-") || route === "map") return "航图";
  if (route.startsWith("hanzi-")) return "汉字学习";
  if (route === "clock-session") return "时钟学习";
  if (route === "make-ten-session") return "凑十训练";
  if (route === "math-practice-session") return "数学练习";
  if (route === "math-preview") return "数学练习设计室";
  if (route === "math-print") return "A4 数学练习卷";
  if (route === "bundle-practice") return "捆和根练习";
  if (route === "poem-session") return "古诗学习";
  if (route === "poem-recitation") return "古诗朗读";
  if (route === "poem-learning-v2") return "古诗学习";
  if (route === "poem-review-v2") return "古诗复习";
  if (route === "pet-growth") return "星宠小屋";
  if (route === "profile") return "个人中心";
  if (route === "growth-record") return "我的成长";
  if (route === "fever-record") return "发热记录";

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
  const growthReturnRouteRef = useRef<"home" | "profile">(
    window.history.state?.growthReturnRoute === "home" ? "home" : "profile",
  );
  const { mascot, selectedPet, selectPet } = useMascot();

  useEffect(() => {
    document.title = `星宠-${childPageTitle(route)}`;
  }, [route]);

  useEffect(() => {
    stopManagedHtmlAudio();
  }, [route]);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState({ route: "login" }, "", "#login");
    }

    const handlePopState = () => {
      const nextRoute = readRouteFromHash();
      if (nextRoute === "growth-record") {
        growthReturnRouteRef.current = window.history.state?.growthReturnRoute === "home"
          ? "home"
          : "profile";
      }
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
          navigate(profile.onboardingCompletedAt ? DEFAULT_TASK_ROUTE : "step-1");
        }
      })
      .catch(() => undefined);
  // Initial session restoration only; navigation owns later route changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(nextRoute: AppRoute) {
    if (nextRoute === route) return;
    if (
      (route === "timed-complete" || route === "untimed-complete") &&
      nextRoute !== "timed-complete" &&
      nextRoute !== "untimed-complete"
    ) {
      setLastCompletion(null);
    }
    const historyState: { route: AppRoute; growthReturnRoute?: "home" | "profile" } = {
      route: nextRoute,
    };
    if (nextRoute === "growth-record") {
      const returnRoute = route === "profile"
        ? "profile"
        : route === "fever-record"
          ? growthReturnRouteRef.current
          : "home";
      growthReturnRouteRef.current = returnRoute;
      historyState.growthReturnRoute = returnRoute;
    }
    markChildNavigation(nextRoute);
    window.history.pushState(historyState, "", `#${nextRoute}`);
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
      navigate(DEFAULT_TASK_ROUTE);
      return;
    }
    reportActionError(reason);
  }

  function leaveActiveAttempt() {
    const attemptId = activeAttempt?.id;
    if (!attemptId) {
      navigate(DEFAULT_TASK_ROUTE);
      return;
    }

    setOptimisticallyAbandonedAttemptId(attemptId);
    setActiveAttempt(null);
    navigate(DEFAULT_TASK_ROUTE);

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
            { route: DEFAULT_TASK_ROUTE },
            "",
            `#${DEFAULT_TASK_ROUTE}`,
          );
          setRoute(DEFAULT_TASK_ROUTE);
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
            : active.dailyTask.experienceKindSnapshot === "MATH_PRACTICE"
              ? "math-practice-session"
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

  useEffect(() => {
    if (
      (route !== "timed-complete" && route !== "untimed-complete") ||
      lastCompletion
    ) {
      return;
    }

    // Completion pages are intentionally ephemeral. A restored hash without
    // the server-confirmed reward must never render a fabricated reward card.
    window.history.replaceState(
      { route: DEFAULT_TASK_ROUTE },
      "",
      `#${DEFAULT_TASK_ROUTE}`,
    );
    setRoute(DEFAULT_TASK_ROUTE);
  }, [lastCompletion, route]);

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

  if (route === "home" || route === "tasks" || route.startsWith("tasks-")) {
    const dashboard = route === "home" || route === "tasks-dashboard";
    const listOnly = route === "tasks";
    const view = dashboard || listOnly ? "partial" : route.replace("tasks-", "") as TaskView;
    return (
      <TaskExperience
        view={view}
        variant={dashboard ? "dashboard" : listOnly ? "list" : "legacy"}
        navActive={dashboard ? "home" : "tasks"}
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
              : attempt.dailyTask.experienceKindSnapshot === "MATH_PRACTICE"
                ? "math-practice-session"
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
          navigate(onboardingCompleted ? DEFAULT_TASK_ROUTE : "step-1");
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
          navigate(DEFAULT_TASK_ROUTE);
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

  if (route === "math-practice-session") {
    return (
      <MathPracticeExperience
        attemptId={activeAttempt!.id}
        rewardStars={activeAttempt!.dailyTask.baseStarsSnapshot}
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

  if (route === "release-notes") {
    return <ReleaseNotesPage onBack={() => navigate("pages")} />;
  }

  if (route === "math-preview") {
    return <MathPracticePreview />;
  }

  if (route === "math-print") {
    return <MathWorksheetPrintPage />;
  }

  if (route === "bundle-practice") {
    return <BundleComposePracticePage />;
  }

  if (route === "poem-recitation") {
    return <PoemRecitationPage onNavigate={navigate} />;
  }

  if (route === "poem-learning-v2") {
    return <PoemLearningStaticPage onNavigate={navigate} />;
  }

  if (route === "poem-review-v2") {
    return <PoemReviewStaticPage onNavigate={navigate} />;
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
        onBack={() => navigate(DEFAULT_TASK_ROUTE)}
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
            navigate(DEFAULT_TASK_ROUTE);
            return;
          }
          setIsCompletingAttempt(true);
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                setIsCompletingAttempt(false);
                navigate(DEFAULT_TASK_ROUTE);
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
    if (!lastCompletion) {
      return (
        <div className="task-page task-page--loading">
          <ChildDataState message="正在确认任务结果…" />
        </div>
      );
    }
    return (
      <UntimedTaskComplete
        rewardStars={lastCompletion.totalStars}
        onContinue={() => navigate(DEFAULT_TASK_ROUTE)}
      />
    );
  }

  if (route === "timed-active") {
    return (
      <TimedTaskActive
        onBack={() => navigate(DEFAULT_TASK_ROUTE)}
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
            navigate(DEFAULT_TASK_ROUTE);
            return;
          }
          setIsCompletingAttempt(true);
          void completeAttempt(activeAttempt.id)
            .then(({ reward, alreadyCompleted }) => {
              if (alreadyCompleted) {
                setActiveAttempt(null);
                setLastCompletion(null);
                setIsCompletingAttempt(false);
                navigate(DEFAULT_TASK_ROUTE);
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
            navigate(DEFAULT_TASK_ROUTE);
            return;
          }
          void completeAttempt(activeAttempt.id)
            .then(({ alreadyCompleted }) => {
              setActiveAttempt(null);
              setLastCompletion(null);
              navigate(alreadyCompleted ? DEFAULT_TASK_ROUTE : "timed-timeout");
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
    if (!lastCompletion) {
      return (
        <div className="task-page task-page--loading">
          <ChildDataState message="正在确认任务结果…" />
        </div>
      );
    }
    return (
      <TimedTaskComplete
        baseStars={lastCompletion.baseStars}
        bonusStars={lastCompletion.bonusStars}
        onBack={() => navigate(DEFAULT_TASK_ROUTE)}
      />
    );
  }

  if (route === "timed-timeout") {
    return <TimedTaskTimeout onBack={() => navigate(DEFAULT_TASK_ROUTE)} />;
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
    return <WishesRequested onNavigate={navigate} onBack={() => navigate("pet-growth")} />;
  }

  if (route === "footprints") {
    return <Footprints onNavigate={navigate} />;
  }

  if (route === "pet-growth") {
    return <PetGrowthPage onNavigate={navigate} />;
  }

  if (route === "profile") {
    return (
      <ChildProfilePage
        onBack={() => navigate(DEFAULT_TASK_ROUTE)}
        onGrowth={() => navigate("growth-record")}
        onSignedOut={() => {
          setTaskExperienceCache(null);
          setActiveAttempt(null);
          setNickname("");
          navigate("login");
        }}
      />
    );
  }

  if (route === "growth-record") {
    return <ChildGrowthPage onBack={() => navigate(growthReturnRouteRef.current)} onFever={() => navigate("fever-record")} />;
  }

  if (route === "fever-record") {
    return <ChildFeverPage onBack={() => navigate("growth-record")} />;
  }

  if (route === "hanzi-home") {
    return <HanziLearningHome onNavigate={navigate} />;
  }

  if (route === "hanzi-learning-v2") {
    return <HanziLearningStaticPage onNavigate={navigate} />;
  }

  if (route === "hanzi-review-v2") {
    return <HanziReviewStaticPage onNavigate={navigate} />;
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
            .then(() => navigate(DEFAULT_TASK_ROUTE))
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
