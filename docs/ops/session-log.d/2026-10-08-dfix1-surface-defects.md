# 2026-10-08 lane DFIX-1 (dfix1-surface-defects): the design audit's build defects and the dispositioned data defects

Branch lane/dfix1-surface-defects, cut from origin/master 910f35a75. Prior decisions: DAUDIT-2 (PR 1049) BUILD DEFECTS (9 rows),
rule 20 (artboards govern look), the audit specs under fsi-app/.discipline/rendering/audit/spec/ as the oracle. PR
coord/flag1-dispositions had not merged at start, so the data-defect rows came from the DISPO-1 table
(docs/ops/session-log.d/2026-10-09-dispo1-dispositions.md on lane/flag1-disposition-gate).

## Accomplished

Four BUILD DEFECT components fixed and seven DISPO-1 data-defect rows closed or refuted with evidence; every fact below was confirmed by the run named beside it.

### Build defects (the spec row is the test; `npm run audit:design` run once at the end, results.json and the AUDIT document committed as generated)

| Row (audit id) | Before | After | Test, red then green |
|---|---|---|---|
| compose-12-community#661 (CommunityRooms.tsx head) | "New post . Global room" | head reads `selected.short`; aside and labels keep the full name | CommunityRooms.composition.npmtest.mjs red (2 source assertions), green. Audit row still MISMATCH: the audit MOUNT fixture (`mounts.mjs:1782`) gives the room `short: 'GLO'`, so the measured text is "New post . GLO". See NEEDS WRITE-SET EXPANSION. |
| mobile-03#1567 to #1571, #1596 (ui/Timeline.tsx) | one horizontal layout at every width, 1 MISMATCH + 4 NOT BUILT + 1 bounds NOT BUILT | wide block (`cl-timeline-wide`) hidden under 768 by the component's own `<style>`; narrow block with the 62px / 14px / 1fr rows, 2px track, same four-marker window, same callout | new Timeline.npmtest.mjs: 7 of 8 red against the old file, 8 of 8 green; all six audit rows MATCH (plus 11 new MATCH rows from the spec) |
| compose-07-research-detail#479 (ResearchFindingDetailSurface.tsx) | index advertised "S1 Summary" with no section#summary for a finding that is not record grade | non-record branch renders S1 Summary from whatIsIt, note, whyMatters; S2 fallback no longer repeats the prose | new ResearchFindingDetailSurface.npmtest.mjs: 3 of 5 red against the old file, 5 of 5 green; audit row MATCH |
| admin-issues-rail#46 (ui/RailCard.tsx title weight) | 800 | 700 (parts brief 2.12, dc.html p13); MOBILE 390 "At a glance" spec row fixed to 700 with the ruling cited | RailCard.npmtest.mjs red then green; audit row MATCH |

Rule-20 consequence found by the audit run: three eyebrow-label rows of `railcards.json` asserted 800 for the same RailCard title; changed to 700 with the same note (they are the spec rows for RailCard). Two more specs assert 800 for the same title and now read MISMATCH (see NEEDS WRITE-SET EXPANSION).

Audit totals after the run: 73 specs, 2534 checks, MATCH 2469, MISMATCH 53, NOT BUILT 12. Rows that differ from the committed results.json and are NOT caused by this lane: compose-08 (`.cl-masthead-dek` NOT BUILT, filters-rail `.cl-facet-row` height 24 vs 44) and list-surface (4 facet rows 24 vs 44). Confirmed by stashing this lane's src and spec changes and re-running those two specs on the pristine tree: the same 1 NOT BUILT + 1 MISMATCH and 4 MISMATCH appear.

### Data defects (each a failing test first, except where the flag dissolved)

