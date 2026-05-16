---
name: rule-group-scoped-features
description: Every UI surface that lists or filters by people declares its context first, then scopes accordingly. Three contexts: workspace (org_memberships), community (community_group_members), personal (current user only). No feature filters by all platform profiles. The context is part of the feature's specification, not a runtime inference.
---

# Rule: Group-scoped features

## What this rule requires

Every UI surface, API endpoint, or backend feature that lists, filters, or routes to other humans declares its context FIRST in its spec, then scopes its people-source accordingly. Three contexts, mutually exclusive at the feature level. No feature filters by all platform profiles.

The context declaration is part of the feature's specification, not a runtime inference. A spec that says "list users for assign-to" without naming the context is incomplete.

## The three contexts

```
PLATFORM INTELLIGENCE (intelligence_items, sources)
        shared substrate
              |
   +----------+----------+
   |          |          |
WORKSPACE  COMMUNITY  PERSONAL
   |          |          |
org_       community_  current
memberships  group_     user only
             members
```

| Context | Source of "who is in this scope" | Examples | Backend lookup |
|---|---|---|---|
| Workspace | org_memberships of the current workspace | Assign-to within workspace, shared notes on items, org-shared watchlists, mentions in workspace notes, member directory for the workspace | `get_workspace_members(p_org_id)` RPC (migration 077) gated by `_assert_org_membership` |
| Community | community_group_members of the relevant community group | Forum thread participants, post authors, vendor endorsers, case study contributors, mentions in community discussions, group member directory | community_group_members WHERE group_id = X, RLS-scoped to members of that group |
| Personal | Current user only | Personal watchlist, personal pins, individual preferences, user-only notification settings | auth.uid() (no picker needed; the feature operates on the current user) |

## No feature filters by all platform profiles

A "mention anyone on the platform" feature is an anti-pattern. It leaks the existence of one workspace's users to another workspace and breaks the multi-tenant boundary.

Specific anti-patterns:
- A user search that returns all platform profiles
- An autocomplete that suggests names across all tenants
- A "share with" dropdown that lists users outside the current workspace or community group
- A notification target list that fans out across tenants

The fix in every case is to identify which of the three contexts the feature is operating in and to scope through the appropriate table.

## Feature design checklist

When proposing or building any feature that surfaces people, answer these BEFORE writing code:

1. **Which context?** Workspace, community, or personal. If you can't pick one, the feature is two features and needs to be split.
2. **Which people-source?** org_memberships (workspace), community_group_members + group_id (community), or auth.uid() (personal).
3. **Which lookup endpoint?** `get_workspace_members` RPC for workspace, direct community_group_members query for community, auth.uid() for personal.
4. **Which RLS or authorization gate?** Workspace features inherit `_assert_org_membership`; community features inherit the community group's RLS (RLS-recursion safe per migration 046); personal features rely on auth.uid() identity.
5. **What is the failure mode if the wrong context is picked?** A workspace feature accidentally scoped to community leaks workspace-internal info to community members; a community feature accidentally scoped to workspace excludes legitimate community contributors; a personal feature with broader scope leaks the user's preferences.

## Implementation patterns (post multi-tenant foundation deploy)

After migration 077 (PR #116, 2026-05-15):

**Workspace-scoped pickers:**
```sql
SELECT * FROM get_workspace_members(:current_workspace_org_id);
```
Returns the org_memberships join with profiles.id, full_name, work_email, role. Gated by `_assert_org_membership` (the authenticated user must be a member of the same workspace).

**Community-scoped pickers:**
```sql
SELECT p.id, p.full_name, ...
FROM community_group_members cgm
JOIN profiles p ON p.id = cgm.user_id
WHERE cgm.group_id = :relevant_community_group_id;
```
RLS on community_group_members ensures the querying user can only see groups they themselves are a member of (per migration 029 + 046).

**Personal-scoped features:**
```sql
SELECT * FROM user_watchlist WHERE user_id = auth.uid();
```
No picker needed; the feature scopes to the authenticated user directly.

## Community groups: public vs invitation-only

A community group can be public (anyone authenticated can join) or invitation-only (gated by `community_group_invitations`, where the group-owner controls access). The group-owner role is distinct from the platform admin role; one user can own a community group without being a platform admin.

Invitation tokens for community groups follow the same shape as org invitations (migration 076 establishes the pattern: token-based, one-shot, expirable). Bundled into the invitation-polish dispatch (see `docs/multi-tenant-foundation-followups-2026-05-15.md` item 3).

For the rule's purposes: a community-scoped feature surfaces members of the group regardless of whether the group is public or invitation-only. The gating happens at join time, not at member-listing time.

## Audit of existing features (post-deploy)

Some features built before this rule may have used global profile queries. Sweep these as part of the source-registry-hygiene + audit-cleanup dispatch:

- Audit each instance of `from('profiles')` in `fsi-app/src` to confirm it is either (a) reading the current user's own row, or (b) reading a specific user_id resolved from a workspace or community membership, NOT a broad list
- Migrate any broad-list reads to `get_workspace_members` or the community_group_members pattern
- Add this rule's reference to the spec of every feature that surfaces people, in PR descriptions going forward

## Composition

- Inherits from: nothing direct (architectural rule)
- Composes with:
  - [[rule-workspace-anchored-output]] (workspace-context features apply that framing rule when they generate content)
  - [[rule-community-attributed-output]] (community-context features apply that framing rule)
  - Every future feature spec that surfaces people
- Built atop:
  - `org_memberships` table + `get_workspace_members` RPC (workspace context; migration 077)
  - `community_group_members` table + `community_group_invitations` table (community context; migrations 029, 076-style invitation-token pattern)
  - `auth.uid()` (personal context; Supabase built-in)

## Failure mode signature

The following are wrong:

- A new feature spec that says "list users for X" without naming the context
- A backend query against `profiles` without a workspace or community scope
- A frontend autocomplete that returns results across tenant boundaries
- A "share with" or "mention" UI that doesn't constrain to the current scope

The fix in every case is to identify the context, scope through the correct table, and reject the unscoped pattern.

## Audit cross-reference

- Operator instruction 2026-05-15: established the three-context architecture and the "no feature filters by all platform profiles" requirement
- v2 audit Section 6.8 (multi-tenancy + sector ranking; workspace scoping rationale)
- v2 audit Section 3 / S11 (the audit-named RPC auth gap that PR #116 closed; same architectural principle applied to data access)
- Multi-tenant foundation deploy 2026-05-15: PR #116 added `get_workspace_members` as the canonical workspace-scoped people lookup
- Saved memory [[feedback-cost-discipline-manual-controls]] (the broader cost-discipline-as-design-principle that frames why scoping is enforced at the product layer, not only at the database layer)
