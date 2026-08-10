import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MathQuestion } from "@star-monsters/math-practice";

type Props = {
  question: Pick<MathQuestion, "id" | "typeId" | "response">;
  values: readonly string[];
  disabled?: boolean;
  activeSlot?: number;
  onActiveSlotChange?: (index: number) => void;
  hideSlots?: boolean;
  onChange: (values: string[]) => void;
  onSubmit: () => void;
};

function EquationSlots({
  question,
  values,
  activeSlot,
  onSelect,
}: {
  question: Pick<MathQuestion, "id" | "typeId" | "response">;
  values: readonly string[];
  activeSlot: number;
  onSelect: (index: number) => void;
}) {
  const template = question.response.template;
  if (!template) {
    const slots = question.response.slots ?? 1;
    return (
      <div className="math-answer-slots">
        {Array.from({ length: slots }, (_, index) => {
          const slot = <button
            className={activeSlot === index ? "is-active" : ""}
            type="button"
            onClick={() => onSelect(index)}
          >
            {values[index] || <span>?</span>}
          </button>;
          const label = question.response.slotLabels?.[index];
          return label ? (
            <div className="math-answer-slot-field" key={index}>
              <small>{label}</small>
              {slot}
            </div>
          ) : <span className="math-answer-slot-field math-answer-slot-field--plain" key={index}>{slot}</span>;
        })}
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

function FactFamilySlots({
  question,
  values,
  activeSlot,
  onSelect,
}: {
  question: Pick<MathQuestion, "id" | "typeId" | "response">;
  values: readonly string[];
  activeSlot: number;
  onSelect: (index: number) => void;
}) {
  const rows = question.response.equationRows ?? 4;
  const slotsPerRow = question.response.equationSlotsPerRow ?? 4;
  return (
    <div className={`math-fact-family-slots math-fact-family-slots--${rows}`}>
      {Array.from({ length: rows }, (_, rowIndex) => {
        const start = rowIndex * slotsPerRow;
        return (
          <div className="math-fact-family-row" key={rowIndex}>
            {[0, 1, 2].map((offset) => {
              const slot = start + offset;
              return (
                <button className={activeSlot === slot ? "is-active" : ""} type="button" onClick={() => onSelect(slot)} key={`${question.id}-${slot}`}>
                  {values[slot] || <span>{offset === 1 ? "+ / −" : "?"}</span>}
                </button>
              );
            })}
            <b>=</b>
            <button className={activeSlot === start + 3 ? "is-active" : ""} type="button" onClick={() => onSelect(start + 3)}>
              {values[start + 3] || <span>?</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SortableNumberTiles({
  questionId,
  options,
  values,
  disabled,
  onChange,
}: {
  questionId: string;
  options: readonly string[];
  values: readonly string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const [draggingValue, setDraggingValue] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingValueRef = useRef<string | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const orderRef = useRef<string[]>([]);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPositionRef = useRef<{ clientX: number; width: number; height: number } | null>(null);
  const optionsKey = options.join("|");
  const hasCompleteOrder = values.length === options.length &&
    options.every((option) => values.includes(option));
  const orderedValues = useMemo(
    () => hasCompleteOrder ? [...values] : [...options],
    [hasCompleteOrder, options, values],
  );

  useEffect(() => {
    if (!hasCompleteOrder) onChange([...options]);
  }, [hasCompleteOrder, onChange, options]);

  useEffect(() => {
    orderRef.current = orderedValues;
  }, [orderedValues]);

  useEffect(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragPositionRef.current = null;
    const activePointer = pointerIdRef.current;
    const track = trackRef.current;
    if (activePointer !== null && track?.hasPointerCapture(activePointer)) {
      track.releasePointerCapture(activePointer);
    }
    draggingValueRef.current = null;
    pointerIdRef.current = null;
    setDraggingValue(null);
    setDragPosition(null);
  }, [questionId, optionsKey]);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
  }, []);

  function updateDragPosition(clientX: number, width: number, height: number) {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const halfWidth = width / 2;
    const x = Math.min(Math.max(clientX - trackRect.left, halfWidth + 8), trackRect.width - halfWidth - 8);
    setDragPosition({ x, y: trackRect.height / 2, width, height });
  }

  function scheduleDragPosition(clientX: number, width: number, height: number) {
    pendingDragPositionRef.current = { clientX, width, height };
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pending = pendingDragPositionRef.current;
      pendingDragPositionRef.current = null;
      if (pending && draggingValueRef.current !== null) {
        updateDragPosition(pending.clientX, pending.width, pending.height);
      }
    });
  }

  function cancelScheduledDragPosition() {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragPositionRef.current = null;
  }

  function startDrag(value: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const tileRect = event.currentTarget.getBoundingClientRect();
    orderRef.current = orderedValues;
    draggingValueRef.current = value;
    pointerIdRef.current = event.pointerId;
    setDraggingValue(value);
    updateDragPosition(event.clientX, tileRect.width, tileRect.height);
    track.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const movingValue = draggingValueRef.current;
    if (disabled || pointerIdRef.current !== event.pointerId || movingValue === null) return;
    event.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const movingTile = track.querySelector<HTMLElement>(`[data-math-sort-value="${movingValue}"]`);
    const movingRect = movingTile?.getBoundingClientRect();
    scheduleDragPosition(event.clientX, movingRect?.width ?? 68, movingRect?.height ?? 82);

    const remainingTiles = Array.from(track.querySelectorAll<HTMLElement>("[data-math-sort-value]"))
      .filter((tile) => tile.dataset.mathSortValue !== movingValue)
      .map((tile) => {
        const rect = tile.getBoundingClientRect();
        return { value: tile.dataset.mathSortValue ?? "", center: rect.left + rect.width / 2 };
      })
      .sort((left, right) => left.center - right.center);
    const nextIndex = remainingTiles.findIndex((tile) => event.clientX < tile.center);
    const insertionIndex = nextIndex < 0 ? remainingTiles.length : nextIndex;
    const withoutMoving = orderRef.current.filter((value) => value !== movingValue);
    const next = [...withoutMoving];
    next.splice(insertionIndex, 0, movingValue);
    if (next.every((value, index) => value === orderRef.current[index])) return;
    orderRef.current = next;
    onChange(next);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelScheduledDragPosition();
    draggingValueRef.current = null;
    pointerIdRef.current = null;
    setDraggingValue(null);
    setDragPosition(null);
  }

  return (
    <div className="math-sort-zone" onContextMenu={(event) => event.preventDefault()}>
      <div className="math-sort-zone__hint">
        <strong>从小到大</strong>
        <span>按住数字，左右拖动</span>
      </div>
      <div
        className="math-sort-zone__track"
        role="list"
        aria-label="数字排序拖动区域"
        ref={trackRef}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        {orderedValues.map((value, index) => (
          <button
            className={draggingValue === value ? "is-dragging" : ""}
            type="button"
            role="listitem"
            aria-label={`数字 ${value}，当前位置第 ${index + 1}，按住拖动`}
            aria-grabbed={draggingValue === value}
            disabled={disabled}
            data-math-sort-value={value}
            onPointerDown={(event) => startDrag(value, event)}
            onDragStart={(event) => event.preventDefault()}
            draggable={false}
            key={value}
          >
            <span aria-hidden="true" className="math-sort-zone__grip">•••</span>
            <b>{value}</b>
          </button>
        ))}
        {draggingValue && dragPosition ? (
          <div
            className="math-sort-zone__ghost"
            aria-hidden="true"
            style={{
              left: dragPosition.x,
              top: dragPosition.y,
              width: dragPosition.width,
              height: dragPosition.height,
            }}
          >
            <span className="math-sort-zone__grip">•••</span>
            <b>{draggingValue}</b>
          </div>
        ) : null}
      </div>
      <div className="math-sort-zone__scale" aria-hidden="true"><span>小</span><i /><span>大</span></div>
    </div>
  );
}

export function MathAnswerEditor({
  question,
  values,
  disabled = false,
  activeSlot: activeSlotProp,
  onActiveSlotChange,
  hideSlots = false,
  onChange,
  onSubmit,
}: Props) {
  const [internalActiveSlot, setInternalActiveSlot] = useState(0);
  const activeSlot = activeSlotProp ?? internalActiveSlot;
  const response = question.response;
  const isOptionMode = ["R03", "R05", "R06", "R08"].includes(response.mode);
  const isFactFamily = Boolean(response.equationRows && response.equationSlotsPerRow);
  const slotCount = response.slots ?? (response.template ? Math.max(...Array.from(response.template.matchAll(/\{(\d+)\}/g), (match) => Number(match[1]))) + 1 : 1);
  const options = useMemo(() => {
    if (!isOptionMode) return [];

    const uniqueOptions = [...new Set(response.options ?? [])];
    // N08 only ever accepts comparison symbols. This also protects an already-open
    // exercise from rendering stale V07 equation choices after a hot deployment.
    if (question.typeId === "N08") {
      return [">", "<", "="].filter((symbol) => uniqueOptions.includes(symbol));
    }
    return uniqueOptions;
  }, [isOptionMode, question.typeId, response.options]);
  const operatorSlot = isFactFamily && activeSlot % (response.equationSlotsPerRow ?? 4) === 1;

  function setActiveSlot(nextSlot: number) {
    setInternalActiveSlot(nextSlot);
    onActiveSlotChange?.(nextSlot);
  }

  useEffect(() => {
    setInternalActiveSlot(0);
    onActiveSlotChange?.(0);
  }, [question.id, question.typeId, response.mode, onActiveSlotChange]);

  const complete = useMemo(() => {
    if (response.mode === "R08") return values.length === options.length;
    if (isOptionMode) return values.length > 0;
    return Array.from({ length: slotCount }).every((_, index) => Boolean(values[index]));
  }, [isOptionMode, options.length, response.mode, slotCount, values]);

  function updateSlot(nextValue: string) {
    const next = Array.from({ length: slotCount }, (_, index) => values[index] ?? "");
    next[activeSlot] = nextValue;
    onChange(next);
    if (nextValue && activeSlot < slotCount - 1) setActiveSlot(activeSlot + 1);
  }

  function inputDigit(digit: string) {
    if (operatorSlot) return;
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
    if (response.multiSelect) {
      onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
      return;
    }
    onChange([option]);
  }

  return (
    <div className={`math-answer-editor${isFactFamily ? " is-fact-family" : ""}${hideSlots ? " is-inline-number-sequence" : ""}${disabled ? " is-disabled" : ""}`}>
      {isOptionMode ? (
        <>
          {response.mode === "R08" ? (
            <SortableNumberTiles
              questionId={question.id}
              options={options}
              values={values}
              disabled={disabled}
              onChange={onChange}
            />
          ) : (
            <div className="math-option-pad">
              {options.map((option, optionIndex) => {
                const selected = values.includes(option);
                return (
                  <button
                    className={selected ? "is-selected" : ""}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleOption(option)}
                    key={`${option}-${optionIndex}`}
                  >
                    {response.multiSelect ? <span>{selected ? "✓" : ""}</span> : null}
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {!hideSlots ? (isFactFamily
            ? <FactFamilySlots question={question} values={values} activeSlot={activeSlot} onSelect={setActiveSlot} />
            : <EquationSlots question={question} values={values} activeSlot={activeSlot} onSelect={setActiveSlot} />) : null}
          <div className={`math-keypad${isFactFamily ? " math-keypad--fact-family" : ""}`} aria-label="数字和符号选择器">
            <div className="math-keypad__numbers">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button type="button" disabled={operatorSlot} onClick={() => inputDigit(digit)} key={digit}>{digit}</button>
              ))}
              {!isFactFamily ? <button
                  className="math-keypad__next"
                  type="button"
                  disabled={slotCount === 1 || activeSlot >= slotCount - 1 || !values[activeSlot]}
                  onClick={() => setActiveSlot(activeSlot + 1)}
                >
                  下一格
                </button> : null}
              <button type="button" disabled={operatorSlot} onClick={() => inputDigit("0")}>0</button>
              <button className="math-keypad__erase" type="button" onClick={removeDigit} aria-label="退格">⌫</button>
            </div>
            {response.mode === "R04" ? (
              <div className="math-keypad__symbols">
                {(isFactFamily ? ["+", "-"] : ["+", "-", ">", "<", "="]).map((symbol) => (
                  <button type="button" disabled={isFactFamily && !operatorSlot} onClick={() => updateSlot(symbol)} key={symbol}>{symbol}</button>
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
