# Caro's Ledge — Sprint 3 Remediation Dispatch

**Date:** May 25, 2026
**Predecessor:** v3 remediation dispatch (closed at commit cbfa471)
**Scope:** Close every gap deferred from v3. Bring every page to full mockup fidelity. Address foundational data work that unblocks downstream UI honesty.
**Authority:** Claude Code may reorder within phases based on code dependencies. Operator-decision gates are non-skippable.

---

## 1. Scope honest accounting

v3 closed with these gaps documented:

**Data-layer gaps (block honest UI):**
1. Classifier quality: 468+ rows need review/cleanup (409 ambiguous category + 24 d=1 'research' + 32 non-canonical + 3 surfaced misclassifications)
2. Agent prompt doesn't emit `signal_band` or `theme` columns
3. `intelligence_items.trajectory_points` schema doesn't exist
4. `profiles.verified` column doesn't exist
5. Thread priority/urgency signal doesn't exist on `community_posts`
6. `intelligence_item_sections` table not backfilled for 11 of 14 regulation brief sections
7. `regional_data_facts` not backfilled for Asia/UK/UAE D2-D6 dimensions
8. `community_post_topics` aggregate query doesn't exist
9. `profiles` projection (org_id, workspace_role, sector, region) partially landed — needs completion

**Workflow/UI gaps (depend on data + dispatch):**
10. Multi-org-switcher missing (silently locks users to oldest org)
11. Admin restructure (retire legacy 11-tab strip, canonicalize 6-section-card design)
12. Community editorial pickup notification wiring (server-side emit + notification_type entry)
13. /admin Community pickups Path C upgrade (explicit `editorial_review_requested_at` flag if Path A heuristic insufficient)

**Cross-cutting capability gaps (apply to every surface):**
14. Watchlist mechanism (universal, polymorphic on item_type)
15. Share mechanism (URL + post-to-community)
16. Export mechanism (PDF / CSV / Markdown)
17. Alerts / notifications-on-change
18. Bookmark + follow-theme / follow-jurisdiction
19. Citation generator
20. Action assignment to team member
21. Deadline reminders
22. Region/signal compare side-by-side
23. Cross-link intelligence items in posts/briefs

**Performance/maintenance:**
24. /map cache-payload trimming (`getAppData` exceeds 2MB)
25. Skill cleanup (sprint-followups-discipline 4 stale named rules)
26. /map sub-jurisdiction pin density toggle (optional drill mode)

That's 26 discrete items. Sprint 3 ships them across 9 named dispatches.

---

## 2. Authority and constraints

### Hard constraints (carry forward from v3)

- **Verification gate:** every UI-touching item exercised in dev server with browser observation before commit. Operator browser-tests at risk-tier-appropriate cadence.
- **Atomic commits per dispatch/phase**, no batch-commits across dispatches.
- **Design reference protocol binds:** read `design_handoff_2026-05/[surface].html` before writing code for any surface. Pre-build checklist applies.
- **Integrity rule absolute:** drop visual UI when data doesn't support it honestly. No fabricated data, no placeholder-as-fact, no engagement-as-urgency conflation.
- **Mockup-vs-prior-instruction divergences surfaced before implementing.**
- **No new fitness functions, ADRs, or discipline rules.** Engine slim policy holds.
- **No paste simplification that drops integrity qualifiers.**

### What's different from v3

- **Larger scope, longer arc.** v3 was 25 commits. Sprint 3 is 60-80 commits estimate. Expect multi-session execution.
- **Cross-dispatch dependencies are explicit.** Some dispatches unblock others. Respect the order.
- **Per-dispatch operator green-light at completion**, not per-phase within dispatch. Claude Code drives a dispatch end-to-end, surfaces completion, operator browser-tests + green-lights, then next dispatch starts.

---

## 3. Sprint 3 dispatch sequencing (hard dependencies respected)

### Group A — Foundational data work (must ship first)

These unblock downstream dispatches. Each touches the data layer in ways that downstream work depends on.

