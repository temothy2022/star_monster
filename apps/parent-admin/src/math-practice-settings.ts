import {
  MATH_QUESTION_CATEGORIES,
  getMathQuestionTypesByCategory,
} from "@star-monsters/math-practice";
import type { MathPracticeSettings } from "./api";

export const DEFAULT_MATH_PRACTICE_SETTINGS: MathPracticeSettings = {
  totalQuestions: 10,
  typeCounts: {
    N01: 2,
    C01: 2,
    V01: 2,
    V04: 1,
    W01: 1,
    W03: 1,
    S04: 1,
  },
  arithmeticItemsPerQuestion: Object.fromEntries(["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14"].map((typeId) => [typeId, 5])),
};

const MATH_TYPE_IDS = MATH_QUESTION_CATEGORIES.flatMap((domain) =>
  getMathQuestionTypesByCategory(domain.id).map((type) => type.id),
);
const MATH_TYPE_ID_SET = new Set<string>(MATH_TYPE_IDS);

export const MATH_PRACTICE_PRESETS = [
  { id: "balanced", name: "综合均衡", description: "数感、计算、看图、应用和空间都会练到", typeIds: ["N01", "N04", "P01", "C01", "C02", "V01", "V04", "W01", "W03", "S04"] },
  { id: "number-sense", name: "数感数序", description: "数数、顺序、相邻数、比较和数位", typeIds: ["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N15", "N16", "P01", "P05"] },
  { id: "calculation", name: "计算专项", description: "加减法、连加连减、填符号和分与合", typeIds: ["C01", "C02", "C03", "C04", "C05", "C06", "V01", "V02", "V03", "V04"] },
  { id: "picture-equations", name: "看图列式", description: "根据图意理解加、减和一图四式", typeIds: ["V01", "V02", "V03", "V04", "V05", "V06", "V07"] },
  { id: "word-problems", name: "应用题", description: "合并、剩余、比较和逆向求未知量", typeIds: ["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W09"] },
  { id: "spatial-logic", name: "量感空间", description: "大小、高矮、长短、轻重、方位和立体空间", typeIds: ["N11", "N12", "N13", "N14", "S01", "S02", "S03", "S04", "S05"] },
] as const;

export function clampMathTotal(value: number) {
  return Math.max(1, Math.min(100, Number.isFinite(value) ? Math.round(value) : 1));
}

export function countAllocatedQuestions(typeCounts: Record<string, number>) {
  return Object.values(typeCounts).reduce((sum, count) => sum + count, 0);
}

export function normalizeLegacyMathTypeCounts(typeCounts: Record<string, number>) {
  const normalized = { ...typeCounts };
  for (const [legacyId, canonicalId] of [["P02", "P01"], ["P04", "P03"]] as const) {
    if (!(legacyId in normalized)) continue;
    normalized[canonicalId] = (normalized[canonicalId] ?? 0) + (normalized[legacyId] ?? 0);
    delete normalized[legacyId];
  }
  return normalized;
}

export function allocateEvenly(totalQuestions: number, typeIds: readonly string[]) {
  const total = clampMathTotal(totalQuestions);
  if (!typeIds.length) return {};
  const typeCounts: Record<string, number> = {};
  for (let index = 0; index < total; index += 1) {
    const typeId = typeIds[index % typeIds.length]!;
    typeCounts[typeId] = (typeCounts[typeId] ?? 0) + 1;
  }
  return typeCounts;
}

export function rebalanceTypeCounts(typeCounts: Record<string, number>, nextTotalQuestions: number) {
  const totalQuestions = clampMathTotal(nextTotalQuestions);
  const activeCounts = Object.entries(normalizeLegacyMathTypeCounts(typeCounts)).filter(([typeId, count]) => MATH_TYPE_ID_SET.has(typeId) && count > 0);
  if (!activeCounts.length) return allocateEvenly(totalQuestions, MATH_PRACTICE_PRESETS[0].typeIds);
  const previousTotal = activeCounts.reduce((sum, [, count]) => sum + count, 0);
  const weighted = activeCounts.map(([typeId, count], index) => {
    const exact = count * totalQuestions / previousTotal;
    return { typeId, count: Math.floor(exact), remainder: exact - Math.floor(exact), index };
  });
  let remaining = totalQuestions - weighted.reduce((sum, item) => sum + item.count, 0);
  for (const item of [...weighted].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remaining <= 0) break;
    item.count += 1;
    remaining -= 1;
  }
  return Object.fromEntries(weighted.filter((item) => item.count > 0).map((item) => [item.typeId, item.count]));
}
