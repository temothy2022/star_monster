import {
  MATH_QUESTION_TYPES_BY_ID,
  type MathQuestionTypeId,
} from "./question-types.js";
import type { MathDifficulty } from "./types.js";
import type {
  GenerateMathQuestionInput,
  MathLengthAssetKey,
  MathQuestion,
  MathQuestionResponse,
  MathLogicPictureKey,
  MathSpriteKey,
  MathVisualSpec,
} from "./question-spec.js";

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)]!;
  }

  shuffle<T>(values: readonly T[]) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    }
    return copy;
  }
}

const sprites = ["chick", "puppy", "apple", "pencil", "watermelon", "bear", "duck", "cake"] as const;
const queueSprites = ["chick", "puppy", "bear", "duck"] as const;
const factFamilySprites = ["apple", "watermelon", "bear", "duck", "cake"] as const;

const logicCharacters: readonly { label: string; asset: MathSpriteKey }[] = [
  { label: "小鸡", asset: "chick" },
  { label: "小狗", asset: "puppy" },
  { label: "小熊", asset: "bear" },
  { label: "小鸭", asset: "duck" },
  { label: "西瓜妹妹", asset: "watermelon" },
];

const logicSports: readonly { label: string; asset: MathLogicPictureKey }[] = [
  { label: "足球", asset: "soccer" },
  { label: "篮球", asset: "basketball" },
  { label: "排球", asset: "volleyball" },
  { label: "网球", asset: "tennis" },
  { label: "羽毛球", asset: "badminton" },
];

function rotatingValues<T>(values: readonly T[], offset: number) {
  return values.map((_, index) => values[(offset + index) % values.length]!);
}

const spriteCounters: Record<MathSpriteKey, string> = {
  chick: "只小鸡",
  puppy: "只小狗",
  apple: "个苹果",
  pencil: "支铅笔",
  watermelon: "个西瓜",
  bear: "只小熊",
  duck: "只鸭子",
  cake: "个蛋糕",
};

const spriteNames: Record<MathSpriteKey, string> = {
  chick: "小鸡",
  puppy: "小狗",
  apple: "苹果",
  pencil: "铅笔",
  watermelon: "西瓜",
  bear: "小熊",
  duck: "鸭子",
  cake: "蛋糕",
};

const positionNames = ["左边", "中间", "右边"] as const;

const lengthAssetSets: readonly {
  asset: MathLengthAssetKey;
  label: string;
  longestIndex: 0 | 1 | 2;
}[] = [
  { asset: "rulers", label: "尺子", longestIndex: 0 },
  { asset: "crayons", label: "彩笔", longestIndex: 1 },
  { asset: "ribbons", label: "丝带", longestIndex: 2 },
  { asset: "toothbrushes", label: "牙刷", longestIndex: 0 },
  { asset: "paintbrushes", label: "画笔", longestIndex: 1 },
  { asset: "straws", label: "吸管", longestIndex: 2 },
  { asset: "spoons", label: "勺子", longestIndex: 0 },
];

function factFamilyColumns(count: number, rng: SeededRng) {
  if (count <= 3) return rng.next() > 0.5 ? count : 2;
  return rng.next() > 0.35 ? Math.ceil(count / 2) : count;
}

function numericResponse(slots = 1, maxDigits = 2): MathQuestionResponse {
  return { mode: slots === 1 ? "R01" : "R02", slots, maxDigits };
}

function equationResponse(template: string, slots: number): MathQuestionResponse {
  return { mode: "R04", template, slots, maxDigits: 2 };
}

function optionResponse(
  options: readonly string[],
  mode: "R03" | "R05" | "R06" | "R08" = "R05",
  multiSelect = false,
): MathQuestionResponse {
  return { mode, options, multiSelect };
}

function question(
  input: GenerateMathQuestionInput,
  data: Omit<MathQuestion, "id" | "seed" | "typeId">,
): MathQuestion {
  return {
    id: `${input.typeId}-${input.seed}`,
    seed: input.seed,
    typeId: input.typeId,
    difficulty: input.difficulty,
    ...data,
  };
}

function seededDifficulty(typeId: MathQuestionTypeId, seed: number): MathDifficulty {
  const [minimum, maximum] = MATH_QUESTION_TYPES_BY_ID[typeId].difficultyRange;
  if (minimum === maximum) return minimum;
  const hash = Math.imul(seed ^ typeId.charCodeAt(0) ^ typeId.charCodeAt(2), 2654435761) >>> 0;
  const roll = hash % 100;
  if (minimum === 1 && maximum === 2) return roll < 45 ? 1 : 2;
  if (minimum === 2 && maximum === 3) return roll < 70 ? 2 : 3;
  return roll < 30 ? 1 : roll < 80 ? 2 : 3;
}

function normalizeDifficulty(input: GenerateMathQuestionInput): MathDifficulty {
  const [minimum, maximum] = MATH_QUESTION_TYPES_BY_ID[input.typeId].difficultyRange;
  const requested = input.difficulty ?? seededDifficulty(input.typeId, input.seed);
  return Math.max(minimum, Math.min(maximum, requested)) as MathDifficulty;
}

function compareSymbol(first: number, second: number) {
  return first > second ? ">" : first < second ? "<" : "=";
}

function equationValues(...values: Array<number | string>) {
  return values.map(String);
}

function generateCubeStructure(rng: SeededRng, difficulty: 1 | 2 | 3) {
  const limits = {
    1: { minCount: 3, maxCount: 4, maxX: 1, maxY: 1, maxZ: 1 },
    2: { minCount: 5, maxCount: 7, maxX: 2, maxY: 2, maxZ: 1 },
    3: { minCount: 7, maxCount: 9, maxX: 2, maxY: 2, maxZ: 2 },
  }[difficulty];
  const targetCount = rng.int(limits.minCount, limits.maxCount);
  const cubes: Array<[number, number, number]> = [[0, 0, 0]];
  const keys = new Set(["0,0,0"]);

  while (cubes.length < targetCount) {
    const candidates: Array<[number, number, number]> = [];
    for (const [x, y, z] of cubes) {
      const neighbors: Array<[number, number, number]> = [
        [x + 1, y, z],
        [x - 1, y, z],
        [x, y + 1, z],
        [x, y - 1, z],
        [x, y, z + 1],
      ];
      for (const candidate of neighbors) {
        const [nextX, nextY, nextZ] = candidate;
        const key = candidate.join(",");
        const supported = nextZ === 0 || keys.has(`${nextX},${nextY},${nextZ - 1}`);
        if (
          nextX >= 0 && nextX <= limits.maxX &&
          nextY >= 0 && nextY <= limits.maxY &&
          nextZ >= 0 && nextZ <= limits.maxZ &&
          supported && !keys.has(key) &&
          !candidates.some((item) => item.join(",") === key)
        ) {
          candidates.push(candidate);
        }
      }
    }
    const next = rng.pick(candidates);
    cubes.push(next);
    keys.add(next.join(","));
  }

  return cubes;
}

