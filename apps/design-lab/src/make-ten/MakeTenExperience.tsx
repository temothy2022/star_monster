import { useCallback, useEffect, useRef, useState } from "react";
import {
  finishMakeTenSession,
  startMakeTenSession,
  submitMakeTenAnswer,
  type MakeTenLearningSession,
} from "../api/child-api";
import { playAnswerSound } from "../audio/feedback-sounds";
import backIcon from "@star-monsters/assets/icons/icon-arrow-left.svg";

type Feedback = {
  selectedNumber: number | null;
  correct: boolean;
  timedOut: boolean;
  answer: number;
};

export function MakeTenExperience({
  attemptId,
  onExit,
  onCompleted,
  onFailed,
}: {
  attemptId: string;
  onExit: () => void;
  onCompleted: (reward: { baseStars: number; bonusStars: number; dailyGoalBonusStars: number; totalStars: number }) => void;
  onFailed: () => void;
}) {
  const [session, setSession] = useState<MakeTenLearningSession | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const remainingMsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startMakeTenSession(attemptId)
      .then(({ session: loaded }) => {
        if (!cancelled) setSession(loaded);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "凑十训练暂时无法开始");
      });
    return () => { cancelled = true; };
  }, [attemptId]);

  const question = session?.questions[session.currentIndex] ?? null;

  const submit = useCallback(async (selectedNumber: number | null, timedOut = false) => {
    if (!session || !question || submittingRef.current || feedback) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    const correct = !timedOut && selectedNumber === 10 - question.target;
    const durationMs = session.secondsPerQuestion * 1000;
    const responseMs = timedOut
      ? Math.round(durationMs)
      : Math.max(
          0,
          Math.min(
            Math.round(durationMs),
            Math.round(durationMs - remainingMsRef.current),
          ),
        );
    setFeedback({ selectedNumber, correct, timedOut, answer: 10 - question.target });
    playAnswerSound(correct);
    try {
      const result = await submitMakeTenAnswer(session.id, {
        questionIndex: session.currentIndex,
        selectedNumber,
        timedOut,
        responseMs,
      });
      feedbackTimerRef.current = window.setTimeout(() => {
        setSession(result.session);
        setFeedback(null);
        setBusy(false);
        submittingRef.current = false;
      }, correct ? 1500 : 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "答案提交失败");
      setFeedback(null);
      setBusy(false);
      submittingRef.current = false;
    }
  }, [feedback, question, session]);

  useEffect(() => {
    if (!session || session.completedAt) return;
    const duration = session.secondsPerQuestion * 1000;
    remainingMsRef.current = duration;
    setRemainingMs(duration);
    setPaused(false);
  }, [session?.completedAt, session?.currentIndex, session?.secondsPerQuestion]);

  useEffect(() => {
    if (!session || !question || feedback || session.completedAt || paused) return;
    const deadline = performance.now() + remainingMsRef.current;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, deadline - performance.now());
      remainingMsRef.current = remaining;
      setRemainingMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        void submit(null, true);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [feedback, paused, question, session?.completedAt, session?.currentIndex, session?.secondsPerQuestion, submit]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  async function finish() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await finishMakeTenSession(session.id);
      if (session.passed) onCompleted(result.reward);
      else onFailed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务完成失败");
      setBusy(false);
    }
  }

  function leave() {
    if (session?.completedAt) {
      void finish();
      return;
    }
    onExit();
  }

  if (!session) {
    return <main className="make-ten-page"><div className="make-ten-loading">{error || "正在准备凑十训练…"}</div></main>;
  }

  const progress = session.totalQuestions ? session.currentIndex / session.totalQuestions * 100 : 0;
  const timerProgress = session.secondsPerQuestion
    ? Math.max(0, Math.min(100, remainingMs / (session.secondsPerQuestion * 1000) * 100))
    : 0;
  const accuracy = session.totalQuestions ? Math.round(session.correctCount / session.totalQuestions * 100) : 0;

  return <main className="make-ten-page" onContextMenu={(event) => event.preventDefault()}>
    <button className="clock-back-button" type="button" disabled={busy} onClick={leave} aria-label="返回任务列表"><img src={backIcon} alt="" aria-hidden="true" /></button>
    <header className="make-ten-header">
      <div><span>数字好朋友</span><h1>{session.completedAt ? "今天的凑十训练完成啦" : `第 ${Math.min(session.currentIndex + 1, session.totalQuestions)} 题`}</h1></div>
      {!session.completedAt ? <div className="make-ten-total-progress"><span style={{ width: `${progress}%` }} /><strong>{session.currentIndex}/{session.totalQuestions}</strong></div> : null}
    </header>

    {!session.completedAt && question ? <section className={`make-ten-workspace${feedback ? " make-ten-workspace--feedback" : ""}`}>
      <div className="make-ten-timer-row">
        <div className="make-ten-timer" aria-label={`本题剩余 ${Math.ceil(remainingMs / 1000)} 秒`}><span style={{ width: `${feedback ? 0 : timerProgress}%` }} /></div>
        <button
          className="make-ten-pause-button"
          type="button"
          disabled={Boolean(feedback)}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >{paused ? "继续" : "暂停"}</button>
      </div>
      <div className="make-ten-equation"><strong>{question.target}</strong><span>+</span><span className={`make-ten-blank${feedback && !feedback.correct ? " make-ten-blank--answer" : ""}`}>{feedback && !feedback.correct ? feedback.answer : "?"}</span><span>=</span><strong>10</strong></div>
      <p>谁是 {question.target} 的好朋友？</p>
      <div className="make-ten-options">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => <button
          type="button"
          key={value}
          disabled={busy}
          className={`${feedback?.selectedNumber === value ? "selected" : ""}${feedback && !feedback.correct && feedback.answer === value ? " correct-answer" : ""}`}
          onClick={() => void submit(value)}
        >{value}</button>)}
      </div>
      {feedback ? <div className={`make-ten-feedback ${feedback.correct ? "make-ten-feedback--correct" : "make-ten-feedback--wrong"}`}>
        <strong>{feedback.correct ? "答对啦！" : feedback.timedOut ? "时间到" : "再想一想"}</strong>
        {!feedback.correct ? <span>正确答案是 {feedback.answer}</span> : <span>{question.target} + {feedback.answer} = 10</span>}
      </div> : null}
      {paused && !feedback ? <div className="make-ten-pause-layer" role="status"><strong>暂停中</strong><span>家长讲解后，点击“继续”恢复倒计时</span></div> : null}
      {error ? <div className="clock-learning-error">{error}</div> : null}
    </section> : null}

    {session.completedAt ? <section className={`make-ten-result ${session.passed ? "make-ten-result--passed" : "make-ten-result--failed"}`}>
      <div className="make-ten-result__mark">{session.passed ? "★" : "↻"}</div>
      <h2>{session.correctCount} / {session.totalQuestions} 题答对</h2>
      <strong>正确率 {accuracy}%</strong>
      <p>{session.passed ? `达到 ${session.passAccuracyPercent}% 的目标，本次可以获得任务星星。` : `本次没有达到 ${session.passAccuracyPercent}% 的目标，继续练熟后再来挑战。`}</p>
      <button type="button" className="make-ten-result-button" disabled={busy} onClick={() => void finish()}>{busy ? "完成中…" : session.passed ? "领取任务星星" : "返回任务列表"}</button>
      {error ? <div className="clock-learning-error">{error}</div> : null}
    </section> : null}
  </main>;
}
