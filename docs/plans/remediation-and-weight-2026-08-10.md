════════ CARO'S LEDGE — REMEDIATION + WEIGHT PLAN (2026-08-10, for the managing session) ════════

FIRST ACT: persist this text verbatim as docs/plans/remediation-and-weight-2026-08-10.md,
add the INDEX.md line, commit. It is the working plan for three workstreams that run
INTERLEAVED with flywheel wave 1 and never ahead of it.

VERDICTS (live-verified 2026-08-10, do not re-derive)
- LOC corrected: living app src/ 94,957 (377 files) · scripts 63,491 (640, audit ledger
  by doctrine, not maintained code) · migrations 29,890 (append-only) · src tests 15,896 ·
  discipline 12,001 · CI 919. TOTAL 217,154. The judgeable number is the 94,957.
- Registry roles (2,071 active): 870 feed items AND ground claims · 211 ground claims only ·
  9 items only · 981 do NOTHING (47% inert; 1,041 item-less rows never checked; 1,230 of
  all actives created 2026-08). eur-lex.europa.eu holds 719 active rows (document-level
  grounding rows created outside the institution-dedup path — correct for grounding,
  NEVER a coverage metric).
- Dead-code audit (docs/audits/full-code-audit-2026-08-09.md, instrumented): 11 dead
  modules, 8 unmounted components, 25 unused symbols, 159 dead exports, 2 unused deps.
  UNEXECUTED as of today (6 of 11 dead modules verified still present).
- God modules (largest living-app files): supabase-server.ts 3,137 · CommunityRooms 1,967 ·
  canonical-pipeline.ts 1,809 · RegulationsLedger 1,489 · RegulationDetailSurface 1,398 ·
  MapPageView 1,252 · GroupModals 1,201 · OperationsDetailSurface 1,143 ·
  MarketSignalDetailSurface 1,111 · MarketIntelLedger 1,026 · verification.ts 1,011 ·
  ResearchLedger 1,007. src/data seed surface: 5,129 lines.

──────── CORRECTION (2026-08-11): THE VERDICTS REGISTRY FIGURES ABOVE ARE STALE AND WERE MIS-DERIVED ────────
The "Registry roles (2,071 active) ... 981 do NOTHING (47% inert; 1,041 item-less rows never checked)" line
must NOT be re-used. Two independent problems, both verified live:
1. STALE. Live counts on 2026-08-11 after the W1.1 pass: 1,284 active / 1,243 provisional (admin_only=false).
   A 869-row active->provisional demotion ran 2026-08-10 21:19:35 UTC between the plan being written and W1.1
   being picked up. See docs/ops/session-log.md 2026-08-11 entries for the full ledger.
2. MIS-DERIVED. "No role" was computed by joining two tables (intelligence_items, section_claim_provenance).
   `sources.source_role` IS A REAL COLUMN populated by the platform's own classifier, and `sources` carries 25
   FK references from 20+ tables. Against the real field, 285 of the 869 demoted rows had a classifier-assigned
   role and 150 were `primary_legal_authority` — the highest role the system assigns — while counted as "no role".

BINDING METHOD FOR ANY FUTURE ROLE/USAGE/RELEVANCE QUESTION (applies to W1.2, W1.3, P3 and any successor):
- Read the FIELD first. source_role, secondary_roles, category, classification_confidence, classification_rationale,
  fetch_status, expected_output already hold the platform's own judgment. Do not re-derive what is recorded.
- Enumerate the COMPLETE reference surface (all 25 FK columns into sources), not a convenient subset.
- Where the platform ships an instrument for the question, THAT INSTRUMENT DECIDES. For source relevance /
  on-vertical identity that is src/lib/sources/vertical-fit.ts (deterministic, $0, never auto-kills; `unknown`
  and general-legislature both route to REVIEW pending the corpus coverage check). Do not hand-roll a heuristic
  over names, notes text or URL shape — two such heuristics were tried on 2026-08-11 and both mis-classified.
- If the instrument must be re-implemented in another dialect (e.g. ported to SQL), PROVE EQUIVALENCE on a real
  sample before applying it. The 2026-08-11 pass diffed 250 rows JS-vs-SQL to 0 mismatches before touching the set.
────────────────────────────────────────────────────────────────────────────────────────────────────────────

W1 — SOURCE REGISTRY INTEGRITY (data work, $0, Supabase MCP, guarded discipline)
W1.1 Triage the 981 no-role actives. Dispositions: (a) DEFAULT demote to status=
  'provisional' for inert never-checked rows (provisional is already gated out of every
  scrape/AI/index job; suspend-not-delete doctrine preserved; fully reversible), (b)
  keep-active with a one-line justification for institutional portals genuinely awaiting
  scan restoration, (c) suspend junk. Execute with cite + prior-value snapshot + read-back
  verification + a ledger row recording counts per disposition. HARD GATE: W1.1 completes
  BEFORE any ADR-015 source-monitoring restoration flips scanning on — the 981 carry
  status='active' AND admin_only=false, the exact filter every job scans.
