## 2026-10-07, lane s8a-notes-assignment: private workspace notes and assignment with notification on every detail page

Plan Stage 8 bullet 1 (brief s8a.md). ADR-042 and ADR-043: external data only; a note and an assignment are workspace
commentary and coordination, never analysed, never read by another page or the flywheel. Nothing touched a database;
migrations 358 and 359 are written, NOT APPLIED. Nothing here populates data.

### Accomplished
- Migration 358 `item_notes`: org_id, item_id, author_user_id (nullable on purpose), body, created_at, edited_at,
  deleted_at, legacy_override_id. RLS: org members read; insert as yourself and only owner, admin or member (a viewer
  reads); update reaches the author and owner or admin of the row's own org; a guard trigger lets the author change the
  body only, the author or an owner or admin set deleted_at only, and nobody un-delete or change identity columns; no DELETE policy,
  DELETE revoked from anon and authenticated. Also `move_override_notes_to_item_notes()`, the idempotent data move of the
  single `workspace_item_overrides.notes` field (staged for the coordinator after merge, never run by the migration).
- Migration 359 `item_assignments`: (org_id, item_id, assignee_user_id, assigned_by, due_on, state open|done,
  created_at), unique (org_id, item_id, assignee_user_id). RLS: org members read; insert as yourself, assignee must be a
  member of the same org holding the role member, admin or owner (a viewer is not assignable); update and delete for the assignee, the assigner, or owner or admin of the row's org; a guard
  trigger lets an authenticated caller change state only. Also adds `assignment` to the `notifications.kind` CHECK.
- Both migrations end in a self-check that attacks the table on LIVE rows (no fabricated fixture, so no FK can fail, the
  migration 311 lesson) under `SET LOCAL ROLE authenticated`, inside a subtransaction it always rolls back, and skips with
  a NOTICE when a live fixture is absent.
