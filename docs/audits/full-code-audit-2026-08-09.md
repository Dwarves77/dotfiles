# Full code audit — dead code, unconnected wiring, root cause (2026-08-09)

Operator-directed. Method: **instruments first, over every line** — the TypeScript
compiler (unused-symbol pass), ts-prune (dead exports over the whole program),
depcheck (dependency graph), and four purpose-built graph scans (route→caller,
component→mount, module→importer, docs→script referential integrity) parse 100%
of `fsi-app/src` (94,768 lines, 376 files). Paid reading went only where
instruments cannot see. Every headline claim below was then **individually
re-verified by direct grep** (no regex-artifact findings), and every finding was
cross-checked against the repo's own prior dispositions
(dead-code-disposition-2026-05-21, category-e-investigation, dormant-systems- and
functional-purpose audits) so nothing already ruled KEEP is re-flagged.

Scope boundaries, stated honestly: `fsi-app/scripts/*.mjs` (63,013 lines) are
one-shot writes scripts that the code-vs-data doctrine deliberately retains as
audit records — "dead" there is by design and excluded; `.discipline/` (11,595
lines) carries its own selftest coverage and CI wiring; migrations (216 files)
are append-only history. The audit surface is the LIVING app.

## A. Verified dead modules — zero importers anywhere (11 files)

| Module | Evidence + class |
|---|---|
| `src/stores/exportStore.ts` | Zero references in the entire tree — while the fsi-app doctrine still lists it among "the five Zustand stores." Dead + doctrine drift. |
| `src/lib/urgency.ts` | Never imported; `urgencyScore` LIVES in `lib/scoring.ts`. A dead **duplicate twin** — two implementations, one wired. |
| `src/lib/dashboard/critical-items.ts` | **Regression after disposition**: dead-code doc says "CLOSED Build 11 — wired into DashboardHero." The Template-01 dashboard rebuild severed it; today zero importers, and a supabase-server.ts comment says the logic was re-wrapped elsewhere. |
| `src/lib/dashboard/credibility.ts` | Same severed-by-rebuild class as critical-items. |
| `src/lib/export/slackFormat.ts` | Zero references. |
| `src/lib/export/htmlReport.ts` | Zero references. |
| `src/lib/acronyms.ts` | Zero references. |
| `src/lib/lineage.ts` | Zero imports (only word-matches in unrelated comments). |
| `src/lib/sources/api-fetch.ts` | Zero references. |
| `src/lib/sources/instrument-identity.ts` | Zero references outside itself. |
| `src/lib/agent/extract-research-sections.ts` | Zero importers — built for the analysis-construction-spec Research extractor, never wired into the pipeline. |

## B. Unmounted components (8) — three distinct classes, per prior-art cross-check

1. **Severed by surface rebuilds (regressions):** `BulkSelectBar` (functional-purpose
   audit recorded it PRESENT on /regulations; the Template-02 rebuild dropped it),
   `SortRow` (category-E ruled it LIVE 2026-05-21; now unmounted). The rebuilds
   remounted surfaces from scratch and silently orphaned ruled-live wiring.
2. **Never mounted (spec-first construction):** `ViewToggles`, `SectorChipFilter`,
   `ConfidenceFacet`, `RowCard` — built ahead of mounts during dispatch waves, no
   check ever asked "did this mount?"
3. **Available-by-design (prior operator-facing ruling, NOT dead):**
   `SignalStrength`, `JurisdictionChip` — the credibility-components disposition
   explicitly keeps them "available for ad-hoc mount." Re-flagging them would
   overrule a standing disposition; listed here only for completeness.

## C. Compiler-verified unused symbols (25 sites)

`tsc --noUnusedLocals --noUnusedParameters` over the full program: 25 errors — dead
imports (`SupabaseClient` twice), dead constants (`MAX_REDIRECTS`,
`CONTENT_HAIKU_SYSTEM_PROMPT`), dead locals in 21 more sites incl.
`canonical-pipeline.ts` (`anthropicError`) and `AuthProvider.tsx` (`setLoading`).
Mechanical deletions; full list reproducible with the one-line audit tsconfig.

## D. Dead exports (159 after framework false-positive filtering)

ts-prune: 324 raw → 159 after removing Next.js entrypoint conventions.
Concentrations: `lib/constants.ts` (19 dead exports — retired 7-domain-era color
maps, `BRIEFING_SECTIONS`, `DEEP_DIVE_SECTIONS`), `lib/data.ts` (`getMapData`,
`getTechnologyItems`, `getSourceCitationStats`…), `src/data/index.ts` (the whole
seed surface: changelog/disputes/xrefPairs/supersessions exported, unimported).
Full list: regenerate with `npx ts-prune` + the documented filter.

