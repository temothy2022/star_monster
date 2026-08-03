import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  ApiError,
  finalizeHanziLearningSession,
  startHanziLearningSession,
  type HanziCharacter,
  type HanziLearningSession,
} from "../api/child-api";
import { ChildDataState } from "../components/ChildDataState";
import { LoadingDots } from "../components/LoadingDots";
import backIcon from "../assets/icon-arrow-left.svg";
import playIcon from "../assets/untimed-task/play.svg";
import defaultHanziImage from "../assets/hanzi/test-generated-shui.jpeg";
import meaningSpeakerIcon from "../assets/hanzi/meaning-speaker.svg";
import {
  getHanziAudioElement,
  preloadHanziSessionAssets,
} from "./hanzi-asset-preloader";
import { HanziTaskControls } from "./HanziTaskControls";
import {
  reportChildMediaDiagnostic,
  reportChildPageReady,
} from "../api/performance-telemetry";

type CompletionReward = {
  baseStars: number;
  bonusStars: number;
  dailyGoalBonusStars: number;
  totalStars: number;
};

type FlowTransitionAction =
  | "start"
  | "review-known"
  | "review-unknown"
  | "review-continue"
  | "new-next"
  | `answer:${string}`
  | "question-continue";

function mediaPath(url?: string | null) {
  if (!url) return undefined;
  try {
    return new URL(url, window.location.href).pathname.slice(0, 160);
  } catch {
    return undefined;
  }
}

function speak(text: string, audioUrl?: string | null) {
  let cancelled = false;
  let fallbackCleanup: (() => void) | undefined;
  const startedAt = performance.now();
  const speakWithBrowserVoice = () => {
    if (cancelled || fallbackCleanup) return;
    reportChildMediaDiagnostic({
      operation: audioUrl
        ? "hanzi_audio_fallback"
        : "hanzi_browser_voice_used",
      status: audioUrl ? 0 : 200,
      totalMs: performance.now() - startedAt,
      path: mediaPath(audioUrl),
    });
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.72;
    utterance.pitch = 1.05;
    utterance.onerror = () => {
      reportChildMediaDiagnostic({
        operation: "hanzi_browser_voice_failed",
        status: 0,
        totalMs: performance.now() - startedAt,
        path: mediaPath(audioUrl),
      });
    };
    window.speechSynthesis.speak(utterance);
    fallbackCleanup = () => {
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
    };
  };

  if (audioUrl) {
    const audio = getHanziAudioElement(audioUrl);
    audio.pause();
    audio.currentTime = 0;
    audio.onerror = speakWithBrowserVoice;
    void audio.play().catch(speakWithBrowserVoice);
    return () => {
      cancelled = true;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
      fallbackCleanup?.();
    };
  }
  speakWithBrowserVoice();
  return () => {
    cancelled = true;
    fallbackCleanup?.();
  };
}

function resolvedSentence(character: HanziCharacter) {
  return character.sentence.replace("__", character.character);
}

function characterImageSource(character: HanziCharacter) {
  const imageKey = character.imageKey.trim();
  if (!imageKey || imageKey === "default-hanzi") return defaultHanziImage;
  return imageKey;
}

function handleCharacterImageError(
  event: SyntheticEvent<HTMLImageElement>,
) {
  const image = event.currentTarget;
  if (image.src.endsWith(defaultHanziImage)) return;
  reportChildMediaDiagnostic({
    operation: "hanzi_image_fallback",
    status: 0,
    totalMs: 0,
    path: new URL(image.src, window.location.href).pathname,
  });
  image.src = defaultHanziImage;
}

function speakCharacterThenText(
  character: HanziCharacter,
  text: string,
  textAudioUrl?: string | null,
) {
  let cancelled = false;
  let pauseTimer: number | undefined;
  let audio: HTMLAudioElement | undefined;
  let followingCleanup: (() => void) | undefined;
  let fallbackStarted = false;

  const speakFollowingText = () => {
    if (cancelled) return;
    pauseTimer = window.setTimeout(() => {
      if (!cancelled) followingCleanup = speak(text, textAudioUrl);
    }, 500);
  };

  const speakWithBrowserVoice = () => {
    if (fallbackStarted || cancelled) return;
    fallbackStarted = true;
    reportChildMediaDiagnostic({
      operation: character.characterAudioUrl
        ? "hanzi_character_audio_fallback"
        : "hanzi_character_browser_voice_used",
      status: character.characterAudioUrl ? 0 : 200,
      totalMs: 0,
      path: mediaPath(character.characterAudioUrl),
    });
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(character.character);
    utterance.lang = "zh-CN";
    utterance.rate = 0.72;
    utterance.pitch = 1.05;
    utterance.onend = speakFollowingText;
    window.speechSynthesis.speak(utterance);
  };

  if (character.characterAudioUrl) {
    audio = getHanziAudioElement(character.characterAudioUrl);
    audio.pause();
    audio.currentTime = 0;
    audio.onended = speakFollowingText;
    audio.onerror = speakWithBrowserVoice;
    void audio.play().catch(speakWithBrowserVoice);
  } else {
    speakWithBrowserVoice();
  }

  return () => {
    cancelled = true;
    if (pauseTimer !== undefined) window.clearTimeout(pauseTimer);
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    }
    followingCleanup?.();
    window.speechSynthesis?.cancel();
  };
}

type HanziLocalDraft = {
  version: 1;
  sessionId: string;
  reviewIndex: number;
  reviewKnownIds: string[];
  reviewUnknownIds: string[];
  newIndex: number;
  questionIndex: number;
  consolidationCorrect: number;
  consolidationTotal: number;
  answerSelections: Record<string, string>;
};