| # | Dispatch | Why first | Unblocks |
|---|---|---|---|
| A1 | Classifier-quality review | Cleans 468+ rows that contaminate every surface's data | Honest /research routing, /market band routing, /regulations topic display |
| A2 | Agent prompt extension | Emit signal_band + theme columns at ingestion time | /market signal-band routing column-first; /research theme routing column-first; replaces regex fallback |
| A3 | Profiles projection completion | Workspace_role + sector + region columns honest end-to-end | Multi-org-switcher (Group C); community author identity (closes H6 graceful degradation); admin-restructure permissions |
| A4 | Trajectory schema + ingestion | `intelligence_items.trajectory_points` JSONB or `signal_trajectory` table + agent classifier extension | /market real trajectory bars (closes H1 Path A); replaces empty-state placeholders |
| A5 | Intelligence item sections backfill | Populate `intelligence_item_sections` for 11 of 14 regulation brief sections | /regulations/[slug] full 14-section render (closes Phase 1.5 audit § 3 partial) |
| A6 | Regional data facts backfill | Populate `regional_data_facts` for Asia/UK/UAE D2-D6 | /operations dimension full coverage (closes Phase 1.5 audit § 6 partial) |

### Group B — Universal capability platform (depends on Group A)

The cross-cutting capability dispatch. Builds the universal mechanisms that every surface consumes. One dispatch with multiple internal phases because building these as one-off-per-surface creates 5-6 implementations of every capability.

| # | Phase within capability dispatch | Scope |
|---|---|---|
| B1 | Watchlist mechanism | Polymorphic `user_watchlist(user_id, item_type, item_id, added_at)`. Buttons on every intel item card. Watchlist view at /watchlist. |
| B2 | Share mechanism | `/api/share/[item_type]/[item_id]` returns shareable URL + OG metadata. Share button on every intel item detail page. Optional post-to-community handoff. |
| B3 | Export mechanism | `/api/export/[item_type]/[item_id]?format=pdf\|csv\|md`. Export button on /regulations/[slug] + /research/[slug] + /market/[slug] + /operations. Bulk export from index pages. |
| B4 | Alerts / notifications-on-change | Subscribe to item / theme / jurisdiction / region. Notification dispatcher pubsub. /notifications view. Email digest opt-in. |
| B5 | Bookmark + follow | Lightweight bookmark (sibling to watchlist for non-watch-list cases). Follow-theme + follow-jurisdiction subscriptions. /following view. |
| B6 | Citation generator | "Cite this finding" button on /research/[slug]. Copies formatted citation block. |
| B7 | Action assignment | Assign action to team member from /regulations/[slug]. Requires teams table; if absent, requires schema addition. |
| B8 | Deadline reminders | Set personal deadline reminder from /regulations/[slug]. Notifications dispatcher (B4) integration. |
| B9 | Compare side-by-side | Compare two signals (/market) or two regions (/operations) side-by-side. New `/compare` route or modal. |
| B10 | Cross-link intelligence items | Mention intel items in /community posts. `referenced_intelligence_item_ids` column already exists (migration 104); needs UI to populate. |

### Group C — Workflow dispatches (depend on Groups A + B selectively)

| # | Dispatch | Depends on | Scope |
|---|---|---|---|
| C1 | Multi-org-switcher | A3 (profiles projection) | Identity/workspace chrome. State + persistence + per-route invalidation + UI switcher dropdown. |
| C2 | Admin restructure | A3 (profiles.workspace_role for permissions) | Retire legacy 11-tab strip cleanly. Migrate remaining content to 6-section-card destinations. Sources / Workspaces / Ingest / Coverage / Research pipeline / Community pickups become full nav primitives. |
| C3 | Community editorial pickup notification wiring | A3 (profiles projection for author identity) + B4 (alerts dispatcher) | Server-side emit on PromotePostDialog success → notification_type entry → user-facing notification on promoted post's author. Closes Phase 1.5 audit § 7 flow 17. |
| C4 | Community editorial-review-flag (if needed) | None — independent | Optional Path C upgrade: add `community_posts.editorial_review_requested_at` column + toggle UI on community thread view. Only fires if H5 Path A heuristic proves insufficient in operator review. |

