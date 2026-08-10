import { MATH_QUESTION_TYPES_BY_ID, type MathQuestionTypeId } from "./question-types.js";

export type MathQuestionCategoryId =
  | "QUANTITY"
  | "PLACE_VALUE"
  | "MEASUREMENT"
  | "CALCULATION"
  | "VISUAL_MODEL"
  | "WORD_PROBLEM"
  | "POSITION"
  | "LOGIC_SPACE";

export type MathQuestionSkillFamily = {
  id: string;
  name: string;
  description: string;
  typeIds: readonly MathQuestionTypeId[];
};

export type MathQuestionCategory = {
  id: MathQuestionCategoryId;
  name: string;
  order: number;
  families: readonly MathQuestionSkillFamily[];
};

/**
 * Curriculum-facing catalogue. The legacy domain on each type remains stable
 * for stored IDs, while this layer is used by parents, worksheet builders and
 * previews to group skills by what the child is actually learning.
 */
export const MATH_QUESTION_CATEGORIES = [
  {
    id: "QUANTITY", name: "数与数量", order: 1, families: [
      { id: "COUNTING", name: "数物计数", description: "普通、容器和结构化计数", typeIds: ["N01", "N02", "N03"] },
      { id: "NUMBER_SEQUENCE", name: "相邻数与数列", description: "相邻数、顺数、倒数和等间隔规律", typeIds: ["N06", "N07"] },
      { id: "NUMBER_COMPARE", name: "数字比较与排序", description: "比较数字大小并把多个数排序", typeIds: ["N08", "N09"] },
      { id: "QUANTITY_COMPARE", name: "数量比较与构造", description: "比较多少、求相差并按要求补画数量", typeIds: ["N10", "N16"] },
    ],
  },
  {
    id: "PLACE_VALUE", name: "数位与表征", order: 2, families: [
      { id: "READ_REPRESENTATION", name: "看图写数", description: "从十捆和单根小棍的图片读写数字", typeIds: ["P01"] },
      { id: "COMPOSE_DECOMPOSE", name: "数的组成与数位意义", description: "沿分支把两位数分成几个十和几个一", typeIds: ["P03"] },
      { id: "PLACE_MEANING", name: "数位条件推理", description: "根据十位和个位条件推理数字", typeIds: ["P07"] },
      { id: "ABACUS", name: "计数器读数与拨数", description: "看珠写数和用珠表示数", typeIds: ["P05", "P06"] },
    ],
  },
  {
    id: "MEASUREMENT", name: "量感比较", order: 3, families: [
      { id: "SIZE", name: "比大小", description: "比较物体整体大小", typeIds: ["N11"] },
      { id: "HEIGHT", name: "比高矮", description: "统一基线比较高矮", typeIds: ["N12"] },
      { id: "LENGTH", name: "比长短", description: "统一起点比较长短", typeIds: ["N13"] },
      { id: "WEIGHT", name: "比轻重", description: "根据跷跷板高低判断轻重", typeIds: ["N14"] },
    ],
  },
  {
    id: "CALCULATION", name: "数的运算", order: 4, families: [
      { id: "CHAIN", name: "连加连减", description: "连续进行两步或多步加减", typeIds: ["C02", "C03"] },
      { id: "OPERATOR", name: "巧填符号", description: "填写加号或减号使等式成立", typeIds: ["C04"] },
      { id: "NUMBER_BOND", name: "数的分与合", description: "整体和两个部分之间的关系", typeIds: ["C05"] },
      { id: "MISSING_EQUATION", name: "算式缺数", description: "根据等式结构填写未知数", typeIds: ["C06"] },
      { id: "RANGE_ARITHMETIC", name: "分段加减", description: "按数的范围练习不进位、不退位、进位和退位", typeIds: ["C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14"] },
    ],
  },
  {
    id: "VISUAL_MODEL", name: "看图建模与列式", order: 5, families: [
      { id: "PART_WHOLE", name: "部分整体列式", description: "两部分、整体和未知部分模型", typeIds: ["V01", "V02", "V06"] },
      { id: "VISUAL_CHAIN", name: "看图连续运算", description: "多组连加或分两次划去", typeIds: ["V03", "V05"] },
      { id: "CROSS_OUT", name: "划去求剩", description: "从整体划去一部分求剩余", typeIds: ["V04"] },
      { id: "FACT_FAMILY", name: "一图四式", description: "两个部分和整体的互逆算式", typeIds: ["V07"] },
    ],
  },
  {
    id: "WORD_PROBLEM", name: "情境应用题", order: 6, families: [
      { id: "COMBINE", name: "合并求总数", description: "两个静态部分合并求整体", typeIds: ["W01"] },
      { id: "CHANGE_RESULT", name: "变化后求结果", description: "增加或减少后求现在数量", typeIds: ["W02", "W03"] },
      { id: "CHANGE_UNKNOWN", name: "求变化量", description: "已知原来和现在反求变化量", typeIds: ["W04"] },
      { id: "PART_UNKNOWN", name: "已知整体求部分", description: "已知整体和一部分求另一部分", typeIds: ["W05"] },
      { id: "DIFFERENCE", name: "比较求相差", description: "求一种比另一种多或少多少", typeIds: ["W06"] },
      { id: "EQUAL_GROUPS", name: "同样多关系", description: "理解同样多后再合并", typeIds: ["W07"] },
      { id: "COMPARE_UNKNOWN", name: "比较关系求未知量", description: "根据相差数求较多量或较少量", typeIds: ["W08"] },
      { id: "START_UNKNOWN", name: "求原有数量", description: "从结果和变化量反求原来数量", typeIds: ["W09"] },
    ],
  },
  {
    id: "POSITION", name: "顺序、方位与位置", order: 7, families: [
      { id: "ORDINAL", name: "第几与反向找对象", description: "从左或右确定名次和对象", typeIds: ["N04", "S01"] },
      { id: "BEFORE_AFTER", name: "前后数量", description: "根据队伍朝向判断前后数量", typeIds: ["N05"] },
      { id: "SELECT_RANGE", name: "按方向圈选", description: "从指定方向圈选连续对象", typeIds: ["N15"] },
      { id: "RELATIVE_POSITION", name: "相对方位", description: "判断一维和二维相对位置", typeIds: ["S05", "S02"] },
    ],
  },
  {
    id: "LOGIC_SPACE", name: "逻辑与立体空间", order: 8, families: [
      { id: "LOGIC_GRID", name: "多条件逻辑", description: "根据多条条件完成逻辑表格", typeIds: ["S03"] },
      { id: "COUNT_CUBES", name: "立体方块", description: "分层数出组合立方体", typeIds: ["S04"] },
    ],
  },
] as const satisfies readonly MathQuestionCategory[];

