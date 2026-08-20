import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { projectCubeStructure } from "@star-monsters/math-practice";
import type {
  CubeCoordinate,
  MathLengthAssetKey,
  MathLogicPictureKey,
  MathQuestion,
  MathSpriteKey,
} from "@star-monsters/math-practice";
import appleUrl from "@star-monsters/assets/images/math-practice/apple.webp";
import bearUrl from "@star-monsters/assets/images/math-practice/bear.webp";
import cakeUrl from "@star-monsters/assets/images/math-practice/cake.webp";
import chickUrl from "@star-monsters/assets/images/math-practice/chick.webp";
import duckUrl from "@star-monsters/assets/images/math-practice/duck.webp";
import pencilUrl from "@star-monsters/assets/images/math-practice/pencil.webp";
import puppyUrl from "@star-monsters/assets/images/math-practice/puppy.webp";
import stickBundleUrl from "@star-monsters/assets/images/math-practice/stick-bundle.webp";
import watermelonUrl from "@star-monsters/assets/images/math-practice/watermelon.webp";
import balanceScaleBaseUrl from "@star-monsters/assets/images/math-practice/balance-scale-base-v2.webp";
import balanceScaleBeamUrl from "@star-monsters/assets/images/math-practice/balance-scale-beam-v2.webp";
import lengthCrayonsUrl from "@star-monsters/assets/images/math-practice/length-crayons.webp";
import lengthPaintbrushesUrl from "@star-monsters/assets/images/math-practice/length-paintbrushes.webp";
import lengthRibbonsUrl from "@star-monsters/assets/images/math-practice/length-ribbons.webp";
import lengthRulersUrl from "@star-monsters/assets/images/math-practice/length-rulers.webp";
import lengthSpoonsUrl from "@star-monsters/assets/images/math-practice/length-spoons.webp";
import lengthStrawsUrl from "@star-monsters/assets/images/math-practice/length-straws.webp";
import lengthToothbrushesUrl from "@star-monsters/assets/images/math-practice/length-toothbrushes.webp";
import logicAppleUrl from "@star-monsters/assets/images/math-practice/apple.webp";
import logicWatermelonUrl from "@star-monsters/assets/images/math-practice/watermelon.webp";
import logicCakeUrl from "@star-monsters/assets/images/math-practice/cake.webp";
import logicPencilUrl from "@star-monsters/assets/images/math-practice/pencil.webp";
import logicBackpackUrl from "@star-monsters/assets/images/math-practice/logic/backpack.webp";
import { ChildControlIcon } from "../components/ChildControlIcon";
import logicBookUrl from "@star-monsters/assets/images/math-practice/logic/book.webp";
import logicCarUrl from "@star-monsters/assets/images/math-practice/logic/car.webp";
import logicTrainUrl from "@star-monsters/assets/images/math-practice/logic/train.webp";
import logicBicycleUrl from "@star-monsters/assets/images/math-practice/logic/bicycle.webp";
import logicSoccerUrl from "@star-monsters/assets/images/math-practice/logic/soccer.webp";
import logicBasketballUrl from "@star-monsters/assets/images/math-practice/logic/basketball.webp";
import logicVolleyballUrl from "@star-monsters/assets/images/math-practice/logic/volleyball.webp";
import logicTennisUrl from "@star-monsters/assets/images/math-practice/logic/tennis.webp";
import logicBadmintonUrl from "@star-monsters/assets/images/math-practice/logic/badminton.webp";

const spriteUrls: Record<MathSpriteKey, string> = {
  apple: appleUrl,
  bear: bearUrl,
  cake: cakeUrl,
  chick: chickUrl,
  duck: duckUrl,
  pencil: pencilUrl,
  puppy: puppyUrl,
  watermelon: watermelonUrl,
};

const spriteLabels: Record<MathSpriteKey, string> = {
  apple: "苹果",
  bear: "小熊",
  cake: "蛋糕",
  chick: "小鸡",
  duck: "鸭子",
  pencil: "铅笔",
  puppy: "小狗",
  watermelon: "西瓜",
};

const lengthAssetUrls: Record<MathLengthAssetKey, string> = {
  rulers: lengthRulersUrl,
  crayons: lengthCrayonsUrl,
  ribbons: lengthRibbonsUrl,
  toothbrushes: lengthToothbrushesUrl,
  paintbrushes: lengthPaintbrushesUrl,
  straws: lengthStrawsUrl,
  spoons: lengthSpoonsUrl,
};

