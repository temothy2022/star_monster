import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  answerHanziQuestion,
  answerHanziReview,
  completeHanziNewCharacter,
  finishHanziLearningSession,
  startHanziLearningSession,
  type HanziCharacter,
  type HanziLearningSession,
} from "../api/child-api";
import { ChildDataState } from "../components/ChildDataState";
import backIcon from "../assets/icon-arrow-left.svg";
import playIcon from "../assets/untimed-task/play.svg";
import defaultHanziImage from "../assets/hanzi/test-generated-shui.jpeg";
import meaningSpeakerIcon from "../assets/hanzi/meaning-speaker.svg";
import { HanziTaskControls } from "./HanziTaskControls";

type CompletionReward = {
  baseStars: number;
  bonusStars: number;
  dailyGoalBonusStars: number;
  totalStars: number;
};

function speak(text: string, audioUrl?: string | null) {
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    void audio.play().catch(() => undefined);
    return;
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.72;
  utterance.pitch = 1.05;
  window.speechSynthesis.speak(utterance);
}

function resolvedSentence(character: HanziCharacter) {
  return character.sentence.replace("__", character.character);
}

function characterImageSource(character: HanziCharacter) {
  const imageKey = character.imageKey.trim();
  if (!imageKey || imageKey === "default-hanzi") return defaultHanziImage;
  return imageKey;
}

