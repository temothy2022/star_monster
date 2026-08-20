import { useMemo, useState } from "react";
import stickBundleUrl from "@star-monsters/assets/images/math-practice/stick-bundle.webp";
import { ChildControlIcon } from "../components/ChildControlIcon";
import "./bundle-compose-practice.css";

type PracticeQuestion = {
  currentTens: number;
  currentOnes: number;
  targetTens: 5 | 10;
};

type Feedback = "correct" | "wrong" | null;

function makeQuestion(currentTens: number, currentOnes: number, targetTens: 5 | 10): PracticeQuestion {
  return { currentTens, currentOnes, targetTens };
}

function randomQuestion(): PracticeQuestion {
  const targetTens: 5 | 10 = Math.random() < 0.5 ? 5 : 10;
  const currentTens = Math.floor(Math.random() * targetTens);
  const currentOnes = currentTens === 0
    ? 1 + Math.floor(Math.random() * 9)
    : Math.floor(Math.random() * 10);
  return makeQuestion(currentTens, currentOnes, targetTens);
}

function answerFor(question: PracticeQuestion) {
  const addedOnes = question.currentOnes === 0 ? 0 : 10 - question.currentOnes;
  const addedTens = question.targetTens - question.currentTens - (addedOnes > 0 ? 1 : 0);
  return { addedTens, addedOnes };
}

function QuantityDisplay({ tens, ones }: { tens: number; ones: number }) {
  return (
    <div className="bundle-practice-quantity" aria-label={`${tens}捆${ones}根`}>
      <div className="bundle-practice-bundles" aria-hidden="true">
        {Array.from({ length: tens }, (_, index) => (
          <img key={index} src={stickBundleUrl} alt="" draggable={false} />
        ))}
      </div>
      <div className="bundle-practice-sticks" aria-hidden="true">
        {Array.from({ length: ones }, (_, index) => <i key={index} />)}
      </div>
      {tens === 0 && ones === 0 ? <span className="bundle-practice-empty">还没有摆放</span> : null}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="bundle-practice-stepper">
      <span>{label}</span>
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`少摆一${label}`}><ChildControlIcon kind="decrease" /></button>
      <strong>{value}</strong>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`多摆一${label}`}><ChildControlIcon kind="increase" /></button>
    </div>
  );
}

export function BundleComposePracticePage() {
  const [question, setQuestion] = useState<PracticeQuestion>(() => makeQuestion(3, 6, 5));
  const [addedTens, setAddedTens] = useState(0);
  const [addedOnes, setAddedOnes] = useState(0);
  const [isArranging, setIsArranging] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [attempts, setAttempts] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const answer = useMemo(() => answerFor(question), [question]);
  const resultOnes = question.currentOnes + addedOnes;
  const resultTens = question.currentTens + addedTens + Math.floor(resultOnes / 10);
  const normalizedResultOnes = resultOnes % 10;

  function startArranging() {
    setIsArranging(true);
    setFeedback(null);
  }

  function submit() {
    if (!isArranging || feedback) return;
    const isCorrect = addedTens === answer.addedTens && addedOnes === answer.addedOnes;
    setAttempts((value) => value + 1);
    if (isCorrect) setCorrectCount((value) => value + 1);
    setFeedback(isCorrect ? "correct" : "wrong");
  }

  function nextQuestion() {
    setQuestion(randomQuestion());
    setAddedTens(0);
    setAddedOnes(0);
    setIsArranging(false);
    setFeedback(null);
  }

  return (
    <main className="bundle-practice-page">
      <header className="bundle-practice-header">
        <div>
          <h1>捆和根凑整</h1>
        </div>
        <a className="bundle-practice-back" href="#pages"><ChildControlIcon kind="back" />返回页面清单</a>
      </header>

      <section className="bundle-practice-progress" aria-label="练习进度">
        <span>独立练习</span>
        <strong>{attempts === 0 ? "先来试一道" : `已练 ${attempts} 题`}</strong>
        <b>{correctCount}/{attempts || 0} 正确</b>
      </section>

      <section className="bundle-practice-card">
        <div className="bundle-practice-card__topline">
          <span className="bundle-practice-chip">今天的摆放题</span>
          <span className="bundle-practice-target">目标：{question.targetTens} 捆</span>
        </div>
        <h2>现在有 {question.currentTens} 捆 {question.currentOnes} 根，怎样凑成 {question.targetTens} 捆？</h2>
        <p className="bundle-practice-instruction">先想好“还要几捆、几根”，再点击开始摆放。</p>

        <div className="bundle-practice-board">
          <article className="bundle-practice-panel bundle-practice-panel--current">
            <div className="bundle-practice-panel__label">现在有</div>
            <div className="bundle-practice-panel__value">{question.currentTens} 捆 {question.currentOnes} 根</div>
            <QuantityDisplay tens={question.currentTens} ones={question.currentOnes} />
          </article>

          <div className="bundle-practice-plus" aria-hidden="true">＋</div>

          <article className="bundle-practice-panel bundle-practice-panel--add">
            <div className="bundle-practice-panel__label">还要摆</div>
            <div className="bundle-practice-panel__value">{addedTens} 捆 {addedOnes} 根</div>
            <QuantityDisplay tens={addedTens} ones={addedOnes} />
            <div className="bundle-practice-controls" aria-label="调整要摆放的数量">
              <Stepper label="捆" value={addedTens} min={0} max={question.targetTens - question.currentTens} disabled={!isArranging || Boolean(feedback)} onChange={setAddedTens} />
              <Stepper label="根" value={addedOnes} min={0} max={9} disabled={!isArranging || Boolean(feedback)} onChange={setAddedOnes} />
            </div>
          </article>

          <div className="bundle-practice-equals" aria-hidden="true">＝</div>

          <article className="bundle-practice-panel bundle-practice-panel--result">
            <div className="bundle-practice-panel__label">摆好以后</div>
            <div className="bundle-practice-panel__value">{resultTens} 捆 {normalizedResultOnes} 根</div>
            <QuantityDisplay tens={resultTens} ones={normalizedResultOnes} />
            <span className="bundle-practice-result-note">十根可以换成一捆</span>
          </article>
        </div>

        {!isArranging ? (
          <button className="bundle-practice-primary" type="button" onClick={startArranging}>我想好了，开始摆</button>
        ) : feedback ? (
          <div className={`bundle-practice-feedback bundle-practice-feedback--${feedback}`} role="status">
            <strong>{feedback === "correct" ? "摆对啦！" : `再想一想，正确答案是 ${answer.addedTens} 捆 ${answer.addedOnes} 根`}</strong>
            <button className="bundle-practice-primary" type="button" onClick={nextQuestion}>再来一道</button>
          </div>
        ) : (
          <button className="bundle-practice-primary" type="button" onClick={submit}>摆好了，检查答案</button>
        )}
      </section>

      <p className="bundle-practice-note">小提示：先用根凑成一捆，再数一数还差几捆。</p>
    </main>
  );
}
