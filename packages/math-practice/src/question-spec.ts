import type { MathQuestionTypeId } from "./question-types.js";
import type { MathDifficulty, MathResponseModeId } from "./types.js";

export type MathSpriteKey =
  | "chick"
  | "puppy"
  | "apple"
  | "pencil"
  | "watermelon"
  | "bear"
  | "duck"
  | "cake";

export type MathLogicPictureKey =
  | "soccer"
  | "basketball"
  | "volleyball"
  | "tennis"
  | "badminton"
  | "apple"
  | "watermelon"
  | "cake"
  | "pencil"
  | "backpack"
  | "book"
  | "car"
  | "train"
  | "bicycle";

export type MathArithmeticToken = number | "+" | "-" | "=" | { kind: "BLANK"; placeholder?: string };

export type MathLengthAssetKey =
  | "rulers"
  | "crayons"
  | "ribbons"
  | "toothbrushes"
  | "paintbrushes"
  | "straws"
  | "spoons";

export type MathVisualSpec =
  | { kind: "NONE" }
  | {
      kind: "ARITHMETIC_LIST";
      items: readonly {
        tokens: readonly MathArithmeticToken[];
      }[];
    }
  | {
      kind: "OBJECT_GROUPS";
      asset: MathSpriteKey;
      groups: readonly number[];
      groupColumns?: readonly number[];
      groupLabels?: readonly string[];
      orientation?: "HORIZONTAL" | "VERTICAL";
      containers?: boolean;
      crossedOut?: readonly number[];
      totalLabel?: number;
      unknownGroupIndex?: number;
    }
  | { kind: "ABACUS"; tens: number; ones: number }
  | { kind: "PLACE_VALUE"; tens: number; ones: number; bundled?: boolean; showLabels?: boolean }
  | { kind: "NUMBER_BOXES"; values: readonly (number | null)[] }
  | {
      kind: "NUMBER_BOND";
      total: number | null;
      parts: readonly [number | null, number | null];
    }
  | {
      kind: "QUEUE";
      assets: readonly MathSpriteKey[];
      targetIndex?: number;
      direction?: "LEFT" | "RIGHT";
      directionLabel?: string;
      /** Show reading-order badges under non-selectable queue items. */
      showIndices?: boolean;
      selectable?: boolean;
    }
  | {
      kind: "COUNT_ADJUST";
      asset: MathSpriteKey;
      referenceCount: number;
      relation: "MORE" | "FEWER";
      difference: number;
      maximum: number;
    }
  | {
      kind: "ATTRIBUTE_COMPARE";
      asset: MathSpriteKey;
      assets?: readonly MathSpriteKey[];
      scales: readonly number[];
      attribute?: "SIZE" | "HEIGHT" | "LENGTH" | "WEIGHT";
      balance?: "LEFT" | "RIGHT" | "EQUAL";
      balanceType?: "SEESAW" | "SCALE";
      weights?: readonly [number, number];
      lengthAsset?: MathLengthAssetKey;
      lengthOrientation?: "HORIZONTAL" | "VERTICAL";
    }
  | {
      kind: "SPATIAL_GRID";
      cells: readonly (MathSpriteKey | null)[][];
    }
  | {
      kind: "LOGIC_GRID";
      rows: readonly string[];
      rowAssets?: readonly MathSpriteKey[];
      columns: readonly string[];
      columnAssets?: readonly MathLogicPictureKey[];
      clues: readonly string[];
    }
  | {
      kind: "CUBES";
      cubes: readonly [x: number, y: number, z: number][];
    };

export type MathQuestionResponse = {
  mode: MathResponseModeId;
  template?: string;
  slots?: number;
  maxDigits?: number;
  options?: readonly string[];
  multiSelect?: boolean;
  equationRows?: number;
  equationSlotsPerRow?: number;
  slotLabels?: readonly string[];
};

export type MathQuestionAnswer = {
  values: readonly string[];
  display: string;
};

export type MathQuestion = {
  id: string;
  seed: number;
  typeId: MathQuestionTypeId;
  difficulty?: MathDifficulty;
  prompt: string;
  helper?: string;
  visual: MathVisualSpec;
  response: MathQuestionResponse;
  answer: MathQuestionAnswer;
  explanation: string;
};

export type GenerateMathQuestionInput = {
  typeId: MathQuestionTypeId;
  seed: number;
  difficulty?: MathDifficulty;
  /** Number of independent arithmetic exercises shown in one question card. */
  itemsPerQuestion?: number;
};
