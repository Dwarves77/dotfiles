## 2026-10-07, lane s8b-tag-attribution: a workspace tag shows who applied it and when

Plan Stage 8 (tag attribution). Inside a workspace the members see each other's names (Community pseudonymity does not apply). No database, no network; everything below was run on fixtures. Migration 360 is written and NOT APPLIED.

### Accomplished
- Read of migration 313 settled the open question in the brief ("the join may lack author columns"): `item_workspace_tags` already holds `created_by` (uuid, nullable, ON DELETE SET NULL) and `created_at` (timestamptz, NOT NULL, default now()), and the PUT route already stamped `created_by` from the session. No `applied_by` / `applied_at` column was added: a second copy of the same two facts would be the drift class. Migration 360 therefore adds no column; it asserts the pair's shape, names it "the attribution" in the column comments, and changes no RLS and no data (no backfill).
- Real write defect found and fixed: the PUT route upserted on (tag_id, intelligence_item_id), so a second apply of the same tag rewrote `created_by` to the re-applier while `created_at` kept the first time, pairing one member's name with another's date. It now upserts with `ignoreDuplicates: true` (ON CONFLICT DO NOTHING); the first applier and date stand.
- `src/lib/tags/attribution.ts` (new, pure): `memberDisplayName` (full name, else display name; never an email), `buildApplications`, `formatAppliedDate` (UTC, "3 Sep 2026"), `attributionText` ("applied by Ada Lovelace on 3 Sep 2026"; "a former member" when the account is gone, "a workspace member" when the profile has no name).
- `GET /api/workspace/tags?itemId=` now also returns `applications` (tag id, author id, author name, applied-at) for that item, via `loadItemApplications` in `src/lib/tags/server.ts` (bounded read of the item's join rows plus one profiles lookup; a read error degrades to no attribution, never a failed response).
- Render: `WorkspaceTagPill` takes an optional `title`; `DetailTagRow` passes the attribution as each applied chip's title; `TagPopover` shows a muted second line "applied by <name> on <date>" on each applied row (truncates with the full text in its title) and reads the author and date back after an apply.
- Pre-existing 375 defect found by the new 375 pass and fixed: the 280px popover panel is anchored after the applied chips, so on a phone it ran off the right edge (panel right edge at x=523 in a 375px viewport, page scrolled sideways). `TagPopover` now shifts the panel back inside the viewport (recomputed on open and resize) and caps it at viewport width minus 16px.
- The workspace-tags smoke spec had its route order backwards (Playwright tries the most recently registered route first, and `**/api/workspace/tags**` also matches the items path), so the list handler answered every PUT and no server state ever changed; the original "apply adds a pill" check passed because the popover always lists every tag. Fixed in this spec (items route registered last) and the new checks assert the read-back.

### Read and reused
Read: COMMON.md, s8b.md, CLAUDE.md, lane-common-contract, ux-laws.md, design-principles.md (DP-1, DP-2), migration 313, migration 357 and its test (header and test shape), the tags GET/POST/DELETE route and the `[id]/items` route, `route.npmtest.mjs`, `src/lib/tags/{server,client,types,useWorkspaceTagsFacet}.ts`, `TagPopover.tsx`, `DetailTagRow.tsx`, `Chips.tsx` (WorkspaceTagPill), `workspace-tags-smoke.mjs`, `harness.mjs`, `ux-harness.mjs`, `route-guard.ts`, `org.ts`, `archive-impact/route.ts` (profile name lookup precedent), `run-test-suite.sh` and `run-npmtest-suites.sh` (test discovery). Reused: the existing `created_by`/`created_at` columns (no new ones), `requireUserRoute`/`resolveOrgIdFromUserId`, the route test's jiti-alias stub technique, the smoke harness (`bundleEntry`, `measureGuard`, `assertGuardClean`), the profiles `full_name`/`display_name` lookup shape, `WorkspaceTagPill` and `TagPopover` (extended, no new component). S8-A's files (DetailShell.tsx, migrations 358 and 359) were not touched.

### Decisions
- Reuse `created_by`/`created_at` instead of adding `applied_by`/`applied_at` (the brief said "if absent"; the pair is present under other names). If the literal column names are wanted, that is a rename migration plus the same code; flagged, not done.
- Author names come from `profiles.full_name`, else `display_name`; no email is ever returned or shown.
- Attribution is shown for the open item's chips and its tag list only. List rows (`ListRow` tags) and the saved-search tag filter are unchanged: ListRow.tsx is outside the write set.
- The PUT-route attack test lives in `src/app/api/workspace/tags/item-attribution.npmtest.mjs`, not beside the route: a bracketed directory name (`[id]`) is read as a glob character class by `node --test` path arguments, which would run zero tests silently.

### NOT done
- Migration 360 is not applied (it is comment-and-assert only, so no dependent code waits on it).
- The row tags on list pages carry no attribution title (ListRow.tsx not in the write set; `withItemTags` returns ids only).
- No live-data check; no data population.

### DESIGN CHANGES OWED (for Claude Design)
- Artboard 22 does not draw the attribution. Built as: chip tooltip "applied by <name> on <date>", and a muted 11px second line on each applied row of the tag popover, truncating. Please draw it, including the long-name case.
- The tag popover panel is 280px; on a phone it is now shifted left to stay inside the viewport. Please draw the narrow-width placement (full-width sheet, or anchored panel).

### Evidence
- Red against the old source (src changes stashed, new tests kept): `item-attribution.npmtest.mjs` 1 of 4 fails (repeat apply is not ignore-duplicates); `route.npmtest.mjs` 1 of 9 fails (no `applications`); `DetailTagRow.npmtest.mjs` 2 of 2 fail; smoke `workspace-tags` 8 failures (no chip title, no attribution lines, no read-back after apply, 375 panel at x=522.6 past the 375px viewport, page scrolls sideways).
- Green on the new source: `attribution.test.mjs` 5/5, `item-attribution.npmtest.mjs` 4/4 (includes the attack: forged `created_by`, `createdBy`, `applied_by`, `appliedBy`, `appliedAt`, `created_at` and `org_id` in the body are ignored; the row keys are exactly tag_id, intelligence_item_id, org_id, created_by), `route.npmtest.mjs` 9/9, `TagPopover.npmtest.mjs` 7/7, `DetailTagRow.npmtest.mjs` 2/2, `Chips.npmtest.mjs` 10/10, `360_workspace_tag_attribution.test.mjs` 6/6, smoke `workspace-tags` 18 checks, 0 failures (the spec's own bundle in a real chromium at 1280 and 375). `tsc --noEmit` clean. `docs/inventories/migrations.md` regenerated with its generator (324 rows, 1 added).

### UX compliance
- Screen/block: item tag chips (detail header) and the + Tag popover list.
- Primary goal: see who tagged an item and when, and tag or untag it. Path: zero steps to read (hover a chip for the title, or open the list where each applied row says it); one tap on a row to apply or remove.
- Primary action: apply or remove a tag (the row tap); the attribution line is read-only and quieter (11px muted).
- Feedback states: apply and remove keep the existing immediate check mark and chip update; after an apply the attribution line appears from the server read-back. A failed attribution read shows no line rather than an error (the tag itself still works). Targets: rows keep their 40px minimum height and are otherwise unchanged by this lane; the attribution line is not interactive.