## E. Dependency graph

Unused runtime deps: `@workflow/next`, `react-leaflet-cluster`. Unused dev deps
flagged: `@tailwindcss/postcss`, `tailwindcss`, `@types/react-dom` (verify against
PostCSS config before removal — depcheck under-detects PostCSS wiring).

## F. Routes with zero in-app callers (5 of 84) — classified, none summarily dead

`/version` (documented public exception, doctrine-cited); `/admin/spot-check/recurring`
(cron-invoked, cron currently disabled); `/admin/run-intake` (crawl-rebuild spec,
operator-invoked); `/health/spend` (observability-posture doc, ops-invoked);
`/admin/recompute-trust` (doctrine lists an admin UI consumer — no button exists in
today's AdminDashboard: **lost-button regression candidate**, same rebuild-sever class).

## G. Docs→script referential integrity

Dozens of `scripts/*.mjs` paths cited in docs do not exist in the tree. Majority
class: `_diag`/`_temp`/`audit_*` one-shots that were ALWAYS gitignored — docs cite
artifacts that never entered version control (rule 015's honestly-named residual).
This includes the handover-flagged `gate-a-mint.mjs`. Consequence: those doc
references are non-reproducible; each future citation of an untracked script needs
an inline "untracked, regenerable" tag or the script committed.

## Root cause — why it is like this (evidence-based, four mechanisms)

1. **Rebuild-severs-wiring.** The dominant mechanism, proven three ways
   (critical-items, BulkSelectBar/SortRow, recompute-trust's lost button):
   template-based surface rebuilds (Template-01 dashboard, Template-02 regulations)
   remount surfaces from scratch; anything wired into the OLD surface silently
   loses its only importer. Disposition docs then assert CLOSED/LIVE states the
   import graph no longer supports — documentation drifted from wiring because
   dispositions are written once and never re-verified.
2. **Spec-first construction without a mount check.** Dispatch waves built
   components against specs; no gate ever asked "does anything import this?"
   The repo's own discipline suite (11.6k lines!) checks commits, invariants,
   secrets, skills — but has NO liveness check on exports, mounts, or deps.
3. **Doctrine asserting state.** The doctrine file's own rule ("doctrine, not
   state") is violated by its five-store list (exportStore dead), its
   recompute-trust UI claim, and the migration-048 vocab (fixed this branch).
   State claims in doctrine rot exactly as the doctrine predicts.
4. **Episodic, not continuous, deletion.** T7 and the wave-α deletions prove the
   will exists — but deletion ran as occasional campaigns. Between campaigns,
   nothing mechanical accumulated the candidates. Every finding in §A–§D would
   have been caught the week it went dead by tools that run in seconds.

## Remediation plan (phased; per the standing operator rule, site-code deletions need operator sign-off — each phase is a small reviewable PR)

- **P1 — mechanical deletions (1 PR):** the 25 compiler-verified symbols + the 9
  §A modules that are not regression candidates (all but critical-items/credibility).
  Zero behavior change by construction (zero importers). Operator signs the list.
- **P2 — regression rulings (1 PR each):** critical-items + credibility.ts (rewire
  into the rebuilt dashboard OR delete + correct the Build-11 disposition doc);
  BulkSelectBar + SortRow (remount on /regulations OR delete + correct
  category-E/functional-purpose records); recompute-trust admin button (restore or
  document as ops-only). These change behavior; each needs its ruling.
- **P3 — dead-export sweep (1-2 PRs):** the 159, walked file-by-file; constants.ts
  and data.ts first (highest concentration, lowest risk).
- **P4 — the class fix, CI liveness gates:** add to bug-class-guard —
  ts-prune-with-baseline (HARD on NEW dead exports, report-only on the backlog),
  the unmounted-component scan, depcheck. This is what makes deletion continuous
  instead of episodic; without P4, P1-P3 rot again by the next rebuild.
- **P5 — doctrine de-stating:** strip the five-store list and other state claims
  from doctrine per its own rule; state lives in the graph scans.
- **P6 — docs referential tagging (report-only scan):** untracked-script citations
  get machine-flagged so future docs cite reproducible artifacts.

Everything here is reproducible from a clean checkout with the commands named
inline; nothing rests on this session's memory.
