export type ClockQuestionType = "SET_CLOCK" | "READ_CLOCK";

export type ClockQuestion = {
  type: ClockQuestionType;
  hour: number;
  minute: number;
  second: number;
};

export type ClockAnswer = {
  questionIndex: number;
  hour: number;
  minute: number;
  second: number;
  correct: boolean;
  answeredAt: string;
};

function randomInt(maxExclusive: number, random: () => number): number {
  return Math.floor(random() * maxExclusive);
}

export function normalizeClockHour(hour: number): number {
  const normalized = Math.round(hour) % 12;
  return normalized <= 0 ? normalized + 12 : normalized;
}

export function generateClockQuestions(
  count: number,
  minuteStep: 1 | 5,
  random: () => number = Math.random,
): ClockQuestion[] {
  const safeCount = Math.max(1, Math.min(20, Math.round(count)));
  const minuteOptions = 60 / minuteStep;
  const types = Array.from({ length: safeCount }, () =>
    random() < 0.5 ? "SET_CLOCK" as const : "READ_CLOCK" as const,
  );
  if (safeCount >= 2 && types.every((type) => type === types[0])) {
    types[safeCount - 1] = types[0] === "SET_CLOCK" ? "READ_CLOCK" : "SET_CLOCK";
  }

  const used = new Set<string>();
  return types.map((type) => {
    let hour = 1;
    let minute = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      hour = randomInt(12, random) + 1;
      minute = randomInt(minuteOptions, random) * minuteStep;
      const key = `${hour}:${minute}`;
      if (!used.has(key)) {
        used.add(key);
        break;
      }
    }
    return { type, hour, minute, second: 0 };
  });
}

export function isClockAnswerCorrect(
  question: ClockQuestion,
  answer: Pick<ClockAnswer, "hour" | "minute">,
): boolean {
  return normalizeClockHour(answer.hour) === question.hour &&
    Math.round(answer.minute) === question.minute;
}

export function clockMastery(accuracy: number | null): {
  level: "NO_DATA" | "NEEDS_PRACTICE" | "DEVELOPING" | "PROFICIENT" | "MASTERED";
  label: string;
} {
  if (accuracy === null || !Number.isFinite(accuracy)) {
    return { level: "NO_DATA", label: "暂无数据" };
  }
  if (accuracy >= 0.9) return { level: "MASTERED", label: "掌握良好" };
  if (accuracy >= 0.75) return { level: "PROFICIENT", label: "基本掌握" };
  if (accuracy >= 0.6) return { level: "DEVELOPING", label: "正在进步" };
  return { level: "NEEDS_PRACTICE", label: "需要巩固" };
}