| Row | Result |
|---|---|
| 02-l3:188 chips 3-bucket vs richer producer output | CredibilityChipAuthority takes the producer's shape (`unknown`, `integrityFlagged` optional) and prints "N unknown standing" and "N integrity-flagged" when above zero. Test builds the distribution with the producer's own `aggregateAuthorityDistribution` and renders the chip (CredibilityChip.npmtest.mjs): 1 red, then green; three-bucket callers unchanged. |
| 03-l12:160, 164 Findings not rendering for record-grade market items; dead S2 anchor | [REFUTED as open] already fixed by the L12 addendum itself (2026-10-03): `showFindings = !isRecord \|\| carbonOverlayResolved \|\| !!corridorCostView` gates both the section and the index entry (MarketSignalDetailSurface.tsx), and market-detail-raw-dump-smoke.mjs cases `l12-findings-record-resolved` and `l12-findings-record-unresolved` assert both directions. Re-ran that smoke on this tree: 8 checks, 0 failures. No code change. |
| 05-p2:106 chips ellipsise at 768 to 1023 | [REFUTED as open] the 169 px title column was measured on the old 8-column grid; PAR-1 (2026-10-07) replaced 768 to 1023 with the stacked row (chips wrap whole on line 3). Measured today in headless Chromium, ListRow with five bias tags: title 627 px at 768, 759 at 900, 882 at 1023; no chip clipped at 768, 900, 1023, 1024, 1100; no horizontal overflow. ListRow.npmtest.mjs already pins the CSS. No code change. |
| 05-p2:109 citation titles not links | InferenceClaim takes `resolveCitationHref`; a cited title with an href is a link of its own at min-height 44; without one it is plain text (byte-identical to before). The href comes from `readCustomerInferences` (`hrefs` map, built in supabase-server.ts with the existing `itemDetailHref` from the item's type and domain), through InferenceSection. Tests: inference-view.test.mjs (2 new) and grade-and-inference.npmtest.mjs (2 new), red then green. The admin InferenceReview passes no resolver and is unchanged. |
| 08-alias1:42 alias writer ON CONFLICT DO NOTHING | `buildAliasRow` + `writeEntityAliases` in entities/resolve.mjs (upsert with `ignoreDuplicates` on the full primary key, chunks of 200, inserted versus skipped counted from the rows the database returns, a database error thrown). resolve.test.mjs: import failed red, then 19 of 19 green. |
| 08-sec5:105 author_user_id on anonymous posts | `authorIdForViewer`, `idWithheldForAnonymity`, `viewerAdminIfNeeded` in community/identity.mjs; `authorBlockForPost` takes `viewer`. Applied in the read path of posts GET and POST, post GET and PATCH, replies GET and POST, entity threads GET (the last now selects `anonymous` and reads identities). Anonymous means post flag, account default, or an identity that could not be read (fail closed). The id reaches the author and a platform admin (`readOwnPlatformAdmin`, read once and only when an id was withheld from a non-author). Tests on the real handlers with a fake client (community-identity-routes.npmtest.mjs): 5 red then 15 of 15 green, anonymous stranger, author, admin, per-user default, failed identity read, all four read routes. identity.test.mjs: two tests that encoded the leak were corrected. |
| 08-s8e5:124 OperationsDimension consumers assuming six values | Grep of src, scripts and .discipline for the dimension names: the only code consumers are `operations-matrix.ts` (`ALL_OPERATIONS_DIMENSIONS`, already seven) and OperationsLedger.tsx, which held a second hand-typed list. The ledger now maps the constant (`DIMENSION_DISPLAY` is a `Record<OperationsDimension, ...>`, so tsc refuses a missing entry). OperationsLedger.npmtest.mjs: 2 red then 7 of 7 green; a new test pins migration 378's CHECK list to the same seven values. Remaining six-value copies are outside the write set, see below. |

## Read and reused

- Read: CLAUDE.md, lane-common-contract headings and the UX contract, ux-laws.md and design-principles.md DP-2, COMMON.md and the brief, the DAUDIT-2 log (BUILD DEFECTS, decisions), the DISPO-1 table, the L3, L12, P1/P2, ALIAS-1, S8-E5 and SEC-5 session logs for their rows, the audit README and the mobile-03, compose-07, railcards and admin-issues-rail specs, the deleted `DetailTimeline` (git show b4b47b01e^) for the vertical stack, migration 377 and 378, `authority-score.mjs`.
- Reused, not rebuilt: `classifyMilestones`/`collapseTimeline` and the dot-style helpers for the narrow timeline, `StateNote` callout (extracted once as `TimelineCallout`, used by both blocks); Operations' real-field Summary fallback for the research Summary; `aggregateAuthorityDistribution` as the chip test's source; `itemDetailHref`, `fetchAllRows`-style chunking convention for the alias writer, `readOwnPlatformAdmin` for the admin answer; the esbuild plus react-dom/server render technique of ImpactMeter.npmtest.mjs; the jiti route harness of community-identity-routes.npmtest.mjs; the sanctioned node_modules link beside the worktrees (no link inside the worktree).

## Decisions

- Narrow timeline breakpoint is 767px, the phone boundary PAR-1 uses; the narrow block keeps the header, the four-marker window with "+N more", and the callout with Full schedule, so nothing the wide block showed is lost under 768. Rows carry labels only; the Next line is the callout's (not repeated per row).
- A flag that dissolves under evidence is corrected in place (rule 13 corollary): 03-l12 (both rows) and the 768 half of 05-p2 are closed as already fixed, with the evidence above.
- Fail closed on an unresolved author identity: not known to be public, so the id is withheld from non-authors.

## NOT done / NEEDS WRITE-SET EXPANSION (nothing below was touched)

- `fsi-app/.discipline/rendering/audit/mounts.mjs:1782`: the Community audit mount's room has `short: 'GLO'`; the real `rooms.ts` short is "Global". One value changes and compose-12-community#661 reads MATCH. Until then that row stays MISMATCH ("New post . GLO").
- `fsi-app/.discipline/rendering/audit/spec/inthisliststat.json` and `.../section-card-lists.json`: each has one row asserting the RailCard title at font-weight 800; both now read MISMATCH (700) and need the same change to 700 as railcards.json.
- `fsi-app/src/components/community/PostComposer.tsx:33`: `CommunityPostAuthor.user_id: string` is now `string | null` on the wire for anonymous posts; the client type should say so (no component reads it today).
- `.discipline/rendering/audit/mounts.mjs:521` keeps a verbatim six-entry copy of the Operations DIMENSIONS ("all 6"); the comments in `scripts/entities/seed-corridors.mjs:37` and `src/lib/regional/state-cost-facts-envelope.mjs:8` still say six. The mount copy should be seven (or import the constant).
- Not run locally per COMMON rule 9: the whole suite, fitness runner, tsc, lint. Run locally and green: every touched test file plus the neighbouring community, detail, operations and agent-format tests (482 of 482), the registered UX smokes for the touched components (13 specs, 0 failures), `npm run audit:design` once.
- The `[WORK: DFIX-1]` tokens do not exist on master (the disposition PR has not merged), so `[CLOSED: PR 1059]` is appended (token edit only) to the last line of each item named in the data-defect table: l3 item 3, l12 items 2 and 3, p2 (both bullets), alias1 open item, s8e5 first NOT done bullet, sec5 residual. When the disposition PR merges, its tokens on those lines are superseded by these.

## UX compliance

- Timeline (ActionCard TIMELINE block, narrow form). Primary goal: see what has passed and what comes next. Path: zero steps, read in place; the vertical form removes the sideways reading of ellipsised labels at 375 to 390. One primary action: the Full schedule link in the callout (unchanged, a quiet link). Async actions: none. Targets: no new interactive element; "+N more" is the existing link.
- Research finding detail, Summary section. Primary goal: the 30-second read. Path: the index tab Summary now lands on a section (law 3, 9: essentials first). One primary action: none added. Async: none.
- Citation links (InferenceClaim in the Inferences section). Primary goal: open what an inference is drawn from. Path: one tap on the cited title. One primary action: the link itself, 44 px tall (law 2). Async: none (navigation).
- Community New post head, RailCard title weight, credibility chip label, Operations ledger dimension list: no new action; visual or textual only (chip label adds two counts only when above zero).
