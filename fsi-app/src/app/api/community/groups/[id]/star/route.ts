// PATCH /api/community/groups/[id]/star { starred: boolean }
//
// Toggle the per-user starred flag on community_group_members for the
// caller. Star/unstar drives sidebar pinning; it is purely a personal
// preference and does not affect group state for other members.
//
// RLS on community_group_members.UPDATE allows a user to update their
// own row (with role/joined_at unchanged). Updating just `starred` is
// within that policy, the shared handler (below) uses the caller's
// RLS-aware client so the row guard is enforced server-side, not just
// in our query.
//
// Auth: cookie session.
// Rate limit: standard 60/min/user.
//
// The handler body is shared with the sibling /mute route (same table, same
// self-only RLS-scoped write, same response shape) via
// createMemberPrefTogglePatchHandler (src/lib/community/member-pref-route.mjs) -
// F45 (duplicate-code) caught the two routes as a near-verbatim clone when they
// were each written out in full; this file now exports only the one-line
// handler (F34: route files export only handlers).

import { createMemberPrefTogglePatchHandler } from "@/lib/community/member-pref-route.mjs";

export const PATCH = createMemberPrefTogglePatchHandler("starred");
