export const RECENT_TASK_DURATION_SAMPLE_SIZE = 10;
export const MIN_VALID_TASK_DURATION_SECONDS = 10;
export const MAX_VALID_TASK_DURATION_SECONDS = 4 * 60 * 60;

export function recentAverageTaskSeconds(
  elapsedSeconds: readonly number[],
  sampleSize = RECENT_TASK_DURATION_SAMPLE_SIZE,
): number | null {
  const samples = elapsedSeconds
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= MIN_VALID_TASK_DURATION_SECONDS &&
        value <= MAX_VALID_TASK_DURATION_SECONDS,
    )
    .slice(0, Math.max(1, sampleSize));

  if (!samples.length) return null;

  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return Math.max(60, Math.round(average / 60) * 60);
}
