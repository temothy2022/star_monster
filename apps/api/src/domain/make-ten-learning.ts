export type MakeTenQuestion = {
  target: number;
};

export type MakeTenAnswer = {
  questionIndex: number;
  selectedNumber: number | null;
  correct: boolean;
  timedOut: boolean;
  responseMs: number | null;
  answeredAt: string;
};

export type MakeTenFactSnapshot = {
  target: number;
  attemptCount: number;
  correctCount: number;
  totalResponseMs: number;
  recentAccuracy: number | null;
  recentResponseMs: number | null;
  consecutiveWrong: number;
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function makeTenQuestionWeight(
  fact: MakeTenFactSnapshot | undefined,
  secondsPerQuestion: number,
) {
  const attemptCount = Math.max(0, fact?.attemptCount ?? 0);
  const lifetimeAccuracy = fact
    ? (fact.correctCount + 2) / (attemptCount + 4)
    : 0.5;
  const effectiveAccuracy = clamp(
    lifetimeAccuracy * 0.55 +
      (fact?.recentAccuracy ?? lifetimeAccuracy) * 0.45,
    0,
    1,
  );
  const lifetimeResponseMs =
    fact && attemptCount > 0
      ? fact.totalResponseMs / attemptCount
      : secondsPerQuestion * 700;
  const effectiveResponseMs =
    lifetimeResponseMs * 0.45 +
    (fact?.recentResponseMs ?? lifetimeResponseMs) * 0.55;
  const responseRatio = clamp(
    effectiveResponseMs / Math.max(1000, secondsPerQuestion * 1000),
    0,
    1.4,
  );
  const uncertainty = 1 / Math.sqrt(attemptCount + 1);
  const wrongStreak = Math.min(3, Math.max(0, fact?.consecutiveWrong ?? 0));

  return (
    0.4 +
    (1 - effectiveAccuracy) * 2.4 +
    responseRatio +
    uncertainty * 0.7 +
    wrongStreak * 0.22
  );
}

export function generateAdaptiveMakeTenQuestions(
  count: number,
  facts: MakeTenFactSnapshot[],
  secondsPerQuestion: number,
  random: () => number = Math.random,
): MakeTenQuestion[] {
  const safeCount = Math.max(1, Math.min(50, Math.round(count)));
  const factsByTarget = new Map(facts.map((fact) => [fact.target, fact]));
  const questions: MakeTenQuestion[] = [];

  while (questions.length < safeCount) {
    const previousTarget = questions.at(-1)?.target;
    const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .filter((target) => target !== previousTarget)
      .map((target) => ({
        target,
        weight: makeTenQuestionWeight(
          factsByTarget.get(target),
          secondsPerQuestion,
        ),
      }));
    const totalWeight = candidates.reduce(
      (total, candidate) => total + candidate.weight,
      0,
    );
    let selection = clamp(random(), 0, 0.999999999) * totalWeight;
    let chosen = candidates.at(-1)!;
    for (const candidate of candidates) {
      selection -= candidate.weight;
      if (selection < 0) {
        chosen = candidate;
        break;
      }
    }
    questions.push({ target: chosen.target });
  }

  return questions;
}

export function makeTenFactAssessment(
  fact: MakeTenFactSnapshot | undefined,
  secondsPerQuestion: number,
) {
  if (!fact || fact.attemptCount === 0) {
    return { level: "NO_DATA" as const, label: "等待积累" };
  }
  const accuracy = fact.correctCount / fact.attemptCount;
  const responseMs =
    fact.recentResponseMs ?? fact.totalResponseMs / fact.attemptCount;
  if (accuracy < 0.7 || fact.consecutiveWrong >= 2) {
    return { level: "FOCUS" as const, label: "重点练习" };
  }
  if (responseMs > secondsPerQuestion * 700) {
    return { level: "SLOW" as const, label: "需要提速" };
  }
  if (accuracy >= 0.9 && responseMs <= secondsPerQuestion * 500) {
    return { level: "STRONG" as const, label: "已经熟练" };
  }
  return { level: "PRACTICING" as const, label: "继续巩固" };
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

export function makeTenAttemptStatus(passed: boolean) {
  return passed ? "COMPLETED" as const : "FAILED" as const;
}

export function makeTenMastery(accuracy: number | null) {
  if (accuracy === null || !Number.isFinite(accuracy)) return { level: "NO_DATA" as const, label: "暂无数据" };
  if (accuracy >= 0.9) return { level: "MASTERED" as const, label: "反应熟练" };
  if (accuracy >= 0.8) return { level: "PROFICIENT" as const, label: "基本熟练" };
  if (accuracy >= 0.6) return { level: "DEVELOPING" as const, label: "正在进步" };
  return { level: "NEEDS_PRACTICE" as const, label: "需要巩固" };
}