W1.2 Institution keying. All coverage metrics and L2 gap detection (U2 gaps.mjs) key on
  institutionKey(url) (scripts/lib/db.mjs), never on source-row counts. Record in the
  build plan U2 section: gaps are per-institution-per-jurisdiction, not per-row.
W1.3 (optional, defer unless wanted) one SQL view separating monitoring-portals from
  citation-document rows so /admin shows honest registry counts.

W2 — DEAD CODE: EXECUTE THE AUDIT (P-numbers from full-code-audit-2026-08-09)
P1 Mechanical deletions, one PR: the 25 compiler-verified symbols + the 9 dead modules
  that are not regression candidates. Zero importers = zero behavior change. Operator
  signs the file list inside the PR description. (~1,000 lines out.)
P2 Regression rulings, one small PR each AFTER the operator rules (menu below):
  critical-items.ts + credibility.ts (rewire into rebuilt dashboard OR delete + correct
  the Build-11 disposition doc — RECOMMEND delete+correct; the rebuilt dashboard shipped
  without them and nobody missed the output), BulkSelectBar + SortRow (remount on
  /regulations OR delete + correct category-E records — RECOMMEND remount SortRow, delete
  BulkSelectBar), recompute-trust admin button (restore OR document ops-only — RECOMMEND
  ops-only doc line; the route is worker-auth and rarely used).
P3 Dead-export sweep (159): constants.ts and data.ts first, then the rest file-by-file.
  INCLUDES the src/data seed-surface removal (~5,129 lines) after per-file import
  verification proves zero live importers — the audit says the export surface is
  unimported; verify per file before deleting, some files may still be read directly.
P4 CI LIVENESS GATES (the recurrence killer; same mechanical-gate family as U8, land
  together or adjacent): ts-prune-with-baseline (HARD-fail on NEW dead exports,
  report-only on the legacy backlog), unmounted-component scan, depcheck. Each gate
  ships red-test-proven (a seeded violation must fail CI) per rule 15.
P5 Doctrine de-stating: strip state claims from fsi-app/.claude/CLAUDE.md (five-store
  list, recompute-trust UI claim) per its own doctrine-not-state rule.
P6 Docs referential tagging (report-only): untracked-script citations machine-flagged.

W3 — WEIGHT (measured, opportunistic, never big-bang)
W3.1 God-module decomposition under the DRIVER RULE: decompose a file ONLY when a build
  unit already touches it, with tests, never as a standalone refactor PR. Mapping:
  supabase-server.ts (3,137 — split per-surface read paths) rides U3/U9;
  canonical-pipeline.ts (1,809) rides U7; ledger/detail surfaces ride U9. No file is
  refactored without a driver; the perf-playbook measurement rule applies.
W3.2 Era purge: 7-domain-era color maps and constants, duplicate twins (urgency.ts vs
  scoring.ts) — largely covered by P1/P3, named here so the era is fully retired.
W3.3 DEFENDED WEIGHT, do not strip: banner comments and inline rationale are the project
  memory that makes autonomous sessions resumable. A line-count diet that deletes them
  buys nothing and costs the workflow. Comment density is a choice, not bloat.
W3.4 LOC trend line: report-only CI metric on living-app lines so the number a reviewer
  judges has a visible direction. New source files target <800 lines; existing god files
  shrink only via W3.1's driver rule.

──────── ADDENDUM: W3.1 RESOLVED BY AUDIT (2026-08-10, this session, instrumented) ────────
Duplication across ledger/detail families: REFUTED by measurement (shared-line counts at or
near the 144-line unrelated-pair baseline). No shared-core extraction unit exists.
Per-file dispositions for the 12 >1,000-line files:
- supabase-server.ts (3,137): THE decompose target. Split per-surface into lib/reads/<surface>.ts
  behind a compat re-export barrel (20 importers migrate gradually). Driver: U3/U9. Also P3-check
  suspected era-orphan fetchers by importer grep: fetchTechnologyItems, fetchListingsMapData,
  fetchListingsOnly, fetchResourcesOnly.
- KEEP as cohesive (no action): canonical-pipeline.ts (doctrine-protected, single consumer,
  exports = test surface), verification.ts (pure single-purpose pipeline).
- Page-in-a-file class (8 surface components): acceptable at current scale; decompose ONLY under
  the driver rule when a unit touches them (U9 touches the five surface files). NEW RULE for all
  new surfaces starting U3: born sectioned, <800 lines per file — the class must not grow.
- GroupModals.tsx: split per-modal on the next community driver.
Net: the weight story is one mechanical split (supabase-server) + a birth standard, not a
refactor campaign. The 12 files = 17,551 lines = 18.5% of the living app.
───────────────────────────────────────────────────────────────────────────────────────────

