export const PROVISIONAL_REVIEW_STATUSES = ["pending_review", "needs_more_data"] as const;

type ProvisionalReviewStatus = (typeof PROVISIONAL_REVIEW_STATUSES)[number];

/** True when a provisional source row is still awaiting review. */
export function isAwaitingReview(status: string | null | undefined): boolean {
  return PROVISIONAL_REVIEW_STATUSES.includes(status as ProvisionalReviewStatus);
}