export function generateMathQuestion(
  input: GenerateMathQuestionInput,
): MathQuestion {
  const difficulty = normalizeDifficulty(input);
  input = { ...input, difficulty };
  const rng = new SeededRng(input.seed + input.typeId.charCodeAt(0) * 997);
  // Consecutive worksheet seeds deliberately rotate the full material library.
  // This keeps counting sheets from becoming a page of almost identical apples
  // while remaining completely deterministic for previews and answer keys.
  const asset = sprites[((input.seed % sprites.length) + sprites.length) % sprites.length]!;
  const a = difficulty === 1 ? rng.int(2, 5)
    : difficulty === 2 ? rng.int(5, 10)
    : rng.int(7, 12);
  const b = difficulty === 1 ? rng.int(1, Math.min(4, 9 - a))
    : difficulty === 2 ? rng.int(2, Math.min(8, 18 - a))
    : rng.int(Math.max(3, 11 - a), Math.min(9, 20 - a));
  const total = a + b;
  const baseVisual: MathVisualSpec = { kind: "NONE" };

  switch (input.typeId) {
    case "N01": {
      const count = difficulty === 1 ? rng.int(3, 8) : rng.int(9, 18);
      return question(input, { prompt: `数一数，一共有多少${spriteCounters[asset]}？`, visual: { kind: "OBJECT_GROUPS", asset, groups: [count] }, response: numericResponse(), answer: { values: [String(count)], display: String(count) }, explanation: `逐个数一数，一共有 ${count} 个。` });
    }
    case "N02": {
      const groupCount = difficulty === 1 ? 3 : difficulty === 2 ? 4 : 5;
      const groups = Array.from({ length: groupCount }, () => rng.int(2, difficulty === 1 ? 5 : difficulty === 2 ? 7 : 9));
      const position = difficulty === 1 ? 2 : rng.int(2, groupCount - 1);
      const targetIndex = position - 1;
      // N02 containers can wrap from a row into several rows on an iPad, phone,
      // or printed page. An absolute left/right prompt would then change meaning
      // with the viewport. The renderer labels every container by its stable
      // reading-order index, so the prompt intentionally refers to that index.
      return question(input, { prompt: `第 ${position} 组里有几个？`, visual: { kind: "OBJECT_GROUPS", asset, groups, containers: true }, response: numericResponse(), answer: { values: [String(groups[targetIndex])], display: String(groups[targetIndex]) }, explanation: `第 ${position} 组里有 ${groups[targetIndex]} 个。` });
    }
    case "N03": {
      const bundle = difficulty === 1 ? 5 : 10;
      const ones = rng.int(1, difficulty === 1 ? 4 : 9);
      return question(input, { prompt: `先按 ${bundle} 个一组，再数一数一共有多少？`, visual: { kind: "OBJECT_GROUPS", asset, groups: [bundle, ones], groupColumns: [difficulty === 1 ? 5 : 5, ones] }, response: numericResponse(), answer: { values: [String(bundle + ones)], display: String(bundle + ones) }, explanation: `${bundle} 个和 ${ones} 个合起来是 ${bundle + ones} 个。` });
    }
    case "N04": {
      const length = difficulty === 1 ? 5 : 7;
      const targetIndex = rng.int(1, length - 2);
      const direction = difficulty === 1 ? "LEFT" : rng.pick(["LEFT", "RIGHT"] as const);
      const position = direction === "LEFT" ? targetIndex + 1 : length - targetIndex;
      return question(input, { prompt: `从${direction === "LEFT" ? "左" : "右"}边数，戴小星星的伙伴排第几？`, visual: { kind: "QUEUE", assets: Array.from({ length }, (_, index) => queueSprites[index % queueSprites.length]!), targetIndex, direction }, response: numericResponse(), answer: { values: [String(position)], display: `第 ${position}` }, explanation: `从${direction === "LEFT" ? "左" : "右"}边开始数，目标排第 ${position}。` });
    }
    case "N05": {
      const length = difficulty === 1 ? 5 : rng.int(6, 8);
      const targetIndex = rng.int(1, length - 2);
      const direction = difficulty === 1 ? "RIGHT" : rng.pick(["LEFT", "RIGHT"] as const);
      const relation = rng.pick(["前面", "后面"] as const);
      const frontCount = direction === "RIGHT" ? length - targetIndex - 1 : targetIndex;
      const behindCount = length - frontCount - 1;
      const count = relation === "前面" ? frontCount : behindCount;
      const offset = rng.int(0, queueSprites.length - 1);
      const assets = Array.from({ length }, (_, index) => queueSprites[(index + offset) % queueSprites.length]!);
      return question(input, {
        prompt: `队伍朝${direction === "RIGHT" ? "右" : "左"}前进，戴星星的伙伴${relation}有几个小伙伴？`,
        visual: { kind: "QUEUE", assets, targetIndex, direction, directionLabel: "队伍前进方向" },
        response: numericResponse(),
        answer: { values: [String(count)], display: String(count) },
        explanation: `沿着前进方向看，戴星星的伙伴${relation}有 ${count} 个小伙伴。`,
      });
    }
    case "N06": {
      const center = difficulty === 1 ? rng.int(2, 8) : rng.int(10, 18);
      const missingIndex = rng.int(0, 2);
      const sequence = [center - 1, center, center + 1];
      const answer = sequence[missingIndex]!;
      return question(input, {
        prompt: "把相邻的数填完整。",
        visual: { kind: "NUMBER_BOXES", values: sequence.map((value, index) => index === missingIndex ? null : value) },
        response: numericResponse(),
        answer: { values: [String(answer)], display: String(answer) },
        explanation: `${sequence.join("、")} 是相邻的三个数。`,
      });
    }
    case "N07": {
      const step = difficulty === 3 ? 2 : 1;
      const direction = difficulty === 1 ? 1 : rng.pick([1, -1] as const);
      const start = direction === 1 ? rng.int(0, 20 - step * 4) : rng.int(step * 4, 20);
      const sequence = Array.from({ length: 5 }, (_, index) => start + direction * step * index);
      const missingIndexes: readonly number[] = difficulty === 1
        ? [rng.pick([1, 2, 3] as const)]
        : rng.pick([[1, 3], [0, 2], [2, 4]] as const);
      const answers = missingIndexes.map((index) => String(sequence[index]!));
      return question(input, {
        prompt: `找规律，把缺少的${missingIndexes.length === 1 ? "数" : "两个数"}填进去。`,
        visual: { kind: "NUMBER_BOXES", values: sequence.map((value, index) => missingIndexes.some((missingIndex) => missingIndex === index) ? null : value) },
        response: numericResponse(missingIndexes.length),
        answer: { values: answers, display: answers.join("，") },
        explanation: `每次${direction === 1 ? "增加" : "减少"} ${step}。`,
      });
    }
    case "N08": {
      const maximum = difficulty === 1 ? 10 : 20;
      const first = rng.int(0, maximum);
      const second = difficulty === 2 && rng.next() < 0.2 ? first : rng.int(0, maximum);
      const answer = compareSymbol(first, second);
      return question(input, { prompt: "比一比，在圆圈里填上正确的符号。", helper: `${first} ○ ${second}`, visual: baseVisual, response: optionResponse([">", "<", "="], "R03"), answer: { values: [answer], display: answer }, explanation: `${first} ${answer} ${second}。` });
    }
    case "N09": {
      const length = difficulty === 1 ? 3 : difficulty === 2 ? 4 : 5;
      const candidates = rng.shuffle(Array.from({ length: 20 }, (_, index) => index + 1)).slice(0, length);
      const sortedNumbers = [...candidates].sort((left, right) => left - right);
      let values = rng.shuffle(sortedNumbers);
      if (values.every((value, index) => value === sortedNumbers[index])) values = [...values].reverse();
      const sorted = sortedNumbers.map(String);
      return question(input, { prompt: "拖动数字，从小到大排好队。", visual: baseVisual, response: optionResponse(values.map(String), "R08"), answer: { values: sorted, display: sorted.join(" < ") }, explanation: `从小到大是 ${sorted.join("、")}。` });
    }
    case "N10": {
      const first = rng.int(3, 7);
      const second = first + rng.int(1, 4);
      if (difficulty === 3) {
        const askMost = rng.next() > 0.5;
        const groups = rng.shuffle([first, second, second + rng.int(1, 3)]);
        const target = askMost ? Math.max(...groups) : Math.min(...groups);
        const answerIndex = groups.indexOf(target);
        const verticalPositions = ["上面", "中间", "下面"] as const;
        return question(input, {
          prompt: `数一数，哪一组${askMost ? "最多" : "最少"}？`,
          visual: { kind: "OBJECT_GROUPS", asset, groups, orientation: "VERTICAL", groupLabels: verticalPositions },
          response: optionResponse(verticalPositions),
          answer: { values: [verticalPositions[answerIndex]!], display: verticalPositions[answerIndex]! },
          explanation: `${verticalPositions[answerIndex]}一组有 ${target} 个，数量${askMost ? "最多" : "最少"}。`,
        });
      }
      if (difficulty === 1) {
        const answer = second > first ? "下面" : "上面";
        return question(input, { prompt: "数一数，哪一组更多？", visual: { kind: "OBJECT_GROUPS", asset, groups: [first, second], orientation: "VERTICAL", groupLabels: ["上面", "下面"] }, response: optionResponse(["上面", "下面"]), answer: { values: [answer], display: answer }, explanation: `上面有 ${first} 个，下面有 ${second} 个，所以${answer}更多。` });
      }
      return question(input, { prompt: "下面一组比上面一组多几个？", visual: { kind: "OBJECT_GROUPS", asset, groups: [first, second], orientation: "VERTICAL", groupLabels: ["上面", "下面"] }, response: numericResponse(), answer: { values: [String(second - first)], display: String(second - first) }, explanation: `${second} - ${first} = ${second - first}，多 ${second - first} 个。` });
    }
    case "N11": {
      const scales = rng.shuffle(difficulty === 1 ? [0.58, 1, 0.78] : [0.72, 1, 0.86]);
      const answerIndex = scales.indexOf(Math.max(...scales));
      const compareAsset = rng.pick(["apple", "cake", "watermelon", "bear"] as const);
      return question(input, {
        prompt: "请选出最大的一个。",
        visual: { kind: "ATTRIBUTE_COMPARE", asset: compareAsset, scales, attribute: "SIZE" },
        response: optionResponse(positionNames),
        answer: { values: [positionNames[answerIndex]!], display: positionNames[answerIndex]! },
        explanation: `${positionNames[answerIndex]}的一个最大。`,
      });
    }
    case "N12": {
      const scales = rng.shuffle(difficulty === 1 ? [0.58, 1, 0.76] : [0.76, 1, 0.86]);
      const answerIndex = scales.indexOf(Math.max(...scales));
      const compareAsset = rng.pick(["bear", "duck", "chick", "puppy"] as const);
      return question(input, {
        prompt: "请选出最高的一个。",
        visual: { kind: "ATTRIBUTE_COMPARE", asset: compareAsset, scales, attribute: "HEIGHT" },
        response: optionResponse(positionNames),
        answer: { values: [positionNames[answerIndex]!], display: positionNames[answerIndex]! },
        explanation: "把物体放在同一条底线上，再比较谁的顶部最高。",
      });
    }
    case "N13": {
      const lengthSet = rng.pick(lengthAssetSets);
      const answer = positionNames[lengthSet.longestIndex]!;
      return question(input, {
        prompt: "请选出最长的一件。",
        visual: { kind: "ATTRIBUTE_COMPARE", asset: "pencil", scales: [1, 1, 1], attribute: "LENGTH", lengthAsset: lengthSet.asset },
        response: optionResponse(positionNames),
        answer: { values: [answer], display: answer },
        explanation: `${answer}的${lengthSet.label}最长。`,
      });
    }
    case "N14": {
      const balance = rng.pick(["LEFT", "RIGHT"] as const);
      const answer = balance === "LEFT" ? "左边" : "右边";
      const weightAssets = rng.shuffle(["bear", "duck", "chick", "puppy", "cake", "watermelon", "apple"] as const).slice(0, 2);
      return question(input, {
        prompt: "看跷跷板，请选出较重的一个。",
        visual: { kind: "ATTRIBUTE_COMPARE", asset: weightAssets[0]!, assets: weightAssets, scales: [1, 1], attribute: "WEIGHT", balance },
        response: optionResponse(["左边", "右边"]),
        answer: { values: [answer], display: answer },
        explanation: "跷跷板较低的一边更重。",
      });
    }
    case "N15": {
      const length = difficulty === 1 ? 6 : 8;
      const selectionCount = difficulty === 1 ? 2 : rng.int(2, 4);
      const direction = difficulty === 1 ? "LEFT" : rng.pick(["LEFT", "RIGHT"] as const);
      const offset = rng.int(0, queueSprites.length - 1);
      const assets = Array.from({ length }, (_, index) => queueSprites[(index + offset) % queueSprites.length]!);
      const indexes = Array.from({ length: selectionCount }, (_, index) => direction === "LEFT" ? index : length - 1 - index).sort((left, right) => left - right);
      const answers = indexes.map((index) => `item-${index}`);
      return question(input, {
        prompt: `从${direction === "LEFT" ? "左" : "右"}边起，圈出 ${selectionCount} 个小伙伴。`,
        visual: { kind: "QUEUE", assets, selectable: true },
        response: { mode: "R06", multiSelect: true, slots: selectionCount },
        answer: { values: answers, display: indexes.map((index) => `第 ${index + 1} 个`).join("、") },
        explanation: `从${direction === "LEFT" ? "左" : "右"}边开始，连续圈出 ${selectionCount} 个。`,
      });
    }
    case "N16": {
      const referenceCount = difficulty === 1 ? rng.int(3, 5) : rng.int(4, 7);
      const difference = difficulty === 1 ? 1 : rng.int(1, 2);
      const relation = referenceCount - difference >= 1 && rng.next() > 0.5 ? "FEWER" : "MORE";
      const targetCount = relation === "MORE" ? referenceCount + difference : referenceCount - difference;
      return question(input, {
        prompt: `点击加号，画出比上面${relation === "MORE" ? "多" : "少"} ${difference} 个的数量。`,
        visual: { kind: "COUNT_ADJUST", asset, referenceCount, relation, difference, maximum: 10 },
        response: { mode: "R07", slots: 1, maxDigits: 2 },
        answer: { values: [String(targetCount)], display: String(targetCount) },
        explanation: `${referenceCount} ${relation === "MORE" ? "+" : "-"} ${difference} = ${targetCount}。`,
      });
    }
    case "P01": {
      const ones = difficulty === 1 ? rng.int(1, 5) : rng.int(6, 9);
      return question(input, { prompt: "看图写数，再读一读。", visual: { kind: "PLACE_VALUE", tens: 1, ones, bundled: true }, response: numericResponse(), answer: { values: [String(10 + ones)], display: `${10 + ones}` }, explanation: `1 个十和 ${ones} 个一组成 ${10 + ones}。` });
    }
    case "P02": {
      const ones = difficulty === 1 ? rng.int(1, 5) : rng.int(6, 9);
      return question(input, { prompt: `1 个十和 ${ones} 个一组成的数是多少？`, visual: { kind: "PLACE_VALUE", tens: 1, ones }, response: numericResponse(), answer: { values: [String(10 + ones)], display: String(10 + ones) }, explanation: `10 + ${ones} = ${10 + ones}。` });
    }
    case "P03": {
      const ones = difficulty === 1 ? rng.int(1, 5) : rng.int(6, 9);
      const value = 10 + ones;
      return question(input, { prompt: `${value} 里面有几个十和几个一？`, visual: { kind: "NUMBER_BOXES", values: [value] }, response: { ...numericResponse(2), slotLabels: ["几个十", "几个一"] }, answer: { values: ["1", String(ones)], display: `1 个十，${ones} 个一` }, explanation: `${value} 由 1 个十和 ${ones} 个一组成。` });
    }
    case "P04": {
      const ones = difficulty === 1 ? rng.int(1, 5) : difficulty === 2 ? rng.int(6, 9) : (rng.next() > 0.5 ? 0 : rng.int(1, 9));
      const tens = difficulty === 3 && ones === 0 ? 2 : 1;
      const value = tens * 10 + ones;
      const askTens = difficulty === 1 ? false : rng.next() > 0.5;
      const digit = askTens ? tens : ones;
      const place = askTens ? "十位" : "个位";
      const unit = askTens ? "十" : "一";
      return question(input, { prompt: `${value} 的${place}上是几？它表示几个${unit}？`, visual: { kind: "NUMBER_BOXES", values: [value] }, response: { ...numericResponse(2), slotLabels: ["数位上的数", `表示几个${unit}`] }, answer: { values: [String(digit), String(digit)], display: `${place}是 ${digit}，表示 ${digit} 个${unit}` }, explanation: `从右边起${askTens ? "第二" : "第一"}位是${place}。` });
    }
    case "P05": {
      const tens = difficulty === 1 ? 0 : (rng.next() > 0.2 ? 1 : 2);
      const ones = tens === 2 ? 0 : rng.int(difficulty === 1 ? 1 : 0, 9);
      const value = tens * 10 + ones;
      return question(input, { prompt: "看计数器，写出这个数。", visual: { kind: "ABACUS", tens, ones }, response: numericResponse(), answer: { values: [String(value)], display: String(value) }, explanation: `十位 ${tens} 颗、个位 ${ones} 颗，表示 ${value}。` });
    }
    case "P06": {
      const beadCount = difficulty === 2 ? 1 : 2;
      const answers = Array.from({ length: beadCount + 1 }, (_, tens) => String(tens * 10 + beadCount - tens));
      const distractors = beadCount === 1 ? ["11", "20"] : ["12"];
      return question(input, { prompt: `把 ${beadCount} 颗珠子放在十位和个位，可以表示哪些数？`, visual: { kind: "ABACUS", tens: 0, ones: 0 }, response: optionResponse(rng.shuffle([...answers, ...distractors]), "R05", true), answer: { values: answers, display: answers.join("、") }, explanation: "把珠子分别放在个位、十位，列出所有不同分法。" });
    }
    case "P07": {
      const ones = rng.int(difficulty === 2 ? 2 : 5, difficulty === 2 ? 5 : 8);
      const value = 10 + ones;
      const afterAdding = difficulty === 3;
      const answer = afterAdding ? value + 1 : value;
      const prompt = afterAdding
        ? `十位上是 1，个位比十位多 ${ones - 1}，再在个位添 1 颗珠子，这个数变成几？`
        : `十位上是 1，个位比十位多 ${ones - 1}，这个数是几？`;
      return question(input, { prompt, visual: { kind: "ABACUS", tens: 1, ones: 0 }, response: optionResponse([String(answer - 1), String(answer), String(answer + 1)]), answer: { values: [String(answer)], display: String(answer) }, explanation: afterAdding ? `先得到 ${value}，个位再添 1 颗后是 ${answer}。` : `个位是 ${ones}，所以这个数是 ${value}。` });
    }
    case "C01": {
      const addition = rng.next() > 0.5;
      const left = addition ? a : total;
      const right = b;
      const result = addition ? total : a;
      const symbol = addition ? "+" : "-";
      return question(input, { prompt: "算一算。", helper: `${left} ${symbol} ${right} = ?`, visual: baseVisual, response: numericResponse(), answer: { values: [String(result)], display: String(result) }, explanation: `${left} ${symbol} ${right} = ${result}。` });
    }
    case "C02": {
      const addendCount = difficulty === 3 ? 4 : 3;
      const maximumTotal = difficulty === 1 ? 10 : difficulty === 2 ? 16 : 20;
      const addends: number[] = [];
      for (let index = 0; index < addendCount; index += 1) {
        const remainingSlots = addendCount - index - 1;
        const used = addends.reduce((sum, value) => sum + value, 0);
        addends.push(rng.int(1, Math.min(difficulty === 1 ? 4 : 6, maximumTotal - used - remainingSlots)));
      }
      const result = addends.reduce((sum, value) => sum + value, 0);
      const helper = `${addends.join(" + ")} = ?`;
      return question(input, { prompt: "连加算一算。", helper, visual: baseVisual, response: numericResponse(), answer: { values: [String(result)], display: String(result) }, explanation: `${addends.join(" + ")} = ${result}。` });
    }
    case "C03": {
      const start = difficulty === 1 ? rng.int(7, 10) : difficulty === 2 ? rng.int(11, 16) : rng.int(17, 20);
      const removalCount = difficulty === 3 ? 3 : 2;
      const removals: number[] = [];
      for (let index = 0; index < removalCount; index += 1) {
        const remaining = start - removals.reduce((sum, value) => sum + value, 0);
        removals.push(rng.int(1, Math.min(difficulty === 1 ? 3 : 5, remaining - (removalCount - index))));
      }
      const result = start - removals.reduce((sum, value) => sum + value, 0);
      const helper = `${start} - ${removals.join(" - ")} = ?`;
      return question(input, { prompt: "连减算一算。", helper, visual: baseVisual, response: numericResponse(), answer: { values: [String(result)], display: String(result) }, explanation: `${start} - ${removals.join(" - ")} = ${result}。` });
    }
    case "C04": {
      const addition = rng.next() > 0.5;
      const helper = addition ? `${a} ○ ${b} = ${total}` : `${total} ○ ${b} = ${a}`;
      const symbol = addition ? "+" : "-";
      return question(input, { prompt: "填上加号或减号，让算式成立。", helper, visual: baseVisual, response: optionResponse(["+", "-"], "R03"), answer: { values: [symbol], display: symbol }, explanation: helper.replace("○", symbol) + "。" });
    }
    case "C05": {
      const askTotal = difficulty === 2 && rng.next() > 0.65;
      return question(input, { prompt: "把数的分与合填完整。", visual: askTotal ? { kind: "NUMBER_BOND", total: null, parts: [a, b] } : { kind: "NUMBER_BOND", total, parts: [a, null] }, response: numericResponse(), answer: { values: [String(askTotal ? total : b)], display: String(askTotal ? total : b) }, explanation: `${a} 和 ${b} 合成 ${total}。` });
    }
    case "C06": {
      if (difficulty === 1) {
        return question(input, { prompt: "把缺少的数填进去。", helper: `${a} + ${b} = □`, visual: baseVisual, response: numericResponse(), answer: { values: [String(total)], display: String(total) }, explanation: `${a} + ${b} = ${total}。` });
      }
      if (difficulty === 2) {
        return question(input, { prompt: "把缺少的数填进去。", helper: `□ + ${b} = ${total}`, visual: baseVisual, response: numericResponse(), answer: { values: [String(a)], display: String(a) }, explanation: `${a} + ${b} = ${total}。` });
      }
      const missingSubtrahend = rng.next() > 0.5;
      const helper = missingSubtrahend ? `${total} - □ = ${a}` : `□ - ${b} = ${a}`;
      return question(input, { prompt: "把缺少的数填进去。", helper, visual: baseVisual, response: numericResponse(), answer: { values: [String(missingSubtrahend ? b : total)], display: String(missingSubtrahend ? b : total) }, explanation: `${total} - ${b} = ${a}。` });
    }
    case "V01":
      return question(input, { prompt: "看图列一道加法算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: `两组合起来，用加法：${a} + ${b} = ${total}。` });
    case "V02":
      return question(input, { prompt: "看图列式，求问号表示的数量。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b], totalLabel: total, unknownGroupIndex: 1 }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: `总数减去已知的一部分：${total} - ${a} = ${b}。` });
    case "V03": {
      const result = difficulty === 1 ? rng.int(6, 10) : difficulty === 2 ? rng.int(11, 16) : rng.int(17, 20);
      const groupMaximum = difficulty === 1 ? 4 : difficulty === 2 ? 7 : 8;
      const first = rng.int(difficulty === 1 ? 2 : difficulty === 2 ? 3 : 5, difficulty === 1 ? 4 : difficulty === 2 ? 6 : 7);
      const secondMinimum = Math.max(1, result - first - groupMaximum);
      const secondMaximum = Math.min(groupMaximum, result - first - 1);
      const second = rng.int(secondMinimum, secondMaximum);
      const groups = rng.shuffle([first, second, result - first - second]);
      const values = groups.flatMap((value, index) => index === groups.length - 1 ? [String(value)] : [String(value), "+"]);
      values.push(String(result));
      const template = groups
        .flatMap((_, index) => index === groups.length - 1 ? [`{${index * 2}}`] : [`{${index * 2}}`, `{${index * 2 + 1}}`])
        .join(" ") + ` = {${groups.length * 2 - 1}}`;
      return question(input, {
        prompt: "看图列一道连加算式。",
        visual: { kind: "OBJECT_GROUPS", asset, groups },
        response: equationResponse(template, groups.length * 2),
        answer: { values, display: `${groups.join(" + ")} = ${result}` },
        explanation: "把三组数量依次相加。",
      });
    }
    case "V04":
      return question(input, { prompt: "看图列一道减法算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [total], crossedOut: [b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` }, explanation: `原有 ${total} 个，划去 ${b} 个，还剩 ${a} 个。` });
    case "V05": {
      const start = difficulty === 2 ? rng.int(9, 14) : rng.int(15, 20);
      const first = rng.int(difficulty === 2 ? 2 : 4, difficulty === 2 ? 4 : 7);
      const second = rng.int(1, Math.min(difficulty === 2 ? 3 : 5, start - first - 1));
      return question(input, { prompt: "看图列一道连减算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [start], crossedOut: [first, second] }, response: equationResponse("{0} {1} {2} {3} {4} = {5}", 6), answer: { values: equationValues(start, "-", first, "-", second, start - first - second), display: `${start} - ${first} - ${second} = ${start - first - second}` }, explanation: "按两次划去的数量连续相减。" });
    }
    case "V06": {
      if (difficulty === 3) {
        return question(input, { prompt: "看括号图，列式求出一共有多少。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: `两个部分合起来：${a} + ${b} = ${total}。` });
      }
      const unknownGroupIndex = difficulty === 1 ? 1 : rng.pick([0, 1] as const);
      const known = unknownGroupIndex === 0 ? b : a;
      const missing = unknownGroupIndex === 0 ? a : b;
      return question(input, { prompt: "看括号图，列式求出问号。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b], totalLabel: total, unknownGroupIndex }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", known, missing), display: `${total} - ${known} = ${missing}` }, explanation: `总数 ${total} 减去已知的一部分 ${known}，得到 ${missing}。` });
    }
    case "V07": {
      const factA = difficulty === 2 ? rng.int(2, 5) : rng.int(2, 7);
      const factB = difficulty === 2
        ? factA
        : rng.pick(Array.from({ length: 10 - factA }, (_, index) => index + 1).filter((value) => value !== factA));
      const factTotal = factA + factB;
      const factAsset = rng.pick(factFamilySprites);
      const rows = factA === factB
        ? [equationValues(factA, "+", factB, factTotal), equationValues(factTotal, "-", factA, factB)]
        : [
            equationValues(factA, "+", factB, factTotal),
            equationValues(factB, "+", factA, factTotal),
            equationValues(factTotal, "-", factA, factB),
            equationValues(factTotal, "-", factB, factA),
          ];
      return question(input, {
        prompt: factA === factB ? "看图填写下面两道算式。" : "看图填写一组一图四式。",
        visual: {
          kind: "OBJECT_GROUPS",
          asset: factAsset,
          groups: [factA, factB],
          groupColumns: [factFamilyColumns(factA, rng), factFamilyColumns(factB, rng)],
        },
        response: {
          mode: "R04",
          slots: rows.length * 4,
          maxDigits: 2,
          equationRows: rows.length,
          equationSlotsPerRow: 4,
        },
        answer: {
          values: rows.flat(),
          display: rows.map((row) => `${row[0]} ${row[1]} ${row[2]} = ${row[3]}`).join("；"),
        },
        explanation: factA === factB
          ? "两部分相同，交换位置后的算式不变，所以只写一道加法和一道减法。"
          : "两个部分可以交换相加，整体减去一部分得到另一部分。",
      });
    }
    case "W01": {
      const storyAsset = rng.pick(["apple", "cake", "pencil", "chick", "duck"] as const);
      return question(input, { prompt: `小鸡有 ${a} ${spriteCounters[storyAsset]}，小狗有 ${b} ${spriteCounters[storyAsset]}，它们一共有多少${spriteCounters[storyAsset]}？`, visual: { kind: "OBJECT_GROUPS", asset: storyAsset, groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: "把两部分合起来，用加法。" });
    }
    case "W02": {
      const storyAsset = rng.pick(["apple", "cake", "pencil"] as const);
      return question(input, { prompt: `盒子里原来有 ${a} ${spriteCounters[storyAsset]}，又放进 ${b} ${spriteCounters[storyAsset]}，现在有多少${spriteCounters[storyAsset]}？`, visual: { kind: "OBJECT_GROUPS", asset: storyAsset, groups: [a, b], containers: true }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: "又增加了一些，用加法。" });
    }
    case "W03": {
      const storyAsset = rng.pick(["chick", "duck", "apple", "cake"] as const);
      const action = storyAsset === "chick" || storyAsset === "duck" ? "离开了" : "拿走了";
      return question(input, { prompt: `原来有 ${total} ${spriteCounters[storyAsset]}，${action} ${b} ${spriteCounters[storyAsset]}，还剩多少${spriteCounters[storyAsset]}？`, visual: { kind: "OBJECT_GROUPS", asset: storyAsset, groups: [total], crossedOut: [b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` }, explanation: "减少了一些，用减法求剩下的数量。" });
    }
    case "W04": {
      if (difficulty === 3) {
        return question(input, { prompt: `小狗原来有 ${total} 支铅笔，用了一些后还剩 ${a} 支，它用了几支？`, visual: { kind: "OBJECT_GROUPS", asset: "pencil", groups: [total], crossedOut: [b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: "用原来的数量减去剩下的数量，求用掉的数量。" });
      }
      return question(input, { prompt: `小狗原来有 ${a} 支铅笔，现在有 ${total} 支，又拿来了几支？`, visual: { kind: "OBJECT_GROUPS", asset: "pencil", groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: "用现在的数量减去原来的数量。" });
    }
    case "W05":
      return question(input, { prompt: `盘子里苹果和梨一共有 ${total} 个，其中苹果有 ${a} 个，梨有几个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [a, b], containers: true, totalLabel: total, unknownGroupIndex: 1 }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: "整体减去已知部分，得到另一部分。" });
    case "W06": {
      const larger = a + b;
      const prompt = difficulty === 3
        ? `小鸡有 ${larger} 个苹果，小狗有 ${a} 个，小狗比小鸡少几个？`
        : `小鸡有 ${larger} 个苹果，小狗有 ${a} 个，小鸡比小狗多几个？`;
      return question(input, { prompt, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [larger, a] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(larger, "-", a, b), display: `${larger} - ${a} = ${b}` }, explanation: "不管问多几个还是少几个，都用大数减小数求相差数量。" });
    }
    case "W07": {
      const equalAmount = difficulty === 2 ? rng.int(2, 5) : rng.int(6, 9);
      return question(input, { prompt: `小鸡摘了 ${equalAmount} 个苹果，小狗摘得和小鸡同样多，它们一共摘了多少个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [equalAmount, equalAmount] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(equalAmount, "+", equalAmount, equalAmount * 2), display: `${equalAmount} + ${equalAmount} = ${equalAmount * 2}` }, explanation: `同样多表示小狗也摘了 ${equalAmount} 个。` });
    }
    case "W08": {
      const askLarger = difficulty === 2 || rng.next() > 0.5;
      const storyAsset = rng.pick(["apple", "cake", "pencil", "chick", "duck"] as const);
      if (askLarger) {
        return question(input, {
          prompt: `小狗有 ${a} ${spriteCounters[storyAsset]}，小鸡比小狗多 ${b} ${spriteCounters[storyAsset]}，小鸡有多少${spriteCounters[storyAsset]}？`,
          visual: { kind: "NONE" },
          response: equationResponse("{0} {1} {2} = {3}", 4),
          answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` },
          explanation: "求较多的数量，用较少量加上相差数。",
        });
      }
      return question(input, {
        prompt: `小鸡有 ${total} ${spriteCounters[storyAsset]}，小鸡比小狗多 ${b} ${spriteCounters[storyAsset]}，小狗有多少${spriteCounters[storyAsset]}？`,
        visual: { kind: "NONE" },
        response: equationResponse("{0} {1} {2} = {3}", 4),
        answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` },
        explanation: "求较少的数量，用较多量减去相差数。",
      });
    }
    case "W09": {
      const additionStory = difficulty === 2 || rng.next() > 0.5;
      const storyAsset = rng.pick(["apple", "cake", "pencil", "chick", "duck"] as const);
      if (additionStory) {
        return question(input, {
          prompt: `盒子里原来有一些${spriteCounters[storyAsset]}，又放进 ${b} ${spriteCounters[storyAsset]}，现在有 ${total} ${spriteCounters[storyAsset]}。原来有多少${spriteCounters[storyAsset]}？`,
          visual: { kind: "NONE" },
          response: equationResponse("{0} {1} {2} = {3}", 4),
          answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` },
          explanation: "用现在的数量减去增加的数量，得到原来的数量。",
        });
      }
      return question(input, {
        prompt: `原来有一些${spriteCounters[storyAsset]}，拿走 ${b} ${spriteCounters[storyAsset]}后还剩 ${a} ${spriteCounters[storyAsset]}。原来有多少${spriteCounters[storyAsset]}？`,
        visual: { kind: "NONE" },
        response: equationResponse("{0} {1} {2} = {3}", 4),
        answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` },
        explanation: "把剩下的数量和拿走的数量合起来，得到原来的数量。",
      });
    }
    case "S01": {
      const length = difficulty === 1 ? 5 : 6;
      const assets = rng.shuffle(["chick", "apple", "puppy", "pencil", "bear", "duck"] as const).slice(0, length);
      const direction = difficulty === 1 ? "LEFT" : rng.pick(["LEFT", "RIGHT"] as const);
      const position = rng.int(2, assets.length - 1);
      const targetIndex = direction === "LEFT" ? position - 1 : assets.length - position;
      const target = assets[targetIndex]!;
      return question(input, { prompt: `从${direction === "LEFT" ? "左" : "右"}边数，第 ${position} 个是什么？`, visual: { kind: "QUEUE", assets, targetIndex, direction }, response: optionResponse(assets.map((item) => spriteNames[item])), answer: { values: [spriteNames[target]], display: spriteNames[target] }, explanation: `从${direction === "LEFT" ? "左" : "右"}边开始数，第 ${position} 个是${spriteNames[target]}。` });
    }
    case "S02": {
      const assets = rng.shuffle(["chick", "apple", "puppy", "pencil", "bear", "duck"] as const);
      const directions = difficulty === 1 ? ["左边", "右边"] as const : ["左边", "右边", "上面", "下面"] as const;
      const answer = rng.pick(directions);
      const target = assets[0]!;
      const anchor = assets[1]!;
      if (difficulty === 3) {
        const cells: (MathSpriteKey | null)[][] = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => null));
        const positions = answer === "左边" ? [[1, 0], [1, 2]]
          : answer === "右边" ? [[1, 2], [1, 0]]
          : answer === "上面" ? [[0, 1], [2, 1]]
          : [[2, 1], [0, 1]];
        cells[positions[0]![0]!]![positions[0]![1]!] = target;
        cells[positions[1]![0]!]![positions[1]![1]!] = anchor;
        [[0, 0], [0, 2], [2, 0], [2, 2]].forEach(([row, column], index) => {
          cells[row!]![column!] = assets[index + 2]!;
        });
        return question(input, { prompt: `${spriteNames[target]}在${spriteNames[anchor]}的哪一边？`, visual: { kind: "SPATIAL_GRID", cells }, response: optionResponse(["左边", "右边", "上面", "下面"]), answer: { values: [answer], display: answer }, explanation: `${spriteNames[target]}在${spriteNames[anchor]}的${answer}。` });
      }
      const cells = answer === "左边" ? [[target, anchor], [assets[2]!, assets[3]!]]
        : answer === "右边" ? [[anchor, target], [assets[2]!, assets[3]!]]
        : answer === "上面" ? [[target, assets[2]!], [anchor, assets[3]!]]
        : [[anchor, assets[2]!], [target, assets[3]!]];
      return question(input, { prompt: `${spriteNames[target]}在${spriteNames[anchor]}的哪一边？`, visual: { kind: "SPATIAL_GRID", cells }, response: optionResponse(directions), answer: { values: [answer], display: answer }, explanation: `${spriteNames[target]}在${spriteNames[anchor]}的${answer}。` });
    }
    case "S03": {
      const scenario = Math.imul(input.seed, 2654435761) >>> 0;
      const allCharacters = rotatingValues(logicCharacters, scenario % logicCharacters.length);
      const sports = rotatingValues(logicSports, Math.floor(scenario / logicCharacters.length) % logicSports.length).slice(0, 3);
      const characters = difficulty === 2 ? allCharacters.slice(0, 4) : allCharacters;
      const assignments = difficulty === 2
        ? [sports[0]!, sports[0]!, sports[1]!, sports[2]!]
        : [sports[0]!, sports[0]!, sports[1]!, sports[1]!, sports[2]!];
      const clues = difficulty === 2 ? [
        `${characters[0]!.label}想玩${sports[0]!.label}。`,
        `${characters[1]!.label}要和${characters[0]!.label}一起玩。`,
        `${characters[2]!.label}想玩${sports[1]!.label}。`,
        `${characters[3]!.label}不玩${sports[0]!.label}和${sports[1]!.label}。`,
      ] : [
        `${characters[0]!.label}想玩${sports[0]!.label}。`,
        `${characters[1]!.label}要和${characters[0]!.label}一起玩。`,
        `${characters[2]!.label}不玩${sports[0]!.label}和${sports[2]!.label}。`,
        `${characters[3]!.label}要和${characters[2]!.label}一起玩。`,
        `${characters[4]!.label}想自己一个人玩。`,
      ];
      const answers = characters.map((character, index) => `${character.label}-${assignments[index].label}`);
      return question(input, {
        prompt: "根据条件，帮每个小伙伴选择一种运动，在表格里打勾。",
        visual: {
          kind: "LOGIC_GRID",
          rows: characters.map((character) => character.label),
          rowAssets: characters.map((character) => character.asset),
          columns: sports.map((sport) => sport.label),
          columnAssets: sports.map((sport) => sport.asset),
          clues,
        },
        response: { mode: "R05", multiSelect: true },
        answer: { values: answers, display: answers.map((value) => value.replace("-", "选")).join("，") },
        explanation: "先确定想玩的运动，再根据一起玩、排除和独自玩的条件完成表格。",
      });
    }
    case "S04": {
      const cubes = generateCubeStructure(rng, difficulty);
      return question(input, { prompt: "数一数，这个立体由几个小正方体组成？", visual: { kind: "CUBES", cubes }, response: numericResponse(), answer: { values: [String(cubes.length)], display: String(cubes.length) }, explanation: `逐层数，一共有 ${cubes.length} 个小正方体。` });
    }
    case "S05": {
      const length = difficulty === 1 ? 5 : 7;
      const offset = rng.int(0, queueSprites.length - 1);
      const assets = Array.from({ length }, (_, index) => queueSprites[(index + offset) % queueSprites.length]!);
      const anchorIndex = rng.int(1, length - 2);
      const targetOnLeft = rng.next() > 0.5;
      const targetIndex = targetOnLeft ? anchorIndex - 1 : anchorIndex + 1;
      const target = assets[targetIndex]!;
      const anchor = assets[anchorIndex]!;
      const answer = targetOnLeft ? "左边" : "右边";
      return question(input, {
        prompt: `${spriteNames[target]}在${spriteNames[anchor]}的哪一边？`,
        visual: { kind: "QUEUE", assets },
        response: optionResponse(["左边", "右边"]),
        answer: { values: [answer], display: answer },
        explanation: `以${spriteNames[anchor]}为参照，${spriteNames[target]}在它的${answer}。`,
      });
    }
  }

  throw new Error(`Unsupported math question type: ${input.typeId}`);
}

export function answerMathQuestion(
  question: MathQuestion,
  values: readonly string[],
) {
  if (question.typeId === "V07") {
    const rowSize = question.response.equationSlotsPerRow ?? 4;
    const normalizeRows = (items: readonly string[]) =>
      Array.from({ length: Math.ceil(items.length / rowSize) }, (_, index) =>
        items.slice(index * rowSize, (index + 1) * rowSize).join("|"),
      ).sort();
    const expected = normalizeRows(question.answer.values);
    const actual = normalizeRows(values);
    return expected.length === actual.length && expected.every((row, index) => row === actual[index]);
  }
  if (question.response.multiSelect) {
    const expected = [...question.answer.values].sort();
    const actual = [...values].sort();
    return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  }
  return question.answer.values.length === values.length &&
    question.answer.values.every((value, index) => value === values[index]);
}

export function generateMathWorksheet(
  typeCounts: Partial<Record<MathQuestionTypeId, number>>,
  seed: number,
) {
  const queues: Array<{ typeId: MathQuestionTypeId; questions: MathQuestion[] }> = [];
  const signatures = new Set<string>();
  let questionSeed = seed;
  for (const [typeId, count] of Object.entries(typeCounts) as Array<[MathQuestionTypeId, number]>) {
    const questions: MathQuestion[] = [];
    for (let index = 0; index < count; index += 1) {
      const difficulty = difficultyForIndex(typeId, index, count, questionSeed);
      let selected: MathQuestion | null = null;
      let lastCandidate: MathQuestion | null = null;
      for (let attempt = 0; attempt < 512; attempt += 1) {
        const candidate = generateMathQuestion({ typeId, seed: questionSeed, difficulty });
        questionSeed += 1;
        lastCandidate = candidate;
        const signature = JSON.stringify([
          candidate.typeId,
          candidate.prompt,
          candidate.helper ?? "",
          candidate.visual,
          candidate.response,
          candidate.answer.values,
        ]);
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        selected = candidate;
        break;
      }
      // Some mathematically finite types can be requested beyond their distinct
      // presentation pool. Preserve the requested count in that exceptional case;
      // normal worksheets always resolve through the de-duplicating path above.
      questions.push(selected ?? lastCandidate!);
    }
    queues.push({ typeId, questions });
  }

  // Randomize the mix of types while keeping each type's own queue in order.
  // Each type therefore keeps its own easy-to-hard progression in a mixed worksheet.
  const orderRng = new SeededRng(seed ^ 0x9e3779b9);
  const cursors = new Map<MathQuestionTypeId, number>();
  const worksheet: MathQuestion[] = [];
  while (worksheet.length < queues.reduce((total, queue) => total + queue.questions.length, 0)) {
    const available = queues.filter((queue) => (cursors.get(queue.typeId) ?? 0) < queue.questions.length);
    const queue = orderRng.pick(available);
    const cursor = cursors.get(queue.typeId) ?? 0;
    worksheet.push(queue.questions[cursor]!);
    cursors.set(queue.typeId, cursor + 1);
  }
  return worksheet;
}

function difficultyForIndex(
  typeId: MathQuestionTypeId,
  index: number,
  count: number,
  seed: number,
): MathDifficulty {
  const [minimum, maximum] = MATH_QUESTION_TYPES_BY_ID[typeId].difficultyRange;
  if (minimum === maximum) return minimum;
  if (count <= 1) return seededDifficulty(typeId, seed);
  if (count === 2) return index === 0 ? minimum : maximum;
  if (count === 3) {
    if (minimum === 1 && maximum === 3) return (index + 1) as MathDifficulty;
    return index === 0 ? minimum : maximum;
  }
  if (minimum === 1 && maximum === 2) {
    const easyCount = Math.max(1, Math.round(count * 0.45));
    return index < easyCount ? 1 : 2;
  }
  if (minimum === 2 && maximum === 3) {
    const hardCount = Math.max(1, Math.round(count * 0.3));
    return index >= count - hardCount ? 3 : 2;
  }
  const easyCount = Math.max(1, Math.round(count * 0.3));
  const hardCount = Math.max(1, Math.round(count * 0.2));
  if (index < easyCount) return 1;
  if (index >= count - hardCount) return 3;
  return 2;
}
