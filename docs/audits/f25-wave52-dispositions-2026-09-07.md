# F25 wave52 expiry dispositions — 2026-09-07 (lane F25-WAVE52)

Master was RED [CONFIRMED by Discipline engine run 34072529126, on master after PR #601 "train/wave52
2026 09 07"]: fitness summary 33 functions, 14 violations, all F25 (`module-liveness`) `ALLOWLIST ENTRY
EXPIRED` — every entry the ASSEMBLE-47 coordinator lane re-granted to `expiry:52` on 2026-09-05 (train 47,
"a ~5-train buffer, not indefinite," per `F25-module-liveness.mjs`'s own "ASSEMBLE-47 RATCHET NOTE"), now
expired because `latestTrainWave()` reads `wave52` on `origin/master`'s own git log (PR #601 landed it).

**Binding operator ruling this lane executes**: never re-grant an F25 expiry. Every one of the 14 gets a
real disposition — WIRE (a genuine dispatch root) or DELETE (script + test + runbook mentions + doc index
lines) — never a fifteenth deferral.

## Method

For each of the 14, read: the file's own header, its test (if any), `git log` on the file, and whether the
ruling/incident it served is closed. Primary provenance: `docs/audits/wiring-census-2026-08-11.md` §A/§B
(the class F25 mechanizes), `docs/audits/full-read-2026-08-31/L14-scripts-B.md` (per-file WIRING/NOTE
verdicts for every `scripts/_reground/*` and several `scripts/verify/*` files — the most recent full read
of this exact file set), and `docs/PROGRAM-BOARD.md` §2 (Unit 3's live, un-closed status). Default applied
per the dispatch: a one-shot whose ruling is closed and whose remediation has been applied is DELETED; a
check or tool that would still catch a recurring defect, or that serves an ACTIVE (not closed) remediation
effort, is WIRED.

## Disposition table

| # | Script | Purpose (own header) | Decision | Reason |
|---|---|---|---|---|
| 1 | `scripts/_reground/executor-ground.mjs` | $0 hand-supplied-ledger grounding path (CC-GROUNDING-EXECUTOR, operator ruling 2026-07-16) — bypasses fetch/Sonnet spend, the system's own mint gates (verbatim-kept-filter, tier-stamp, S-CONFLATE/S-NUMERIC, `validate_item_provenance`) still run unchanged | **WIRE** | OPERATOR-TOOL per `L14-scripts-B.md` (not DEAD). Serves the still-ACTIVE Unit-3 quarantine drain (`PROGRAM-BOARD.md` §2, deferred to 2026-10-31, not closed). Takes item-specific positional args (`<itemId> <ledger.json>`) that do not fit a scheduled/CI-fanned-out shape — registered in `OUT-OF-REPO-BOUNDARY.md`'s Operator-CLI register instead; `F25-module-liveness.mjs`'s `findDispatchRoots` Source 7 widened to recognize a backticked `_reground/*.mjs` row the same way it already recognizes `governance/*.mjs`/`dispatch/*.mjs`/`install-hooks.mjs`. |
| 2 | `scripts/_reground/free-pass-run.mjs` | $0 batch re-attribution of failing FACT claims to already-held floor-qualifying captures (economy-of-information doctrine, 2026-07-13) | **WIRE** | Same as #1 — OPERATOR-TOOL per `L14-scripts-B.md`, serves the active drain, per-batch args (`--apply`/`--limit`/`--only`) don't fit a schedule. Operator-CLI register row added. |
| 3 | `scripts/_reground/id-stamp.mjs` | Verify-before-write promotion to id-confirmed under an already-held mutation lease | **WIRE** | Same as #1 — OPERATOR-TOOL, needs `<itemKey> <proposedId> <holder>` — genuinely a per-item judgment call, not automatable. Operator-CLI register row added. |
| 4 | `scripts/_reground/lease.mjs` | Standalone per-item mutation-lease CLI (acquire/heartbeat/release), thin wrapper over the mig-211 RPCs | **WIRE** | Same as #1 — OPERATOR-TOOL, the lock primitive `id-stamp.mjs`/`tombstone-delete.mjs` require the caller to already hold. Operator-CLI register row added. |
| 5 | `scripts/_reground/restore-overclear.mjs` | One-shot restoration of claims over-cleared by a specific 2026-07-16 batch drain-clear incident | **DELETE** | DEAD-HISTORICAL per `L14-scripts-B.md`: scoped precisely to `supersede_reason='proven_inaccurate'` AND `inaccuracy_proof.reason='span_absent_from_verified_primary'` — a named, closed incident, not reusable machinery. The gate that caused the incident was tightened (`doctrine-register.mjs` category-21-adjacent note); nothing else references the file outside historical prose. Already deleted in this worktree by the prior session; kept. |
| 6 | `scripts/_reground/target-match-probe.mjs` | Read-only `verifyTargetMatch` report over the current drain worklist, zero writes/spend/fetch | **WIRE** | Same as #1 — OPERATOR-TOOL, ad hoc diagnostic over the active drain. Operator-CLI register row added. |
| 7 | `scripts/_reground/tombstone-delete.mjs` | Tombstone-then-delete for archive-endgame buckets, fail-closed ordering (tombstone insert before delete) | **WIRE** | OPERATOR-TOOL per `L14-scripts-B.md`, with running evidence: `disposition_ledger` carries 236 live rows (table-usage.txt), "consistent with this tool ... having actually run historically." Still the reusable mechanism for GROUP-② tombstone rule and duplicate merges. Operator-CLI register row added. |
| 8 | `scripts/verify/admin-phrase-scan.mjs` | SOFT review signal: admin/profile JSX scanned for human-gate framing that contradicts RD-20 (Unit 0c Part 4, operator ruling 2026-07-13) | **WIRE** | Recurring class — a new admin/profile component can reintroduce the framing at any time. Filesystem-only, no creds, always exits 0. Registered as a `run-data-audit-lane.mjs` `AUDITS` entry (SOFT), dispatched nightly via `.github/workflows/data-audit-lane.yml`. |
| 9 | `scripts/verify/cleanup-dup-sources.mjs` | Batch cleanup of a specific duplicate-source cluster | **DELETE** | The named cluster it targeted was a dated, already-resolved incident; re-running against a corrected corpus is a no-op. No test, no other reference. Already deleted in this worktree by the prior session; kept. |
| 10 | `scripts/verify/defect-signature-scan.mjs` | Ground-truth verification unit (2026-07-15, ADR-014): S-CONFLATE/S-NUMERIC heuristic triage over FACT claims, HOLDS for live verification, never a build-blocking verdict itself | **WIRE** | Recurring class — any FACT claim minted at any time can trip either signature. Registered as a `run-data-audit-lane.mjs` `AUDITS` entry (SOFT). Bare (no-flag) invocation given a default `--since 24h ago` frame (this lane) so the AUDITS dispatch shape works without a hand-supplied `--ids`/`--since`/`--all`, mirroring `wave-acceptance-audit.mjs`'s own bare-invocation default. Its own `defect-signature-scan.golden.mjs` behavioral proof is unaffected (drives the module directly, not the CLI frame). |
| 11 | `scripts/verify/remediate-orphan-sources.mjs` | REMEDIATION half of invariant SC-2-source-registration: registers the host of a source-y archived item, or reclassifies a mis-labeled `source_not_item` portal whose host is already registered | **WIRE** | Recurring class — `scripts/verify/orphan-source-audit.mjs` (already wired) DETECTS pre-existing orphans and the invariant's own residual note says this is what must FIX them. Dispatched via a new `.github/workflows/maintenance.yml` step (`remediate-orphan-sources`), through a `scripts/maintenance/remediate-orphan-sources.mjs` subprocess wrapper (same shape as `acquire-primaries.mjs`/`refetch-capped.mjs`) — the target script does real guarded Supabase writes even inside its own dry-run report, so wrapping it unmodified as a child process is the honest boundary. See `docs/runbooks/MAINTENANCE-RUNBOOK.md` §39. |
| 12 | `scripts/verify/remediate-reclassify-proposal.mjs` | Batch execution of a specific proposal-reclassification ruling | **DELETE** | The ruling it applied was a one-time batch already executed against the live corpus. No test, no other reference. Already deleted in this worktree by the prior session; kept. |
| 13 | `scripts/verify/stale-verified-audit.mjs` | Detects verified items whose grounding has gone stale | **DELETE** | Superseded: its detection surface is now covered by the already-wired `defect-signature-scan` (S-CONFLATE/S-NUMERIC triage) and `surface-visibility` audits (#10, #14) — keeping a third, unwired, overlapping detector is the "shadow capability" class CLAUDE.md's "one module every caller imports" ruling forbids in the other direction. `citingFiles` reference in `skill-contract-map.mjs`'s `remediation-discipline` pin removed in the same commit (no `contentHash` change). Already deleted in this worktree by the prior session; kept. |
| 14 | `scripts/verify/surface-visibility-audit.mjs` | The "verified item hidden from its surface" invariant (PPWR incident, 2026-07-08): opens `integrity_flags` rows for a live verified item whose domain routes to no surface or the wrong one | **WIRE** | Recurring class — a live item can be minted/reclassified with a null/mis-set domain at any time; `full-read-2026-08-31/L13-scripts-A.md` finding #5 flagged it as "the one write-capable audit in `scripts/verify/` with no automated caller." Registered as a `run-data-audit-lane.mjs` `AUDITS` entry (SOFT). |

**Totals: 10 WIRED / 4 DELETED.**

## Mechanism note: the `_reground/` Operator-CLI register widening

Six of the ten WIRE dispositions (#1–#4, #6–#7) are genuinely hand-run, per-item CLI tools whose
arguments (an item id, a lease holder, a proposed identifier, a batch limit) do not fit a scheduled or
CI-fanned-out `mode`/`arg` shape the way `maintenance.yml`'s existing steps do. Rather than force an
ill-fitting `maintenance.yml` wrapper on each, this lane widened `F25-module-liveness.mjs`'s existing
Source 7 (`OUT-OF-REPO-BOUNDARY.md`'s "Operator-CLI register" — already the recognized mechanism for
`install-hooks.mjs`, `dispatch/start.mjs`, `dispatch/audit.mjs`) to also recognize a backticked
`_reground/*.mjs` row, resolving it under `fsi-app/scripts/` instead of `fsi-app/.discipline/`. This keeps
"operator-invoked, out-of-workflow, no schedule" as ONE recognized dispatch shape rather than inventing a
second one for the same class of tool. `F25-module-liveness.test.mjs` and
`OUT-OF-REPO-BOUNDARY.md`'s own "registry cannot rot" test cover the extension.

## Result

`node fsi-app/.discipline/fitness/runner.mjs`: F25 (`module-liveness`) 0 violations. `LEGACY_ALLOWLIST`
carries 17 entries, none with an `expiry` field — no expiry-carrying entry remains in the F25 allowlist.
