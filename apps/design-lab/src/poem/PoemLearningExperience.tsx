import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  completePoemLearning,
  finishPoemReview,
  startPoemLearningSession,
  submitPoemReview,
  type Poem,
  type PoemLearningSession,
} from "../api/child-api";
import speakerIcon from "../assets/hanzi/sound-speaker.svg";
import backIcon from "../assets/icon-arrow-left.svg";
import defaultPoemImage from "../assets/poem/spring-dawn.png";
import { ChildDataState } from "../components/ChildDataState";
import { LoadingDots } from "../components/LoadingDots";
import { HanziTaskControls } from "../hanzi/HanziTaskControls";
import {
  getPoemAudioElement,
  preloadPoemAssets,
} from "./poem-asset-cache";

type Reward = {
  baseStars: number;
  bonusStars: number;
  dailyGoalBonusStars: number;
  totalStars: number;
};

const END_PUNCTUATION = /[，。！？；]/;
const STALE_POEM_CODES = new Set([
  "ATTEMPT_NOT_ACTIVE",
  "ATTEMPT_NOT_FOUND",
  "TASK_ALREADY_COMPLETED",
]);

function isStalePoemAttempt(reason: unknown): boolean {
  return (
    reason instanceof ApiError &&
    Boolean(reason.code && STALE_POEM_CODES.has(reason.code))
  );
}

function poemClauses(content: string): string[] {
  const clauses: string[] = [];
  let current = "";
  for (const character of Array.from(content)) {
    current += character;
    if (END_PUNCTUATION.test(character)) {
      clauses.push(current);
      current = "";
    }
  }
  if (current.trim()) clauses.push(current);
  return clauses;
}

function reviewHint(clause: string): string {
  const characters = Array.from(clause);
  const punctuation = END_PUNCTUATION.test(characters.at(-1) ?? "")
    ? characters.pop()
    : "";
  const firstIndex = characters.findIndex((character) => character.trim());
  if (firstIndex < 0) return clause;
  const first = characters[firstIndex];
  const hiddenCount = Math.max(2, characters.length - firstIndex - 1);
  return `${first}${"＿".repeat(Math.min(hiddenCount, 8))}${punctuation}`;
}

async function speakPoem(
  poem: Poem,
  onStarted?: () => void,
  onEnded?: () => void,
  onError?: () => void,
): Promise<() => void> {
  if (poem.audioUrl) {
    const audio = await getPoemAudioElement(poem.audioUrl);
    let stopped = false;
    audio.pause();
    audio.currentTime = 0;
    audio.onended = () => {
      if (!stopped) onEnded?.();
    };
    audio.onerror = () => {
      if (!stopped) onError?.();
    };
    void audio
      .play()
      .then(() => {
        if (!stopped) onStarted?.();
      })
      .catch(() => {
        if (!stopped) onError?.();
      });
    return () => {
      stopped = true;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    };
  }

  if (!("speechSynthesis" in window)) {
    onError?.();
    return () => undefined;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    `${poem.title}，${poem.dynasty}代，${poem.author}。${poem.content}`,
  );
  utterance.lang = "zh-CN";
  utterance.rate = 0.72;
  utterance.pitch = 1.04;
  utterance.onstart = () => onStarted?.();
  utterance.onend = () => onEnded?.();
  utterance.onerror = () => onError?.();
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}

