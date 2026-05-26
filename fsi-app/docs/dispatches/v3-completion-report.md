# v3 Remediation Dispatch — Completion Report

**Date:** 2026-05-25
**Status:** Implementation complete; pending operator browser-test verdict on /map at 375px + desktop.
**Dispatch scope:** Phase 2-7 remediation across 8 surfaces (Regulations index, Regulations detail, Market Intel, Research, Operations, Community, Map, Admin) + cross-cutting strips, plus Phase 5 detail-route builds and the Phase 4 H-series mockup-fidelity corrections.

---

## Production build status

```
> npm run build
✓ Compiled successfully in 2.8s
  Running TypeScript ... (clean)
  Collecting page data using 31 workers ...
  Generating static pages using 31 workers (62/62) in 1069.3ms
```

All 62 routes generated. No TypeScript errors. No new build warnings introduced by this dispatch.

**Pre-existing perf warning carried forward (not introduced by this dispatch):**

```
Failed to set Next.js data cache for unstable_cache /
042f3e15ebfb5039e57c7a9351612bd6e990c2c88dbb65dfca7f19c5e3f22158,
items over 2MB can not be cached (2875919 bytes)
```

`getAppData` cache payload exceeds the 2MB limit. Tracked as Sprint 3 cache-payload trimming dispatch (operator verdict 2026-05-25: mobile-performance constraint per standing preferences; trim before mobile users see degraded load times).

---

## Dispatch scope shipped (25 commits)

### Phase 2-3 — pre-rebuild data integrity

| Commit | Subject |
|---|---|
| `1b5d0f1` | chore(integrity): Phase 2B — flag 7 pre-gate rows with fetch-error briefs |
| `e1070af` | chore(items): Phase 3D — backfill 78 high-confidence intelligence_items.category |

### Phase 4 — strips and wires per-surface mockup alignment

| Commit | Subject |
|---|---|
| `516191b` | refactor(regulations/[slug]): Phase 4 strips — dead watchlist + dead stat tiles, rename Penalty |
| `870168b` | refactor(settings): Phase 4 strip — remove duplicate Dashboard + Exports tabs |
| `0f2d7f7` | refactor(profile): Phase 4 strip — remove hardcoded value={0} stat tiles |
| `16d7c8d` | refactor(regulations): Phase 4 strip — drop broken Confidence sort + UUID shortform |
| `3be7d2c` | fix(regulations): Phase 4.M1 — REGION filter wired to TIER1 region groups |
| `6d3e715` | refactor(research): Phase 4.M2 — strip Reuters as separate coverage class |
| `c9f0eea` | fix(market): Phase 4.M5 — add 5th legend item to match 5-tile grid |

### Phase 5 — detail-route builds

| Commit | Subject |
|---|---|
| `66a35c7` | feat(research): Phase 5a — BUILD /research/[slug] ResearchFindingDetailSurface (~1085 lines) |
| `ce5f9bd` | feat(market): Phase 5b — BUILD /market/[slug] MarketSignalDetailSurface (~1204 lines) |
| `4351255` | feat(routes): Phase 5 Step 10 — wire `<Link>` click-through on /research + /market index cards |

### H-series operator dispatches (Phase 4 mockup-fidelity corrections)

| Commit | Subject | Note |
|---|---|---|
| `0d847d3` | fix(market): H1 Path B — strip fabricated TrajectoryBars; honest empty-state on every B1 | Integrity rule application |
| `bb76810` | fix(operations): H2 — D2-D6 dimension consistency to card pattern | Misread of mockup |
| `cb0ff22` | fix(operations): H2 Path A revert — D2-D6 back to fact tables per mockup | Operator correction |
| `d373531` | fix(mobile): H3 — Phase 4 mobile responsive batch (375px target) | Responsive utility classes |
| `ef634da` | fix(mobile): H3.1 — clear hamburger overlap on mobile masthead | Geometry fix |
| `a78ca63` | feat(admin): H4 — BUILD Research pipeline review queue UI as Section card 5 destination | Editorial staging moved from /research |
| `7a45285` | feat(admin): H5 — BUILD Community pickups queue UI as Section card 6 destination | Engagement-heuristic suggestion queue |
| `ee7914d` | feat(community): H6 — /community 5-tab rebuild per mockup | 5 tabs + thread rows + Public forums + author identity |
| `8ba687b` | feat(map): Phase 6 — /map rebuild per mockup (Path C) | −622 net lines |