const lengthAssetLabels: Record<MathLengthAssetKey, string> = {
  rulers: "三把长短不同的尺子",
  crayons: "三支长短不同的彩笔",
  ribbons: "三条长短不同的丝带",
  toothbrushes: "三把长短不同的牙刷",
  paintbrushes: "三支长短不同的画笔",
  straws: "三根长短不同的吸管",
  spoons: "三把长短不同的勺子",
};

type VisualQuestion = Pick<MathQuestion, "typeId" | "visual" | "helper" | "response">;

type MathVisualProps = {
  question: VisualQuestion;
  cubeVisibleLayers?: number | null;
  cubeAnimatingLayer?: number | null;
  values?: readonly string[];
  activeSlot?: number;
  onSlotSelect?: (index: number) => void;
  disabled?: boolean;
  onChange?: (values: string[]) => void;
};

const Sprite = memo(function Sprite({ asset, className = "", style }: { asset: MathSpriteKey; className?: string; style?: CSSProperties }) {
  return (
    <img
      className={`math-sprite ${className}`}
      src={spriteUrls[asset]}
      alt={spriteLabels[asset]}
      draggable={false}
      style={style}
    />
  );
});

function ObjectGroups({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "OBJECT_GROUPS") return null;
  const { visual } = question;
  const totalObjects = visual.groups.reduce((sum, count) => sum + count, 0);
  const removalStages = visual.crossedOut ?? [];
  const totalRemoved = removalStages.reduce((sum, count) => sum + count, 0);
  let globalIndex = 0;
  const splitRemovalGroups = removalStages.length > 0
    && visual.groups.length === 1
    && totalRemoved > 0
    && totalRemoved < totalObjects;
  const displayGroups = splitRemovalGroups
    ? [
        { count: totalObjects - totalRemoved, removed: false, key: "remaining" },
        ...removalStages.map((count, index) => ({ count, removed: true, key: `removed-${index}` })),
      ]
    : visual.groups.map((count, index) => ({ count, removed: false, key: `group-${index}` }));

  return (
    <div className="math-object-model">
      <div className={`math-object-groups${visual.orientation === "VERTICAL" ? " math-object-groups--vertical" : ""}${visual.orientation !== "VERTICAL" && visual.groups.length === 2 ? " math-object-groups--split" : ""}`}>
        {displayGroups.map(({ count, removed, key }, groupIndex) => {
          const groupStart = globalIndex;
          globalIndex += count;
          // Split subtraction models used to leave removal stages as free-flow
          // groups. Five or more objects could then become one long vertical
          // column on paper. Give every stage a compact, readable grid.
          const gridColumns = visual.groupColumns?.[groupIndex]
            ?? (splitRemovalGroups ? Math.min(5, count) : undefined);
          if (visual.unknownGroupIndex === groupIndex) {
            return (
              <div className="math-object-group math-object-group--unknown" key={groupIndex}>
                <span>?</span>
              </div>
            );
          }
          return (
            <div
              className={`math-object-group${gridColumns ? " math-object-group--grid" : ""}${visual.containers ? " math-object-group--container" : ""}${removed ? " math-object-group--removed" : ""}`}
              style={gridColumns
                ? { gridTemplateColumns: `repeat(${gridColumns}, 58px)` }
                : undefined}
              key={key}
            >
              {visual.groupLabels?.[groupIndex] ? <strong className="math-object-group-label">{visual.groupLabels[groupIndex]}</strong> : null}
              {Array.from({ length: count }, (_, localIndex) => {
                const itemIndex = groupStart + localIndex;
                const fromEnd = totalObjects - itemIndex;
                const crossed = !splitRemovalGroups && fromEnd <= totalRemoved;
                let stage = 0;
                let running = 0;
                for (let index = 0; index < removalStages.length; index += 1) {
                  running += removalStages[index] ?? 0;
                  if (fromEnd <= running) {
                    stage = index + 1;
                    break;
                  }
                }
                return (
                  <span
                    className={`math-object${crossed ? ` math-object--crossed math-object--stage-${stage}` : ""}`}
                    key={localIndex}
                  >
                    <Sprite asset={visual.asset} />
                  </span>
                );
              })}
              {visual.containers ? <span className="math-container-label">第 {groupIndex + 1} 组</span> : null}
            </div>
          );
        })}
      </div>
      {visual.totalLabel !== undefined ? (
        <div className="math-total-bracket">
          <span />
          <strong>{visual.totalLabel}</strong>
          <span />
        </div>
      ) : null}
    </div>
  );
}