function draftKey(sessionId: string) {
  return `hanzi-learning-draft:${sessionId}`;
}

function phaseForLocalProgress(
  session: HanziLearningSession,
  reviewIndex: number,
  newIndex: number,
) {
  if (reviewIndex < session.reviewCharacterIds.length) return "REVIEW";
  if (newIndex < session.newCharacterIds.length) return "NEW_LEARNING";
  return "CONSOLIDATION";
}

function restoreLocalDraft(session: HanziLearningSession) {
  try {
    const raw = window.localStorage.getItem(draftKey(session.id));
    if (!raw) return { session, answerSelections: {} as Record<string, string> };
    const draft = JSON.parse(raw) as Partial<HanziLocalDraft>;
    if (draft.version !== 1 || draft.sessionId !== session.id) {
      return { session, answerSelections: {} as Record<string, string> };
    }
    const reviewIndex = Math.min(
      session.reviewCharacterIds.length,
      Math.max(session.reviewIndex, Number(draft.reviewIndex) || 0),
    );
    const newIndex = Math.min(
      session.newCharacterIds.length,
      Math.max(session.newIndex, Number(draft.newIndex) || 0),
    );
    const questionIndex = Math.min(
      session.questions.length,
      Math.max(session.questionIndex, Number(draft.questionIndex) || 0),
    );
    const validReviewIds = new Set(session.reviewCharacterIds);
    const reviewKnownIds = [
      ...new Set([
        ...session.reviewKnownIds,
        ...(draft.reviewKnownIds ?? []).filter((id) => validReviewIds.has(id)),
      ]),
    ];
    const reviewUnknownIds = [
      ...new Set([
        ...session.reviewUnknownIds,
        ...(draft.reviewUnknownIds ?? []).filter((id) =>
          validReviewIds.has(id),
        ),
      ]),
    ];
    const consolidationTotal = Math.min(
      session.questions.length,
      Math.max(
        session.consolidationTotal,
        Number(draft.consolidationTotal) || 0,
      ),
    );
    const consolidationCorrect = Math.min(
      consolidationTotal,
      Math.max(
        session.consolidationCorrect,
        Number(draft.consolidationCorrect) || 0,
      ),
    );
    const restored: HanziLearningSession = {
      ...session,
      phase:
        session.phase === "COMPLETED"
          ? "COMPLETED"
          : phaseForLocalProgress(session, reviewIndex, newIndex),
      reviewIndex,
      reviewKnownIds,
      reviewUnknownIds,
      newIndex,
      questionIndex,
      consolidationCorrect,
      consolidationTotal,
      summary: {
        ...session.summary,
        reviewKnown: reviewKnownIds.length,
        reviewUnknown: reviewUnknownIds.length,
        correct: consolidationCorrect,
        total: consolidationTotal,
      },
    };
    return {
      session: restored,
      answerSelections:
        draft.answerSelections &&
        typeof draft.answerSelections === "object"
          ? draft.answerSelections
          : {},
    };
  } catch {
    return { session, answerSelections: {} as Record<string, string> };
  }
}

function saveLocalDraft(
  session: HanziLearningSession,
  answerSelections: Record<string, string>,
) {
  const draft: HanziLocalDraft = {
    version: 1,
    sessionId: session.id,
    reviewIndex: session.reviewIndex,
    reviewKnownIds: session.reviewKnownIds,
    reviewUnknownIds: session.reviewUnknownIds,
    newIndex: session.newIndex,
    questionIndex: session.questionIndex,
    consolidationCorrect: session.consolidationCorrect,
    consolidationTotal: session.consolidationTotal,
    answerSelections,
  };
  try {
    window.localStorage.setItem(draftKey(session.id), JSON.stringify(draft));
  } catch {
    // Learning can continue without local resume support.
  }
}

function clearLocalDraft(sessionId: string) {
  try {
    window.localStorage.removeItem(draftKey(sessionId));
  } catch {
    // Ignore storage restrictions in private browsing.
  }
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="hanzi-back-button" type="button" onClick={onClick} aria-label="返回任务列表">
      <img src={backIcon} alt="" aria-hidden="true" />
    </button>
  );
}

function PlayIcon() {
  return <img className="hanzi-play-icon" src={playIcon} alt="" aria-hidden="true" />;
}

function CharacterBox({
  character,
  compact = false,
}: {
  character: string;
  compact?: boolean;
}) {
  return (
    <div className={`hanzi-character-box${compact ? " hanzi-character-box--compact" : ""}`}>
      <span>{character}</span>
    </div>
  );
}

function ProgressHeader({
  title,
  current,
  total,
  onBack,
}: {
  title: string;
  current: number;
  total: number;
  onBack: () => void;
}) {
  return (
    <header className="hanzi-flow-header">
      <div className="hanzi-flow-header__top">
        <BackButton onClick={onBack} />
        <h1>{title}</h1>
        <span>{total ? `第 ${Math.min(current, total)} / ${total}` : ""}</span>
      </div>
      <div className="hanzi-progress-track" aria-label={`${title}进度`}>
        <span style={{ width: `${total ? (Math.min(current, total) / total) * 100 : 100}%` }} />
      </div>
    </header>
  );
}

function sentenceParts(sentence: string) {
  const [before = sentence, after = ""] = sentence.split("__");
  return { before, after };
}

