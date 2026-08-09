import type { MathQuestionTypeId } from "./question-types.js";
import type { MathDifficulty, MathResponseModeId } from "./types.js";

export type MathSpriteKey = "chick" | "puppy" | "apple" | "pencil";

export type MathVisualSpec =
  | { kind: "NONE" }
  | {
      kind: "OBJECT_GROUPS";
      asset: MathSpriteKey;
      groups: readonly number[];
      containers?: boolean;
      crossedOut?: readonly number[];
      totalLabel?: number;
      unknownGroupIndex?: number;
    }
  | { kind: "ABACUS"; tens: number; ones: number }
  | { kind: "PLACE_VALUE"; tens: number; ones: number; bundled?: boolean }
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
    }
  | {
      kind: "ATTRIBUTE_COMPARE";
      asset: MathSpriteKey;
      scales: readonly number[];
      balance?: "LEFT" | "RIGHT" | "EQUAL";
    }
  | {
      kind: "SPATIAL_GRID";
      cells: readonly (MathSpriteKey | null)[][];
    }
  | {
      kind: "LOGIC_GRID";
      rows: readonly string[];
      columns: readonly string[];
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
};