function ArithmeticList({ question, values, activeSlot = 0, disabled, onSlotSelect }: MathVisualProps) {
  if (question.visual.kind !== "ARITHMETIC_LIST") return null;
  return (
    <div className="math-arithmetic-list" aria-label="多道算式">
      {question.visual.items.map((item, itemIndex) => (
        <div className="math-arithmetic-row" key={itemIndex}>
          <span className="math-arithmetic-row__number">{itemIndex + 1}.</span>
          <div className="math-arithmetic-row__equation">
            {item.tokens.map((token, tokenIndex) => {
              if (typeof token === "object") {
                const active = activeSlot === itemIndex;
                return (
                  <button
                    className={`math-arithmetic-blank${active ? " is-active" : ""}`}
                    type="button"
                    disabled={disabled}
                    aria-label={`第 ${itemIndex + 1} 题答案`}
                    onClick={() => onSlotSelect?.(itemIndex)}
                    key={`${itemIndex}-${tokenIndex}`}
                  >{values?.[itemIndex] || token.placeholder || "?"}</button>
                );
              }
              return <span key={`${itemIndex}-${tokenIndex}`} className="math-arithmetic-token">{token}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Abacus({ tens, ones }: { tens: number; ones: number }) {
  return (
    <div className="math-abacus" aria-label={`十位 ${tens} 颗珠子，个位 ${ones} 颗珠子`}>
      {([tens, ones] as const).map((count, index) => (
        <div className="math-abacus__column" key={index}>
          <div className="math-abacus__rod">
            {Array.from({ length: count }, (_, beadIndex) => (
              <span className="math-abacus__bead" key={beadIndex} />
            ))}
          </div>
          <strong>{index === 0 ? "十位" : "个位"}</strong>
        </div>
      ))}
    </div>
  );
}

function StickBundle() {
  return (
    <img className="math-stick-bundle" src={stickBundleUrl} alt="一捆小棍" draggable={false} />
  );
}

function PlaceValue({ tens, ones, showLabels = true }: { tens: number; ones: number; showLabels?: boolean }) {
  return (
    <div className="math-place-value">
      <div className="math-place-value__section">
        <div className="math-place-value__bundles">
          {Array.from({ length: tens }, (_, index) => <StickBundle key={index} />)}
        </div>
        {showLabels ? <span>{tens} 个十</span> : null}
      </div>
      <div className="math-place-value__section">
        <div className="math-loose-sticks">
          {Array.from({ length: ones }, (_, index) => <i key={index} />)}
        </div>
        {showLabels ? <span>{ones} 个一</span> : null}
      </div>
    </div>
  );
}

function NumberBoxes({
  values,
  answerValues,
  interactive,
  activeSlot,
  disabled,
  onSlotSelect,
}: {
  values: readonly (number | null)[];
  answerValues: readonly string[];
  interactive: boolean;
  activeSlot: number;
  disabled: boolean;
  onSlotSelect?: (index: number) => void;
}) {
  let missingSlot = 0;
  return (
    <div className={`math-number-boxes math-number-boxes--${values.length}`}>
      {values.map((value, index) => {
        const answerSlot = value === null ? missingSlot++ : -1;
        const answer = interactive && answerSlot >= 0 ? answerValues[answerSlot] : undefined;
        const className = [
          value === null ? "math-number-box--missing" : "",
          interactive && answerSlot === activeSlot ? "math-number-box--active" : "",
        ].filter(Boolean).join(" ");
        if (interactive && value === null) {
          return (
            <button
              className={className}
              type="button"
              disabled={disabled}
              aria-label={answer ? `第 ${answerSlot + 1} 个答案是 ${answer}` : `填写第 ${answerSlot + 1} 个缺少的数`}
              onClick={() => onSlotSelect?.(answerSlot)}
              key={index}
            >
              {answer || "?"}
            </button>
          );
        }
        return <span className={className} key={index}>{value ?? answer ?? "?"}</span>;
      })}
    </div>
  );
}

function NumberBond({
  total,
  parts,
  answerValues = [],
  activeSlot = 0,
  totalSlotIndex,
  partSlotIndexes,
  slotLabels,
  showLines = true,
  disabled = false,
  onSlotSelect,
}: {
  total: number | null;
  parts: readonly [number | null, number | null];
  answerValues?: readonly string[];
  activeSlot?: number;
  totalSlotIndex?: number;
  partSlotIndexes?: readonly [number | undefined, number | undefined];
  slotLabels?: readonly string[];
  showLines?: boolean;
  disabled?: boolean;
  onSlotSelect?: (index: number) => void;
}) {
  const totalValue = total ?? (totalSlotIndex === undefined ? "" : answerValues[totalSlotIndex] ?? "");
  return (
    <div className="math-number-bond" role="group" aria-label="数的组成与分解">
      {totalSlotIndex !== undefined && onSlotSelect ? (
        <button
          className={`math-number-bond__total${activeSlot === totalSlotIndex ? " is-active" : ""}`}
          type="button"
          disabled={disabled}
          aria-label={totalValue ? `合成数已填写 ${totalValue}` : "填写合成数"}
          onClick={() => onSlotSelect(totalSlotIndex)}
        >{totalValue || "?"}</button>
      ) : <span className="math-number-bond__total">{totalValue || "?"}</span>}
      {showLines ? (
        <svg className="math-number-bond__lines" viewBox="0 0 360 210" aria-hidden="true">
          <path d="M180 76 L95 148 M180 76 L265 148" />
        </svg>
      ) : null}
        <div className="math-number-bond__branches">
          {parts.map((part, index) => {
          const slotIndex = partSlotIndexes?.[index] ?? index;
          const value = part ?? answerValues[slotIndex] ?? "";
          const label = slotLabels?.[index];
          const editable = part === null && Boolean(onSlotSelect);
          return (
            <div className="math-number-bond__field" key={index}>
              {editable ? (
                <button
                  className={activeSlot === slotIndex ? "is-active" : ""}
                  type="button"
                  disabled={disabled}
                  aria-label={`${label ?? `第 ${index + 1} 个分支`}，${value ? `已填写 ${value}` : "未填写"}`}
                  onClick={() => onSlotSelect?.(slotIndex)}
                >
                  {value || <span>?</span>}
                </button>
              ) : <span>{value || "?"}</span>}
              {label ? <small>{label}</small> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberBondSet({
  bonds,
  answerValues,
  activeSlot,
  disabled,
  onSlotSelect,
}: {
  bonds: readonly { total: number | null; parts: readonly [number | null, number | null] }[];
  answerValues: readonly string[];
  activeSlot: number;
  disabled: boolean;
  onSlotSelect?: (index: number) => void;
}) {
  let nextSlot = 0;
  const configuredBonds = bonds.map((bond) => {
    const totalSlotIndex = bond.total === null ? nextSlot++ : undefined;
    const partSlotIndexes = bond.parts.map((part) => part === null ? nextSlot++ : undefined) as [number | undefined, number | undefined];
    return { bond, totalSlotIndex, partSlotIndexes };
  });

  return (
    <div className="math-number-bond-set" aria-label="20以内数的分与合">
      {configuredBonds.map(({ bond, totalSlotIndex, partSlotIndexes }, index) => (
        <NumberBond
          total={bond.total}
          parts={bond.parts}
          answerValues={answerValues}
          activeSlot={activeSlot}
          totalSlotIndex={totalSlotIndex}
          partSlotIndexes={partSlotIndexes}
          disabled={disabled}
          onSlotSelect={onSlotSelect}
          key={index}
        />
      ))}
    </div>
  );
}

function Queue({
  question,
  values,
  disabled,
  onChange,
}: {
  question: VisualQuestion;
  values: readonly string[];
  disabled: boolean;
  onChange?: (values: string[]) => void;
}) {
  if (question.visual.kind !== "QUEUE") return null;
  const { visual } = question;
  const canSelect = Boolean(visual.selectable && onChange);
  const isSpatialChoice = question.typeId === "S01";
  function toggleItem(index: number) {
    if (!canSelect || disabled || !onChange) return;
    const value = `item-${index}`;
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }
  return (
    <div className="math-queue-wrap">
      <div className="math-queue">
        {visual.assets.map((asset, index) => {
          const selected = values.includes(`item-${index}`);
          const content = <>
            {visual.targetIndex === index ? <b aria-label="目标">★</b> : null}
            <Sprite asset={asset} />
            {canSelect ? (isSpatialChoice ? null : <i aria-hidden="true">{selected ? "✓" : ""}</i>) : visual.showIndices !== false ? <small>{index + 1}</small> : null}
          </>;
          return canSelect ? (
            <button
              className={`math-queue__item math-queue__item--selectable${isSpatialChoice ? " math-queue__item--spatial-choice" : ""}${selected ? " is-selected" : ""}`}
              type="button"
              disabled={disabled}
              aria-label={`第 ${index + 1} 个小伙伴${selected ? "，已圈选" : ""}`}
              aria-pressed={selected}
              onClick={() => toggleItem(index)}
              key={`${asset}-${index}`}
            >{content}</button>
          ) : <span className={`math-queue__item${isSpatialChoice ? " math-queue__item--spatial-choice" : ""}`} key={`${asset}-${index}`}>{content}</span>;
        })}
      </div>
      {visual.direction ? (
        <div
          className={`math-direction math-direction--${visual.direction.toLowerCase()}`}
          aria-label={`${visual.directionLabel ?? "方向"}：${visual.direction === "LEFT" ? "向左" : "向右"}`}
        >
          <span className="math-direction__label">{visual.directionLabel ?? `从${visual.direction === "LEFT" ? "左" : "右"}边数`}</span>
          <span className="math-direction__trail" aria-hidden="true"><i /><i /><i /></span>
          <b>{visual.direction === "LEFT" ? "向左" : "向右"}</b>
        </div>
      ) : null}
    </div>
  );
}

function CountAdjust({
  question,
  values,
  disabled,
  onChange,
}: {
  question: VisualQuestion;
  values: readonly string[];
  disabled: boolean;
  onChange?: (values: string[]) => void;
}) {
  if (question.visual.kind !== "COUNT_ADJUST") return null;
  const visual = question.visual;
  const count = Math.max(0, Math.min(visual.maximum, Number(values[0] ?? 0) || 0));
  function setCount(next: number) {
    if (disabled || !onChange) return;
    onChange([String(Math.max(0, Math.min(visual.maximum, next)))]);
  }
  return (
    <div className="math-count-adjust">
      <section aria-label={`参考数量 ${visual.referenceCount}`}>
        <strong>看一看</strong>
        <div>{Array.from({ length: visual.referenceCount }, (_, index) => <Sprite asset={visual.asset} key={index} />)}</div>
      </section>
      <span>比参考数量{visual.relation === "MORE" ? "多" : "少"} {visual.difference} 个</span>
      <section className="math-count-adjust__drawing" aria-label={`已经画了 ${count} 个`}>
        <strong>点一下画出来</strong>
        <div>
          {Array.from({ length: count }, (_, index) => (
            <button type="button" disabled={disabled} aria-label="擦掉一个" onClick={() => setCount(count - 1)} key={index}>
              <Sprite asset={visual.asset} />
            </button>
          ))}
          {count < visual.maximum ? <button className="math-count-adjust__add" type="button" disabled={disabled} aria-label="再画一个" onClick={() => setCount(count + 1)}><ChildControlIcon kind="increase" /></button> : null}
        </div>
      </section>
    </div>
  );
}

function AttributeCompare({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "ATTRIBUTE_COMPARE") return null;
  const visual = question.visual;
  if (visual.attribute === "LENGTH") {
    const legacyLongestIndex = visual.scales.indexOf(Math.max(...visual.scales));
    const lengthAsset = visual.lengthAsset ?? (["rulers", "crayons", "ribbons"] as const)[legacyLongestIndex] ?? "rulers";
    const isVertical = visual.lengthOrientation === "VERTICAL";
    return (
      <div className={`math-length-compare${isVertical ? " math-length-compare--vertical" : ""}`}>
        <img
          src={lengthAssetUrls[lengthAsset]}
          alt={lengthAssetLabels[lengthAsset]}
          draggable={false}
        />
        <div className="math-length-compare__labels">
          {(isVertical ? ["上面", "中间", "下面"] : ["左边", "中间", "右边"]).map((label) => <small key={label}>{label}</small>)}
        </div>
      </div>
    );
  }
  if (visual.attribute === "WEIGHT" && visual.balance) {
    if (visual.balanceType === "SCALE") {
      const weights = visual.weights ?? [2, 2];
      const balanceLabel = visual.balance === "EQUAL" ? "两边一样重" : visual.balance === "LEFT" ? "左边较重" : "右边较重";
      const beamRotation = visual.balance === "LEFT" ? -4 : visual.balance === "RIGHT" ? 4 : 0;
      return (
        <div className={`math-scale-compare math-scale-compare--${visual.balance.toLowerCase()}`} aria-label={`天平，${balanceLabel}`}>
          <div className="math-scale-compare__stage">
            <img className="math-scale-compare__base" src={balanceScaleBaseUrl} alt="卡通天平底座" draggable={false} />
            <div className="math-scale-compare__beam" style={{ transform: `rotate(${beamRotation}deg)` }}>
              <img src={balanceScaleBeamUrl} alt="卡通天平横梁和托盘" draggable={false} />
              <div className="math-scale-compare__weights math-scale-compare__weights--left">
                {Array.from({ length: weights[0] }, (_, index) => <span key={index} aria-hidden="true" />)}
              </div>
              <div className="math-scale-compare__weights math-scale-compare__weights--right">
                {Array.from({ length: weights[1] }, (_, index) => <span key={index} aria-hidden="true" />)}
              </div>
            </div>
          </div>
          <div className="math-scale-compare__labels"><small>左边</small><small>右边</small></div>
        </div>
      );
    }
    // A positive CSS rotation lowers the left end of the beam; keep the
    // visual direction aligned with the answer semantics.
    const rotation = visual.balance === "LEFT" ? 7 : visual.balance === "RIGHT" ? -7 : 0;
    return (
      <div className="math-balance-compare" aria-label={`跷跷板${visual.balance === "LEFT" ? "左低右高" : visual.balance === "RIGHT" ? "右低左高" : "两边一样重"}`}>
        <div className="math-balance-compare__objects" style={{ transform: `rotate(${rotation}deg)` }}>
          <div className="math-balance-compare__object math-balance-compare__object--left" style={{ transform: `rotate(${-rotation}deg)` }}><Sprite asset={visual.assets?.[0] ?? visual.asset} /></div>
          <div className="math-balance-compare__object math-balance-compare__object--right" style={{ transform: `rotate(${-rotation}deg)` }}><Sprite asset={visual.assets?.[1] ?? visual.asset} /></div>
        </div>
        <i />
        <div className="math-balance-compare__labels"><small>左边</small><small>右边</small></div>
      </div>
    );
  }
  return (
    <div className={`math-attribute-compare math-attribute-compare--${(visual.attribute ?? "SIZE").toLowerCase()}`}>
      {visual.scales.map((scale, index) => (
        <div key={index}>
          <Sprite
            asset={visual.asset}
            className="math-sprite--scaled"
            style={{ transform: visual.attribute === "LENGTH" ? `scaleX(${scale})` : `scale(${scale})` }}
          />
          <small>{["左边", "中间", "右边"][index]}</small>
        </div>
      ))}
    </div>
  );
}

function SpatialGrid({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "SPATIAL_GRID") return null;
  return (
    <div className="math-spatial-grid" style={{ gridTemplateColumns: `repeat(${question.visual.cells[0]?.length ?? 1}, 1fr)` }}>
      {question.visual.cells.flatMap((row, rowIndex) =>
        row.map((asset, columnIndex) => (
          <div key={`${rowIndex}-${columnIndex}`}>{asset ? <Sprite asset={asset} /> : null}</div>
        )),
      )}
    </div>
  );
}

const logicPictureLabels: Record<MathLogicPictureKey, string> = {
  soccer: "足球",
  basketball: "篮球",
  volleyball: "排球",
  tennis: "网球",
  badminton: "羽毛球",
  apple: "苹果",
  watermelon: "西瓜",
  cake: "蛋糕",
  pencil: "铅笔",
  backpack: "书包",
  book: "图画书",
  car: "小汽车",
  train: "小火车",
  bicycle: "自行车",
};

const logicRowAssetByLabel: Partial<Record<string, MathSpriteKey>> = {
  小鸡: "chick",
  小狗: "puppy",
  小熊: "bear",
  小鸭: "duck",
  苹果妹妹: "apple",
  西瓜妹妹: "watermelon",
};

const logicColumnAssetByLabel: Partial<Record<string, MathLogicPictureKey>> = {
  皮球: "volleyball",
  足球: "soccer",
  篮球: "basketball",
  排球: "volleyball",
  网球: "tennis",
  羽毛球: "badminton",
  苹果: "apple",
  西瓜: "watermelon",
  蛋糕: "cake",
  铅笔: "pencil",
  书包: "backpack",
  图画书: "book",
  小汽车: "car",
  小火车: "train",
  自行车: "bicycle",
};

const logicPictureUrls: Record<MathLogicPictureKey, string> = {
  soccer: logicSoccerUrl,
  basketball: logicBasketballUrl,
  volleyball: logicVolleyballUrl,
  tennis: logicTennisUrl,
  badminton: logicBadmintonUrl,
  apple: logicAppleUrl,
  watermelon: logicWatermelonUrl,
  cake: logicCakeUrl,
  pencil: logicPencilUrl,
  backpack: logicBackpackUrl,
  book: logicBookUrl,
  car: logicCarUrl,
  train: logicTrainUrl,
  bicycle: logicBicycleUrl,
};

const LogicPicture = memo(function LogicPicture({ asset }: { asset: MathLogicPictureKey }) {
  return <img className="math-logic-picture" src={logicPictureUrls[asset]} alt={logicPictureLabels[asset]} draggable={false} />;
});

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path d="M16 9c1.4 1.6 1.4 4.4 0 6M18.5 6.5c3.2 3 3.2 8 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogicGrid({
  question,
  values,
  disabled,
  onChange,
}: {
  question: VisualQuestion;
  values: readonly string[];
  disabled: boolean;
  onChange?: (values: string[]) => void;
}) {
  if (question.visual.kind !== "LOGIC_GRID") return null;
  const visual = question.visual;
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const rowAssets = useMemo(
    () => visual.rows.map((row, index) => visual.rowAssets?.[index] ?? logicRowAssetByLabel[row] ?? "chick"),
    [visual.rowAssets, visual.rows],
  );
  const columnAssets = useMemo(
    () => visual.columns.map((column, index) => visual.columnAssets?.[index] ?? logicColumnAssetByLabel[column] ?? "volleyball"),
    [visual.columnAssets, visual.columns],
  );

  useEffect(() => {
    setSpeakingIndex(null);
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [visual.clues]);

  function toggleCell(rowIndex: number, columnIndex: number) {
    if (disabled || !onChange) return;
    const row = visual.rows[rowIndex]!;
    const column = visual.columns[columnIndex]!;
    const value = `${row}-${column}`;
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    const next = values.filter((item) => !item.startsWith(`${row}-`));
    onChange([...next, value]);
  }

  function speakClue(clue: string, index: number) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clue);
    utterance.lang = "zh-CN";
    utterance.rate = 0.78;
    utterance.pitch = 1.05;
    utterance.onend = () => setSpeakingIndex((current) => current === index ? null : current);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="math-logic-model">
      <div
        className="math-logic-clues"
        style={{ gridTemplateRows: `repeat(${visual.clues.length}, minmax(0, 1fr))` }}
        aria-label="题目条件"
      >
        {visual.clues.map((clue, index) => (
          <div className={speakingIndex === index ? "is-speaking" : ""} key={clue}>
            <span>{index + 1}</span>
            <p>{clue}</p>
            <button type="button" disabled={disabled} onClick={() => speakClue(clue, index)} aria-label={`朗读条件${index + 1}`}>
              <SpeakerIcon /><b>朗读</b>
            </button>
          </div>
        ))}
      </div>
      <div className="math-logic-grid" style={{ gridTemplateColumns: `88px repeat(${visual.columns.length}, minmax(82px, 1fr))` }}>
        <span className="math-logic-grid__corner" />
        {columnAssets.map((asset, index) => (
          <div className="math-logic-grid__picture" aria-label={visual.columns[index]} key={visual.columns[index]}>
            <LogicPicture asset={asset} />
          </div>
        ))}
        {visual.rows.flatMap((row, rowIndex) => [
          <div className="math-logic-grid__picture" aria-label={row} key={`${row}-label`}>
            <Sprite asset={rowAssets[rowIndex]!} />
          </div>,
          ...visual.columns.map((column, columnIndex) => {
            const selected = values.includes(`${row}-${column}`);
            return (
              <button
                className={selected ? "is-selected" : ""}
                type="button"
                disabled={disabled}
                aria-label={`${row}选择${column}${selected ? "，已打勾" : ""}`}
                aria-pressed={selected}
                onClick={() => toggleCell(rowIndex, columnIndex)}
                key={`${row}-${column}`}
              >
                <span>{selected ? "✓" : ""}</span>
              </button>
            );
          }),
        ])}
      </div>
    </div>
  );
}

function CubeModel({ cubes, visibleLayers, animatedLayer }: { cubes: readonly CubeCoordinate[]; visibleLayers?: number | null; animatedLayer?: number | null }) {
  const size = 36;
  const originX = 180;
  const originY = 168;
  const { allFaces, viewBox } = useMemo(() => {
    const faces = projectCubeStructure(cubes, { size, originX, originY });
    const allPoints = faces.flatMap((face) => face.points);
    const padding = 12;
    const minX = Math.min(...allPoints.map(([x]) => x)) - padding;
    const minY = Math.min(...allPoints.map(([, y]) => y)) - padding;
    const maxX = Math.max(...allPoints.map(([x]) => x)) + padding;
    const maxY = Math.max(...allPoints.map(([, y]) => y)) + padding;
    return {
      allFaces: faces,
      viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    };
  }, [cubes]);
  const faces = visibleLayers == null
    ? allFaces
    : allFaces.filter((face) => face.z < visibleLayers);

  return (
    <svg className="math-cube-model" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`由 ${cubes.length} 个小正方体组成的立体`}>
      {faces.map(({ key, z, top, left, right }) => (
        <g className={animatedLayer === z ? "cube-layer-drop" : undefined} key={key}>
          <polygon className="cube-top" points={top.map((point) => point.join(",")).join(" ")} />
          <polygon className="cube-left" points={left.map((point) => point.join(",")).join(" ")} />
          <polygon className="cube-right" points={right.map((point) => point.join(",")).join(" ")} />
        </g>
      ))}
    </svg>
  );
}

function MathVisualComponent({
  question,
  cubeVisibleLayers,
  cubeAnimatingLayer,
  values = [],
  activeSlot = 0,
  onSlotSelect,
  disabled = false,
  onChange,
}: MathVisualProps) {
  switch (question.visual.kind) {
    case "NONE":
      return <div className="math-plain-helper">{question.helper}</div>;
    case "ARITHMETIC_LIST":
      return <ArithmeticList question={question} values={values} activeSlot={activeSlot} disabled={disabled} onSlotSelect={onSlotSelect} />;
    case "OBJECT_GROUPS":
      return <ObjectGroups question={question} />;
    case "ABACUS":
      return <Abacus tens={question.visual.tens} ones={question.visual.ones} />;
    case "PLACE_VALUE":
      return <PlaceValue tens={question.visual.tens} ones={question.visual.ones} showLabels={question.visual.showLabels} />;
    case "NUMBER_BOXES":
      return (
        <NumberBoxes
          values={question.visual.values}
          answerValues={values}
          interactive={["N06", "N07"].includes(question.typeId)}
          activeSlot={activeSlot}
          disabled={disabled}
          onSlotSelect={onSlotSelect}
        />
      );
    case "NUMBER_BOND":
      return (
        <NumberBond
          total={question.visual.total}
          parts={question.visual.parts}
          answerValues={["P03", "P04"].includes(question.typeId) ? values : []}
          activeSlot={activeSlot}
          slotLabels={question.response.slotLabels}
          showLines={!(["P03", "P04"].includes(question.typeId))}
          disabled={disabled}
          onSlotSelect={["P03", "P04"].includes(question.typeId) ? onSlotSelect : undefined}
        />
      );
    case "NUMBER_BOND_SET":
      return (
        <NumberBondSet
          bonds={question.visual.bonds}
          answerValues={values}
          activeSlot={activeSlot}
          disabled={disabled}
          onSlotSelect={onSlotSelect}
        />
      );
    case "QUEUE":
      return <Queue question={question} values={values} disabled={disabled} onChange={onChange} />;
    case "COUNT_ADJUST":
      return <CountAdjust question={question} values={values} disabled={disabled} onChange={onChange} />;
    case "ATTRIBUTE_COMPARE":
      return <AttributeCompare question={question} />;
    case "SPATIAL_GRID":
      return <SpatialGrid question={question} />;
    case "LOGIC_GRID":
      return <LogicGrid question={question} values={values} disabled={disabled} onChange={onChange} />;
    case "CUBES":
      return <CubeModel cubes={question.visual.cubes} visibleLayers={cubeVisibleLayers} animatedLayer={cubeAnimatingLayer} />;
  }
}

function sameValues(first: readonly string[] | undefined, second: readonly string[] | undefined) {
  if (first === second) return true;
  const left = first ?? [];
  const right = second ?? [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mathVisualPropsEqual(previous: MathVisualProps, next: MathVisualProps) {
  if (previous.question !== next.question) return false;
  if (previous.cubeVisibleLayers !== next.cubeVisibleLayers || previous.cubeAnimatingLayer !== next.cubeAnimatingLayer) return false;
  if (previous.activeSlot !== next.activeSlot) return false;
  if (!["ARITHMETIC_LIST", "LOGIC_GRID", "QUEUE", "COUNT_ADJUST", "NUMBER_BOXES", "NUMBER_BOND", "NUMBER_BOND_SET"].includes(previous.question.visual.kind)) return true;
  return previous.disabled === next.disabled && sameValues(previous.values, next.values);
}

export const MathVisual = memo(MathVisualComponent, mathVisualPropsEqual);