export function PoemLearningExperience({
  attemptId,
  onExit,
  onCompleted,
}: {
  attemptId: string;
  onExit: () => void;
  onCompleted: (reward: Reward) => void;
}) {
  const [session, setSession] = useState<PoemLearningSession | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const stopAudioRef = useRef<(() => void) | null>(null);
  const playbackRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startPoemLearningSession(attemptId)
      .then(({ session: nextSession }) => {
        if (!cancelled) setSession(nextSession);
      })
      .catch((reason) => {
        if (!cancelled) {
          if (isStalePoemAttempt(reason)) {
            onExit();
            return;
          }
          setError(reason instanceof Error ? reason.message : "古诗学习暂时无法开始");
        }
      });
    return () => {
      cancelled = true;
      playbackRequestRef.current += 1;
      stopAudioRef.current?.();
    };
  }, [attemptId]);

  const poem = session?.poems[session.currentIndex] ?? session?.poems[0] ?? null;
  const clauses = useMemo(
    () => (poem ? poemClauses(poem.content) : []),
    [poem],
  );

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const nearbyPoemIds = new Set(
      session.poemIds.slice(session.currentIndex, session.currentIndex + 2),
    );
    const nearbyPoems = session.poems.filter((item) =>
      nearbyPoemIds.has(item.id),
    );
    const timer = window.setTimeout(() => {
      void preloadPoemAssets(nearbyPoems, controller.signal);
    }, 50);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [session]);

  async function playCurrent() {
    if (!poem || busy) return;
    const requestId = playbackRequestRef.current + 1;
    playbackRequestRef.current = requestId;
    setError("");
    setPlaying(true);
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    const cleanup = await speakPoem(
      poem,
      undefined,
      () => {
        if (playbackRequestRef.current === requestId) setPlaying(false);
      },
      () => {
        if (playbackRequestRef.current === requestId) {
          setPlaying(false);
          setError("暂时无法播放朗读，请再试一次");
        }
      },
    );
    if (playbackRequestRef.current !== requestId) {
      cleanup();
      return;
    }
    stopAudioRef.current = cleanup;
  }

  async function finishLearning(currentPoem: Poem) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    stopAudioRef.current?.();
    setPlaying(false);
    try {
      const result = await completePoemLearning(session.id, currentPoem.id);
      onCompleted(result.reward);
    } catch (reason) {
      if (isStalePoemAttempt(reason)) {
        onExit();
        return;
      }
      setError(reason instanceof Error ? reason.message : "古诗学习完成失败");
      setBusy(false);
    }
  }

  async function handleReview(result: "REMEMBERED" | "FORGOT") {
    if (!session || !poem || busy) return;
    setBusy(true);
    setError("");
    stopAudioRef.current?.();
    try {
      const response = await submitPoemReview(
        session.id,
        poem.id,
        result,
      );
      const nextSession = response.session;
      if (nextSession.currentIndex >= nextSession.poemIds.length) {
        const completion = await finishPoemReview(nextSession.id);
        onCompleted(completion.reward);
        return;
      }
      setSession(nextSession);
      setShowOriginal(false);
      setBusy(false);
    } catch (reason) {
      if (isStalePoemAttempt(reason)) {
        onExit();
        return;
      }
      setError(reason instanceof Error ? reason.message : "古诗复习提交失败");
      setBusy(false);
    }
  }

  if (!session || !poem) {
    return (
      <main className="poem-page poem-page--runtime">
        <HanziTaskControls onAbandon={onExit} experienceName="古诗学习" />
        <header className="poem-page__header">
          <button
            className="poem-page__back"
            type="button"
            aria-label="返回任务列表"
            onClick={onExit}
          >
            <img src={backIcon} alt="" aria-hidden="true" />
          </button>
          <h1>古诗学习</h1>
        </header>
        <ChildDataState
          error={Boolean(error)}
          message={error || "正在准备今天的古诗…"}
        />
      </main>
    );
  }

  const isReview = session.kind === "REVIEW";
  const isLastReview = session.currentIndex === session.poemIds.length - 1;

  return (
    <main className={`poem-page poem-page--runtime ${isReview ? "poem-page--review" : ""}`}>
      <HanziTaskControls onAbandon={onExit} experienceName="古诗学习" />
      <header className="poem-page__header">
        <button
          className="poem-page__back"
          type="button"
          aria-label="返回任务列表"
          onClick={onExit}
        >
          <img src={backIcon} alt="" aria-hidden="true" />
        </button>
        <div className="poem-page__progress">
          {isReview ? `第 ${session.currentIndex + 1} / ${session.poemIds.length} 首` : "本周新诗"}
        </div>
        <h1>{isReview ? "古诗复习" : "古诗学习"}</h1>
      </header>

      <section className="poem-page__main" aria-label={isReview ? "古诗复习" : "古诗学习"}>
        <div className="poem-page__illustration-column">
          <div className="poem-page__poem-heading">
            <h2>《{poem.title}》</h2>
            <span>{poem.dynasty}代 · {poem.author}</span>
          </div>
          <div className="poem-page__image-frame">
            <img src={poem.imageUrl || defaultPoemImage} alt={`${poem.title}配图`} />
          </div>
        </div>

        <div className="poem-page__recitation-column">
          <button
            className={`poem-page__listen ${playing ? "is-playing" : ""}`}
            type="button"
            aria-label={`播放${poem.title}`}
            disabled={busy}
            onClick={() => void playCurrent()}
          >
            <img src={speakerIcon} alt="" aria-hidden="true" />
          </button>
          <div className="poem-runtime__text" aria-label={showOriginal || !isReview ? poem.content : "背诵提示"}>
            {clauses.map((clause, index) => (
              <div className="poem-page__line" key={`${clause}-${index}`}>
                {Array.from(
                  isReview && !showOriginal ? reviewHint(clause) : clause,
                ).map((character, characterIndex) =>
                  END_PUNCTUATION.test(character) ? (
                    <span
                      className="poem-page__punctuation"
                      key={`${character}-${characterIndex}`}
                    >
                      {character}
                    </span>
                  ) : (
                    <span
                      className="poem-page__character"
                      key={`${character}-${characterIndex}`}
                    >
                      {character}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>

          {isReview ? (
            <>
              <button
                className="poem-runtime__original"
                type="button"
                onClick={() => setShowOriginal((value) => !value)}
              >
                {showOriginal ? "收起原文" : "查看原文"}
              </button>
              <div className="poem-runtime__review-actions">
                <button
                  className="poem-runtime__forgot"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleReview("FORGOT")}
                >
                  忘了
                </button>
                <button
                  className={`poem-page__complete${
                    busy ? " child-submit-button--loading" : ""
                  }`}
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void handleReview("REMEMBERED")}
                >
                  {busy ? (
                    <LoadingDots label={isLastReview ? "正在完成" : "正在提交"} />
                  ) : isLastReview ? (
                    "完成"
                  ) : (
                    "下一首"
                  )}
                </button>
              </div>
            </>
          ) : (
            <button
              className={`poem-page__complete${
                busy ? " child-submit-button--loading" : ""
              }`}
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void finishLearning(poem)}
            >
              {busy ? (
                <LoadingDots label="正在完成" />
              ) : (
                "完成任务"
              )}
            </button>
          )}
          {error ? <p className="poem-runtime__error" role="alert">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
