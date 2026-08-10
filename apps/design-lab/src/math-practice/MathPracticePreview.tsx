import { useEffect, useMemo, useRef, useState } from "react";
import {
  MATH_QUESTION_CATEGORIES,
  MATH_QUESTION_TYPES,
  answerMathQuestion,
  generateMathQuestion,
  getMathTeachingGuide,
  getMathQuestionTypesByCategory,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";
import { MathAnswerEditor } from "./MathAnswerEditor";
import { MathTeachingHint } from "./MathTeachingHint";
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
  const [hintLevel, setHintLevel] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const feedbackTimer = useRef<number | null>(null);
  const question = useMemo(() => generateMathQuestion({ typeId: selectedTypeId, seed }), [seed, selectedTypeId]);
  const definition = MATH_QUESTION_TYPES.find((item) => item.id === selectedTypeId)!;
  const teachingGuide = getMathTeachingGuide(selectedTypeId);
  const currentIndex = MATH_QUESTION_TYPES.findIndex((item) => item.id === selectedTypeId);
  const cubeLayerCount = question.visual.kind === "CUBES"
    ? Math.max(...question.visual.cubes.map(([, , z]) => z)) + 1
    : 0;
  const cubeGuideComplete = cubeLayerCount > 0 && cubeGuideLayers === cubeLayerCount;
  const logicGridRowCount = question.visual.kind === "LOGIC_GRID" ? question.visual.rows.length : 0;
  const isLogicGrid = question.typeId === "S03" && logicGridRowCount > 0;
  const isInlineSort = question.typeId === "N09";
  const logicGridComplete = isLogicGrid && values.length === logicGridRowCount;
  const isDirectVisualAnswer = isLogicGrid || question.typeId === "N15" || question.typeId === "N16";
  const directVisualComplete = isLogicGrid
    ? logicGridComplete
    : question.typeId === "N15"
      ? values.length === (question.response.slots ?? 1)
      : question.typeId === "N16" && Number(values[0] ?? 0) > 0;

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
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setSelectedTypeId(typeId);
    setValues([]);
    setCubeGuideLayers(null);
    setCubeAnimatingLayer(null);
    setHintLevel(0);
    setAttemptCount(0);
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

  function changeQuestion() {
    setSeed((value) => value + 1);
    setValues([]);
    setCubeGuideLayers(null);
    setCubeAnimatingLayer(null);
    setHintLevel(0);
    setAttemptCount(0);
    clearFeedback();
  }

  function changeValues(next: string[]) {
    setValues(next);
    if (feedback !== "IDLE") clearFeedback();
  }

  function submit() {
    if (answerMathQuestion(question, values)) {
      showFeedback("CORRECT");
      return;
    }
    const nextAttempt = attemptCount + 1;
    setAttemptCount(nextAttempt);
    if (nextAttempt === 1) setHintLevel((current) => Math.max(1, current));
    showFeedback(nextAttempt >= 2 ? "REVEAL" : "WRONG");
  }

  return (
    <main className="math-preview" data-math-type={selectedTypeId}>
      <aside className="math-preview__catalog">
        <a className="math-preview__back" href="#pages">← 返回页面清单</a>
        <div className="math-preview__catalog-title">
          <img src={chickUrl} alt="小鸡数学向导" />
          <div><strong>数学练习设计室</strong><small>{MATH_QUESTION_TYPES.length} 种题型逐一检查</small></div>
        </div>
        <div className="math-preview__catalog-scroll">
          {MATH_QUESTION_CATEGORIES.map((domain, categoryIndex) => (
            <section key={domain.id}>
              <h2><span>{categoryIndex + 1}</span>{domain.name}</h2>
              <div>
                {getMathQuestionTypesByCategory(domain.id).map((item) => (
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

        <details className="math-teaching-audit">
          <summary>查看这个题型的教学重点</summary>
          <div>
            <p><b>训练目标</b><span>{teachingGuide.focus}</span></p>
            <p><b>常见错误</b><span>{teachingGuide.commonMistake}</span></p>
          </div>
        </details>

        <div className={`math-question-layout${isDirectVisualAnswer ? " math-question-layout--logic" : ""}${isInlineSort ? " math-question-layout--sort" : ""}`}>
          <article className="math-question-card" data-math-type={question.typeId} data-math-hint-level={hintLevel}>
            <div className="math-question-card__prompt">
              <span>想一想</span>
              <h1>{question.prompt}</h1>
              {isDirectVisualAnswer || isInlineSort ? <button className="math-logic-new-question" type="button" onClick={changeQuestion}>换一道</button> : null}
              {question.helper && question.visual.kind !== "NONE" ? <p>{question.helper}</p> : null}
              {question.typeId === "S04" ? (
                <button className={`math-cube-guide-button${cubeGuideLayers !== null ? " is-playing" : ""}`} type="button" onClick={advanceCubeGuide}>
                  {cubeGuideLayers === null ? "分层看" : cubeGuideComplete ? "重新分层" : "放下一层"}
                </button>
              ) : null}
              <MathTeachingHint
                question={question}
                level={hintLevel}
                disabled={feedback === "CORRECT" || feedback === "REVEAL"}
                onLevelChange={setHintLevel}
              />
            </div>
            <div className={`math-visual-board math-visual-board--${isInlineSort ? "inline-sort" : question.visual.kind.toLowerCase()}`}>
              {isInlineSort ? (
                <div className="math-inline-sort-answer">
                  <MathAnswerEditor
                    key={`${selectedTypeId}:${seed}:${question.id}:${question.response.mode}:inline`}
                    question={question}
                    values={values}
                    disabled={feedback === "CORRECT" || feedback === "REVEAL"}
                    onChange={changeValues}
                    onSubmit={submit}
                  />
                </div>
              ) : (
                <MathVisual
                  question={question}
                  cubeVisibleLayers={question.typeId === "S04" ? cubeGuideLayers : undefined}
                  cubeAnimatingLayer={question.typeId === "S04" ? cubeAnimatingLayer : undefined}
                  values={values}
                  disabled={feedback === "CORRECT" || feedback === "REVEAL"}
                  onChange={changeValues}
                />
              )}
            </div>
            {isDirectVisualAnswer ? (
              <div className="math-logic-submit">
                <button className="math-submit-answer" type="button" disabled={!directVisualComplete || feedback === "CORRECT" || feedback === "REVEAL"} onClick={submit}>提交答案</button>
              </div>
            ) : null}
          </article>

          {!isDirectVisualAnswer && !isInlineSort ? <aside className="math-answer-card">
            <div className="math-answer-card__top">
              <span>我的答案</span>
              <button type="button" onClick={() => {
                changeQuestion();
              }}>换一道 ↻</button>
            </div>
            <MathAnswerEditor
              key={`${selectedTypeId}:${seed}:${question.id}:${question.response.mode}`}
              question={question}
              values={values}
              disabled={feedback === "CORRECT" || feedback === "REVEAL"}
              onChange={changeValues}
              onSubmit={submit}
            />
          </aside> : null}
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