- Routes `src/app/api/workspace/items/[id]/notes` (GET, POST, PATCH own, DELETE) and `/assignments` (GET, POST many, PATCH
  state, DELETE). Shared preamble in `src/lib/workspace/item-collab-route.ts` (requireUserRoute, which carries the 60/min
  limiter, then the caller's org AND role from org_memberships, then the verified item by legacy_id or uuid). Rules in pure
  modules `item-notes.mjs`, `item-assignments.mjs`, `item-collab-shared.mjs` (dependencies injected).
- Notification: an assignment dispatches one `assignment` notification per new assignee (not the assigner) through the
  existing `dispatchNotification`; `NotificationKind` gains `assignment`; `NotificationsList` labels it "Assigned" with a
  UserCheck icon and the existing click-through link to the item.
- UI: `ItemNotesBlock`, `ItemAssignBlock`, mounted through ONE slot in `DetailShell.tsx` (`ItemCollabSlot`, rendered by
  `DetailPageWrapper`). The slot reads the item id from the page pathname and mounts only when the shared bootstrap roster
  is non-null (a workspace is present). The four surfaces pass nothing new.
- Smoke spec `item-collab-smoke.mjs` (registered in `ux-smoke-specs.mjs`, both blocks listed in F35) with a sibling
  navigation stub so the real shell slot is mounted: empty, full, extreme, readonly, error states plus add-note, delete
  confirm and assign flows.
- `docs/inventories/migrations.md` regenerated with its generator.
- Coordinator rulings on PR 988 (2026-10-08), all applied:
  - Ruling 1, CI fixes: the counter uses `formatNumber`; the initial fetch of both blocks runs inside the effect's own async
    callback (retry bumps an attempt counter); the `today` effect is gone and the past-date check runs in the Assign click handler.
  - Ruling 2, the old notes path is retired (never a second copy): the Market detail `NotesField` mount, its function, the
    `initialNote` prop and the "Your notes" rail card are removed from `MarketSignalDetailSurface.tsx` (the shared Notes section
    DetailShell mounts is the one notes surface); `/api/workspace/overrides` no longer writes `notes` and answers a 400 naming the
    new route if a request carries one; `supabase-server.ts` no longer selects or maps `notes` on the override rows; the bootstrap
    hook type, `useWorkspaceOverridesHydration.ts` and the `resourceStore.ts` `WorkspaceOverride` type no longer carry it
    (`bootstrap/logic.ts` held only comments). The column stays until the data move has run; a later migration drops it.
  - Ruling 3: an author deletes their own note (same right as edit), an owner or admin deletes any; a viewer is readable-only and
    NOT assignable: the picker roster and the route both admit only member, admin or owner, and migration 359's INSERT policy checks
    the assignee's role.

### Read and reused
Read: COMMON.md, s8a.md, CLAUDE.md, lane-common-contract.md, ux-laws.md, design-principles.md, migrations 006, 006 RLS,
032, 235 and 311 (headers), 356 (self-check convention), `/api/workspace/overrides`, `/members`, `tags/[id]/items`,
`dispatch.ts`, `NotificationsList.tsx`, `DetailShell.tsx`, `OwnerTeamCard.tsx`, `NotesField` in MarketSignalDetailSurface,
`useWorkspaceBootstrap.ts`, `route-guard.ts`, `org.ts`, `rate-limit.ts`, `authed-fetch.ts`, `id-redirect.ts`,
`item-links.ts`, `F35`, `ux-harness.mjs`, `ux-assert.mjs`, `cross-page-smoke.mjs`.
Reused instead of building: `requireUserRoute` (auth plus rate limit), `resolveOrgMembershipFromUserId`, `isItemUuid`,
`itemDetailHref`, `dispatchNotification` and the notification bell, `authedFetch`, the shared bootstrap singleton (the
"workspace present" signal), `DetailSection`, `DetailLayout`, `ActionButton`, `formatDate`, `formatRelativeCompact`,
`withErrorCapture`, the migration 356 and 311 self-check conventions. Nothing existing was duplicated.

### Evidence, red then green
- `node --test src/lib/workspace/item-collab.test.mjs`: against the tree without `item-notes.mjs` and
  `item-assignments.mjs`, fails at import (ERR_MODULE_NOT_FOUND); with them 26 of 26 pass. Mutation proof: deleting every
  `.eq("org_id", ctx.orgId)` from the two modules fails exactly the four cross-org attack tests (22 pass, 4 fail), restored
  26 of 26.
- `node --test supabase/migrations/358_workspace_item_notes.test.mjs supabase/migrations/359_item_assignments.test.mjs`:
  18 of 18 pass. Mutation proof: replacing the read policy predicate with `true` fails the read-policy test (8 pass, 1
  fail), restored 9 of 9.
- `node --test src/lib/notifications/dispatch-kinds.npmtest.mjs`: 3 of 3 (the kind list assertion now includes
  `assignment`; one test added for the label and icon).
- Smoke (the registered spec run directly through Playwright): first run failed 16 checks, "unseparated thousands
  rendered" on the `0 / 4000` counter; the counter now renders `0 / 4,000`; second run 36 checks, 0 failures at 375, 768,
  1024 and 1280, including the shell slot and the add, delete-confirm and assign flows.
- After the rulings: `item-collab.test.mjs` 29 of 29. Red first: with the new tests and the old modules, 5 failed (author delete,
  viewer assignee, picker roster, viewer rights); green after. `notes-path-retired.test.mjs` (4 tests): against the old tree 3 of 4
  fail (Market mount, overrides route, read path), green after. Migration tests 18 of 18; against the old SQL, 4 fail (insert policy
  role, guard trigger author delete, both self-check attack lists).
- Full `node .discipline/rendering/run-rendering-guard.mjs`: PASS, 27 UX smoke specs including item-collab, 650 UX checks.
  `npx eslint` on the touched trees: clean.
- `npx tsc --noEmit`: clean.
- Targeted fitness checks run on the touched files only (F34, F35, F36, F38, F39, F40, F41, F42, F43, F62): 0
  violations. `render-clock.npmtest.mjs`, `DetailShell.npmtest.mjs`, `FactBlocks.npmtest.mjs`, `F35` test: 40 of 40.
- NOT run here (no database): the migrations' own self-checks, the RLS policies themselves, the routes against a real
  service client. Their SQL has only been read, never executed. The apply-time self-check is the first execution.

### Decisions
- REUSE: `workspace_item_overrides.notes` is one text field with no author or thread, so item_notes supersedes it for
  notes. The column stays until the data move has run, but its readers and writers are retired (ruling 2); the data move copies, never deletes. The single owner
  (`owner_user_id`, migration 234, OwnerTeamCard) is a different thing and is untouched; item_assignments is the
  multi-person table.
- The `assignment` value in the notifications.kind CHECK is in migration 359 (the brief names no migration for it).
- Role rule: a viewer reads notes and assignments but cannot add, edit or assign, and is not assignable (coordinator ruling
  2026-10-08; the brief is silent on viewers and existing workspace routes ignore the viewer role).
- Delete of a note: the author deletes their own, an owner or admin deletes any (coordinator ruling 2026-10-08; the brief said
  owner or admin only).
- Imported notes have no author (nullable author_user_id); nobody can edit them, an owner or admin can delete them.
- Added DELETE on assignments (remove an assignee) so a mistaken assignment is recoverable (ux-laws 15); the brief lists
  GET, POST, PATCH only.
- Due date is set at assignment time only; changing it means remove and assign again.
- Items must be `provenance_status = 'verified'` (the customer read gate) for either route to touch them.

### Apply then move (order for the coordinator's executor, ruling 5)
1. Apply migration 358, then 359 (both before the routes deploy). 2. Merge and deploy the code. 3. Run the data move once:
`SELECT public.move_override_notes_to_item_notes();` (returns the number of notes copied; idempotent; copies, never deletes).
Verify: `SELECT count(*) FROM public.item_notes WHERE legacy_override_id IS NOT NULL;` equals the count of
`workspace_item_overrides` rows with a non-empty `notes` of at most 20000 characters. Nothing writes that column once the code is
deployed, so the move captures every note. A later migration (not this lane's) drops `workspace_item_overrides.notes` and
the `workspace_notes` column that `get_workspace_intelligence` still returns.
Files edited under the coordinator's write-set expansion ruling (granted): `MarketSignalDetailSurface.tsx`,
`api/workspace/overrides/route.ts`, `bootstrap/logic.ts` (comments), `useWorkspaceOverridesHydration.ts`, `supabase-server.ts`.
Ungranted at the time, granted after the fact by ruling (coordinator, 2026-10-08, "retroactively and for the last time"):
`useWorkspaceBootstrap.ts` (the `BootstrapOverrideRow` type) and `resourceStore.ts` (the `WorkspaceOverride` type and four `notes: ""`
defaults); they carry the same field down the type chain and the retirement does not compile without them. No other open PR touches
any of the files above (checked; S8-D #990 touches `supabase-server.ts` export only, a different region).
Also ungranted at the time, granted after the fact by ruling (coordinator, 2026-10-08, "nothing to remove"): the new nav stub
`stub-next-navigation-item.mjs` (the shell-slot smoke needs a detail-route pathname), the `ux-smoke-specs.mjs` and `F35` registrations
(they are what make the smoke run), the `dispatch-kinds.npmtest.mjs` change (its kind list includes `assignment`), and the new
retirement test `notes-path-retired.test.mjs`.

### What is NOT done
- The data move is staged, not run (no population before every layer is complete).
- Migrations 358 and 359 are not applied; apply both BEFORE deploying the routes, then merge the code.
- No notification email or Slack channel; in-app bell only (the existing machinery).

### Open items for the coordinator
- `src/app/api/community/notifications/route.ts` header comment still lists the old kinds (comment only).
- `.discipline/rendering/layout-guard/manifests.json` still lists the artboard-derived rail card "Your notes" for `/market/[slug]`
  (generated from the artboard; the full rendering guard passes with the card gone). Claude Design owes the artboard change below.

### DESIGN CHANGES OWED (Claude Design, rule 20; artboard 22 and the four detail artboards 03, 05, 07, 09 draw none of this)
- Two sections at the foot of every detail page, after the last designed section and outside the section index: "Notes"
  (composer first, then notes newest first, author and relative time, Edit and Delete on the row, inline delete confirm)
  and "Assignments" (assignee chips with state and due date, Mark done or Reopen, Remove, then the member picker as toggle
  chips, a date field and the one primary Assign button whose label counts the people). Sections carry no S ordinal.
- Artboard 05 draws a rail card "YOUR NOTES"; the build RETIRED it (the foot Notes section does the same job, never two
  copies). The artboard and the layout-guard manifest must drop that rail card; the Market rail is now At a glance, Impact
  assessment, Relevance, In this list, Legend.
- Notification row for kind `assignment` ("Assigned", UserCheck icon).
- Phone layout at 375 for both sections (chips wrap, buttons 44 px).

### Value Delivery Check
This dispatch's work DOES directly advance customer-facing value delivery. Surfaces: Regulations, Market Intel, Research
and Operations detail pages (the shared detail shell) gain private workspace notes and assignment; Community's notification
bell carries the new `assignment` kind. Community remains social only (ADR-041): nothing flows from notes or assignments
into any Community page. Map, Intelligence Assistant, Onboarding: not touched. Dual posture: serves the current cohort and
any future organisation equally (org-scoped by membership, no vertical assumption).

## UX compliance

Blocks added: Notes section and Assignments section at the foot of every detail page (one DetailShell slot).
- Notes. Primary goal: leave the team a note about this item. Path in steps: type, then Add note (2). One primary action:
  Add note. Feedback: the button reads "Adding..." and disables at once; success is stated ("Note added."), the note appears
  first and the composer clears; failure shows the API's plain message beside the preserved text. Edit is offered on your
  own notes (Save is primary inside the row, Cancel beside it; "Saving..." then "Note saved."). Delete follows the
  server's per-note rights (your own notes; every note for an owner or admin) and warns first with a two-step inline confirm ("Delete note" / "Keep it"; "Deleting..." then "Note
  deleted."). Empty and read-only states say what the section is and what the role can do. Character counter is shown.
- Assignments. Primary goal: make sure the right people own acting on the item. Path: pick people, optionally a due date,
  then Assign (2 to 3). One primary action: Assign, its label counts the people picked and it stays disabled with "Pick at
  least one person." until someone is picked. Feedback: "Assigning..." at once, then "Assigned N people. N notified."; a
  failure keeps the picked people and the date and says what to fix. Chips: Mark done or Reopen ("Saving..." then "Marked
  done."), Remove (then "Removed <name>."). The picker lists only members who can be assigned (member, admin, owner; never a viewer) and are not already
  assigned. A due date in the past is refused in the click handler with a plain message and the picked people kept.
- Touch targets: every button, chip, date input and textarea is at least 44 px; asserted by the guard at 375, 768, 1024 and
  1280 (36 checks, 0 failures).
- Text: names and note bodies wrap anywhere, no horizontal overflow at 375 with 100 character unbroken tokens (extreme state).
- Row components added: `ItemNotesBlock.tsx` and `ItemAssignBlock.tsx`, both carry `data-guard-title` (author and assignee
  names), mounted by `item-collab-smoke.mjs`, listed in F35 `ROW_COMPONENTS` (two lines) and the spec is registered in
  `ux-smoke-specs.mjs` (one import, one entry). Both registry edits are in this PR because the lane contract's F35 line
  was in the brief's write set; the S3-B lane did the same.