function speakCharacterThenText(
  character: HanziCharacter,
  text: string,
  textAudioUrl?: string | null,
) {
  let cancelled = false;
  let pauseTimer: number | undefined;
  let audio: HTMLAudioElement | undefined;
  let fallbackStarted = false;

  const speakFollowingText = () => {
    if (cancelled) return;
    pauseTimer = window.setTimeout(() => {
      if (!cancelled) speak(text, textAudioUrl);
    }, 500);
  };

  const speakWithBrowserVoice = () => {
    if (fallbackStarted || cancelled) return;
    fallbackStarted = true;
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
    audio = new Audio(character.characterAudioUrl);
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
    }
    window.speechSynthesis?.cancel();
  };
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
  const [error, setError] = useState("");
  const [knownToast, setKnownToast] = useState(false);
  const [unknownCharacter, setUnknownCharacter] = useState<HanziCharacter | null>(null);
  const [pendingSession, setPendingSession] = useState<HanziLearningSession | null>(null);
  const activeSpeechCleanup = useRef<null | (() => void)>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    selectedId: string;
    targetId: string;
    correct: boolean;
    nextSession: HanziLearningSession;
  } | null>(null);

  useEffect(
    () => () => {
      activeSpeechCleanup.current?.();
      activeSpeechCleanup.current = null;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startHanziLearningSession(attemptId)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        setSession(loaded);
        if (
          loaded.reviewIndex > 0 ||
          loaded.newIndex > 0 ||
          loaded.questionIndex > 0
        ) {
          setStarted(true);
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "汉字学习暂时无法开始");
      });
    return () => {
      cancelled = true;
      window.speechSynthesis?.cancel();
    };
  }, [attemptId]);

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
    if (!started || !currentNewCharacter) return;
    activeSpeechCleanup.current?.();
    const cleanup = speakCharacterThenText(
      currentNewCharacter,
      resolvedSentence(currentNewCharacter),
      currentNewCharacter.sentenceAudioUrl,
    );
    activeSpeechCleanup.current = cleanup;
    return () => {
      if (activeSpeechCleanup.current === cleanup) {
        cleanup();
        activeSpeechCleanup.current = null;
      }
    };
  }, [currentNewCharacter, started]);

  useEffect(() => {
    if (
      !started ||
      session?.phase !== "CONSOLIDATION" ||
      answerFeedback ||
      !currentQuestionTarget
    ) {
      return;
    }
    speak(
      resolvedSentence(currentQuestionTarget),
      currentQuestionTarget.sentenceAudioUrl,
    );
  }, [
    answerFeedback,
    currentQuestionTarget,
    session?.phase,
    session?.questionIndex,
    started,
  ]);

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

  async function submitReview(known: boolean) {
    if (!reviewCharacter || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await answerHanziReview(
        session!.id,
        reviewCharacter.id,
        known,
      );
      if (known) {
        setKnownToast(true);
        window.setTimeout(() => {
          setKnownToast(false);
          setFlipped(false);
          setSession(result.session);
        }, 700);
      } else {
        setUnknownCharacter(reviewCharacter);
        setPendingSession(result.session);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "复习结果暂时无法保存");
    } finally {
      setBusy(false);
    }
  }

  function continueAfterUnknown() {
    if (!pendingSession) return;
    setSession(pendingSession);
    setPendingSession(null);
    setUnknownCharacter(null);
    setFlipped(false);
  }

  async function nextNewStep() {
    if (!newCharacter || busy) return;
    if (newStep < 2) {
      const nextStep = newStep + 1;
      activeSpeechCleanup.current?.();
      activeSpeechCleanup.current = null;
      setNewStep(nextStep);
      if (nextStep === 1) {
        speak(newCharacter.character, newCharacter.characterAudioUrl);
      } else {
        activeSpeechCleanup.current = speakCharacterThenText(
          newCharacter,
          resolvedSentence(newCharacter),
          newCharacter.sentenceAudioUrl,
        );
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await completeHanziNewCharacter(session!.id, newCharacter.id);
      setSession(result.session);
      setNewStep(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "新字进度暂时无法保存");
    } finally {
      setBusy(false);
    }
  }

  async function selectAnswer(characterId: string) {
    if (!question || answerFeedback || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await answerHanziQuestion(
        session!.id,
        session!.questionIndex,
        characterId,
      );
      setAnswerFeedback({
        selectedId: characterId,
        targetId: result.targetCharacterId,
        correct: result.correct,
        nextSession: result.session,
      });
      if (result.correct && questionTarget) {
        speak(questionTarget.character, questionTarget.characterAudioUrl);
      } else if (questionTarget) {
        speak(
          resolvedSentence(questionTarget),
          questionTarget.sentenceAudioUrl,
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "答案暂时无法保存");
    } finally {
      setBusy(false);
    }
  }

  function continueQuestion() {
    if (!answerFeedback) return;
    setSession(answerFeedback.nextSession);
    setAnswerFeedback(null);
  }

  function returnToOverview(nextSession: HanziLearningSession = session!) {
    activeSpeechCleanup.current?.();
    activeSpeechCleanup.current = null;
    window.speechSynthesis?.cancel();
    setSession(nextSession);
    setStarted(false);
    setNewStep(0);
    setFlipped(false);
    setUnknownCharacter(null);
    setPendingSession(null);
    setAnswerFeedback(null);
  }

  function goBackOneStep() {
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
        activeSpeechCleanup.current?.();
        activeSpeechCleanup.current = null;
        window.speechSynthesis?.cancel();
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
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await finishHanziLearningSession(session!.id);
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
    const stages = [
      {
        title: "先复习",
        duration: "约 3 分钟",
        body: "看看还记不记得",
        count: `${session.reviewCharacterIds.length} 个字`,
        tone: "review",
      },
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
          <h1>汉字学习</h1>
          <div className="hanzi-time-chip"><span aria-hidden="true">◷</span>约 7 分钟</div>
        </header>
        <HanziTaskControls onAbandon={onExit} />
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
        <footer className="hanzi-bottom-action">
          <button type="button" onClick={() => setStarted(true)}>开始学习 <span aria-hidden="true">→</span></button>
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
        <HanziTaskControls onAbandon={onExit} />
        <section className="hanzi-coach-card">
          <span className="hanzi-coach-card__spark" aria-hidden="true">✦</span>
          <h1>没关系，我们再认识一次！</h1>
          <CharacterBox character={unknownCharacter.character} compact />
          <button
            className="hanzi-coach-audio"
            type="button"
            onClick={() => speak(unknownCharacter.character, unknownCharacter.characterAudioUrl)}
          >
            <PlayIcon />听一听
          </button>
        </section>
        <footer className="hanzi-bottom-action">
          <button type="button" onClick={continueAfterUnknown}>认识了</button>
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
        <HanziTaskControls onAbandon={onExit} />
        <section className="hanzi-review-canvas">
          <button
            className={`hanzi-review-card${flipped ? " hanzi-review-card--flipped" : ""}`}
            type="button"
            onClick={() => {
              setFlipped((current) => !current);
              if (!flipped) speak(reviewCharacter.character, reviewCharacter.characterAudioUrl);
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
              />
              <div className="hanzi-card-back__bottom">
                <strong>{reviewCharacter.meaning}</strong>
                <span><PlayIcon />听一听</span>
              </div>
            </span>
          </button>
          <div className="hanzi-review-actions">
            <button disabled={busy} type="button" onClick={() => void submitReview(false)}>还不认识</button>
            <button disabled={busy} type="button" onClick={() => void submitReview(true)}>认识</button>
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
        <HanziTaskControls onAbandon={onExit} />
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
                <img src={characterImageSource(newCharacter)} alt={`${newCharacter.character}字形联想图`} />
              </div>
            </div>
          </section>
        ) : newStep === 1 ? (
          <section className="hanzi-sound-card hanzi-runtime-new-card">
            <div className="hanzi-sound-character">
              <CharacterBox character={newCharacter.character} />
              <button className="hanzi-audio-orb" type="button" onClick={() => speak(newCharacter.character, newCharacter.characterAudioUrl)} aria-label={`播放${newCharacter.character}的读音`}>
                <img src={meaningSpeakerIcon} alt="" />
              </button>
            </div>
            <div className="hanzi-sound-vocabulary" aria-label={`${newCharacter.character}的词语`}>
              {newCharacter.words.slice(0, 3).map((word) => (
                <button type="button" key={word} onClick={() => speak(word)} aria-label={`播放词语${word}`}>
                  <span>{word}</span><img src={meaningSpeakerIcon} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="hanzi-meaning-canvas hanzi-runtime-new-card">
            <div className="hanzi-meaning-core">
              <div className="hanzi-meaning-figure">
                <img src={characterImageSource(newCharacter)} alt={`${newCharacter.character}含义图`} />
              </div>
              <div className="hanzi-meaning-panel">
                <div className="hanzi-meaning-panel__character"><strong>{newCharacter.character}</strong><span>{newCharacter.meaning}</span></div>
                <button
                  className="hanzi-meaning-sentence"
                  type="button"
                  onClick={() => speak(resolvedSentence(newCharacter), newCharacter.sentenceAudioUrl)}
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
          <button disabled={busy} type="button" onClick={() => void nextNewStep()}>
            {newStep === 2
              ? session.newIndex + 1 >= session.newCharacterIds.length
                ? "学完啦，去挑战"
                : "下一个字"
              : "下一步"}
            <span aria-hidden="true">→</span>
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
        <HanziTaskControls onAbandon={onExit} />
        {answerFeedback?.correct ? (
          <div className="hanzi-feedback-toast hanzi-feedback-toast--listen" role="status"><span>✓</span>真棒！回答正确！</div>
        ) : null}
        <section className={answerFeedback && !answerFeedback.correct ? "hanzi-listen-wrong__content" : `hanzi-listen-shell${answerFeedback?.correct ? " hanzi-listen-shell--answered" : ""}`}>
          {!answerFeedback ? (
            <header className="hanzi-listen-title">
              <button
                className="hanzi-listen-play"
                type="button"
                aria-label="播放句子"
                onClick={() => speak(resolvedSentence(questionTarget), questionTarget.sentenceAudioUrl)}
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
              return (
                <button
                  className={`${answerFeedback?.selectedId === id ? "hanzi-listen-option--selected" : ""}${answerFeedback?.targetId === id ? " hanzi-listen-option--correct" : ""}`}
                  disabled={Boolean(answerFeedback) || busy}
                  key={id}
                  type="button"
                  onClick={() => void selectAnswer(id)}
                >{option.character}</button>
              );
            })}
          </div>
          {answerFeedback && !answerFeedback.correct ? (
            <div className="hanzi-listen-feedback"><span>i</span>正确答案是「{displayedTarget?.character}」，我们记住它啦！</div>
          ) : null}
        </section>
        {answerFeedback ? (
          <button className="hanzi-listen-next" type="button" onClick={continueQuestion}>继续 <span>→</span></button>
        ) : null}
        {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="hanzi-page hanzi-page--result">
      <HanziTaskControls onAbandon={onExit} />
      <header className="hanzi-result-header">
        <div className="hanzi-result-medal" aria-hidden="true">✓</div>
        <div><h1>今天的汉字学习完成啦！</h1><p>今天认识了好多汉字朋友！</p></div>
      </header>
      <section className="hanzi-result-grid" aria-label="学习结果">
        <article>
          <h2>今天复习</h2>
          <p><span>认识</span><strong>{session.summary.reviewKnown} 个</strong></p>
          <p><span>再见几次</span><strong>{session.summary.reviewUnknown} 个</strong></p>
        </article>
        <article>
          <h2>今天新学</h2>
          <p>认识了 {session.newCharacterIds.length} 个新朋友</p>
          <div className="hanzi-result-characters">
            {session.newCharacterIds.map((id) => <b key={id}>{characterById.get(id)?.character}</b>)}
          </div>
        </article>
        <article>
          <h2>听句挑战</h2>
          <div className="hanzi-score-ring">
            <div className="hanzi-score-ring__value"><strong>{session.summary.correct}</strong><span>/ {session.summary.total}</span></div>
          </div>
        </article>
      </section>
      {error ? <p className="hanzi-runtime-error" role="alert">{error}</p> : null}
      <footer className="hanzi-result-footer">
        <p>这些汉字会在合适的时候再回来见你，见得越多，记得越牢。</p>
        <button disabled={busy} type="button" onClick={() => void finish()}>
          {busy ? "正在完成…" : "完成任务"}
        </button>
      </footer>
    </main>
  );
}