### Documentation + protocol

| Commit | Subject |
|---|---|
| `341b75b` | docs: design-reference-protocol — binding mockup + operator-refinement protocol |
| `b28a691` | docs: fix design_handoff path — lives at repo root, not inside fsi-app/ |
| `1aff2ed` | docs: scrub stale HANDOFF.md entry from design-reference-protocol tree |
| `e05368a` | docs(design): canonicalize design_handoff_2026-05 bundle, retire 2026-04 |

### Read-only investigation outputs

| Artifact | Verdict |
|---|---|
| `fsi-app/docs/pr5-reconciliation.md` | PR #5 already merged (commit `0d7013c`, 2026-05-01). No further action needed. |

---

## Deferred items

### Sprint 3 dispatches (9 total)

| # | Dispatch | Origin |
|---|---|---|
| 1 | multi-org-switcher | Identity/workspace chrome dispatch |
| 2 | trajectory-schema | H1 Path A substantive fix |
| 3 | admin-restructure | Includes H7 create-group modal absorption |
| 4 | classifier-quality | 409 ambiguous items deferred from Phase 3D |
| 5 | signal_band/theme agent prompt extension | Migration 102 columns wiring |
| 6 | cross-cutting capability | Includes H8 share-link copy button absorption |
| 7 | community editorial pickup notification | H9 |
| 8 | skill cleanup | Skill file refactor backlog |
| 9 | community editorial-review-flag | H5 Path A fallback if engagement-heuristic queue misses substantive low-engagement posts |

### Specific deferrals tracked from this dispatch

1. **Trajectory schema** — Per-item trajectory data + ingestion + UI swap. Sprint 3 dispatch 2. Until then, `/market` B1 signal cards show `TrajectoryEmptyState` ("Trajectory data not yet available") rather than fabricated bars.

2. **Sub-jurisdiction pin density toggle** — Q1 deferral. NYC LL97, CA AB-32, Burbank et al. roll up into the United States pin on `/map`. Sub-jurisdiction data is not lost — it remains on resources. If a density toggle becomes operationally important post-launch, it's a Sprint 3 enhancement with proper design (e.g., a "drill mode" toggle switching between country and sub-jurisdiction pin density).

3. **/map cache-payload trimming** — Pre-existing 2.8MB `getAppData` cache exceeds Next.js 2MB limit. Sprint 3 cache-payload trimming dispatch. Mobile-performance constraint per operator standing preferences.

4. **Topic-by-region matrix real-data backfill** — `/community` "Topics this week, by region" matrix renders placeholder constants (CBAM Article 30 / SAF surcharges / etc.). Sprint 3: bundle as `community_post_topics` aggregate query with classifier-quality dispatch or as its own data-shape item. Mockup uses static counts too, so we're not deceiving users; just not real-data backed.

### Path A integrity deferrals (data-driven; not Sprint 3 dispatches per se)

These wait on data sources to land. CSS classes already exist in the mockup spec; only data-to-class mapping needs wiring when those columns ship.

5. **/community `.thread-row.urgent` variant** — Critical border-left for high-priority threads. Requires `community_posts.priority` or equivalent. Engagement-heuristic derivation (reply_count >= 5) was considered and rejected: the visual "drop everything" red border misrepresents engagement data. Wait for proper signal.

