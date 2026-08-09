import { useEffect, useRef, useState } from "react";
import {
  finishMathPracticeSession,
  startMathPracticeSession,
  submitMathPracticeAnswer,
  type MathPracticeFeedback,
  type MathPracticeSession,
} from "../api/child-api";
import { reportChildPageReady } from "../api/performance-telemetry";
import { playAnswerSound } from "../audio/feedback-sounds";
import chickUrl from "@star-monsters/assets/images/math-practice/chick.webp";
import { MathAnswerEditor } from "./MathAnswerEditor";
import { MathVisual } from "./MathVisual";
import "./math-practice.css";

export function MathPracticeExperience({
  attemptId,
  onExit,
  onCompleted,
}: {
  attemptId: string;
  onExit: () => void;
  onCompleted: (reward: { baseStars: number; bonusStars: number; dailyGoalBonusStars: number; totalStars: number }) => void;
}) {
  const [session, setSession] = useState<MathPracticeSession | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<MathPracticeFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cubeGuideLayers, setCubeGuideLayers] = useState<number | null>(null);
  const [cubeAnimatingLayer, setCubeAnimatingLayer] = useState<number | null>(null);
  const questionStartedAt = useRef(performance.now());
  const feedbackTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startMathPracticeSession(attemptId)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        setSession(loaded);
        setCubeGuideLayers(null);
        setCubeAnimatingLayer(null);
        questionStartedAt.current = performance.now();
        reportChildPageReady(
          "math-practice-session",
          "/api/child/math-practice/sessions/start",
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "数学练习暂时无法开始");
      });
    return () => { cancelled = true; };
  }, [attemptId]);

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  async function submit() {
    if (!session?.question || busy || feedback) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitMathPracticeAnswer(session.id, {
        questionIndex: session.currentIndex,
        values,
        responseMs: Math.round(performance.now() - questionStartedAt.current),
      });
      setFeedback(result.feedback);
      playAnswerSound(result.feedback.correct);
      const delay = result.feedback.correct ? 1200 : result.feedback.revealAnswer ? 1800 : 900;
      feedbackTimer.current = window.setTimeout(() => {
        setSession(result.session);
        setValues([]);
        setFeedback(null);
        setBusy(false);
        setCubeGuideLayers(null);
        setCubeAnimatingLayer(null);
        questionStartedAt.current = performance.now();
      }, delay);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "答案提交失败，请再试一次");
      setBusy(false);
    }
  }

  async function finish() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await finishMathPracticeSession(session.id);
      onCompleted(result.reward);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务完成失败");
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="math-session math-session--loading">
        <img src={chickUrl} alt="正在准备题目的小鸡" />
        <strong>{error || "小鸡正在准备数学题…"}</strong>
      </main>
    );
  }

  const progress = session.totalQuestions
    ? (session.currentIndex / session.totalQuestions) * 100
    : 0;
  const question = session.question;
  const cubeLayerCount = question?.visual.kind === "CUBES"
    ? Math.max(...question.visual.cubes.map(([, , z]) => z)) + 1
    : 0;
  const cubeGuideComplete = cubeLayerCount > 0 && cubeGuideLayers === cubeLayerCount;

  function advanceCubeGuide() {
    if (cubeLayerCount === 0) return;
    const next = cubeGuideLayers == null || cubeGuideLayers >= cubeLayerCount ? 1 : cubeGuideLayers + 1;
    setCubeAnimatingLayer(next - 1);
    setCubeGuideLayers(next);
  }

  return (
    <main className="math-session" onContextMenu={(event) => event.preventDefault()}>
      <section className="math-preview__stage">
        {!session.completedAt ? (
          <header className="math-session__header">
            <button type="button" disabled={busy} onClick={onExit} aria-label="退出数学练习">
              <span aria-hidden="true">‹</span>
            </button>
            <div>
              <span>数学探险</span>
              <h1>{`第 ${session.currentIndex + 1} 题`}</h1>
            </div>
            <div className="math-session__progress">
              <div><span style={{ width: `${progress}%` }} /></div>
              <strong>{session.currentIndex} / {session.totalQuestions}</strong>
            </div>
          </header>
        ) : null}

        {!session.completedAt && question ? (
          <div className="math-question-layout">
            <article className="math-question-card">
              <div className="math-question-card__prompt">
                <span>{question.typeId}</span>
                <h1>{question.prompt}</h1>
                {question.helper && question.visual.kind !== "NONE" ? <p>{question.helper}</p> : null}
                {question.typeId === "S04" ? (
                  <button className={`math-cube-guide-button${cubeGuideLayers !== null ? " is-playing" : ""}`} type="button" disabled={busy || Boolean(feedback)} onClick={advanceCubeGuide}>
                    {cubeGuideLayers === null ? "分层看" : cubeGuideComplete ? "重新分层" : "放下一层"}
                  </button>
                ) : null}
              </div>
              <div className={`math-visual-board math-visual-board--${question.visual.kind.toLowerCase()}`}>
                <MathVisual question={question} cubeVisibleLayers={question.typeId === "S04" ? cubeGuideLayers : undefined} cubeAnimatingLayer={question.typeId === "S04" ? cubeAnimatingLayer : undefined} />
              </div>
            </article>

            <aside className="math-answer-card">
              <div className="math-answer-card__top">
                <span>我的答案</span>
              </div>
              <MathAnswerEditor
                question={question}
                values={values}
                disabled={busy || Boolean(feedback)}
                onChange={setValues}
                onSubmit={() => void submit()}
              />
              {error ? <div className="math-session__error">{error}</div> : null}
            </aside>
          </div>
        ) : null}

        {!session.completedAt && question && feedback ? (
          <div className={`math-feedback-toast math-feedback-toast--${feedback.correct ? "correct" : "wrong"}`} role="status" aria-live="polite">
            {feedback.correct ? <><b>正确</b>{feedback.correctAnswer ? <span>答案：{feedback.correctAnswer.display}</span> : null}</> : null}
            {!feedback.correct ? <><b>错误</b>{feedback.revealAnswer && feedback.correctAnswer ? <span>答案：{feedback.correctAnswer.display}</span> : null}</> : null}
          </div>
        ) : null}

        {session.completedAt ? (
          <section className="math-session__result">
            <img src={chickUrl} alt="庆祝完成的小鸡" />
            <h2>完成</h2>
            <div className="math-session__result-stats">
              <strong>{session.totalQuestions} <small>题</small></strong>
              <strong>{session.correctCount} <small>题答对</small></strong>
            </div>
            <div className="math-session__result-stars">获得星星：⭐⭐⭐</div>
            <button type="button" disabled={busy} onClick={() => void finish()}>
              {busy ? "正在领取…" : "领取星星"}
            </button>
            {error ? <div className="math-session__error">{error}</div> : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