### Group D — Specific design gap closures (independent, low-dependency)

| # | Dispatch | Scope |
|---|---|---|
| D1 | Community thread urgency + verified variants | A3 (profiles.verified) + new column on community_posts (priority/urgency signal). Closes /community .urgent + .verified data-shape gaps. |
| D2 | Community topic-by-region aggregate | A1 (classifier quality) for clean topic_tags. Backs the placeholder constants with real `community_post_topics` aggregate query. |
| D3 | /map sub-jurisdiction pin density toggle | Optional drill mode for sub-jurisdiction visibility on the map. Operator-decide if Sprint 3 scope or further deferred. |

### Group E — Performance/maintenance (run parallel where possible)

| # | Dispatch | Scope |
|---|---|---|
| E1 | /map cache-payload trimming | `getAppData` exceeds 2MB. Trim payload, split into lazy-loaded sub-queries, OR migrate to RPC. Address pre-existing performance debt before mobile users surface it. |
| E2 | Skill cleanup | Sprint-followups-discipline 4 stale named rules (Dispatch-artifact commit-summary, Inventory-artifact emission, ADR cross-reference, Inventory consistency). Cleanup pass. |

---

## 4. Execution sequence

### Recommended ordering

**Phase 1 (parallel): Group A foundational data work.**
- A1, A2, A3 run in parallel (independent schema work)
- A4, A5, A6 run after A1 lands (depend on clean data baseline)
- Operator browser-tests each as it lands
- All of Group A must complete before Group B starts

**Phase 2: Group B universal capability platform.**
- B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 → B10 in dependency order
- B1 (watchlist) ships first as the canonical pattern; subsequent capabilities mirror its data shape
- Each B-phase atomic commit per capability
- Operator browser-tests each B-phase before next

**Phase 3 (parallel where possible): Group C workflow dispatches.**
- C1 (multi-org-switcher) starts when A3 + B1 land
- C2 (admin restructure) starts when A3 lands
- C3 (editorial pickup notification) starts when A3 + B4 land
- C4 fires only if operator review of H5 surfaces insufficiency

**Phase 4 (parallel): Group D specific closures.**
- D1 starts when A3 lands
- D2 starts when A1 lands
- D3 operator-decides scope

**Phase 5 (run parallel throughout): Group E maintenance.**
- E1 starts immediately (independent)
- E2 starts immediately (independent)

### Per-dispatch verification gate

Same risk-tier pattern as v3:

- **LOW RISK** (E2 skill cleanup, A1 classifier review documents-only commits): type-check + code-grep verification sufficient
- **MEDIUM RISK** (A2 agent prompt, A4 trajectory schema, A5/A6 backfills): batch operator browser-test at phase end
- **HIGH RISK** (Group B every capability, C1 multi-org-switcher, C2 admin restructure, C3 notification wiring, D1 variants): per-commit operator browser-test before next commit

---

## 5. Operator decisions LOCKED before Sprint 3 starts

These are operator-defaulted and locked. Claude Code does NOT re-surface these for re-decision.

| # | Decision | Locked answer |
|---|---|---|
| 1 | Scope | **Option A — full backlog.** Every v3 gap closes in Sprint 3. ~60-80 commits, multi-session. |
| 2 | Group B capability scope | **Option A — full universal capability platform.** Build all 10 capabilities once, applied across every surface. Per-surface implementations off the table. |
| 3 | A1 classifier-quality approach | **Option B — Haiku batch + 10% spot-check.** Haiku classifies 468 rows (~$1-2 cost), operator spot-checks ~47 rows, accept or reject batch. |
| 4 | A4 trajectory schema | **Option A — `intelligence_items.trajectory_points` JSONB column.** Simpler; time-series query needs unclear, revisit if they emerge. |
| 5 | B7 action assignment | **Option A — lightweight, use existing org_memberships as the team.** No teams table addition unless operator surfaces explicit need. |