export function getMathQuestionFamiliesByCategory(categoryId: MathQuestionCategoryId) {
  return MATH_QUESTION_CATEGORIES.find((category) => category.id === categoryId)?.families ?? [];
}

export function getMathQuestionTypesByCategory(categoryId: MathQuestionCategoryId) {
  return getMathQuestionFamiliesByCategory(categoryId).flatMap((family) =>
    family.typeIds.map((typeId) => MATH_QUESTION_TYPES_BY_ID[typeId]),
  );
}

type MathQuestionCategoryEntry = [MathQuestionTypeId, {
  category: (typeof MATH_QUESTION_CATEGORIES)[number];
  family: (typeof MATH_QUESTION_CATEGORIES)[number]["families"][number];
}];

const questionCategoryEntries: MathQuestionCategoryEntry[] = MATH_QUESTION_CATEGORIES.flatMap((category) =>
  category.families.flatMap((family) =>
    family.typeIds.map((typeId) => [typeId, { category, family }] as const),
  ),
).map(([typeId, value]) => [typeId, value] as MathQuestionCategoryEntry);

// Merged IDs stay absent from the picker. Point legacy lookups at their
// canonical family so old saved settings still have a valid category. C01 is
// kept as a compatibility generator, but its one-step exercise was superseded
// by the range/carry-borrow arithmetic family C07-C14.
for (const [legacyId, canonicalId] of [["P02", "P01"], ["P04", "P03"], ["C01", "C07"]] as const) {
  const category = questionCategoryEntries.find(([typeId]) => typeId === canonicalId)?.[1];
  if (category) questionCategoryEntries.push([legacyId as MathQuestionTypeId, category]);
}

export const MATH_QUESTION_CATEGORY_BY_TYPE = Object.fromEntries(
  questionCategoryEntries,
) as Record<MathQuestionTypeId, {
  category: (typeof MATH_QUESTION_CATEGORIES)[number];
  family: (typeof MATH_QUESTION_CATEGORIES)[number]["families"][number];
}>;
