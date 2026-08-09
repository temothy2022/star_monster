import type { MathQuestionTypeId } from "./question-types.js";
import type {
  GenerateMathQuestionInput,
  MathQuestion,
  MathQuestionResponse,
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

const sprites = ["chick", "puppy", "apple", "pencil"] as const;

const spriteCounters: Record<MathSpriteKey, string> = {
  chick: "只小鸡",
  puppy: "只小狗",
  apple: "个苹果",
  pencil: "支铅笔",
};

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
    ...data,
  };
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
  const rng = new SeededRng(input.seed + input.typeId.charCodeAt(0) * 997);
  const asset = rng.pick(sprites);
  const a = rng.int(2, 6);
  const b = rng.int(1, 5);
  const total = a + b;
  const baseVisual: MathVisualSpec = { kind: "NONE" };

  switch (input.typeId) {
    case "N01": {
      const count = rng.int(4, 15);
      return question(input, { prompt: `数一数，一共有多少${spriteCounters[asset]}？`, visual: { kind: "OBJECT_GROUPS", asset, groups: [count] }, response: numericResponse(), answer: { values: [String(count)], display: String(count) }, explanation: `逐个数一数，一共有 ${count} 个。` });
    }
    case "N02": {
      const groups = [rng.int(2, 5), rng.int(4, 8), rng.int(2, 6)];
      return question(input, { prompt: "从左边数，第 2 个小盘子里有几个？", visual: { kind: "OBJECT_GROUPS", asset, groups, containers: true }, response: numericResponse(), answer: { values: [String(groups[1])], display: String(groups[1]) }, explanation: `第 2 个盘子里有 ${groups[1]} 个。` });
    }
    case "N03": {
      const ones = rng.int(2, 8);
      return question(input, { prompt: "按十个一组数一数，一共有多少？", visual: { kind: "OBJECT_GROUPS", asset, groups: [10, ones], containers: true }, response: numericResponse(), answer: { values: [String(10 + ones)], display: String(10 + ones) }, explanation: `10 个和 ${ones} 个合起来是 ${10 + ones} 个。` });
    }
    case "N04": {
      const length = 7;
      const targetIndex = rng.int(1, 5);
      const direction = rng.pick(["LEFT", "RIGHT"] as const);
      const position = direction === "LEFT" ? targetIndex + 1 : length - targetIndex;
      return question(input, { prompt: `从${direction === "LEFT" ? "左" : "右"}边数，戴小星星的伙伴排第几？`, visual: { kind: "QUEUE", assets: Array.from({ length }, (_, index) => sprites[index % sprites.length]!), targetIndex, direction }, response: numericResponse(), answer: { values: [String(position)], display: `第 ${position}` }, explanation: `从${direction === "LEFT" ? "左" : "右"}边开始数，目标排第 ${position}。` });
    }
    case "N05": {
      const length = 7;
      const targetIndex = 2;
      const behind = length - targetIndex - 1;
      return question(input, { prompt: "小狗后面还有几个小伙伴？", helper: "队伍朝右边前进。", visual: { kind: "QUEUE", assets: ["chick", "apple", "puppy", "pencil", "chick", "apple", "pencil"], targetIndex, direction: "RIGHT" }, response: numericResponse(), answer: { values: [String(behind)], display: String(behind) }, explanation: `小狗后面还有 ${behind} 个小伙伴。` });
    }
    case "N06": {
      const center = rng.int(2, 18);
      return question(input, { prompt: "把相邻的数填完整。", visual: { kind: "NUMBER_BOXES", values: [center - 1, null, center + 1] }, response: numericResponse(), answer: { values: [String(center)], display: String(center) }, explanation: `${center - 1}、${center}、${center + 1} 是相邻的三个数。` });
    }
    case "N07": {
      const start = rng.int(1, 12);
      return question(input, { prompt: "找规律，把缺少的两个数填进去。", visual: { kind: "NUMBER_BOXES", values: [start, null, start + 2, null, start + 4] }, response: numericResponse(2), answer: { values: [String(start + 1), String(start + 3)], display: `${start + 1}，${start + 3}` }, explanation: "每次增加 1。" });
    }
    case "N08": {
      const first = rng.int(0, 20);
      const second = rng.int(0, 20);
      const answer = compareSymbol(first, second);
      return question(input, { prompt: "比一比，在圆圈里填上正确的符号。", helper: `${first} ○ ${second}`, visual: baseVisual, response: optionResponse([">", "<", "="], "R03"), answer: { values: [answer], display: answer }, explanation: `${first} ${answer} ${second}。` });
    }
    case "N09": {
      const values = rng.shuffle([rng.int(1, 5), rng.int(6, 10), rng.int(11, 15), rng.int(16, 20)]);
      const sorted = [...values].sort((x, y) => x - y).map(String);
      return question(input, { prompt: "把数字从小到大排好队。", helper: values.join("、"), visual: baseVisual, response: optionResponse(values.map(String), "R08"), answer: { values: sorted, display: sorted.join(" < ") }, explanation: `从小到大是 ${sorted.join("、")}。` });
    }
    case "N10": {
      const first = rng.int(3, 7);
      const second = first + rng.int(1, 4);
      return question(input, { prompt: "下面一组比上面一组多几个？", visual: { kind: "OBJECT_GROUPS", asset, groups: [first, second] }, response: numericResponse(), answer: { values: [String(second - first)], display: String(second - first) }, explanation: `${second} - ${first} = ${second - first}，多 ${second - first} 个。` });
    }
    case "N11": {
      return question(input, { prompt: "请选出最大的一个。", visual: { kind: "ATTRIBUTE_COMPARE", asset: "apple", scales: [0.72, 1, 0.84] }, response: optionResponse(["左边", "中间", "右边"]), answer: { values: ["中间"], display: "中间" }, explanation: "中间的苹果最大。" });
    }
    case "P01": {
      const ones = rng.int(1, 9);
      return question(input, { prompt: "看图写数，再读一读。", visual: { kind: "PLACE_VALUE", tens: 1, ones, bundled: true }, response: numericResponse(), answer: { values: [String(10 + ones)], display: `${10 + ones}` }, explanation: `1 个十和 ${ones} 个一组成 ${10 + ones}。` });
    }
    case "P02": {
      const ones = rng.int(1, 9);
      return question(input, { prompt: `1 个十和 ${ones} 个一组成的数是多少？`, visual: { kind: "PLACE_VALUE", tens: 1, ones }, response: numericResponse(), answer: { values: [String(10 + ones)], display: String(10 + ones) }, explanation: `10 + ${ones} = ${10 + ones}。` });
    }
    case "P03": {
      const ones = rng.int(1, 9);
      const value = 10 + ones;
      return question(input, { prompt: `${value} 里面有几个十和几个一？`, visual: { kind: "NUMBER_BOXES", values: [value] }, response: numericResponse(2), answer: { values: ["1", String(ones)], display: `1 个十，${ones} 个一` }, explanation: `${value} 由 1 个十和 ${ones} 个一组成。` });
    }
    case "P04": {
      const ones = rng.int(1, 9);
      const value = 10 + ones;
      return question(input, { prompt: `${value} 的十位上是几？它表示几个十？`, visual: { kind: "NUMBER_BOXES", values: [value] }, response: numericResponse(2), answer: { values: ["1", "1"], display: "十位是 1，表示 1 个十" }, explanation: "从右边起第二位是十位。" });
    }
    case "P05": {
      const ones = rng.int(0, 9);
      return question(input, { prompt: "看计数器，写出这个数。", visual: { kind: "ABACUS", tens: 1, ones }, response: numericResponse(), answer: { values: [String(10 + ones)], display: String(10 + ones) }, explanation: `十位 1 颗、个位 ${ones} 颗，表示 ${10 + ones}。` });
    }
    case "P06": {
      return question(input, { prompt: "用 2 颗珠子可以表示哪些数？", visual: { kind: "ABACUS", tens: 0, ones: 0 }, response: optionResponse(["2", "11", "20", "12"], "R05", true), answer: { values: ["2", "11", "20"], display: "2、11、20" }, explanation: "两颗珠子可全在个位、各放一颗，或全在十位。" });
    }
    case "P07": {
      const ones = rng.int(1, 8);
      const value = 10 + ones;
      return question(input, { prompt: `十位上是 1，个位比十位多 ${ones - 1}，这个数是几？`, visual: { kind: "ABACUS", tens: 1, ones: 0 }, response: optionResponse([String(value - 1), String(value), String(value + 1)]), answer: { values: [String(value)], display: String(value) }, explanation: `个位是 ${ones}，所以这个数是 ${value}。` });
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
      const c = rng.int(1, 4);
      return question(input, { prompt: "连加算一算。", helper: `${a} + ${b} + ${c} = ?`, visual: baseVisual, response: numericResponse(), answer: { values: [String(a + b + c)], display: String(a + b + c) }, explanation: `${a} + ${b} + ${c} = ${a + b + c}。` });
    }
    case "C03": {
      const start = rng.int(9, 16);
      const first = rng.int(1, 4);
      const second = rng.int(1, Math.min(4, start - first));
      return question(input, { prompt: "连减算一算。", helper: `${start} - ${first} - ${second} = ?`, visual: baseVisual, response: numericResponse(), answer: { values: [String(start - first - second)], display: String(start - first - second) }, explanation: `${start} - ${first} - ${second} = ${start - first - second}。` });
    }
    case "C04": {
      return question(input, { prompt: "填上加号或减号，让算式成立。", helper: `${total} ○ ${b} = ${a}`, visual: baseVisual, response: optionResponse(["+", "-"], "R03"), answer: { values: ["-"], display: "-" }, explanation: `${total} - ${b} = ${a}。` });
    }
    case "C05": {
      return question(input, { prompt: "把数的分与合填完整。", visual: { kind: "NUMBER_BOND", total, parts: [a, null] }, response: numericResponse(), answer: { values: [String(b)], display: String(b) }, explanation: `${a} 和 ${b} 合成 ${total}。` });
    }
    case "C06": {
      return question(input, { prompt: "把缺少的数填进去。", helper: `□ + ${b} = ${total}`, visual: baseVisual, response: numericResponse(), answer: { values: [String(a)], display: String(a) }, explanation: `${a} + ${b} = ${total}。` });
    }
    case "V01":
      return question(input, { prompt: "看图列一道加法算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: `两组合起来，用加法：${a} + ${b} = ${total}。` });
    case "V02":
      return question(input, { prompt: "看图列式，求问号表示的数量。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b], totalLabel: total, unknownGroupIndex: 1 }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: `总数减去已知的一部分：${total} - ${a} = ${b}。` });
    case "V03": {
      const c = rng.int(1, 4);
      return question(input, { prompt: "看图列一道连加算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b, c] }, response: equationResponse("{0} {1} {2} {3} {4} = {5}", 6), answer: { values: equationValues(a, "+", b, "+", c, a + b + c), display: `${a} + ${b} + ${c} = ${a + b + c}` }, explanation: "把三组数量依次相加。" });
    }
    case "V04":
      return question(input, { prompt: "看图列一道减法算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [total], crossedOut: [b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` }, explanation: `原有 ${total} 个，划去 ${b} 个，还剩 ${a} 个。` });
    case "V05": {
      const start = rng.int(9, 15);
      const first = rng.int(2, 4);
      const second = rng.int(1, 3);
      return question(input, { prompt: "看图列一道连减算式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [start], crossedOut: [first, second] }, response: equationResponse("{0} {1} {2} {3} {4} = {5}", 6), answer: { values: equationValues(start, "-", first, "-", second, start - first - second), display: `${start} - ${first} - ${second} = ${start - first - second}` }, explanation: "按两次划去的数量连续相减。" });
    }
    case "V06":
      return question(input, { prompt: "看括号图，问号是多少？", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b], totalLabel: total, unknownGroupIndex: 0 }, response: numericResponse(), answer: { values: [String(a)], display: String(a) }, explanation: `总数 ${total} 减去另一部分 ${b}，得到 ${a}。` });
    case "V07":
      return question(input, { prompt: "根据这幅图，说出一组一图四式。", visual: { kind: "OBJECT_GROUPS", asset, groups: [a, b], totalLabel: total }, response: optionResponse([`${a}+${b}=${total}`, `${b}+${a}=${total}`, `${total}-${a}=${b}`, `${total}-${b}=${a}`], "R05", true), answer: { values: [`${a}+${b}=${total}`, `${b}+${a}=${total}`, `${total}-${a}=${b}`, `${total}-${b}=${a}`], display: "两道加法和两道减法" }, explanation: "两个部分可以交换相加，整体减去一部分得到另一部分。" });
    case "W01":
      return question(input, { prompt: `小鸡有 ${a} 个苹果，小狗有 ${b} 个苹果，它们一共有多少个苹果？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: "把两部分合起来，用加法。" });
    case "W02":
      return question(input, { prompt: `篮子里原来有 ${a} 个苹果，又放进 ${b} 个，现在有多少个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [a, b], containers: true }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", b, total), display: `${a} + ${b} = ${total}` }, explanation: "又增加了一些，用加法。" });
    case "W03":
      return question(input, { prompt: `草地上原来有 ${total} 只小鸡，跑走了 ${b} 只，还剩多少只？`, visual: { kind: "OBJECT_GROUPS", asset: "chick", groups: [total], crossedOut: [b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", b, a), display: `${total} - ${b} = ${a}` }, explanation: "跑走了一些，用减法求剩下的数量。" });
    case "W04":
      return question(input, { prompt: `小狗原来有 ${a} 支铅笔，现在有 ${total} 支，又拿来了几支？`, visual: { kind: "OBJECT_GROUPS", asset: "pencil", groups: [a, b] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: "用现在的数量减去原来的数量。" });
    case "W05":
      return question(input, { prompt: `盘子里苹果和梨一共有 ${total} 个，其中苹果有 ${a} 个，梨有几个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [a, b], containers: true, totalLabel: total, unknownGroupIndex: 1 }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(total, "-", a, b), display: `${total} - ${a} = ${b}` }, explanation: "整体减去已知部分，得到另一部分。" });
    case "W06": {
      const larger = a + b;
      return question(input, { prompt: `小鸡有 ${larger} 个苹果，小狗有 ${a} 个，小鸡比小狗多几个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [larger, a] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(larger, "-", a, b), display: `${larger} - ${a} = ${b}` }, explanation: "求相差多少，用大数减小数。" });
    }
    case "W07":
      return question(input, { prompt: `小鸡摘了 ${a} 个苹果，小狗摘得和小鸡同样多，它们一共摘了多少个？`, visual: { kind: "OBJECT_GROUPS", asset: "apple", groups: [a, a] }, response: equationResponse("{0} {1} {2} = {3}", 4), answer: { values: equationValues(a, "+", a, a * 2), display: `${a} + ${a} = ${a * 2}` }, explanation: `同样多表示小狗也摘了 ${a} 个。` });
    case "S01":
      return question(input, { prompt: "从左边数，请找出第 3 个小伙伴。", visual: { kind: "QUEUE", assets: ["chick", "apple", "puppy", "pencil", "chick"], direction: "LEFT" }, response: optionResponse(["小鸡", "苹果", "小狗", "铅笔"]), answer: { values: ["小狗"], display: "小狗" }, explanation: "从左边开始数，第 3 个是小狗。" });
    case "S02":
      return question(input, { prompt: "小狗在小鸡的哪一边？", visual: { kind: "SPATIAL_GRID", cells: [["apple", "chick"], ["pencil", "puppy"]] }, response: optionResponse(["左边", "右边", "上面", "下面"]), answer: { values: ["下面"], display: "下面" }, explanation: "小狗在小鸡的下面。" });
    case "S03":
      return question(input, { prompt: "根据提示，给小朋友选择喜欢的运动。", visual: { kind: "LOGIC_GRID", rows: ["小鸡", "小狗", "苹果妹妹"], columns: ["皮球", "足球", "篮球"], clues: ["小鸡想玩足球。", "小狗不玩足球和篮球。", "苹果妹妹不玩皮球。"] }, response: optionResponse(["小鸡-足球", "小狗-皮球", "苹果妹妹-篮球"], "R05", true), answer: { values: ["小鸡-足球", "小狗-皮球", "苹果妹妹-篮球"], display: "三项全部匹配" }, explanation: "逐条排除后，每位小朋友只有一个选择。" });
    case "S04": {
      const difficulty = input.difficulty ?? (rng.int(1, 3) as 1 | 2 | 3);
      const cubes = generateCubeStructure(rng, difficulty);
      return question(input, { difficulty, prompt: "数一数，这个立体由几个小正方体组成？", visual: { kind: "CUBES", cubes }, response: numericResponse(), answer: { values: [String(cubes.length)], display: String(cubes.length) }, explanation: `逐层数，一共有 ${cubes.length} 个小正方体。` });
    }
  }

  throw new Error(`Unsupported math question type: ${input.typeId}`);
}

export function answerMathQuestion(
  question: MathQuestion,
  values: readonly string[],
) {
  if (question.response.mode === "R05" && question.response.multiSelect) {
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
  let questionSeed = seed;
  for (const [typeId, count] of Object.entries(typeCounts) as Array<[MathQuestionTypeId, number]>) {
    const questions: MathQuestion[] = [];
    for (let index = 0; index < count; index += 1) {
      const difficulty = typeId === "S04" ? cubeDifficultyForIndex(index, count) : undefined;
      questions.push(generateMathQuestion({ typeId, seed: questionSeed, difficulty }));
      questionSeed += 1;
    }
    queues.push({ typeId, questions });
  }

  // Randomize the mix of types while keeping each type's own queue in order.
  // This lets S04 progress from easy to medium to hard even in a mixed worksheet.
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

function cubeDifficultyForIndex(index: number, count: number): 1 | 2 | 3 {
  if (count <= 1) return 2;
  if (count === 2) return index === 0 ? 1 : 2;
  if (count === 3) return (index + 1) as 1 | 2 | 3;
  const easyCount = Math.max(1, Math.round(count * 0.3));
  const hardCount = Math.max(1, Math.round(count * 0.2));
  if (index < easyCount) return 1;
  if (index >= count - hardCount) return 3;
  return 2;
}
