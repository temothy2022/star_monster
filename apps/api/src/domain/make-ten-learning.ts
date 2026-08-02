export type MakeTenQuestion = {
  target: number;
};

export type MakeTenAnswer = {
  questionIndex: number;
  selectedNumber: number | null;
  correct: boolean;
  timedOut: boolean;
  answeredAt: string;
};

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export function generateMakeTenQuestions(
  count: number,
  random: () => number = Math.random,
): MakeTenQuestion[] {
  const safeCount = Math.max(1, Math.min(50, Math.round(count)));
  const targets: number[] = [];
  while (targets.length < safeCount) {
    const cycle = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
    if (targets.length && cycle[0] === targets.at(-1)) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    targets.push(...cycle);
  }
  return targets.slice(0, safeCount).map((target) => ({ target }));
}

export function makeTenAnswer(target: number): number {
  return 10 - target;
}

export function isMakeTenAnswerCorrect(
  target: number,
  selectedNumber: number | null,
): boolean {
  return selectedNumber !== null && selectedNumber === makeTenAnswer(target);
}

export function makeTenPassed(
  correctCount: number,
  totalQuestions: number,
  passAccuracyPercent: number,
): boolean {
  return totalQuestions > 0 && correctCount * 100 >= totalQuestions * passAccuracyPercent;
}

export function makeTenMastery(accuracy: number | null) {
  if (accuracy === null || !Number.isFinite(accuracy)) return { level: "NO_DATA" as const, label: "暂无数据" };
  if (accuracy >= 0.9) return { level: "MASTERED" as const, label: "反应熟练" };
  if (accuracy >= 0.8) return { level: "PROFICIENT" as const, label: "基本熟练" };
  if (accuracy >= 0.6) return { level: "DEVELOPING" as const, label: "正在进步" };
  return { level: "NEEDS_PRACTICE" as const, label: "需要巩固" };
}
