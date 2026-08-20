import { useEffect, useRef } from "react";
import {
  getMathTeachingGuide,
  type MathQuestion,
  type MathQuestionTypeId,
  type MathHintVisual,
} from "@star-monsters/math-practice";
import { useMascot } from "../mascots";
import { ChildControlIcon } from "../components/ChildControlIcon";

type HintQuestion = Pick<MathQuestion, "typeId" | "prompt" | "helper" | "response" | "visual">;

function questionNumbers(question: HintQuestion) {
  const text = [question.prompt, question.helper ?? "", ...(question.response.options ?? [])].join(" ");
  const numbers = text.match(/\d+/g)?.map(Number).filter((value) => value >= 0 && value <= 20) ?? [];
  if (question.visual.kind === "NUMBER_BOXES") {
    numbers.push(...question.visual.values.filter((value): value is number => value !== null));
  }
  return new Set(numbers);
}

function HintScaffold({ kind, question }: { kind: MathHintVisual; question: HintQuestion }) {
  if (kind === "NUMBER_PATH") {
    const active = questionNumbers(question);
    return (
      <div className="math-hint-number-path" aria-label="0到20数字路">
        {Array.from({ length: 21 }, (_, value) => <i className={active.has(value) ? "is-active" : ""} key={value}>{value}</i>)}
      </div>
    );
  }
  if (kind === "COUNT") {
    return <div className="math-hint-count" aria-hidden="true"><i>1</i><i>2</i><i>3</i><span>→</span><b>一个只点一次</b></div>;
  }
  if (kind === "DIRECTION") {
    return <div className="math-hint-direction" aria-hidden="true"><b>起点</b><span>→</span><i>1</i><i>2</i><i>3</i></div>;
  }
  if (kind === "COMPARE") {
    return <div className="math-hint-compare" aria-hidden="true"><span><i /><i /><i /><i /><i /></span><b>一一配对</b><span><i /><i /><i /></span></div>;
  }
  if (kind === "PLACE_VALUE") {
    return <div className="math-hint-place-value" aria-hidden="true"><span><b>十位</b><i>1捆 = 10</i></span><span><b>个位</b><i>1个 = 1</i></span></div>;
  }
  if (kind === "PART_WHOLE") {
    return <div className="math-hint-part-whole" aria-hidden="true"><b>整体</b><span><i>部分</i><i>部分</i></span></div>;
  }
  if (kind === "STORY_CHANGE") {
    return <div className="math-hint-story-change" aria-hidden="true"><b>原来</b><span>→</span><i>发生变化</i><span>→</span><b>现在</b></div>;
  }
  if (kind === "ELIMINATION") {
    return <div className="math-hint-elimination" aria-hidden="true"><i>✓</i><i>×</i><i>×</i><i>×</i><i /><i /><i>×</i><i /><i /></div>;
  }
  return <div className="math-hint-layers" aria-hidden="true"><i>第3层</i><i>第2层</i><i>第1层</i><b>从底层开始</b></div>;
}

function speakHint(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.82;
  utterance.pitch = 1.08;
  window.speechSynthesis.speak(utterance);
}

export function MathTeachingHint({
  question,
  level,
  disabled,
  onLevelChange,
}: {
  question: HintQuestion;
  level: number;
  disabled?: boolean;
  onLevelChange: (level: number) => void;
}) {
  const { mascot } = useMascot();
  const guide = getMathTeachingGuide(question.typeId as MathQuestionTypeId);
  const currentLevel = Math.max(0, Math.min(2, level));
  const currentHint = currentLevel > 0 ? guide.hints[currentLevel - 1] : null;
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentLevel === 0) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !hintRef.current?.contains(target)) onLevelChange(0);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [currentLevel, onLevelChange]);

  function openHint(nextLevel: number) {
    const next = Math.max(1, Math.min(2, nextLevel));
    onLevelChange(next);
    speakHint(guide.hints[next - 1]);
  }

  return (
    <div ref={hintRef} className={`math-teaching-hint${currentLevel > 0 ? " is-open" : ""}`}>
      {currentLevel === 0 ? (
        <button type="button" disabled={disabled} onClick={() => openHint(1)}>
          <img src={mascot.images.focus} alt="" />
          星宠提示
        </button>
      ) : (
        <section className="math-teaching-hint__panel" aria-live="polite">
          <div className="math-teaching-hint__message">
            <img src={mascot.images.focus} alt="" />
            <span><small>提示 {currentLevel} / 2</small><strong>{currentHint}</strong></span>
            <button type="button" aria-label="收起提示" onClick={() => onLevelChange(0)}><ChildControlIcon kind="close" /></button>
          </div>
          <HintScaffold kind={guide.visual} question={question} />
          <footer>
            <button type="button" disabled={disabled} onClick={() => currentHint && speakHint(currentHint)}>听一遍</button>
            {currentLevel < 2 ? <button type="button" disabled={disabled} onClick={() => openHint(2)}>再提示一点</button> : null}
          </footer>
        </section>
      )}
    </div>
  );
}
