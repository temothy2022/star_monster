import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  completePoemLearning,
  finishPoemReview,
  getChildProfile,
  startPoemLearningSession,
  submitPoemReview,
  type Poem,
  type PoemLearningSession,
  type MemoryRecallRating,
} from "../api/child-api";
import speakerIcon from "@star-monsters/assets/icons/hanzi/sound-speaker.svg";
import reviewCheckIcon from "@star-monsters/assets/icons/icon-check.svg";
import reviewHintIcon from "@star-monsters/assets/icons/untimed-task/help.svg";
import reviewRetryIcon from "@star-monsters/assets/icons/untimed-task/cancel.svg";
import reviewStarIcon from "@star-monsters/assets/icons/wishes/star.svg";
import defaultPoemImage from "@star-monsters/assets/images/poem/spring-dawn.webp";
import { ChildDataState } from "../components/ChildDataState";
import { ChildControlIcon } from "../components/ChildControlIcon";
import { LoadingDots } from "../components/LoadingDots";
import { HanziTaskControls } from "../hanzi/HanziTaskControls";
import {
  getPoemAudioElement,
  preloadPoemAssets,
} from "./poem-asset-cache";
import { reportChildPageReady } from "../api/performance-telemetry";
import {
  createAudioWithSpeechFallback,
  createDeferredPlayback,
  createSpeechPlayback,
  SinglePendingPlaybackQueue,
  type PlaybackHandle,
} from "../audio/queued-playback";
import { useMascot } from "../mascots";

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

