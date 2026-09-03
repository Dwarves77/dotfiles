/**
 * identity-format.ts — pure formatting/validation helpers for the pseudonymous author-identity
 * surface (spec 05 §2, §5 components 1/11) and the promotion state machine (spec 05 §4, §5
 * component 6). No JSX, no fetch, no DOM — kept separate from the .tsx components that use them so
 * `node --test` can prove the logic directly (Node's built-in type-stripping loader handles a plain
 * relative .ts import; it cannot transform JSX, which is why the components themselves are proven
 * through the rendering guard instead — see .discipline/rendering/fixtures-community/).
 */

import type { AuthorIdentityProjection } from "./api-client";

/**
 * Render the pseudonymity-safe identity line: org type, role, sector, region — joined, never a
 * name or company (spec 05 §2: "profiles display job title, role, industry and company size, and
 * not name or company"). Returns null when every field is absent so a caller can render nothing
 * rather than an empty separator string.
 */
export function formatAuthorIdentity(
  identity: AuthorIdentityProjection | null | undefined
): string | null {
  if (!identity) return null;
  const parts = [identity.orgType, identity.role, identity.sector, identity.region]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/**
 * Entity-binding requirement (spec 05 §5 component 2, acceptance criterion 6: "every thread binds
 * to at least one spine entity"). Returns a user-facing refusal string, or null when the binding is
 * valid — the same rule createCommunityPost() enforces before ever calling the network, exported
 * separately so the composer can show the message live as the picker changes, not only on submit.
 */
export function validateEntityBinding(entityIds: string[] | null | undefined): string | null {
  if (!entityIds || entityIds.length === 0) {
    return "Bind this post to at least one spine entity (corridor, jurisdiction, instrument, technology, or organisation) before posting.";
  }
  return null;
}

/** Promotion state machine labels (spec 05 §4). Gate 1 is the default a post is minted into; an
 * unrecognized state renders itself verbatim rather than silently becoming gate 1 — a state this
 * table doesn't know about is a labelling gap to fix, not a fact to hide. */
const PROMOTION_STATE_LABELS: Record<string, string> = {
  community: "Community — unverified, contributed by a member",
  "community-corroborated": "Community-corroborated — unverified, distribution shown",
  "under-review": "Under review — an editor has opened a verification task",
  verified: "Verified — traced to a primary source",
  retired: "Retired — corrected, kept for the record",
};

export function promotionStateLabel(state: string | null | undefined): string {
  if (!state) return PROMOTION_STATE_LABELS.community;
  return PROMOTION_STATE_LABELS[state] ?? state;
}

/** True only for the two states spec 05 §4 explicitly forbids from citation as fact (gates 1-2) —
 * used to decide whether a surface may present a value as a point estimate. Gate 3 ("under-review")
 * and gate 5 ("retired") are excluded on purpose: neither is citable either, but this helper answers
 * one narrow question (is this an unverified member contribution) rather than every citability rule. */
export function isUnverifiedContribution(state: string | null | undefined): boolean {
  return state === "community" || state === "community-corroborated" || !state;
}

/** Corroboration counter (spec 05 §5 component 5): "showing independent organisations, not post
 * count." Renders the organisation count only — callers that also want the post count read
 * `posts` off the corroboration object directly rather than through this label. */
export function corroborationLabel(organisations: number): string {
  if (!Number.isFinite(organisations) || organisations <= 0) {
    return "No independent corroboration yet";
  }
  return `${organisations} organisation${organisations === 1 ? "" : "s"} corroborating`;
}