---

## 6. Estimated effort and timeline

Honest estimate based on v3 throughput (~25 commits across the dispatch's active phases):

| Group | Commits estimate | Sessions estimate |
|---|---|---|
| A (foundational data) | 12-18 | 2-3 |
| B (capability platform) | 25-35 | 4-6 |
| C (workflow dispatches) | 10-15 | 2-3 |
| D (specific closures) | 5-8 | 1-2 |
| E (maintenance) | 3-5 | 1 |
| **Total** | **55-81** | **10-15 sessions** |

A "session" is a sustained working block similar to today's dispatch arc.

---

## 7. What to expect from execution

- **Per-dispatch completion reports** committed at `fsi-app/docs/dispatches/sprint3-[dispatch-name]-completion.md`
- **Per-dispatch browser-test gates** before next dispatch starts
- **Pre-build mockup-read** on every UI-touching dispatch
- **Surface mockup-vs-prior-instruction divergences** before implementing (same protocol as v3)
- **Atomic commits per phase/dispatch**
- **No paste simplification that drops integrity qualifiers**
- **For source-identity calls where current naming, status, mergers, or renames could be in question, web-search verify before deciding.** Training data unreliable for organizational status post-late-2025.

---

## 8. Group A specific instructions for execution

### A1 Classifier-quality dispatch (LOW RISK after spot-check)

Run Haiku batch over the 468+ rows needing review:
- 409 ambiguous category rows (from Phase 3D deferral)
- 24 d=1 'research' category rows (from earlier reconciliation)
- 32 non-canonical category rows (set to value not in TOPICS taxonomy)
- 3 specific surfaced misclassifications (Green Corridors initiative misclassified as regulation; UNDP Environmental Finance misclassified as regulation; 5x EcoVadis inconsistency)

Cost ceiling $5 (per-call ~$0.0025 per Step 2 calibration, 468 rows = ~$1.17 expected). Confirm cost estimate before invoking; abort if estimate >$5.

Output: `docs/audits/sprint3-classifier-quality-batch-2026-05-XX.json` with Haiku recommendations per row.

Operator spot-checks 10% (~47 rows) — surface as a docs commit for operator review.

After operator green-light on spot-check, batch-apply the recommendations: atomic commit per row-class (category change vs domain change vs item_type change).

Verification: spot-check 10 known misclassified items post-apply (Green Corridors, UNDP, EcoVadis × 5, plus 3 random).

PAY ATTENTION: A1 classifier-quality changes will likely shift item routing between surfaces. After A1 applies, masthead counts on every surface may change. Re-run cross-surface count reconciliation per Phase 2A pattern and surface any unexpected count deltas before A1 considered green.

### A2 Agent prompt extension dispatch (MEDIUM RISK)

Extend agent prompt at `src/lib/agent/system-prompt.ts` to emit:
- `signal_band` (`price | corporate | corridor`, nullable for non-market)
- `theme` (one of 7 Research themes, nullable for non-research)

Extend parser at `src/lib/agent/parse-output.ts` to read those fields.

Extend `seedRow` in worker first-fetch at `drain-first-fetch/route.ts:295-314` to write those columns.

After deployment, monitor next 24h of ingestion — verify new items have `signal_band + theme` populated when applicable.

Refactor regex classifiers in `MarketPage` / `ResearchView` to read columns first, regex fallback only for legacy data (the regex-fallback in v3 Phase 3C stays as belt-and-braces).

Surface for operator review when first batch of new ingestion lands with the columns populated.

### A3 Profiles projection completion dispatch (MEDIUM RISK)

Verify migration 105 actually populated `org_id`, `workspace_role`, `sector`, `region` on profiles. If gaps (NULL on existing profiles), backfill via SQL using `org_memberships` + `workspace_settings` join.

Wire community author identity display (currently graceful-degrades per H6) to use the projection columns end-to-end.

Wire any other surface that depends on profile projection (admin permissions, settings sector display, etc.).

Spot-check 10 community posts render author identity with org name (orange) + workspace_role + sector + region.

PAY ATTENTION: A3 profiles projection completion may surface profiles that should have been multi-org but were silently single-org. If user has memberships in multiple orgs but `profiles.org_id` only stores one, the multi-org-switcher dispatch (C1) inherits the ambiguity. Resolve A3 to use `org_memberships` as the source of truth, `profiles.org_id` as the "current active org" pointer.

### A4 Trajectory schema dispatch (MEDIUM RISK) — runs after A1

Migration 107: `ALTER TABLE intelligence_items ADD COLUMN trajectory_points JSONB`.

Extend agent prompt to emit trajectory data when source has time-series content (B1 Price band items specifically — fuel prices, carbon prices, freight rates).

Backfill existing B1 items where source content includes parseable time-series data (best-effort; rows without parseable trajectory stay NULL).

Replace H1 TrajectoryEmptyState on /market signal cards: render real TrajectoryBars when `trajectory_points` populated, fall through to empty state when NULL.

Same logic on /market/[slug] detail.

Verification: 3 B1 items with trajectory populated render real bars; 3 B1 items without trajectory render honest empty state.

PAY ATTENTION: A4 trajectory backfill is best-effort. Some B1 items may have unparseable source content. Those stay NULL and render honest empty state — this is correct behavior, not a failure. Don't over-engineer extraction to force coverage.

### A5 Intelligence item sections backfill dispatch (MEDIUM RISK) — runs after A1

Verify migration 102 created `intelligence_item_sections` table per Q4 spec.

Backfill the 11 of 14 spec sections not yet rendered as first-class on /regulations/[slug] (currently buried in `full_brief` markdown).

Parser: walk `full_brief` markdown, extract per-section content using markdown header pattern, populate `intelligence_item_sections` rows with `section_key + section_order + content_md + source_ids`.

Update `RegulationDetailSurface` to render all 14 sections from `intelligence_item_sections`, not from `full_brief`.

Verification: load 5 regulation detail pages, confirm all 14 sections render (sections 5/6 may be empty if conditional and not applicable).

PAY ATTENTION: A5 section backfill from full_brief markdown is parsing-fragile. Some briefs may use non-standard header patterns. Surface parse failures rather than fabricating section content. Items with parse failures stay rendering from full_brief; intelligence_item_sections rows omitted.

### A6 Regional data facts backfill dispatch (MEDIUM RISK) — runs after A1

Verify migration 106 created `regional_data_facts` table per Q7 spec.

Backfill D2-D6 fact rows for Asia / UK / UAE regions (currently silently empty per Phase 1.5 audit).

Source attribution per fact row required — no fact lands without a verified source citation.

Update /operations to render fact rows from `regional_data_facts` for all 5 regions (currently EU + US populated, others "Coverage pending" empty state).

Verification: load /operations, expand each region, confirm D2-D6 populated where data exists, honest empty state where not.

PAY ATTENTION: A6 regional data requires real source citations. If Asia/UK/UAE data isn't available from existing sources, those facts stay empty. Don't fabricate to fill coverage.

---

## 9. Cross-cutting execution rhythm

- Per-dispatch atomic commit at completion
- Per-dispatch completion report at `fsi-app/docs/dispatches/sprint3-[dispatch-name]-completion.md`
- Surface to operator at each dispatch completion with verification checklist
- Operator browser-tests + green-lights, then next dispatch starts
- Do not chain dispatches without operator green-light between them
- Same risk-tier verification cadence as v3

PARALLEL TRACKS that can run any time during Sprint 3:
- E1 /map cache-payload trimming dispatch
- E2 Skill cleanup dispatch

Begin A1 + A2 + A3 in parallel as read-only investigations. Surface Haiku batch cost estimate for A1 before invoking. Surface A2 prompt extension diff for operator review before deploying to ingestion. Surface A3 backfill SQL for review before applying.

Hold Groups B / C / D until Group A green-lit.

---

**End of Sprint 3 dispatch brief.**