SEQUENCING (the flywheel keeps priority — nothing here blocks U0-U3)
1. W1.1 any time, independent, data-only (pairs well with U0's DB session).
2. P1 early, its own PR. P4 lands with or adjacent to U8.
3. P2 after operator rulings. P3 in 1-2 PRs after P1. P5/P6 anytime, trivial.
4. W3.1 strictly opportunistic per its driver rule across U3/U7/U9.
Model tier: everything here is Sonnet-safe. P2 items execute trivially once ruled.

OPERATOR RULINGS NEEDED (answer in any session; recorded rulings unblock the PRs)
R1 P1 deletion list — sign-off on the 25 symbols + 9 modules.
R2 critical-items + credibility: delete+correct docs (recommended) or rewire?
R3 SortRow: remount (recommended) or delete?  R4 BulkSelectBar: delete (recommended)?
R5 recompute-trust: ops-only doc (recommended) or restore the button?
R6 W1.1 default disposition: approve demote-to-provisional for inert never-checked rows?

──────── OPERATOR RULINGS RECORDED (2026-08-10, this session) ────────
R1 Sign-off in the PR itself, not in chat: the P1 PR description carries the complete,
  re-verified deletion list; operator reviews and merges there.
R2 APPROVED — delete+correct: critical-items.ts + credibility.ts deleted, Build-11
  disposition doc corrected. Rides P2 (not this PR).
R3 APPROVED — remount SortRow on /regulations. Rides P2.
R4 APPROVED — delete BulkSelectBar. Rides P2.
R5 APPROVED — document recompute-trust as ops-only (worker-auth route, rarely used);
  no button restoration. Rides P2/P5.
R6 APPROVED — demote-to-provisional is the default disposition for inert never-checked
  actives. Rides W1.1 (Supabase MCP, separate from this PR).

P1 EXECUTION NOTE (2026-08-10): the audit's "25 symbols + 9 modules" count was re-verified
live rather than trusted as-is, per standing root-cause-over-patchwork practice — the audit
predates several days of intervening commits. Findings:
- Compiler re-run (tsc --noUnusedLocals --noUnusedParameters, clean/no incremental cache)
  found 26 sites, not 25. Two are inside modules deleted whole in this PR (slackFormat.ts,
  htmlReport.ts) so need no separate fix. One (generate-seed.ts, supabase/seed/, a
  standalone `npx tsx` dev utility not wired into package.json or CI) sits outside the
  audit's declared living-app src/ scope and is left untouched pending its own ruling.
  The remaining 23 are fixed here.
- TWO of the compiler's own findings were false positives from a stale incremental-build
  cache (tsconfig.tsbuildinfo): supabase-server.ts's `Resource/ChangeLogEntry/Dispute/
  Supersession/ItemConnection` import and vertical-fit.ts's `sourceRole` param are both
  genuinely used 1,800+ lines into their files. Caught by re-running clean (tsbuildinfo
  cleared) and cross-checked against a plain `tsc --noEmit` full-project compile, which
  fails without them. Neither touched. A third, previously-masked finding surfaced once
  sourceRole's status was corrected: `url` in the same vertical-fit.ts signature is
  genuinely unused — fixed (parameter renamed `_url`, not removed, since it's an exported
  function with positional callers).
- THREE of the audit's "9 modules, zero importers" were NOT actually zero-importers: the
  audit's import-grep was scoped to src/ and to `import ... from` syntax, which misses (a)
  scripts/ importers outside that scope and (b) the discipline suite's own governance/
  fitness functions, which reference some living-app files by raw file path (readFileSync)
  rather than as TS imports — a reference class no import-grep catches.
  - src/lib/sources/api-fetch.ts: read directly by .discipline/fitness/functions/
    F15-spend-chokepoint.mjs and F16-transport-hold-gate.mjs (both failed red when this
    file was deleted, which is how this was caught). KEPT.
  - src/lib/sources/instrument-identity.ts: imported by scripts/_diag/
    institution-resort.mjs. KEPT.
  - src/lib/agent/extract-research-sections.ts: dynamically imported (jiti) by
    scripts/restore-jolt.mjs. KEPT.
  - The remaining 6 (exportStore.ts, urgency.ts, slackFormat.ts, htmlReport.ts,
    acronyms.ts, lineage.ts) were repo-wide swept (not just src/) by literal filename,
    zero hits outside their own file, confirmed dead, DELETED.
Net P1 scope actually executed: 6 modules (not 9) + 23 unused-symbol sites (not 25).
Full discipline suite (1035/1035), 16/16 fitness functions, and the invariant-coverage
meta-gate all re-ran green after the correction; the two F15/F16 failures caught the
api-fetch.ts miss before it shipped.

DEFINITION OF DONE
Registry: zero active sources with no role and no recorded justification; W1.1 ledger row
exists; the scan-restoration gate is written into ADR-015's restoration checklist.
Code: P1-P6 executed or explicitly ruled; liveness gates in CI and red-test-proven;
src/data seed surface resolved; living-app LOC trend visible and pointing down.
Weight: god-file list shrinking only via drivers; no new file joins the >1,000 list.
════════════════════════════════════════════════════════════════════════════════════════
