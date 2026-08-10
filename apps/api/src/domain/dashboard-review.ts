export type DatedReviewCandidate = {
  id: string;
  nextReviewDate: Date;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function reviewDistance(candidate: DatedReviewCandidate, referenceDate: Date) {
  return Math.abs(candidate.nextReviewDate.getTime() - referenceDate.getTime());
}

export function selectNearestReviews<T extends DatedReviewCandidate>(
  candidates: T[],
  referenceDate: Date,
  limit: number,
): T[] {
  return [...candidates]
    .sort((left, right) =>
      reviewDistance(left, referenceDate) - reviewDistance(right, referenceDate) ||
      left.nextReviewDate.getTime() - right.nextReviewDate.getTime() ||
      left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit));
}

export function selectDailyReview<T extends DatedReviewCandidate>(
  candidates: T[],
  businessDate: Date,
  poolLimit = 4,
): T | null {
  const pool = selectNearestReviews(candidates, businessDate, poolLimit)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (pool.length === 0) return null;
  const dayNumber = Math.floor(businessDate.getTime() / DAY_MS);
  return pool[((dayNumber % pool.length) + pool.length) % pool.length] ?? null;
}