6. **/community `.avatar.verified` variant** — Filled black + white text for verified accounts. Requires `profiles.verified` column. Conflating with `is_platform_admin` or `workspace_role IN ('owner', 'admin')` was considered and rejected: admin/owner is platform standing, not peer-verified status.

---

## Open-item verdicts (this exchange, 2026-05-25)

1. **/map Coverage gaps real-data vs mockup placeholder zeros** → KEEP REAL DATA. H1 integrity precedent applies. The existing `getCoverageGaps()` library produces honest covered/total/gap numbers from the source registry; that beats the mockup's static `0 of 56 / 27 / 13 / 9` placeholders. Locked.

2. **/community topic-by-region matrix placeholder constants** → Sprint 3 (see deferral 4 above). Accept as designed for v3 dispatch close; bundle with classifier-quality or as own data-shape item in Sprint 3 scoping.

3. **2.8MB cache warning on `getAppData`** → Sprint 3 cache-payload trimming dispatch (see deferral 3 above). Pre-existing; not blocking dispatch close.

---

## Sprint 3 backlog handoff inventory

This is the **operator-scoped** dispatch backlog at v3 close. Sprint 3 scoping is a separate conversation with the operator; do not start Sprint 3 work without explicit operator dispatch.

### Sprint 3 dispatches (9)

See "Sprint 3 dispatches" table above.

### Path A data deferrals tracked as Sprint 3 data-shape candidates

- `community_posts.priority` (or equivalent urgency signal) for `.thread-row.urgent`
- `profiles.verified` column for `.avatar.verified`
- `community_post_topics` aggregate for `/community` topic-by-region matrix
- Sub-jurisdiction pin density toggle data-shape (if surface decision warrants)

### Pre-existing perf/integrity items surfaced during this dispatch

- `getAppData` 2.8MB cache exceeds Next.js 2MB limit
- 409 ambiguous items deferred from Phase 3D classifier backfill

### Read-only artifacts produced this dispatch (Sprint 3 reference material)

- `fsi-app/docs/pr5-reconciliation.md` — PR #5 verdict
- `fsi-app/docs/design-reference-protocol.md` — binding mockup + operator-refinement protocol with pre-build checklist (Section 6)

---

## Browser-test status

Cross-surface 375px + desktop verification completed by operator across this dispatch:

| Surface | Verdict | Notes |
|---|---|---|
| /regulations | green at 375px | Stat grid stacks, coverage rail readable |
| /research | green at 375px | Theme cards stack, coverage rail compact |
| /market | green at 375px | SignalCard rows stack, TrajectoryEmptyState renders on every B1 |
| /operations | green at 375px | Region accordions render, D1 cards stack, D2-D6 fact tables readable |
| /map | **pending** | Phase 6 rebuild (commit `8ba687b`) awaiting browser-test verdict |
| /community | green at 375px + desktop | 5-tab strip, region cards stack, group sections render, `id="post-{uuid}"` verified on outer `<a>` |
| /admin | green at 375px | Section cards stack, queue rail readable |
| Sidebar hamburger overlap | green | H3.1 (`ef634da`) cleared eyebrow + title from under fixed hamburger |
| H5 anchor verification | green | /admin Section card 6 → "View thread" → `/community/[group_slug]#post-[id]` resolves |

---

## Dispatch close criterion

Dispatch closes when:
1. ✓ All Phase 2-6 commits land on master
2. ✓ Phase 7 production build clean
3. ✓ Operator browser-test green-light on /regulations, /research, /market, /operations, /community, /admin, sidebar hamburger, H5 anchor
4. ✓ Open-item verdicts captured (3 above)
5. ✓ Sprint 3 backlog inventory committed
6. **Pending:** Operator browser-test green-light on /map at 375px + desktop

After /map green-lights, the v3 remediation dispatch is complete.

---

## Post-dispatch hold posture

Per operator instruction (2026-05-25):

- Sprint 3 scoping is a separate conversation with the operator.
- Do not start Sprint 3 work without explicit operator dispatch.
- Hold position after /map green-light.
