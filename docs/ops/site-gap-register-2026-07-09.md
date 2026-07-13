# Site-Gap Register — 2026-07-09 (CANONICAL BASELINE)

**Baseline ruling (2026-07-09):** the "original findings list" (dispatch-1a source document) is ruled
**non-existent as an artifact**. This register — the Chrome wiring-audit + Jason's experiential rows —
**IS the baseline henceforth.** It supersedes `traceability-matrix-2026-07-07.md` as the baseline (that
doc's 41-finding enumeration remains valid *source data* for the phase-0-5 left-side mapping below).

**Status: SKELETON.** The Chrome agent's detail rows (D/F/Q evidence, U-row descriptions) were cut in
transmission and arrive from Jason shortly. This commit is the honest scaffold; rows fold in by ID as
they land. Nothing below is invented — placeholder rows are marked `⏳ AWAITING DETAIL`.

Triage vocabulary (applied per row on arrival): **FIX-FORWARD-NOW** · **DORMANT-BY-DESIGN** (answered
with the owner-mechanism/gate) · **DESIGN-DEVIATION** (routes to DESIGN-DEVIATIONS).

---

## Open units — U-01 .. U-11

| ID | Unit | Owner-mechanism (which built unit / switch resolves it) | Status |
|----|------|--------------------------------------------------------|--------|
| U-01 | ⏳ AWAITING DETAIL (source rows never arrived — cut in transmission; cannot be reconstructed without Jason's Chrome-audit notes) | — | BLOCKED on source data |
| U-02 | ⏳ AWAITING DETAIL | — | pending row |
| U-03 | ⏳ AWAITING DETAIL | — | pending row |
| U-04 | ⏳ AWAITING DETAIL | — | pending row |
| U-05 | ⏳ AWAITING DETAIL | — | pending row |
| U-06 | ⏳ AWAITING DETAIL | — | pending row |
| U-07 | Backfill (honest-partial path) | Timeline/enacted-text backfill: kept partial + flagged, never fabricated | **CONFIRMED honest-partial** — see note ↓ |
| U-08 | ⏳ AWAITING DETAIL | — | pending row |
| U-09 | ⏳ AWAITING DETAIL | — | pending row |
| U-10 | ⏳ AWAITING DETAIL | — | pending row |
| U-11 | B.2 regeneration (reported 88/293) | Loop / batch-1 go-line (spend-bearing) | **HALTED, not mid-flight** — see finding ↓ |

### U-11 — spend-ledger truth (read-only, 2026-07-09)
The register frames U-11 as "mid-flight spend-bearing work." **Verified state contradicts that:**
`agent_runs` = **0 in the last 24h**; last run **2026-07-07 16:40:26 UTC**; `global_processing_paused=true`,
`scrape_cadence='off'`; month-to-date spend = read it live (`SELECT sum(cost_usd_estimated) FROM agent_runs WHERE started_at > date_trunc('month', now())` — a cached number here drifted once already: the 2026-07-10 board reconciliation read $39.39 MTD while this line said $0; docs reference the query, not the value). The "88/293" is a **static historical
progress count** from the batch that ran through 2026-07-07 — it is **not live and not spending now.**
- **Correction:** U-11 *was* mid-flight (≤ 2026-07-07); it is now **HALTED** by the standing loop-off / scrape-hold.
- **Ledger:** nothing to post — active in-flight spend = **$0**. (Historical: 1,628 runs all-time, 615 in 30d, all ≤ 2026-07-07.)
- **Completion of the remaining ~205:** requires a **re-launched batch**, gated by the loop flip + the batch-1 go-line (a standing switch, operator's word). Envelope = batch-1's quote when authorized.

### U-07 — honest-partial confirmation
Confirmed the ruled honest-partial path: the timeline/enacted-text backfill (PR #240 + fetch-layer)
kept items it could not fully parse **as partial with the old rows retained + an integrity flag**, and
**never fabricated** the missing structure (e.g. the 4 §14-unparseable holds: ICS2, GLEC v3,
CountEmissions, IMO Net-Zero). That is the no-silent-truncation / no-fabrication discipline working, not a gap.

---

## Defects / fabrication / quality — D-1, D-2, F-1, Q-1..Q-3

Fix-forward priority as ruled: **F-1 FIRST (✅ DONE)**, then D-1, D-2, Q-class — **ALL ENACTED 2026-07-11** (reconciliation remediation dispatch; see board-reconciliation closeout).

| ID | Class | Disposition | Status |
|----|-------|-------------|--------|
| F-1 | Customer surface renders unbacked content, nothing detects it (fabricated source row) | CLASS KILL — narrative ↓ | ✅ FIXED |
| D-1 | Admin member UUID chain | ROOT CAUSE: the panel + API both carried the display chain; the two `org_memberships` SELECTs feeding the panel (AdminDashboard.loadData + admin/page.tsx initial fetch) omitted `display_name, email` from the profiles join, so the chain fell to uuid-slice. Selector fixed at both homes (2026-07-11). | ✅ FIXED |
| D-2 | Sources count two-homes | WRONG HOME NAMED: the At-a-glance rail hardcoded `1` (a primary-only literal); the tab parsed the source list. One selector now (`sourceEntriesOf`, RegulationDetailSurface), both homes derive from it (2026-07-11). | ✅ FIXED |
| Q-1 | Tier vocabulary two-homes (FOUR private vocabularies found: CredibilityBadge, AskAssistant, Operations+Research TIER_DEFINITIONS) | Legend ruled correct; ONE exported constant `src/lib/tier-labels.ts` now feeds all card homes; drift-guard test `tier-labels.test.mjs` (surface_of pattern) REDs stray vocab. RESIDUAL: `types/source.ts` promotion-ladder commentary still narrates the old naming (tier-MODEL doc, not display) (2026-07-11). | ✅ FIXED |
| Q-2 | Two unlabeled gap numbers | Labeled both: matrix stat = "Total gaps" (CoverageMatrixView), queue rows = "Coverage gaps (critical)" (IssuesQueue + AdminIssuesRail). No logic change (2026-07-11). | ✅ FIXED |
| Q-3 | Casino signal + siblings | Casino row 646dda2d value-DELETED via the gate (guardedDelete + read-back + log). Sibling sweep over 288 live: 2 hits (Matrix Hudson housing-lottery listings), investigated, ARCHIVED off_domain (reversible, MDEQ precedent). 0 junk-pattern titles remain live (2026-07-11). | ✅ FIXED |

### F-1 root-cause narrative (recorded per ruling)
- **Data layer: CLEAN.** 0 null-field `sources` rows corpus-wide; PPWR's 74 claims have 0 null / 0 dangling source FKs. No junk DB row — nothing to delete.
- **Parse layer: the defect.** §15 Sources bodies carry a SECOND table ("## New Sources Identified"); `parseSourcesList` skipped only the FIRST table's header, so the second table's header row `| Source Name | URL | … |` parsed as a DATA row → a source literally named **"Source Name."** Recurrence: **97 of 103 reg-family verified briefs** carry that table (near-universal, not a one-off).
- **Render layer: lacked its gate.** `SourcesList` (and the other section renderers) emitted parsed entries with no structural validation — an empty/header-echo entry rendered a bare tier badge + placeholder text.
- **Detection: was human** (the Chrome audit). Now MECHANICAL.

### The class kill — "the parse→render boundary is a trust boundary"
1. **Parser root-cause fix** — `parseSourcesList` skips EVERY table's header (line-before-separator rule, handles multi-table sections) + drops placeholder/header-echo names (`extract-regulation-sections.ts`).
2. **Render-trust gate at every structured renderer** — one shared pure helper `source-entry-filter.mjs` (`isPlaceholderText` / `renderableSourceEntries` / `dropUnbackedRows`) applied at ALL FOUR structured renderers: **SourcesList** (name) · **ObligationsTable** (obligation) · **RegulationTimeline** (label) · **ActionList** (label-or-body). Invalid entries suppressed, never their raw text.
3. **Standing detector in CI** — `source-entry-filter.test.mjs` + `source-list-multitable.npmtest.mjs` (the PPWR two-table fixture, red-then-green) → the class cannot re-enter via a future parser or skill-prompt change. First-run corpus sweep = the 97/103 count above.
4. **Seek-more candidate (logged)** — the "New Sources Identified" prose tables name real, un-registered sources (e.g. DG ENV PPWR presentation) = identified-then-dropped data → future seek-more wiring candidate (feeds Axis-1c of the conservation audit).

---

## Baseline mapping (phase 0-5 remediation program → stable IDs) — IN PROGRESS

Closes dispatch-1a. Method: every phase-0-5 item maps to a stable ID; a phase item mapping to **no** ID
becomes a new row (tagged `reconstructed-with-caveat`); an ID with **no** phase coverage lands in the
**NOT-ADDRESSED bucket (the headline)**. The right-side (U/D/F/Q) mapping completes when the detail rows
land — this backbone enumerates the LEFT side now (authoritative source data:
`traceability-matrix-2026-07-07.md`).

**Phase-0-5 left-side (41 findings + 6 open units), for mapping:**
- **S1 (data-loss/security, ×12):** S1-01 loop-off · S1-02 staged-updates auth (FIXED #233) · S1-03 anon-read RLS (FIXED mig 157) · S1-04 worker-secret (FIXED #233) · S1-05 workspace-anchor · S1-06 no-provenance-gate · S1-07 grounding auto-stub (FIXED cited-host gate + mig 158) · S1-08 override anon-read (FIXED #234) · S1-09 Ask retrieval (FIXED mig 159) · S1-10 change-detection (FIXED mig 161) · S1-11 staged materialization · S1-12 search_path (FIXED mig 160 2026-07-08) + leaked-pw (FIXED).
- **S2 (feature broken/hollow, ×13):** S2-01 provenance chips (FIXED #234) · S2-02 detail metadata (FIXED #234) · S2-03 phantom cols (FIXED #234) · S2-04 WATCH (FIXED #245) · S2-05 Notes (FIXED) · S2-06 export/share dead code · S2-07 scan→stage (FIXED) · S2-08 portal deep-links (FIXED mig 162) · S2-09 community (FIXED #247) · S2-10 admin add-member (FIXED #246) · S2-11 notifications · S2-12 verifier sign-off · S2-13 freshness/refresh.
- **S3 (waste/quality, ×6):** S3-01 grounding cost (FIXED #239) · S3-02 failure ladder · S3-03 urgency scales · S3-04 trust decay · S3-05 related-items gate · S3-06 double-pipeline.
- **S4 (hygiene/governance, ×6):** S4-01 ledger reconcile (FIXED) · S4-02 orphan schema (→ Phase 7) · S4-03 error-drop CI (FIXED #235) · S4-04 wired-ness CI (FIXED F14) · S4-05 loop smoke · S4-06 DB backup.
- **DD (dedup/timeline, ×4):** DD-01 timelines (FIXED #240) · DD-02 wrong dates (FIXED #240) · DD-03 duplicates (ENACTED #241) · DD-04 intersection dup-guard.
- **Open units (from the reconciliation):** the-18 flags (DONE, residue 0) · Phase-7 dead-code erase (in flight, Unit 2) · Section-7 backend ×6 (in flight, Unit 3) · Community launch prep (Unit 4) · browser-verification checklist · the three standing switches.

**NOT-ADDRESSED bucket:** computed once the U/D/F/Q detail rows define the right side. Headline number pending.

---

## Related
- [root-cause-why-the-queue-2026-07-08](./root-cause-why-the-queue-2026-07-08.md) — why the queue exists (detection built, drain not) — the frame this register operationalizes
- [traceability-matrix-2026-07-07](./chrome-audit-2026-07/traceability-matrix-2026-07-07.md) — superseded as BASELINE; retained as phase-0-5 source data
- [deletion-reclassification-log](./deletion-reclassification-log.md) · [program-closeout-2026-07-08](./program-closeout-2026-07-08.md) · [flip-readiness-2026-07-08](./flip-readiness-2026-07-08.md) (the three switches)
