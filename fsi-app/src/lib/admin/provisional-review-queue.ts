/**
 * PROVISIONAL_REVIEW_STATUSES — the one definition of "a provisional source awaiting review".
 *
 * WHY THIS FILE EXISTS (production defect, click-through audit 2026-09-08, /admin): one screen
 * showed the tab badge and the issues queue reading 489 while the table header above the rows read
 * "491 PENDING", with 491 Approve buttons in the DOM. Root cause [CONFIRMED, live DB]:
 * `provisional_sources` holds 489 rows at `pending_review` and 2 at `needs_more_data`.
 * `fetchProvisionalSources` (src/lib/supabase-server.ts) selects BOTH — correctly, because both
 * are worked from the same queue, with the same Approve control — while the RPC behind the badge,
 * `admin_attention_counts` (migration 140), counted `status = 'pending_review'` alone. Two
 * populations, one word ("pending"), on one screen.
 *
 * The queue as rendered is the right population: a `needs_more_data` row is still a row an operator
 * has to act on, and the surface offers the same three decisions on it. So both the RPC (migration
 * 314) and every app-side read now name THIS constant's members, and the migration's own comment
 * cites this file, so the two definitions cannot drift apart again in silence.
 */

/** The statuses a provisional source carries while it is still in the review queue. */
export const PROVISIONAL_REVIEW_STATUSES = ["pending_review", "needs_more_data"] as const;

export type ProvisionalReviewStatus = (typeof PROVISIONAL_REVIEW_STATUSES)[number];

/** True when a provisional source row is still awaiting review. */
export function isAwaitingReview(status: string | null | undefined): boolean {
  return PROVISIONAL_REVIEW_STATUSES.includes(status as ProvisionalReviewStatus);
}