function advanceQuestionLocally(
  session: HanziLearningSession,
  correct: boolean,
): HanziLearningSession {
  const nextCorrect = session.consolidationCorrect + (correct ? 1 : 0);
  const nextTotal = session.consolidationTotal + 1;
  return {
    ...session,
    questionIndex: session.questionIndex + 1,
    consolidationCorrect: nextCorrect,
    consolidationTotal: nextTotal,
    summary: {
      ...session.summary,
      correct: nextCorrect,
      total: nextTotal,
    },
  };
}

function advanceNewCharacterLocally(
  session: HanziLearningSession,
): HanziLearningSession {
  const nextIndex = session.newIndex + 1;
  return {
    ...session,
    newIndex: nextIndex,
    phase:
      nextIndex >= session.newCharacterIds.length
        ? "CONSOLIDATION"
        : "NEW_LEARNING",
  };
}

function advanceReviewLocally(
  session: HanziLearningSession,
  characterId: string,
  known: boolean,
): HanziLearningSession {
  const nextIndex = session.reviewIndex + 1;
  const reviewKnownIds = known
    ? [...new Set([...session.reviewKnownIds, characterId])]
    : session.reviewKnownIds;
  const reviewUnknownIds = known
    ? session.reviewUnknownIds
    : [...new Set([...session.reviewUnknownIds, characterId])];
  return {
    ...session,
    reviewIndex: nextIndex,
    reviewKnownIds,
    reviewUnknownIds,
    phase: phaseForLocalProgress(session, nextIndex, session.newIndex),
    summary: {
      ...session.summary,
      reviewKnown: reviewKnownIds.length,
      reviewUnknown: reviewUnknownIds.length,
    },
  };
}

