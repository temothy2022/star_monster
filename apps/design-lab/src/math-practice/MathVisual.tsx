import type {
  MathQuestion,
  MathSpriteKey,
} from "@star-monsters/math-practice";
import appleUrl from "@star-monsters/assets/images/math-practice/apple.webp";
import chickUrl from "@star-monsters/assets/images/math-practice/chick.webp";
import pencilUrl from "@star-monsters/assets/images/math-practice/pencil.webp";
import puppyUrl from "@star-monsters/assets/images/math-practice/puppy.webp";

const spriteUrls: Record<MathSpriteKey, string> = {
  apple: appleUrl,
  chick: chickUrl,
  pencil: pencilUrl,
  puppy: puppyUrl,
};

const spriteLabels: Record<MathSpriteKey, string> = {
  apple: "苹果",
  chick: "小鸡",
  pencil: "铅笔",
  puppy: "小狗",
};

type VisualQuestion = Pick<MathQuestion, "visual" | "helper">;

function Sprite({ asset, className = "" }: { asset: MathSpriteKey; className?: string }) {
  return (
    <img
      className={`math-sprite ${className}`}
      src={spriteUrls[asset]}
      alt={spriteLabels[asset]}
      draggable={false}
    />
  );
}

function ObjectGroups({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "OBJECT_GROUPS") return null;
  const { visual } = question;
  const totalObjects = visual.groups.reduce((sum, count) => sum + count, 0);
  const removalStages = visual.crossedOut ?? [];
  const totalRemoved = removalStages.reduce((sum, count) => sum + count, 0);
  let globalIndex = 0;

  return (
    <div className="math-object-model">
      <div className="math-object-groups">
        {visual.groups.map((count, groupIndex) => {
          const groupStart = globalIndex;
          globalIndex += count;
          if (visual.unknownGroupIndex === groupIndex) {
            return (
              <div className="math-object-group math-object-group--unknown" key={groupIndex}>
                <span>?</span>
              </div>
            );
          }
          return (
            <div
              className={`math-object-group${visual.containers ? " math-object-group--container" : ""}`}
              key={groupIndex}
            >
              {Array.from({ length: count }, (_, localIndex) => {
                const itemIndex = groupStart + localIndex;
                const fromEnd = totalObjects - itemIndex;
                const crossed = fromEnd <= totalRemoved;
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
          <strong>一共 {visual.totalLabel} 个</strong>
          <span />
        </div>
      ) : null}
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

function PlaceValue({ tens, ones }: { tens: number; ones: number }) {
  return (
    <div className="math-place-value">
      <div className="math-place-value__section">
        {Array.from({ length: tens }, (_, index) => (
          <div className="math-stick-bundle" key={index}>
            {Array.from({ length: 10 }, (_, stick) => <i key={stick} />)}
            <b />
          </div>
        ))}
        <span>{tens} 个十</span>
      </div>
      <div className="math-place-value__section">
        <div className="math-loose-sticks">
          {Array.from({ length: ones }, (_, index) => <i key={index} />)}
        </div>
        <span>{ones} 个一</span>
      </div>
    </div>
  );
}

function NumberBoxes({ values }: { values: readonly (number | null)[] }) {
  return (
    <div className="math-number-boxes">
      {values.map((value, index) => (
        <span className={value === null ? "math-number-box--missing" : ""} key={index}>
          {value ?? "?"}
        </span>
      ))}
    </div>
  );
}

function NumberBond({ total, parts }: { total: number | null; parts: readonly [number | null, number | null] }) {
  return (
    <svg className="math-number-bond" viewBox="0 0 360 210" role="img" aria-label="数的分与合">
      <path d="M180 84 L95 152 M180 84 L265 152" />
      <rect x="132" y="18" width="96" height="66" rx="16" />
      <rect x="47" y="142" width="96" height="58" rx="16" />
      <rect x="217" y="142" width="96" height="58" rx="16" />
      <text x="180" y="62">{total ?? "?"}</text>
      <text x="95" y="181">{parts[0] ?? "?"}</text>
      <text x="265" y="181">{parts[1] ?? "?"}</text>
    </svg>
  );
}

function Queue({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "QUEUE") return null;
  const { visual } = question;
  return (
    <div className="math-queue-wrap">
      <div className="math-queue">
        {visual.assets.map((asset, index) => (
          <span className="math-queue__item" key={`${asset}-${index}`}>
            {visual.targetIndex === index ? <b aria-label="目标">★</b> : null}
            <Sprite asset={asset} />
            <small>{index + 1}</small>
          </span>
        ))}
      </div>
      {visual.direction ? (
        <div className={`math-direction math-direction--${visual.direction.toLowerCase()}`}>
          <span>{visual.direction === "LEFT" ? "←" : "→"}</span>
          从{visual.direction === "LEFT" ? "左" : "右"}边数
        </div>
      ) : null}
    </div>
  );
}

function AttributeCompare({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "ATTRIBUTE_COMPARE") return null;
  const visual = question.visual;
  return (
    <div className="math-attribute-compare">
      {visual.scales.map((scale, index) => (
        <div key={index}>
          <Sprite asset={visual.asset} className="math-sprite--scaled" />
          <style>{`.math-attribute-compare > div:nth-child(${index + 1}) .math-sprite--scaled{transform:scale(${scale})}`}</style>
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

function LogicGrid({ question }: { question: VisualQuestion }) {
  if (question.visual.kind !== "LOGIC_GRID") return null;
  const visual = question.visual;
  return (
    <div className="math-logic-model">
      <div className="math-logic-grid" style={{ gridTemplateColumns: `1.25fr repeat(${visual.columns.length}, 1fr)` }}>
        <span />
        {visual.columns.map((column) => <strong key={column}>{column}</strong>)}
        {visual.rows.flatMap((row) => [
          <strong key={`${row}-label`}>{row}</strong>,
          ...visual.columns.map((column) => <span key={`${row}-${column}`}>○</span>),
        ])}
      </div>
      <ol>{visual.clues.map((clue) => <li key={clue}>{clue}</li>)}</ol>
    </div>
  );
}

function CubeModel({ cubes, visibleLayers, animatedLayer }: { cubes: readonly [number, number, number][]; visibleLayers?: number | null; animatedLayer?: number | null }) {
  const size = 36;
  const originX = 180;
  const originY = 168;
  const projected = [...cubes].sort((first, second) => {
    const firstDepth = first[0] + first[1] + first[2] * 0.01;
    const secondDepth = second[0] + second[1] + second[2] * 0.01;
    return firstDepth - secondDepth;
  });

  const allFaces = projected.map(([x, y, z], index) => {
    const px = originX + (x - y) * size;
    const py = originY + (x + y) * (size / 2) - z * size;
    const top = [[px, py - size], [px + size, py - size / 2], [px, py], [px - size, py - size / 2]] as const;
    const left = [[px - size, py - size / 2], [px, py], [px, py + size], [px - size, py + size / 2]] as const;
    const right = [[px, py], [px + size, py - size / 2], [px + size, py + size / 2], [px, py + size]] as const;
    return { key: `${x}-${y}-${z}-${index}`, z, top, left, right, points: [...top, ...left, ...right] };
  });
  const faces = visibleLayers == null
    ? allFaces
    : allFaces.filter((face) => face.z < visibleLayers);
  const allPoints = allFaces.flatMap((face) => face.points);
  const padding = 12;
  const minX = Math.min(...allPoints.map(([x]) => x)) - padding;
  const minY = Math.min(...allPoints.map(([, y]) => y)) - padding;
  const maxX = Math.max(...allPoints.map(([x]) => x)) + padding;
  const maxY = Math.max(...allPoints.map(([, y]) => y)) + padding;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

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

export function MathVisual({ question, cubeVisibleLayers, cubeAnimatingLayer }: { question: VisualQuestion; cubeVisibleLayers?: number | null; cubeAnimatingLayer?: number | null }) {
  switch (question.visual.kind) {
    case "NONE":
      return <div className="math-plain-helper">{question.helper}</div>;
    case "OBJECT_GROUPS":
      return <ObjectGroups question={question} />;
    case "ABACUS":
      return <Abacus tens={question.visual.tens} ones={question.visual.ones} />;
    case "PLACE_VALUE":
      return <PlaceValue tens={question.visual.tens} ones={question.visual.ones} />;
    case "NUMBER_BOXES":
      return <NumberBoxes values={question.visual.values} />;
    case "NUMBER_BOND":
      return <NumberBond total={question.visual.total} parts={question.visual.parts} />;
    case "QUEUE":
      return <Queue question={question} />;
    case "ATTRIBUTE_COMPARE":
      return <AttributeCompare question={question} />;
    case "SPATIAL_GRID":
      return <SpatialGrid question={question} />;
    case "LOGIC_GRID":
      return <LogicGrid question={question} />;
    case "CUBES":
      return <CubeModel cubes={question.visual.cubes} visibleLayers={cubeVisibleLayers} animatedLayer={cubeAnimatingLayer} />;
  }
}
