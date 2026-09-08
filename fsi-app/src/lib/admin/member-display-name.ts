/**
 * memberDisplayName — the one display chain for a workspace member's name.
 *
 * COUNTS-61 (production defect, click-through audit 2026-09-08, /admin): the WORKSPACES card's
 * "Newest join" figure showed a raw UUID fragment to the user ("a0764ff3… · owner").
 *
 * ROOT CAUSE [CONFIRMED by reading both call sites]: MembersPanel.tsx carried a display chain whose
 * own header says "DO-NOT-REVERT ... NO raw UUIDs render in member rows", ending in a
 * `user_id.slice(0, 8)` fallback; WorkspacesUsageRow.tsx did not use that chain at all and printed
 * the sliced UUID directly, unconditionally, never even looking at the joined profile. Two
 * behaviours for one question, and the rule lived in a comment on only one of them.
 *
 * The chain is now here, once, and the UUID slice is GONE from it: a member whose profile carries no
 * name, display name or email renders the absence, not an identifier the reader cannot use. That
 * closes the loophole the original chain's own header was written to prevent.
 */

export interface MemberProfileFields {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

export interface MemberWithProfile {
  user_id?: string | null;
  user?: MemberProfileFields | null;
}

/** What a member with no usable profile field renders as. Never a UUID, never blank. */
export const NO_PROFILE_LABEL = "(no profile)";

/** full_name -> display_name -> email -> the absence. */
export function memberDisplayName(m: MemberWithProfile): string {
  const u = m.user;
  const full = u?.full_name?.trim();
  if (full) return full;
  const display = u?.display_name?.trim();
  if (display) return display;
  const email = u?.email?.trim();
  if (email) return email;
  return NO_PROFILE_LABEL;
}