export function HanziLearningExperience({
  attemptId,
  onExit,
  onCompleted,
}: {
  attemptId: string;
  onExit: () => void;
  onCompleted: (reward: CompletionReward) => void;
}) {
  const [session, setSession] = useState<HanziLearningSession | null>(null);
  const [started, setStarted] = useState(false);
  const [newStep, setNewStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flowTransition, setFlowTransition] =
    useState<FlowTransitionAction | null>(null);
  const [error, setError] = useState("");
  const [knownToast, setKnownToast] = useState(false);
  const [unknownCharacter, setUnknownCharacter] = useState<HanziCharacter | null>(null);
  const [pendingSession, setPendingSession] = useState<HanziLearningSession | null>(null);
  const [answerSelections, setAnswerSelections] = useState<Record<string, string>>({});
  const [assetProgress, setAssetProgress] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    ready: false,
  });
  const activeSpeechCleanup = useRef<null | (() => void)>(null);
  const assetPreloadAbort = useRef<AbortController | null>(null);
  const preloadedSessionId = useRef<string | null>(null);
  const requestAbort = useRef(new AbortController());
  const flowTransitionRef = useRef<FlowTransitionAction | null>(null);
  const transitionFrameIds = useRef<number[]>([]);
  const transitionTimer = useRef<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    selectedId: string;
    targetId: string;
    correct: boolean;
    nextSession: HanziLearningSession;
  } | null>(null);

  const stopActiveSpeech = useCallback(() => {
    activeSpeechCleanup.current?.();
    activeSpeechCleanup.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const playSpeech = useCallback(
    (text: string, audioUrl?: string | null) => {
      stopActiveSpeech();
      activeSpeechCleanup.current = speak(text, audioUrl);
    },
    [stopActiveSpeech],
  );

  const playCharacterThenText = useCallback(
    (
      character: HanziCharacter,
      text: string,
      textAudioUrl?: string | null,
    ) => {
      stopActiveSpeech();
      activeSpeechCleanup.current = speakCharacterThenText(
        character,
        text,
        textAudioUrl,
      );
    },
    [stopActiveSpeech],
  );

  useEffect(() => {
    return () => {
      stopActiveSpeech();
      assetPreloadAbort.current?.abort();
      requestAbort.current.abort();
      for (const frameId of transitionFrameIds.current) {
        window.cancelAnimationFrame(frameId);
      }
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }
    };
  }, [stopActiveSpeech]);

  useEffect(() => {
    const requestController = new AbortController();
    requestAbort.current.abort();
    requestAbort.current = requestController;
    let cancelled = false;
    setError("");
    void startHanziLearningSession(attemptId, requestController.signal)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        const restored = restoreLocalDraft(loaded);
        setSession(restored.session);
        setAnswerSelections(restored.answerSelections);
        setStarted(false);
        reportChildPageReady(
          "hanzi-session",
          "/api/child/hanzi/sessions/start",
        );
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "汉字学习暂时无法开始");
      });
    return () => {
      cancelled = true;
      requestController.abort();
      stopActiveSpeech();
    };
  }, [attemptId, stopActiveSpeech]);

  const abandonLearning = useCallback(() => {
    requestAbort.current.abort();
    assetPreloadAbort.current?.abort();
    stopActiveSpeech();
    if (session) clearLocalDraft(session.id);
    onExit();
  }, [onExit, session, stopActiveSpeech]);

  const characterById = useMemo(
    () => new Map(session?.characters.map((character) => [character.id, character]) ?? []),
    [session],
  );
  const currentNewCharacter = useMemo(() => {
    if (!session || session.phase !== "NEW_LEARNING") return null;
    return characterById.get(session.newCharacterIds[session.newIndex] ?? "") ?? null;
  }, [characterById, session]);
  const currentQuestion = session?.questions[session.questionIndex] ?? null;
  const currentQuestionTarget = currentQuestion
    ? characterById.get(currentQuestion.targetId) ?? null
    : null;

  useEffect(() => {
    if (!session || session.phase === "COMPLETED") return;
    saveLocalDraft(session, answerSelections);
  }, [answerSelections, session]);

  useEffect(() => {
    if (!session || preloadedSessionId.current === session.id) return;
    preloadedSessionId.current = session.id;
    assetPreloadAbort.current?.abort();
    const controller = new AbortController();
    assetPreloadAbort.current = controller;
    setAssetProgress({ total: 0, completed: 0, failed: 0, ready: false });
    const startedAt = performance.now();
    void preloadHanziSessionAssets(session, controller.signal, (progress) => {
      setAssetProgress({ ...progress, ready: progress.completed >= progress.total });
    }).then((result) => {
      if (controller.signal.aborted) return;
      setAssetProgress({ ...result, ready: true });
      reportChildMediaDiagnostic({
        operation:
          result.failed > 0
            ? "hanzi_assets_preload_partial"
            : "hanzi_assets_preload_complete",
        status: result.failed > 0 ? 206 : 200,
        totalMs: performance.now() - startedAt,
      });
    });
  }, [session]);

  if (!session) {
    return (
      <main className="hanzi-page hanzi-page--home">
        <ChildDataState error={Boolean(error)} message={error || "正在准备今天的汉字学习…"} />
      </main>
    );
  }

  const reviewCharacter =
    characterById.get(session.reviewCharacterIds[session.reviewIndex] ?? "") ?? null;
  const newCharacter = currentNewCharacter;
  const question = currentQuestion;
  const questionTarget = currentQuestionTarget;
  const allQuestionsAnswered =
    session.questionIndex >= session.questions.length;

  function releaseFlowTransition() {
    flowTransitionRef.current = null;
    setFlowTransition(null);
  }

  function queueFlowTransition(
    action: FlowTransitionAction,
    beforeCommit: () => void,
    commit: () => void,
    holdMs = 0,
  ) {
    if (flowTransitionRef.current || busy) return;
    flowTransitionRef.current = action;
    setFlowTransition(action);

    try {
      // Keep media playback in the original click gesture for iPad Safari.
      beforeCommit();
    } catch (reason) {
      releaseFlowTransition();
      throw reason;
    }

    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        const finish = () => {
          commit();
          const releaseFrame = window.requestAnimationFrame(
            releaseFlowTransition,
          );
          transitionFrameIds.current.push(releaseFrame);
        };
        if (holdMs > 0) {
          transitionTimer.current = window.setTimeout(finish, holdMs);
        } else {
          finish();
        }
      });
      transitionFrameIds.current.push(secondFrame);
    });
    transitionFrameIds.current.push(firstFrame);
  }

  function playEntryForSession(nextSession: HanziLearningSession) {
    if (nextSession.phase === "NEW_LEARNING") {
      // The first new-character screen should stay quiet. The child can
      // explicitly play the character, words, or sentence from the controls.
      return;
    }
    if (nextSession.phase === "CONSOLIDATION") {
      const nextQuestion = nextSession.questions[nextSession.questionIndex];
      const target = nextQuestion
        ? characterById.get(nextQuestion.targetId)
        : null;
      if (target) {
        playSpeech(resolvedSentence(target), target.sentenceAudioUrl);
      }
    }
  }

  function beginLearning() {
    if (!assetProgress.ready || flowTransitionRef.current) return;
    queueFlowTransition(
      "start",
      () => {
        setError("");
        playEntryForSession(session!);
      },
      () => setStarted(true),
    );
  }

  function submitReview(known: boolean) {
    if (!reviewCharacter || busy || flowTransitionRef.current) return;
    const nextSession = advanceReviewLocally(
      session!,
      reviewCharacter.id,
      known,
    );
    if (known) {
      queueFlowTransition(
        "review-known",
        () => {
          setError("");
          playEntryForSession(nextSession);
          setKnownToast(true);
        },
        () => {
          setKnownToast(false);
          setFlipped(false);
          setSession(nextSession);
        },
        700,
      );
    } else {
      queueFlowTransition(
        "review-unknown",
        () => setError(""),
        () => {
          setUnknownCharacter(reviewCharacter);
          setPendingSession(nextSession);
        },
      );
    }
  }

  function continueAfterUnknown() {
    if (!pendingSession || flowTransitionRef.current) return;
    queueFlowTransition(
      "review-continue",
      () => playEntryForSession(pendingSession),
      () => {
        setSession(pendingSession);
        setPendingSession(null);
        setUnknownCharacter(null);
        setFlipped(false);
      },
    );
  }

  function nextNewStep() {
    if (!newCharacter || busy || flowTransitionRef.current) return;
    if (newStep < 2) {
      const nextStep = newStep + 1;
      queueFlowTransition(
        "new-next",
        () => {
          stopActiveSpeech();
          if (nextStep === 1) {
            playSpeech(newCharacter.character, newCharacter.characterAudioUrl);
          } else {
            playCharacterThenText(
              newCharacter,
              resolvedSentence(newCharacter),
              newCharacter.sentenceAudioUrl,
            );
          }
        },
        () => setNewStep(nextStep),
      );
      return;
    }
    const optimisticSession = advanceNewCharacterLocally(session!);
    queueFlowTransition(
      "new-next",
      () => {
        stopActiveSpeech();
        setError("");
        playEntryForSession(optimisticSession);
      },
      () => {
        setSession(optimisticSession);
        setNewStep(0);
      },
    );
  }

  function selectAnswer(characterId: string) {
    if (!question || answerFeedback || flowTransitionRef.current) return;
    const locallyCorrect = characterId === question.targetId;
    const optimisticSession = advanceQuestionLocally(session!, locallyCorrect);
    queueFlowTransition(
      `answer:${characterId}`,
      () => {
        stopActiveSpeech();
        setError("");
        if (locallyCorrect && questionTarget) {
          playSpeech(
            questionTarget.character,
            questionTarget.characterAudioUrl,
          );
        } else if (questionTarget) {
          playSpeech(
            resolvedSentence(questionTarget),
            questionTarget.sentenceAudioUrl,
          );
        }
      },
      () => {
        setAnswerFeedback({
          selectedId: characterId,
          targetId: question.targetId,
          correct: locallyCorrect,
          nextSession: optimisticSession,
        });
        setAnswerSelections((current) => ({
          ...current,
          [session!.questionIndex]: characterId,
        }));
      },
    );
  }

  function continueQuestion() {
    if (!answerFeedback || flowTransitionRef.current) return;
    queueFlowTransition(
      "question-continue",
      () => {
        stopActiveSpeech();
        playEntryForSession(answerFeedback.nextSession);
      },
      () => {
        setSession(answerFeedback.nextSession);
        setAnswerFeedback(null);
      },
    );
  }

  function returnToOverview(nextSession: HanziLearningSession = session!) {
    stopActiveSpeech();
    setSession(nextSession);
    setStarted(false);
    setNewStep(0);
    setFlipped(false);
    setUnknownCharacter(null);
    setPendingSession(null);
    setAnswerFeedback(null);
  }

  function goBackOneStep() {
    if (flowTransitionRef.current || busy) return;
    if (unknownCharacter) {
      returnToOverview(pendingSession ?? session!);
      return;
    }
    if (session?.phase === "REVIEW") {
      if (flipped) {
        setFlipped(false);
        return;
      }
      returnToOverview();
      return;
    }
    if (session?.phase === "NEW_LEARNING") {
      if (newStep > 0) {
        stopActiveSpeech();
        setNewStep((current) => current - 1);
        return;
      }
      returnToOverview();
      return;
    }
    if (session?.phase === "CONSOLIDATION") {
      returnToOverview(answerFeedback?.nextSession ?? session);
      return;
    }
    returnToOverview();
  }

  async function finish() {
    if (busy || flowTransitionRef.current) return;
    stopActiveSpeech();
    setBusy(true);
    setError("");
    try {
      const reviewKnownIds = new Set(session!.reviewKnownIds);
      const reviewUnknownIds = new Set(session!.reviewUnknownIds);
      const result = await finalizeHanziLearningSession(
        session!.id,
        {
          reviewAnswers: session!.reviewCharacterIds.map((characterId) => ({
            characterId,
            known: reviewKnownIds.has(characterId)
              ? true
              : reviewUnknownIds.has(characterId)
                ? false
                : false,
          })),
          learnedCharacterIds: session!.newCharacterIds,
          answers: Object.entries(answerSelections).map(
            ([questionIndex, selectedCharacterId]) => ({
              questionIndex: Number(questionIndex),
              selectedCharacterId,
            }),
          ),
        },
        requestAbort.current.signal,
      );
      clearLocalDraft(session!.id);
      onCompleted(result.reward);
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        (reason.code === "ATTEMPT_NOT_ACTIVE" || reason.code === "ATTEMPT_NOT_FOUND")
      ) {
        onExit();
        return;
      }
      setError(reason instanceof Error ? reason.message : "任务暂时无法完成");
    } finally {
      setBusy(false);
    }
  }

  if (!started) {
    const assetPercent =
      assetProgress.total > 0
        ? Math.round(
            (Math.min(assetProgress.completed, assetProgress.total) /
              assetProgress.total) *
              100,
          )
        : assetProgress.ready
          ? 100
          : 0;
    const isReviewOnly = session.kind === "REVIEW";
    const stages = isReviewOnly
      ? [{
          title: "复习汉字",
          duration: "约 3 分钟",
          body: "看看还记不记得这些字",
          count: `${session.reviewCharacterIds.length} 个字`,
          tone: "review",
        }]
      : [
          {
            title: "认识新字",
            duration: "约 1 分钟",
            body: "看字形、听读音、想意思",
            count: `${session.newCharacterIds.length} 个字`,
            tone: "new",
          },
          {
            title: "听句挑战",
            duration: "约 3 分钟",
            body: "听句子，选出正确的字",
            count: `${session.questions.length} 道题`,
            tone: "listen",
          },
        ];
    return (
      <main className="hanzi-page hanzi-page--home">
        <header className="hanzi-home-header">
          <span className="hanzi-header-spacer" aria-hidden="true" />
          <h1>{isReviewOnly ? "汉字复习" : "汉字学习"}</h1>
          <div className="hanzi-time-chip"><span aria-hidden="true">◷</span>{isReviewOnly ? "约 3 分钟" : "约 4 分钟"}</div>
        </header>
        <HanziTaskControls onAbandon={abandonLearning} />
        <section className="hanzi-stage-list" aria-label="今日汉字学习流程">
          {stages.map((stage, index) => (
            <article className={`hanzi-stage-card hanzi-stage-card--${stage.tone}`} key={stage.title}>
              <div className="hanzi-stage-card__icon" aria-hidden="true">{index + 1}</div>
              <div className="hanzi-stage-card__copy">
                <div><h2>{stage.title}</h2><strong>{stage.duration}</strong></div>
                <p>{stage.body}</p>
                <small>{stage.count}</small>
              </div>
            </article>
          ))}
        </section>
        {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
        <section
          className="hanzi-asset-preparation"
          aria-label="学习资源准备进度"
          aria-live="polite"
        >
          <div className="hanzi-asset-preparation__header">
            <strong>
              {assetProgress.ready ? "学习资源准备好了" : "正在准备图片和朗读"}
            </strong>
            <span>{assetPercent}%</span>
          </div>
          <div
            className="hanzi-asset-preparation__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={assetPercent}
          >
            <span style={{ width: `${assetPercent}%` }} />
          </div>
          <p>
            {assetProgress.ready && assetProgress.failed > 0
              ? `${assetProgress.failed} 项将自动使用备用资源`
              : assetProgress.ready
                ? "现在可以开始学习"
                : "准备完成后即可开始"}
          </p>
        </section>
        <footer className="hanzi-bottom-action">
          <button
            className={
              flowTransition === "start"
                ? "child-submit-button--loading"
                : undefined
            }
            disabled={!assetProgress.ready || Boolean(flowTransition)}
            aria-busy={flowTransition === "start"}
            type="button"
            onClick={beginLearning}
          >
            {flowTransition === "start" ? (
              <LoadingDots label="正在进入" />
            ) : assetProgress.ready
              ? session.reviewIndex > 0 ||
                session.newIndex > 0 ||
                session.questionIndex > 0
                ? isReviewOnly ? "继续复习" : "继续学习"
                : isReviewOnly ? "开始复习" : "开始学习"
              : `正在准备 ${assetPercent}%`}
            {assetProgress.ready && flowTransition !== "start" ? (
              <span aria-hidden="true">→</span>
            ) : null}
          </button>
        </footer>
      </main>
    );
  }

  if (unknownCharacter) {
    return (
      <main className="hanzi-page hanzi-page--coach">
        <ProgressHeader
          title="复习"
          current={session.reviewIndex + 1}
          total={session.reviewCharacterIds.length}
          onBack={goBackOneStep}
        />
        <HanziTaskControls onAbandon={abandonLearning} />
        <section className="hanzi-coach-card">
          <span className="hanzi-coach-card__spark" aria-hidden="true">✦</span>
          <h1>没关系，我们再认识一次！</h1>
          <CharacterBox character={unknownCharacter.character} compact />
          <button
            className="hanzi-coach-audio"
            disabled={Boolean(flowTransition)}
            type="button"
            onClick={() => playSpeech(unknownCharacter.character, unknownCharacter.characterAudioUrl)}
          >
            <PlayIcon />听一听
          </button>
        </section>
        <footer className="hanzi-bottom-action">
          <button
            className={
              flowTransition === "review-continue"
                ? "child-submit-button--loading"
                : undefined
            }
            disabled={Boolean(flowTransition)}
            aria-busy={flowTransition === "review-continue"}
            type="button"
            onClick={continueAfterUnknown}
          >
            {flowTransition === "review-continue" ? (
              <LoadingDots label="正在继续" />
            ) : (
              "认识了"
            )}
          </button>
        </footer>
      </main>
    );
  }

  if (session.phase === "REVIEW" && reviewCharacter) {
    return (
      <main className="hanzi-page hanzi-page--review">
        <ProgressHeader
          title="复习"
          current={session.reviewIndex + 1}
          total={session.reviewCharacterIds.length}
          onBack={goBackOneStep}
        />
        <HanziTaskControls onAbandon={abandonLearning} />
        <section className="hanzi-review-canvas">
          <button
            className={`hanzi-review-card${flipped ? " hanzi-review-card--flipped" : ""}`}
            disabled={Boolean(flowTransition)}
            type="button"
            onClick={() => {
              if (flowTransitionRef.current) return;
              setFlipped((current) => !current);
              if (!flipped) playSpeech(reviewCharacter.character, reviewCharacter.characterAudioUrl);
            }}
          >
            <span className="hanzi-review-card__face hanzi-review-card__face--front">
              <CharacterBox character={reviewCharacter.character} />
              <span className="hanzi-hint-chip">点一下看看</span>
              <p>认识这个字吗？</p>
            </span>
            <span className="hanzi-review-card__face hanzi-review-card__face--back">
              <CharacterBox character={reviewCharacter.character} />
              <span className="hanzi-flip-cue" aria-hidden="true">↻</span>
              <img
                className="hanzi-runtime-default-image"
                src={characterImageSource(reviewCharacter)}
                alt={`${reviewCharacter.character}字形联想图`}
                decoding="async"
                fetchPriority="high"
                onError={handleCharacterImageError}
              />
              <div className="hanzi-card-back__bottom">
                <strong>{reviewCharacter.meaning}</strong>
                <span><PlayIcon />听一听</span>
              </div>
            </span>
          </button>
          <div className="hanzi-review-actions">
            <button
              className={
                flowTransition === "review-unknown"
                  ? "child-submit-button--loading"
                  : undefined
              }
              disabled={busy || Boolean(flowTransition)}
              aria-busy={flowTransition === "review-unknown"}
              type="button"
              onClick={() => submitReview(false)}
            >
              {flowTransition === "review-unknown" ? (
                <LoadingDots label="正在切换" />
              ) : (
                "还不认识"
              )}
            </button>
            <button
              className={
                flowTransition === "review-known"
                  ? "child-submit-button--loading"
                  : undefined
              }
              disabled={busy || Boolean(flowTransition)}
              aria-busy={flowTransition === "review-known"}
              type="button"
              onClick={() => submitReview(true)}
            >
              {flowTransition === "review-known" ? (
                <LoadingDots label="正在切换" />
              ) : (
                "认识"
              )}
            </button>
          </div>
        </section>
        {knownToast ? (
          <div className="hanzi-known-toast-layer" aria-live="polite">
            <div className="hanzi-feedback-toast hanzi-feedback-toast--success">
              <span aria-hidden="true">✓</span>真棒！记得真清楚！
            </div>
          </div>
        ) : null}
        {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
      </main>
    );
  }

  if (session.phase === "NEW_LEARNING" && newCharacter) {
    const overallProgress =
      ((session.newIndex * 3 + newStep + 1) /
        Math.max(1, session.newCharacterIds.length * 3)) *
      100;
    return (
      <main className={`hanzi-page hanzi-page--runtime-new ${newStep === 0 ? "hanzi-page--new hanzi-page--new-shape" : newStep === 1 ? "hanzi-page--sound" : "hanzi-page--meaning"}`}>
        <header className="hanzi-new-word-header">
          <div className="hanzi-new-word-header__top">
            <BackButton onClick={goBackOneStep} />
            <h1>认识新字</h1>
            <div className="hanzi-new-word-counter">
              <span>第 {session.newIndex + 1} / {session.newCharacterIds.length} 个字</span>
            </div>
          </div>
          <div className="hanzi-new-word-progress"><span style={{ width: `${overallProgress}%` }} /></div>
        </header>
        <HanziTaskControls onAbandon={abandonLearning} />
        <div className="hanzi-step-indicators" aria-label="认识新字步骤">
          {["看字形", "听读音", "想意思"].map((label, index) => (
            <div className={`hanzi-step-pill${index === newStep ? " hanzi-step-pill--active" : ""}${index < newStep ? " hanzi-step-pill--done" : ""}`} key={label}>
              <b>{index < newStep ? "✓" : index + 1}</b><span>{label}</span>
            </div>
          ))}
        </div>
        {newStep === 0 ? (
          <section className="hanzi-shape-card hanzi-runtime-new-card">
            <div className="hanzi-shape-card__content">
              <CharacterBox character={newCharacter.character} />
              <div className="hanzi-shape-image-only">
                <img
                  src={characterImageSource(newCharacter)}
                  alt={`${newCharacter.character}字形联想图`}
                  decoding="async"
                  fetchPriority="high"
                  onError={handleCharacterImageError}
                />
              </div>
            </div>
          </section>
        ) : newStep === 1 ? (
          <section className="hanzi-sound-card hanzi-runtime-new-card">
            <div className="hanzi-sound-character">
              <CharacterBox character={newCharacter.character} />
              <button className="hanzi-audio-orb" disabled={Boolean(flowTransition)} type="button" onClick={() => playSpeech(newCharacter.character, newCharacter.characterAudioUrl)} aria-label={`播放${newCharacter.character}的读音`}>
                <img src={meaningSpeakerIcon} alt="" />
              </button>
            </div>
            <div className="hanzi-sound-vocabulary" aria-label={`${newCharacter.character}的词语`}>
              {newCharacter.words.slice(0, 3).map((word, index) => (
                <button disabled={Boolean(flowTransition)} type="button" key={word} onClick={() => playSpeech(word, newCharacter.wordAudioUrls[index])} aria-label={`播放词语${word}`}>
                  <span>{word}</span><img src={meaningSpeakerIcon} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="hanzi-meaning-canvas hanzi-runtime-new-card">
            <div className="hanzi-meaning-core">
              <div className="hanzi-meaning-figure">
                <img
                  src={characterImageSource(newCharacter)}
                  alt={`${newCharacter.character}含义图`}
                  decoding="async"
                  fetchPriority="high"
                  onError={handleCharacterImageError}
                />
              </div>
              <div className="hanzi-meaning-panel">
                <div className="hanzi-meaning-panel__character"><strong>{newCharacter.character}</strong><span>{newCharacter.meaning}</span></div>
                <button
                  className="hanzi-meaning-sentence"
                  disabled={Boolean(flowTransition)}
                  type="button"
                  onClick={() => playSpeech(resolvedSentence(newCharacter), newCharacter.sentenceAudioUrl)}
                  aria-label="播放例句"
                >
                  <img src={meaningSpeakerIcon} alt="" aria-hidden="true" />
                  <span>{resolvedSentence(newCharacter)}</span>
                </button>
              </div>
            </div>
          </section>
        )}
        {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
        <footer className="hanzi-new-word-footer">
          <button
            className={
              flowTransition === "new-next"
                ? "child-submit-button--loading"
                : undefined
            }
            disabled={busy || Boolean(flowTransition)}
            aria-busy={flowTransition === "new-next"}
            type="button"
            onClick={nextNewStep}
          >
            {flowTransition === "new-next" ? (
              <LoadingDots label="正在切换" />
            ) : newStep === 2
              ? session.newIndex + 1 >= session.newCharacterIds.length
                ? "学完啦，去挑战"
                : "下一个字"
              : "下一步"}
            {flowTransition !== "new-next" ? (
              <span aria-hidden="true">→</span>
            ) : null}
          </button>
        </footer>
      </main>
    );
  }

  if (
    session.phase === "CONSOLIDATION" &&
    question &&
    questionTarget &&
    !allQuestionsAnswered
  ) {
    const parts = sentenceParts(questionTarget.sentence);
    const displayedTarget = answerFeedback
      ? characterById.get(answerFeedback.targetId)
      : null;
    return (
      <main className={`hanzi-page ${answerFeedback && !answerFeedback.correct ? "hanzi-page--listen-wrong" : "hanzi-page--listen-challenge"}${answerFeedback?.correct ? " hanzi-page--listen-correct" : ""}`}>
        <BackButton onClick={goBackOneStep} />
        <HanziTaskControls onAbandon={abandonLearning} />
        {answerFeedback?.correct ? (
          <div className="hanzi-feedback-toast hanzi-feedback-toast--listen" role="status"><span>✓</span>真棒！回答正确！</div>
        ) : null}
        <section className={answerFeedback && !answerFeedback.correct ? "hanzi-listen-wrong__content" : `hanzi-listen-shell${answerFeedback?.correct ? " hanzi-listen-shell--answered" : ""}`}>
          {!answerFeedback ? (
            <header className="hanzi-listen-title">
              <button
                className="hanzi-listen-play"
                disabled={Boolean(flowTransition)}
                type="button"
                aria-label="播放句子"
                onClick={() => playSpeech(resolvedSentence(questionTarget), questionTarget.sentenceAudioUrl)}
              ><PlayIcon /></button>
              <div><h1>听句挑战</h1><p>选出正确的字，放进句子里</p></div>
            </header>
          ) : null}
          <section className="hanzi-listen-sentence" aria-label="句子">
            <p>{parts.before}</p>
            <span className={`hanzi-listen-blank${answerFeedback ? " hanzi-listen-blank--filled" : ""}`}>
              {displayedTarget?.character ?? "?"}
            </span>
            {parts.after ? <p>{parts.after}</p> : null}
          </section>
          <div className="hanzi-listen-options" aria-label="汉字选项">
            {question.optionIds.map((id) => {
              const option = characterById.get(id);
              if (!option) return null;
              const optionLoading = flowTransition === `answer:${id}`;
              return (
                <button
                  className={`${answerFeedback?.selectedId === id ? "hanzi-listen-option--selected" : ""}${answerFeedback?.targetId === id ? " hanzi-listen-option--correct" : ""}${optionLoading ? " child-submit-button--loading hanzi-listen-option--loading" : ""}`}
                  disabled={Boolean(answerFeedback) || Boolean(flowTransition)}
                  aria-busy={optionLoading}
                  aria-label={
                    optionLoading
                      ? `正在选择${option.character}`
                      : `选择${option.character}`
                  }
                  key={id}
                  type="button"
                  onClick={() => selectAnswer(id)}
                >
                  {optionLoading ? (
                    <LoadingDots label="" />
                  ) : (
                    option.character
                  )}
                </button>
              );
            })}
          </div>
          {answerFeedback && !answerFeedback.correct ? (
            <div className="hanzi-listen-feedback"><span>i</span>正确答案是「{displayedTarget?.character}」，我们记住它啦！</div>
          ) : null}
        </section>
        {answerFeedback ? (
          <button
            className={`hanzi-listen-next${
              flowTransition === "question-continue"
                ? " child-submit-button--loading"
                : ""
            }`}
            disabled={Boolean(flowTransition)}
            aria-busy={flowTransition === "question-continue"}
            type="button"
            onClick={continueQuestion}
          >
            {flowTransition === "question-continue" ? (
              <LoadingDots label="正在继续" />
            ) : (
              <>继续 <span>→</span></>
            )}
          </button>
        ) : null}
        {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
      </main>
    );
  }

  const scoreTotal = Math.max(0, session.summary.total);
  const scoreRatio =
    scoreTotal > 0
      ? Math.min(1, Math.max(0, session.summary.correct / scoreTotal))
      : 0;

  return (
    <main className="hanzi-page hanzi-page--result">
      <HanziTaskControls onAbandon={abandonLearning} />
      <header className="hanzi-result-header">
        <div className="hanzi-result-medal" aria-hidden="true">✓</div>
        <div><h1>{session.kind === "REVIEW" ? "今天的汉字复习完成啦！" : "今天的汉字学习完成啦！"}</h1><p>{session.kind === "REVIEW" ? "记得越多，汉字朋友越牢固！" : "今天认识了好多汉字朋友！"}</p></div>
      </header>
      <section className="hanzi-result-grid" aria-label="学习结果">
        <article>
          <h2>今天复习</h2>
          <p><span>认识</span><strong>{session.summary.reviewKnown} 个</strong></p>
          <p><span>再见几次</span><strong>{session.summary.reviewUnknown} 个</strong></p>
        </article>
        {session.kind !== "REVIEW" ? (
          <>
            <article>
              <h2>今天新学</h2>
              <p>认识了 {session.newCharacterIds.length} 个新朋友</p>
              <div className="hanzi-result-characters">
                {session.newCharacterIds.map((id) => <b key={id}>{characterById.get(id)?.character}</b>)}
              </div>
            </article>
            <article>
              <h2>听句挑战</h2>
              <div
                className="hanzi-score-ring"
                style={{
                  background: `conic-gradient(#4da8e8 ${scoreRatio * 360}deg, #e7f2ff 0deg)`,
                }}
              >
                <div className="hanzi-score-ring__value"><strong>{session.summary.correct}</strong><span>/ {session.summary.total}</span></div>
              </div>
            </article>
          </>
        ) : null}
      </section>
      {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
      <footer className="hanzi-result-footer">
        <p>{session.kind === "REVIEW" ? "按时回来复习，汉字就会记得越来越牢。" : "这些汉字会在合适的时候再回来见你，见得越多，记得越牢。"}</p>
        <button
          className={busy ? "child-submit-button--loading" : undefined}
          disabled={busy || Boolean(flowTransition)}
          aria-busy={busy}
          type="button"
          onClick={() => void finish()}
        >
          {busy ? <LoadingDots label="正在完成" /> : "完成任务"}
        </button>
      </footer>
    </main>
  );
}
