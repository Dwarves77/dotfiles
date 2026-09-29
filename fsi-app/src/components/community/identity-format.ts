/**
 * identity-format.ts — pure formatting/validation helpers for the pseudonymous author-identity
 * surface (spec 05 §2, §5 components 1/11) and the promotion state machine (spec 05 §4, §5
 * component 6). No JSX, no fetch, no DOM — kept separate from the .tsx components that use them so
 * `node --test` can prove the logic directly (Node's built-in type-stripping loader handles a plain
 * relative .ts import; it cannot transform JSX, which is why the components themselves are proven
 * through the rendering guard instead — see .discipline/rendering/smoke/community-smoke.mjs, which
 * mounts the real PostList/Post/PeersDiscussingStrip components).
 */

import type { AuthorIdentityProjection } from "./api-client";
import { validateEntityIds } from "../../lib/community/entity-binding.mjs";

/**
 * Render the author identity line (R8.7, spec 07 Community, 2026-09-25, supersedes spec 05 section 2 item
 * 1's "never a name or company"): name and company come FIRST when present (identity shown by
 * default), followed by org type / role / sector / region. An anonymous identity (name/company
 * withheld by `projectAuthorIdentity`) falls back to the pseudonymous org-type/role/sector/region
 * line, same as before R8.7. Returns null when every field is absent so a caller can render nothing
 * rather than an empty separator string.
 */
export function formatAuthorIdentity(
  identity: AuthorIdentityProjection | null | undefined
): string | null {
  if (!identity) return null;
  const nameCompany = [identity.name, identity.company].map((p) => (p ?? "").trim()).filter(Boolean);
  const rest = [identity.orgType, identity.role, identity.sector, identity.region]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  const parts = [...nameCompany, ...rest];
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/**
 * Entity-binding requirement (spec 05 §5 component 2, acceptance criterion 6: "every thread binds
 * to at least one spine entity"; R8.7's amendment states this item "stays unchanged"). Delegates to
 * validateEntityIds (src/lib/community/entity-binding.mjs), the SAME validator POST
 * /api/community/posts/route.ts runs server-side, so this client-side check can never again diverge
 * from what the server actually requires (investigated as part of the "composer 400 without
 * entity_ids" item, 2026-09-25 close note: the two sides had drifted, this client check previously
 * only caught the empty case, not the malformed-id or MAX_ENTITY_IDS cases the server also enforces,
 * so a composer could pass client-side validation and still 400 late, see that module's own header).
 * Returns a user-facing refusal string, or null when the binding is valid, exported separately so
 * the composer can show the message live as the picker changes, not only on submit.
 */
export function validateEntityBinding(entityIds: string[] | null | undefined): string | null {
  const result = validateEntityIds(entityIds);
  return result.ok ? null : result.error;
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
