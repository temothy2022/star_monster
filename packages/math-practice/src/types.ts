export const MATH_QUESTION_DOMAINS = [
  { id: "N", name: "数数、数序与比较", order: 1 },
  { id: "P", name: "数的组成、数位与计数器", order: 2 },
  { id: "C", name: "纯符号运算", order: 3 },
  { id: "V", name: "看图列式与图示运算", order: 4 },
  { id: "W", name: "数学应用题", order: 5 },
  { id: "S", name: "方位、空间与逻辑", order: 6 },
] as const;

export type MathQuestionDomainId =
  (typeof MATH_QUESTION_DOMAINS)[number]["id"];

export const MATH_RESPONSE_MODES = [
  { id: "R01", name: "单个数字填空" },
  { id: "R02", name: "多空填数" },
  { id: "R03", name: "填写运算或比较符号" },
  { id: "R04", name: "列算式" },
  { id: "R05", name: "勾选或多选" },
  { id: "R06", name: "圈选或涂色" },
  { id: "R07", name: "画一画" },
  { id: "R08", name: "排序" },
] as const;

export type MathResponseModeId =
  (typeof MATH_RESPONSE_MODES)[number]["id"];

export const MATH_CORE_GENERATOR_IDS = [
  "COUNT_SINGLE_SET",
  "COUNT_GROUPED_CONTAINERS",
  "COUNT_STRUCTURED",
  "ORDINAL_LEFT_RIGHT",
  "POSITION_BEFORE_AFTER",
  "ADJACENT_NUMBERS",
  "NUMBER_SEQUENCE",
  "COMPARE_NUMBERS",
  "ORDER_NUMBERS",
  "COMPARE_QUANTITIES",
  "COMPARE_ATTRIBUTES",
  "COMPARE_HEIGHT",
  "COMPARE_LENGTH",
  "COMPARE_WEIGHT",
  "SELECT_ORDERED_RANGE",
  "CONSTRUCT_QUANTITY",
  "REPRESENTATION_READ_WRITE",
  "PLACE_VALUE_COMPOSE",
  "PLACE_VALUE_DECOMPOSE",
  "PLACE_VALUE_MEANING",
  "ABACUS_READ",
  "ABACUS_BUILD",
  "PLACE_VALUE_REASONING",
  "ONE_STEP_ARITHMETIC",
  "CHAIN_ADDITION",
  "CHAIN_SUBTRACTION",
  "FILL_OPERATOR",
  "NUMBER_BOND",
  "MISSING_NUMBER_EQUATION",
  "PART_WHOLE_TOTAL",
  "PART_WHOLE_MISSING",
  "VISUAL_CHAIN_ADDITION",
  "TAKE_AWAY_REMAINING",
  "VISUAL_CHAIN_SUBTRACTION",
  "BAR_BRACKET_MODEL",
  "FACT_FAMILY_FOUR",
  "SPATIAL_ONE_DIMENSION",
  "SPATIAL_RELATIVE_ONE_DIMENSION",
  "SPATIAL_GRID",
  "LOGIC_GRID",
  "COUNT_CUBES",
  "COMPARISON_UNKNOWN_AMOUNT",
  "START_UNKNOWN",
] as const;

export type MathCoreGeneratorId =
  (typeof MATH_CORE_GENERATOR_IDS)[number];

export type MathDifficulty = 1 | 2 | 3;

export type MathSceneStrategy =
  | "NONE"
  | "PROGRAMMATIC"
  | "SPRITE_COMPOSITION"
  | "PROGRAMMATIC_AND_SPRITES";

export type MathNumberRange =
  | "WITHIN_5"
  | "WITHIN_10"
  | "WITHIN_20"
  | "WITHIN_100"
  | "NON_NUMERIC";

export type MathQuestionTypeDefinition = {
  id: `${MathQuestionDomainId}${number}`;
  slug: string;
  name: string;
  domain: MathQuestionDomainId;
  coreGeneratorId: MathCoreGeneratorId;
  description: string;
  responseModes: readonly MathResponseModeId[];
  sceneStrategy: MathSceneStrategy;
  numberRange: MathNumberRange;
  difficultyRange: readonly [MathDifficulty, MathDifficulty];
  sourceImageNumbers: readonly number[];
  previewFixtureId: string;
};
