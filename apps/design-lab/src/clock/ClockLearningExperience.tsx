import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  finishClockLearningSession,
  startClockLearningSession,
  submitClockAnswer,
  type ClockAnswer,
  type ClockLearningSession,
  type ClockQuestion,
} from "../api/child-api";
import backIcon from "../assets/icon-arrow-left.svg";

type ClockTime = { hour: number; minute: number; second: number };
type HandKind = "hour" | "minute" | "second";

function normalizedHour(value: number) {
  const hour = value % 12;
  return hour <= 0 ? hour + 12 : hour;
}

function formatTime(time: Pick<ClockTime, "hour" | "minute">) {
  return `${String(normalizedHour(time.hour)).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function initialQuestionTime(question: ClockQuestion, minuteStep: 1 | 5): ClockTime {
  if (question.type === "READ_CLOCK") return { hour: 12, minute: 0, second: 0 };
  const minute = (question.minute + minuteStep * 2) % 60;
  const hour = minute < question.minute ? normalizedHour(question.hour + 1) : question.hour;
  return { hour, minute, second: 0 };
}

function ClockFace({
  time,
  minuteStep,
  interactive,
  compact = false,
  onChange,
}: {
  time: ClockTime;
  minuteStep: 1 | 5;
  interactive: boolean;
  compact?: boolean;
  onChange?: (time: ClockTime) => void;
}) {
  const faceRef = useRef<HTMLDivElement | null>(null);

  function updateHand(kind: HandKind, clientX: number, clientY: number) {
    if (!interactive || !faceRef.current || !onChange) return;
    const bounds = faceRef.current.getBoundingClientRect();
    const x = clientX - (bounds.left + bounds.width / 2);
    const y = clientY - (bounds.top + bounds.height / 2);
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    if (kind === "hour") {
      onChange({ ...time, hour: normalizedHour(Math.round(angle / 30)) });
      return;
    }
    if (kind === "minute") {
      const rawMinute = Math.round(angle / 6) % 60;
      const minute = minuteStep === 5 ? Math.round(rawMinute / 5) * 5 % 60 : rawMinute;
      onChange({ ...time, minute });
      return;
    }
    onChange({ ...time, second: Math.round(angle / 6) % 60 });
  }

  function handEvents(kind: HandKind) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!interactive) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateHand(kind, event.clientX, event.clientY);
      },
      onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.preventDefault();
        updateHand(kind, event.clientX, event.clientY);
      },
    };
  }

  const hourAngle = (time.hour % 12) * 30 + time.minute * 0.5;
  const minuteAngle = time.minute * 6;
  const secondAngle = time.second * 6;
  return <div className={`clock-face${compact ? " clock-face--compact" : ""}${interactive ? " clock-face--interactive" : ""}`} ref={faceRef}>
    <div className="clock-face__inner" />
    {Array.from({ length: 60 }, (_, index) => <span key={index} className={`clock-face__tick${index % 5 === 0 ? " clock-face__tick--hour" : ""}`} style={{ transform: `rotate(${index * 6}deg)` }} />)}
    {Array.from({ length: 12 }, (_, index) => {
      const value = index + 1;
      const angle = value * 30 * Math.PI / 180;
      return <span key={value} className="clock-face__number" style={{ left: `${50 + Math.sin(angle) * 32}%`, top: `${50 - Math.cos(angle) * 32}%` }}>{value}</span>;
    })}
    <button type="button" aria-label="拨动时针" className="clock-hand clock-hand--hour" style={{ transform: `rotate(${hourAngle}deg)` }} disabled={!interactive} {...handEvents("hour")}><span /></button>
    <button type="button" aria-label="拨动分针" className="clock-hand clock-hand--minute" style={{ transform: `rotate(${minuteAngle}deg)` }} disabled={!interactive} {...handEvents("minute")}><span /></button>
    <button type="button" aria-label="拨动秒针" className="clock-hand clock-hand--second" style={{ transform: `rotate(${secondAngle}deg)` }} disabled={!interactive} {...handEvents("second")}><span /></button>
    <span className="clock-face__pin" />
  </div>;
}

function TimeStepper({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  function move(delta: number) {
    const range = max - min + 1;
    const next = ((value - min + delta) % range + range) % range + min;
    onChange(next);
  }
  return <div className="clock-stepper"><span>{label}</span><div><button type="button" onClick={() => move(-step)} aria-label={`${label}减少`}>−</button><strong>{String(value).padStart(2, "0")}</strong><button type="button" onClick={() => move(step)} aria-label={`${label}增加`}>＋</button></div></div>;
}

type Feedback = { answer: ClockAnswer; question: ClockQuestion };

export function ClockLearningExperience({ attemptId, onExit, onCompleted }: { attemptId: string; onExit: () => void; onCompleted: (reward: { baseStars: number; bonusStars: number; dailyGoalBonusStars: number; totalStars: number }) => void }) {
  const [session, setSession] = useState<ClockLearningSession | null>(null);
  const [stage, setStage] = useState<"PRACTICE" | "QUESTION" | "FEEDBACK" | "RESULT">("PRACTICE");
  const [time, setTime] = useState<ClockTime>({ hour: 10, minute: 10, second: 30 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void startClockLearningSession(attemptId)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        setSession(loaded);
        if (loaded.completedAt) setStage("RESULT");
        else if (loaded.currentIndex > 0) setStage("QUESTION");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "时钟学习暂时无法开始");
      });
    return () => { cancelled = true; };
  }, [attemptId]);

  const question = session?.questions[session.currentIndex] ?? null;
  useEffect(() => {
    if (stage === "QUESTION" && question && session) {
      setTime(initialQuestionTime(question, session.minuteStep));
      setFeedback(null);
    }
  }, [question?.hour, question?.minute, question?.type, session?.minuteStep, stage]);

  async function submit() {
    if (!session || !question || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitClockAnswer(session.id, {
        questionIndex: session.currentIndex,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
      });
      setSession(result.session);
      setFeedback({ answer: result.answer, question: result.question });
      setStage("FEEDBACK");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "答案提交失败");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await finishClockLearningSession(session.id);
      onCompleted(result.reward);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务完成失败");
      setBusy(false);
    }
  }

  if (!session) return <main className="clock-learning-page"><div className="clock-learning-loading">{error || "正在准备时钟…"}</div></main>;

  const progress = stage === "PRACTICE"
    ? 0
    : stage === "FEEDBACK" || stage === "RESULT"
      ? session.currentIndex
      : Math.min(session.currentIndex + 1, session.totalQuestions);
  return <main className="clock-learning-page">
    <button className="clock-back-button" type="button" onClick={onExit} aria-label="返回任务列表">
      <img src={backIcon} alt="" aria-hidden="true" />
    </button>
    <header className="clock-learning-header">
      <div><span>时间小课堂</span><h1>{stage === "PRACTICE" ? "拨一拨，认识时间" : stage === "RESULT" ? "今天的练习完成啦" : `第 ${Math.min(session.currentIndex + 1, session.totalQuestions)} 题`}</h1></div>
      {stage !== "PRACTICE" && stage !== "RESULT" ? <div className="clock-learning-progress"><span style={{ width: `${session.currentIndex / session.totalQuestions * 100}%` }} /><strong>{session.currentIndex}/{session.totalQuestions}</strong></div> : null}
    </header>

    {stage === "PRACTICE" ? <section className="clock-learning-workspace clock-learning-workspace--practice">
      <div className="clock-learning-clock-column"><ClockFace time={time} minuteStep={session.minuteStep} interactive onChange={setTime} /><div className="clock-digital-time">{formatTime(time)}<small>{String(time.second).padStart(2, "0")} 秒</small></div></div>
      <div className="clock-learning-prompt"><span className="clock-learning-badge">自由练习</span><h2>试着拨动三根指针</h2><p>准备好以后，开始今天的 {session.totalQuestions} 道题。</p><button type="button" className="clock-primary-button" onClick={() => setStage("QUESTION")}>开始测试</button></div>
    </section> : null}

    {stage === "QUESTION" && question ? <section className="clock-learning-workspace">
      <div className="clock-learning-clock-column"><ClockFace time={question.type === "READ_CLOCK" ? question : time} minuteStep={session.minuteStep} interactive={question.type === "SET_CLOCK"} onChange={setTime} /></div>
      <div className="clock-learning-prompt"><span className="clock-learning-badge">{question.type === "SET_CLOCK" ? "拨钟题" : "认读题"}</span><h2>{question.type === "SET_CLOCK" ? `请拨到 ${formatTime(question)}` : "这个钟面是几点？"}</h2>{question.type === "READ_CLOCK" ? <div className="clock-answer-steppers"><TimeStepper label="时" value={time.hour} min={1} max={12} step={1} onChange={(hour) => setTime({ ...time, hour })} /><TimeStepper label="分" value={time.minute} min={0} max={59} step={session.minuteStep} onChange={(minute) => setTime({ ...time, minute })} /></div> : <p>拖动时针和分针，完成后提交答案。</p>}<button type="button" className="clock-primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "判断中…" : "确定"}</button>{error ? <div className="clock-learning-error">{error}</div> : null}</div>
    </section> : null}

    {stage === "FEEDBACK" && feedback ? <section className="clock-learning-workspace clock-learning-workspace--feedback">
      <div className="clock-learning-clock-column"><ClockFace time={time} minuteStep={session.minuteStep} interactive={false} /><div className="clock-digital-time clock-digital-time--muted">你的答案 {formatTime(time)}</div></div>
      <div className={`clock-feedback ${feedback.answer.correct ? "clock-feedback--correct" : "clock-feedback--wrong"}`}><span>{feedback.answer.correct ? "答对啦" : "再认识一下"}</span><h2>{feedback.answer.correct ? "你已经读懂这个时间了！" : `正确答案是 ${formatTime(feedback.question)}`}</h2>{!feedback.answer.correct ? <div className="clock-feedback__correct"><ClockFace time={feedback.question} minuteStep={session.minuteStep} interactive={false} compact /><strong>{formatTime(feedback.question)}</strong></div> : null}<button type="button" className="clock-primary-button" onClick={() => setStage(session.completedAt ? "RESULT" : "QUESTION")}>{session.completedAt ? "查看结果" : "下一题"}</button></div>
    </section> : null}

    {stage === "RESULT" ? <section className="clock-result"><div className="clock-result__medal">★</div><h2>{session.correctCount} / {session.totalQuestions} 题答对</h2><p>{session.correctCount === session.totalQuestions ? "每一题都答对了，时间小达人！" : "今天又认识了更多时间，继续加油！"}</p><div className="clock-result__bar"><span style={{ width: `${session.correctCount / session.totalQuestions * 100}%` }} /></div><button type="button" className="clock-primary-button" disabled={busy} onClick={() => void finish()}>{busy ? "完成中…" : "完成任务"}</button>{error ? <div className="clock-learning-error">{error}</div> : null}</section> : null}
    <span className="clock-learning-question-count" aria-hidden="true">{progress}/{session.totalQuestions}</span>
  </main>;
}
