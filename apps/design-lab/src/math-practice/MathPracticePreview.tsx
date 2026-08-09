import { useEffect, useMemo, useRef, useState } from "react";
import {
  MATH_QUESTION_DOMAINS,
  MATH_QUESTION_TYPES,
  answerMathQuestion,
  generateMathQuestion,
  getMathQuestionTypesByDomain,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";
import { MathAnswerEditor } from "./MathAnswerEditor";
import { MathVisual } from "./MathVisual";
import chickUrl from "@star-monsters/assets/images/math-practice/chick.webp";
import "./math-practice.css";

type Feedback = "IDLE" | "WRONG" | "REVEAL" | "CORRECT";

export function MathPracticePreview() {
  const [selectedTypeId, setSelectedTypeId] = useState<MathQuestionTypeId>("N01");
  const [seed, setSeed] = useState(20260809);
  const [values, setValues] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>("IDLE");
  const [cubeGuideLayers, setCubeGuideLayers] = useState<number | null>(null);
  const [cubeAnimatingLayer, setCubeAnimatingLayer] = useState<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const question = useMemo(() => generateMathQuestion({ typeId: selectedTypeId, seed }), [seed, selectedTypeId]);
  const definition = MATH_QUESTION_TYPES.find((item) => item.id === selectedTypeId)!;
  const currentIndex = MATH_QUESTION_TYPES.findIndex((item) => item.id === selectedTypeId);
  const cubeLayerCount = question.visual.kind === "CUBES"
    ? Math.max(...question.visual.cubes.map(([, , z]) => z)) + 1
    : 0;
  const cubeGuideComplete = cubeLayerCount > 0 && cubeGuideLayers === cubeLayerCount;

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  function clearFeedback() {
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setFeedback("IDLE");
  }

  function showFeedback(next: Feedback) {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback(next);
    feedbackTimer.current = window.setTimeout(() => {
      feedbackTimer.current = null;
      setFeedback("IDLE");
    }, next === "REVEAL" ? 1800 : 1200);
  }

  function selectQuestion(typeId: MathQuestionTypeId) {
    setSelectedTypeId(typeId);
    setValues([]);
    setCubeGuideLayers(null);
    setCubeAnimatingLayer(null);
    clearFeedback();
  }

  function advanceCubeGuide() {
    if (cubeLayerCount === 0) return;
    const next = cubeGuideLayers == null || cubeGuideLayers >= cubeLayerCount ? 1 : cubeGuideLayers + 1;
    setCubeAnimatingLayer(next - 1);
    setCubeGuideLayers(next);
  }

  function move(offset: number) {
    const next = MATH_QUESTION_TYPES[(currentIndex + offset + MATH_QUESTION_TYPES.length) % MATH_QUESTION_TYPES.length]!;
    selectQuestion(next.id);
  }

  function submit() {
    if (answerMathQuestion(question, values)) {
      showFeedback("CORRECT");
      return;
    }
    showFeedback(feedback === "WRONG" ? "REVEAL" : "WRONG");
  }

  return (
    <main className="math-preview" data-math-type={selectedTypeId}>
      <aside className="math-preview__catalog">
        <a className="math-preview__back" href="#pages">← 返回页面清单</a>
        <div className="math-preview__catalog-title">
          <img src={chickUrl} alt="小鸡数学向导" />
          <div><strong>数学练习设计室</strong><small>42 种题型逐一检查</small></div>
        </div>
        <div className="math-preview__catalog-scroll">
          {MATH_QUESTION_DOMAINS.map((domain) => (
            <section key={domain.id}>
              <h2><span>{domain.id}</span>{domain.name}</h2>
              <div>
                {getMathQuestionTypesByDomain(domain.id).map((item) => (
                  <button
                    className={selectedTypeId === item.id ? "is-active" : ""}
                    type="button"
                    onClick={() => selectQuestion(item.id)}
                    key={item.id}
                  >
                    <b>{item.id}</b><span>{item.name}</span><i>›</i>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>

      <section className="math-preview__stage">
        <header className="math-practice-header">
          <div>
            <button type="button" onClick={() => move(-1)} aria-label="上一种题型">‹</button>
            <span className="math-type-chip">{definition.id}</span>
            <div><strong>{definition.name}</strong><small>{definition.description}</small></div>
          </div>
          <div className="math-practice-progress">
            <span>{currentIndex + 1} / {MATH_QUESTION_TYPES.length}</span>
            <div><i style={{ width: `${((currentIndex + 1) / MATH_QUESTION_TYPES.length) * 100}%` }} /></div>
          </div>
          <button type="button" onClick={() => move(1)} aria-label="下一种题型">›</button>
        </header>

        <div className="math-question-layout">
          <article className="math-question-card">
            <div className="math-question-card__prompt">
              <span>想一想</span>
              <h1>{question.prompt}</h1>
              {question.helper && question.visual.kind !== "NONE" ? <p>{question.helper}</p> : null}
              {question.typeId === "S04" ? (
                <button className={`math-cube-guide-button${cubeGuideLayers !== null ? " is-playing" : ""}`} type="button" onClick={advanceCubeGuide}>
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
              <button type="button" onClick={() => {
                setSeed((value) => value + 1);
                setValues([]);
                setCubeGuideLayers(null);
                setCubeAnimatingLayer(null);
                clearFeedback();
              }}>换一道 ↻</button>
            </div>
            <MathAnswerEditor
              question={question}
              values={values}
              disabled={feedback === "CORRECT" || feedback === "REVEAL"}
              onChange={(next) => {
                setValues(next);
                if (feedback !== "IDLE") clearFeedback();
              }}
              onSubmit={submit}
            />
          </aside>
        </div>
        {feedback !== "IDLE" ? (
          <div className={`math-feedback-toast math-feedback-toast--${feedback === "CORRECT" ? "correct" : "wrong"}`} role="status" aria-live="polite">
            {feedback === "WRONG" || feedback === "REVEAL" ? <><b>错误</b>{feedback === "REVEAL" ? <span>答案：{question.answer.display}</span> : null}</> : null}
            {feedback === "CORRECT" ? <><b>正确</b><span>答案：{question.answer.display}</span></> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