function concealedClause(clause: string): string {
  const characters = Array.from(clause);
  const punctuation = END_PUNCTUATION.test(characters.at(-1) ?? "")
    ? characters.pop()
    : "";
  const visibleLength = characters.filter((character) => character.trim()).length;
  return `${"＿".repeat(Math.min(Math.max(2, visibleLength), 10))}${punctuation}`;
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
  const { mascot } = useMascot();
  const [session, setSession] = useState<PoemLearningSession | null>(null);
  const [learningStep, setLearningStep] = useState<0 | 1 | 2>(0);
  const [reviewDecision, setReviewDecision] = useState<"INITIAL" | "INDEPENDENT" | "HINT">("INITIAL");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const playbackQueueRef = useRef<SinglePendingPlaybackQueue | null>(null);
  const reviewStartedAt = useRef(performance.now());
  if (!playbackQueueRef.current) {
    playbackQueueRef.current = new SinglePendingPlaybackQueue(setPlaying);
  }

  useEffect(() => {
    if (session?.kind !== "REVIEW") return undefined;
    let active = true;
    void getChildProfile()
      .then((profile) => {
        if (active) setStarBalance(profile.starBalance);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.kind]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startPoemLearningSession(attemptId)
      .then(({ session: nextSession }) => {
        if (!cancelled) {
          setSession(nextSession);
          reportChildPageReady(
            "poem-session",
            "/api/child/poems/sessions/start",
          );
        }
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
      playbackQueueRef.current?.clear();
    };
  }, [attemptId]);

  useEffect(() => () => playbackQueueRef.current?.clear(), []);

  const poem = session?.poems[session.currentIndex] ?? session?.poems[0] ?? null;
  const clauses = useMemo(
    () => (poem ? poemClauses(poem.content) : []),
    [poem],
  );

  useEffect(() => {
    setLearningStep(0);
    setReviewDecision("INITIAL");
    reviewStartedAt.current = performance.now();
  }, [poem?.id]);

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

  function playCurrent() {
    if (!poem || busy) return;
    setError("");
    const currentPoem = poem;
    const narration = `${currentPoem.title}，${currentPoem.dynasty}代，${currentPoem.author}。${currentPoem.content}`;
    playbackQueueRef.current?.enqueue(() => {
      let playback: PlaybackHandle;
      if (currentPoem.audioUrl) {
        playback = createDeferredPlayback(async () => {
          const audio = await getPoemAudioElement(currentPoem.audioUrl!);
          return createAudioWithSpeechFallback(audio, narration, {
            rate: 0.72,
            pitch: 1.04,
          });
        });
      } else {
        playback = createSpeechPlayback(narration, {
          rate: 0.72,
          pitch: 1.04,
        });
      }
      void playback.done.catch(() => setError("暂时无法播放朗读，请再试一次"));
      return playback;
    });
  }

  async function finishLearning(currentPoem: Poem) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    playbackQueueRef.current?.clear();
    setPlaying(false);
    try {
      const result = await completePoemLearning(session.id, currentPoem.id);
      setSession(result.session);
      if (result.completion) {
        onCompleted(result.completion.reward);
        return;
      }
      setLearningStep(0);
      setBusy(false);
    } catch (reason) {
      if (isStalePoemAttempt(reason)) {
        onExit();
        return;
      }
      setError(reason instanceof Error ? reason.message : "古诗学习完成失败");
      setBusy(false);
    }
  }

  async function handleReview(rating: MemoryRecallRating) {
    if (!session || !poem || busy) return;
    setBusy(true);
    setError("");
    playbackQueueRef.current?.clear();
    try {
      const response = await submitPoemReview(
        session.id,
        poem.id,
        rating,
        Math.max(0, Math.round(performance.now() - reviewStartedAt.current)),
      );
      const nextSession = response.session;
      if (nextSession.currentIndex >= nextSession.poemIds.length) {
        const completion = await finishPoemReview(nextSession.id);
        onCompleted(completion.reward);
        return;
      }
      setSession(nextSession);
      setReviewDecision("INITIAL");
      reviewStartedAt.current = performance.now();
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
            <ChildControlIcon kind="back" />
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
  if (isReview) {
    const answerVisible = reviewDecision !== "INITIAL";
    const reviewCurrent = session.currentIndex + 1;
    const reviewTotal = session.poemIds.length;
    const reviewProgress = reviewTotal
      ? (Math.min(reviewCurrent, reviewTotal) / reviewTotal) * 100
      : 100;

    return (
      <main className={`poem-page poem-page--adaptive-review${answerVisible ? " is-answer-visible" : ""}`}>
        <HanziTaskControls onAbandon={onExit} experienceName="古诗复习" />
        <header className="adaptive-review-header">
          <button
            className="poem-page__back"
            type="button"
            aria-label="返回任务列表"
            onClick={onExit}
          >
            <ChildControlIcon kind="back" />
          </button>
          <h1>星宠成长基地</h1>
          <span className="adaptive-review-header__balance" aria-label={starBalance == null ? "正在读取星星余额" : `当前有${starBalance}颗星`}>
            <img src={reviewStarIcon} alt="" aria-hidden="true" />
            {starBalance ?? "--"}
          </span>
        </header>

        <section className="adaptive-poem-review" aria-label={`复习古诗${poem.title}`}>
          <div className="adaptive-poem-review__image-pane">
            <img
              src={poem.imageUrl || defaultPoemImage}
              alt={`${poem.title}配图`}
              decoding="async"
            />
          </div>
          <div className="adaptive-poem-review__content-pane">
            <div className="adaptive-poem-review__heading">
              <h2>{poem.title}</h2>
              <span>{poem.dynasty} · {poem.author}</span>
            </div>

            <div className="adaptive-poem-review__grid" aria-label={answerVisible ? poem.content : "背诵提示：先看第一句"}>
              {clauses.map((clause, clauseIndex) => (
                <div className="adaptive-poem-review__line" key={`${clause}-${clauseIndex}`}>
                  {Array.from(clause).map((character, characterIndex) => {
                    const punctuation = END_PUNCTUATION.test(character);
                    if (punctuation) {
                      return answerVisible || clauseIndex === 0 ? (
                        <span className="adaptive-poem-review__punctuation" key={`${character}-${characterIndex}`}>{character}</span>
                      ) : null;
                    }
                    const characterVisible = answerVisible || clauseIndex === 0;
                    return (
                      <span
                        className={`adaptive-poem-review__character${characterVisible ? " is-visible" : ""}`}
                        key={`${character}-${characterIndex}`}
                      >
                        {characterVisible ? character : ""}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            {reviewDecision === "INITIAL" ? (
              <div className="adaptive-review-actions adaptive-poem-review__initial-actions">
                <button
                  className="adaptive-review-button adaptive-review-button--success"
                  type="button"
                  disabled={busy}
                  onClick={() => setReviewDecision("INDEPENDENT")}
                >
                  <img src={speakerIcon} alt="" aria-hidden="true" />
                  我能背
                </button>
                <button
                  className="adaptive-review-button adaptive-review-button--danger"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    playbackQueueRef.current?.clear();
                    setReviewDecision("HINT");
                  }}
                >
                  <img src={reviewHintIcon} alt="" aria-hidden="true" />
                  提示一句
                </button>
              </div>
            ) : (
              <div className="adaptive-poem-review__rating-actions">
                <button className="adaptive-review-button adaptive-review-button--success" type="button" disabled={busy} onClick={() => void handleReview("EASY")}>
                  <img src={reviewCheckIcon} alt="" aria-hidden="true" />很顺利
                </button>
                <button className="adaptive-review-button adaptive-review-button--effort" type="button" disabled={busy} onClick={() => void handleReview("EFFORTFUL")}>
                  想了一会儿
                </button>
                <button className="adaptive-review-button adaptive-review-button--hinted" type="button" disabled={busy} onClick={() => void handleReview("HINTED")}>
                  <img src={reviewHintIcon} alt="" aria-hidden="true" />提示后完成
                </button>
                <button className="adaptive-review-button adaptive-review-button--danger" type="button" disabled={busy} onClick={() => void handleReview("FORGOT")}>
                  <img src={reviewRetryIcon} alt="" aria-hidden="true" />
                  还要复习
                </button>
              </div>
            )}
            {error ? <p className="poem-runtime__error" role="alert">{error}</p> : null}
          </div>
        </section>

        <footer className="adaptive-review-footer">
          <img className="adaptive-review-footer__mascot" src={mascot.images.neutral} alt={`星宠${mascot.name}`} />
          <div className="adaptive-review-footer__progress">
            <span><img src={reviewStarIcon} alt="" aria-hidden="true" />{reviewCurrent} / {reviewTotal}</span>
            <div><i style={{ width: `${reviewProgress}%` }} /></div>
          </div>
        </footer>
      </main>
    );
  }

  const displayedContent = isReview
    ? clauses
        .map((clause) =>
          reviewDecision === "HINT"
            ? reviewHint(clause)
            : concealedClause(clause),
        )
        .join("")
    : clauses
        .map((clause) =>
          learningStep === 0
            ? concealedClause(clause)
            : learningStep === 1
              ? clause
              : reviewHint(clause),
        )
        .join("");
  const displayedClauses = poemClauses(displayedContent);

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
          <ChildControlIcon kind="back" />
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
            <img
              src={poem.imageUrl || defaultPoemImage}
              alt={`${poem.title}配图`}
              decoding="async"
            />
          </div>
        </div>

        <div className="poem-page__recitation-column">
          <button
            className={`poem-page__listen ${playing ? "is-playing" : ""}`}
            type="button"
            aria-label={`播放${poem.title}`}
            disabled={busy}
            onClick={playCurrent}
          >
            <img src={speakerIcon} alt="" aria-hidden="true" />
          </button>
          {!isReview ? (
            <div className="poem-learning-steps" aria-label="学习步骤">
              {[
                "听一遍",
                "看着读",
                "遮住想",
              ].map((label, index) => <span className={index === learningStep ? "is-active" : index < learningStep ? "is-done" : ""} key={label}>{index + 1}. {label}</span>)}
            </div>
          ) : null}
          <div
            className={`poem-runtime__text poem-runtime__text--${
              isReview && reviewDecision === "INITIAL"
                ? "concealed"
                : isReview || learningStep === 2
                  ? "hinted"
                  : learningStep === 0
                    ? "listening"
                    : "visible"
            }`}
            aria-label={isReview || learningStep !== 1 ? "背诵提示" : poem.content}
          >
            {displayedClauses.map((clause, index) => (
              <div className="poem-page__line" key={`${clause}-${index}`}>
                {Array.from(clause).map((character, characterIndex) =>
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
              {reviewDecision === "INITIAL" ? <div className="poem-runtime__review-actions"><button className="poem-runtime__forgot" type="button" disabled={busy} onClick={() => { setReviewDecision("HINT"); playCurrent(); }}>给我提示</button><button className="poem-page__complete" type="button" disabled={busy} onClick={() => setReviewDecision("INDEPENDENT")}>我背出来了</button></div> : reviewDecision === "INDEPENDENT" ? <div className="poem-runtime__review-actions"><button className="poem-runtime__forgot" type="button" disabled={busy} onClick={() => void handleReview("EFFORTFUL")}>想了一会儿</button><button className="poem-page__complete" type="button" disabled={busy} onClick={() => void handleReview("EASY")}>很顺利</button></div> : <div className="poem-runtime__review-actions"><button className="poem-runtime__forgot" type="button" disabled={busy} onClick={() => void handleReview("FORGOT")}>还要再学</button><button className={`poem-page__complete${busy ? " child-submit-button--loading" : ""}`} type="button" disabled={busy} aria-busy={busy} onClick={() => void handleReview("HINTED")}>{busy ? <LoadingDots label={isLastReview ? "正在完成" : "正在提交"} /> : "提示后想起"}</button></div>}
            </>
          ) : (
            <button
              className={`poem-page__complete${
                busy ? " child-submit-button--loading" : ""
              }`}
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => {
                if (learningStep < 2) {
                  setLearningStep((current) => Math.min(2, current + 1) as 0 | 1 | 2);
                  return;
                }
                void finishLearning(poem);
              }}
            >
              {busy ? (
                <LoadingDots label="正在完成" />
              ) : (
                learningStep === 0 ? "听完了，看着读" : learningStep === 1 ? "遮住试一试" : session.currentIndex + 1 < session.poemIds.length ? "下一首" : "完成任务"
              )}
            </button>
          )}
          {error ? <p className="poem-runtime__error" role="alert">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
