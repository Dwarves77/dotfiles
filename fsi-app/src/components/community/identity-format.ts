/**
 * identity-format.ts — pure formatting/validation helpers for the pseudonymous author-identity
 * surface (spec 05 section 2, section 5 components 1/11). No JSX, no fetch, no DOM, kept separate from the .tsx components that use them so
 * `node --test` can prove the logic directly (Node's built-in type-stripping loader handles a plain
 * relative .ts import; it cannot transform JSX, which is why the components themselves are proven
 * through the rendering guard instead — see .discipline/rendering/smoke/community-smoke.mjs, which
 * mounts the real PostList/Post components).
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
