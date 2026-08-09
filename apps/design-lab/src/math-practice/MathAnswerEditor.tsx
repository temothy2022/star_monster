import { useEffect, useMemo, useState } from "react";
import type { MathQuestion } from "@star-monsters/math-practice";

type Props = {
  question: Pick<MathQuestion, "id" | "response">;
  values: readonly string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
  onSubmit: () => void;
};

function EquationSlots({
  question,
  values,
  activeSlot,
  onSelect,
}: {
  question: Pick<MathQuestion, "id" | "response">;
  values: readonly string[];
  activeSlot: number;
  onSelect: (index: number) => void;
}) {
  const template = question.response.template;
  if (!template) {
    const slots = question.response.slots ?? 1;
    return (
      <div className="math-answer-slots">
        {Array.from({ length: slots }, (_, index) => (
          <button
            className={activeSlot === index ? "is-active" : ""}
            type="button"
            onClick={() => onSelect(index)}
            key={index}
          >
            {values[index] || <span>?</span>}
          </button>
        ))}
      </div>
    );
  }

  const parts = template.split(/(\{\d+\})/g).filter(Boolean);
  return (
    <div className="math-equation-slots">
      {parts.map((part, index) => {
        const match = /^\{(\d+)\}$/.exec(part);
        if (!match) return <span key={`${part}-${index}`}>{part}</span>;
        const slot = Number(match[1]);
        return (
          <button
            className={activeSlot === slot ? "is-active" : ""}
            type="button"
            onClick={() => onSelect(slot)}
            key={part}
          >
            {values[slot] || <span>?</span>}
          </button>
        );
      })}
    </div>
  );
}

export function MathAnswerEditor({ question, values, disabled = false, onChange, onSubmit }: Props) {
  const [activeSlot, setActiveSlot] = useState(0);
  const response = question.response;
  const isOptionMode = ["R03", "R05", "R06", "R08"].includes(response.mode);
  const slotCount = response.slots ?? (response.template ? Math.max(...Array.from(response.template.matchAll(/\{(\d+)\}/g), (match) => Number(match[1]))) + 1 : 1);

  useEffect(() => {
    setActiveSlot(0);
  }, [question.id]);

  const complete = useMemo(() => {
    if (response.mode === "R08") return values.length === (response.options?.length ?? 0);
    if (isOptionMode) return values.length > 0;
    return Array.from({ length: slotCount }).every((_, index) => Boolean(values[index]));
  }, [isOptionMode, response.mode, response.options?.length, slotCount, values]);

  function updateSlot(nextValue: string) {
    const next = Array.from({ length: slotCount }, (_, index) => values[index] ?? "");
    next[activeSlot] = nextValue;
    onChange(next);
    if (nextValue && activeSlot < slotCount - 1) setActiveSlot(activeSlot + 1);
  }

  function inputDigit(digit: string) {
    const current = values[activeSlot] ?? "";
    if (["+", "-", ">", "<", "="].includes(current)) {
      updateSlot(digit);
      return;
    }
    const maxDigits = response.maxDigits ?? 2;
    if (current.length >= maxDigits) return;
    const nextValue = current === "0" ? digit : `${current}${digit}`;
    const next = Array.from({ length: slotCount }, (_, index) => values[index] ?? "");
    next[activeSlot] = nextValue;
    onChange(next);
  }

  function removeDigit() {
    const current = values[activeSlot] ?? "";
    if (current) {
      const next = Array.from({ length: slotCount }, (_, index) => values[index] ?? "");
      next[activeSlot] = current.slice(0, -1);
      onChange(next);
    } else if (activeSlot > 0) {
      setActiveSlot(activeSlot - 1);
    }
  }

  function toggleOption(option: string) {
    if (response.mode === "R08") {
      if (values.includes(option)) return;
      onChange([...values, option]);
      return;
    }
    if (response.multiSelect) {
      onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
      return;
    }
    onChange([option]);
  }

  return (
    <div className={`math-answer-editor${disabled ? " is-disabled" : ""}`}>
      {isOptionMode ? (
        <>
          {response.mode === "R08" && values.length ? (
            <div className="math-sort-result">
              {values.map((value, index) => <span key={value}>{value}{index < values.length - 1 ? " <" : ""}</span>)}
              <button type="button" onClick={() => onChange([])}>重新排</button>
            </div>
          ) : null}
          <div className="math-option-pad">
            {response.options?.map((option) => {
              const selected = values.includes(option);
              return (
                <button
                  className={selected ? "is-selected" : ""}
                  type="button"
                  disabled={disabled || (response.mode === "R08" && selected)}
                  onClick={() => toggleOption(option)}
                  key={option}
                >
                  {response.multiSelect ? <span>{selected ? "✓" : ""}</span> : null}
                  {option}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <EquationSlots question={question} values={values} activeSlot={activeSlot} onSelect={setActiveSlot} />
          <div className="math-keypad" aria-label="数字和符号选择器">
            <div className="math-keypad__numbers">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button type="button" onClick={() => inputDigit(digit)} key={digit}>{digit}</button>
              ))}
              <button
                className="math-keypad__next"
                type="button"
                disabled={slotCount === 1 || activeSlot >= slotCount - 1 || !values[activeSlot]}
                onClick={() => setActiveSlot(activeSlot + 1)}
              >
                下一格
              </button>
              <button type="button" onClick={() => inputDigit("0")}>0</button>
              <button className="math-keypad__erase" type="button" onClick={removeDigit} aria-label="退格">⌫</button>
            </div>
            {response.mode === "R04" ? (
              <div className="math-keypad__symbols">
                {["+", "-", ">", "<", "="].map((symbol) => (
                  <button type="button" onClick={() => updateSlot(symbol)} key={symbol}>{symbol}</button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
      <button className="math-submit-answer" type="button" disabled={disabled || !complete} onClick={onSubmit}>
        提交答案
      </button>
    </div>
  );
}
