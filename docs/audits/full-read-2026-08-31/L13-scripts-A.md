# Lane L13-scripts-A — scripts/lib/ (60 files) + scripts/verify/ (56 files)

Repo: /root/work/dotfiles/fsi-app. All paths below are relative to that root. Every file in
/root/work/audit/lanes/L13-scripts-A.txt was read in full (see coverage attestation at the end).

---

## scripts/lib/ (60 files)

**scripts/lib/admin-phrase-scan.mjs — WORKING-WIRED — regex scanner flagging "human-gate" framing phrases in admin/profile UI copy.**
  - WIRING: imported by `scripts/verify/admin-phrase-scan.mjs` (`scanAdminPhrases`), confirmed. That wrapper itself has no automatic caller in this checkout (see verify section).
  - NOTE: carries an ALLOWLIST for legitimate human controls (emergency-stop, SC-3 tier override, community moderation) and negation/retirement handling, per an operator ruling that the intake path has no human-approval gate.

**scripts/lib/admin-phrase-scan.selftest.mjs — TEST — pins positive (flagged phrase) and negative (allowlisted phrase) fixtures for the scanner above; not vacuous.**

**scripts/lib/anthropic.mjs — WORKING-UNWIRED — refs=0, GRAPH:UNREACHABLE — canonical script-side Anthropic Messages API wrapper (`canonicalGenerate`, `textOf`).**
  - WIRING: no importer found anywhere in the repo. Large non-tool calls route through `streamMessagesText` (src/lib/agent/anthropic-stream.mjs, outside lane) to avoid a documented buffered-POST hang bug above `STREAM_ABOVE_MAX_TOKENS=8192`.
  - NOTE: this is the "canonical" wrapper by its own doc comment, yet nothing in scripts/ currently calls it — either every script-side Anthropic call already goes direct, or this is a prepared-but-unused utility.

**scripts/lib/batch-primitives.mjs — WORKING-UNWIRED — refs=1, GRAPH:TEST-ONLY — resilience primitives (`withRetry`, `withRateLimit`, `withIdempotency`, `createPgPool`, `createProgressReporter`, retryability predicates).**
  - WIRING: graph flag confirmed — the only importer in-repo is its own test file. No production script imports these primitives despite their generality.

**scripts/lib/batch-primitives.test.mjs — TEST — exercises every primitive with genuine timing/retry/idempotency assertions; documents a `TIMER_SLOP_MS=2` tolerance against cross-clock flakiness. Not vacuous.**

**scripts/lib/block1-reaudit.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — `--live`-gated acceptance test seeding/deleting SENTINEL rows in the shared prod DB to re-probe Block-1 provenance invariants.**
  - WIRING: refuses to run without an explicit `--live` CLI flag — confirmed safety gate against accidental prod writes. No automatic caller; by design, operator-invoked.

**scripts/lib/bootstrap-test1.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — pure in-memory (no DB) known-answer+mutation matrix re-catching 10 named historical session failures as general-category checks.**
  - WIRING: not `--live`-gated (needs no DB), but not named `*.test.mjs`/`*.selftest.mjs` either, so no test runner or golden-runner glob picks it up. Runs only via `node scripts/lib/bootstrap-test1.mjs` by hand.
  - NOTE: documents an explicit "ANTI-GAMING" bar requiring both a positive AND negative fixture per historical-failure line.

**scripts/lib/canonical-key.mjs — WORKING-WIRED — refs=3 — the ONE JS mirror of `derive_canonical_instrument_key()` SQL (migration 255).**
  - WIRING: confirmed imported by `scripts/verify/canonical-key-uniqueness.mjs:17` (`import { deriveKey } from "../lib/canonical-key.mjs"`).
  - NOTE: replaces two previously-diverged hand-copied mirrors that produced 6 FALSE collision groups in a real incident (run #66, 2026-08-11) — a CELEX-suffix-discarding bug. The two dead-mirror-risk siblings this incident should have retired everywhere are `fetch-quality.mjs` and `urgency.mjs` below, which were never consolidated.

**scripts/lib/canonical-key.selftest.mjs — TEST — pins the exact migration-255 self-check vectors including the 6 real historical false-collision pairs. Not vacuous.**

**scripts/lib/check-sources-decision.selftest.mjs — TEST — composition fixture for src/lib/sources/check-sources-decision.mjs (outside lane), asserting REACHABLE/INCONCLUSIVE/DEAD eviction-decision logic. Not vacuous.**

**scripts/lib/db-register-source-role.test.mjs — TEST — byte-level regression asserting db.mjs's `registerSource` wires `classifySourceRole`.**
  - NOTE: documents a real historical incident: 1,719 of 2,549 registry rows had NULL `source_role`, causing a downstream triage to wrongly demote live regulators (SEC, eCFR, China MEE, Australia's Clean Energy Regulator) to provisional.

**scripts/lib/db.mjs — WORKING-WIRED — refs=37 (highest in lane) — the guarded-write helper: `readClient()`, `readAll()`, `guardedUpdate/Delete/Insert/InsertMany`, `DELETE_PROTECTED_TABLES`, `archivePatch/archiveRows`, `registerSource`, `reclassifyToSource`.**
  - NOTE: `readClient()` proxies `.from(table)` so `.insert/.update/.delete/.upsert` THROW — closes a documented "rule-015 bypass" where the read client was mutating prod. `readAll()` paginates past PostgREST's ~1000-row cap — the exact bug class that created 27 duplicate sources on 2026-06-06 (remediated by `scripts/verify/cleanup-dup-sources.mjs` below). All guarded writes require an explicit `{cite:{skill,reason}}` and snapshot prior row state to `scripts/_snapshots/` before mutating. `reclassifyToSource` registers a source AND read-back-verifies it active BEFORE archiving an item.

**scripts/lib/db.test.mjs — TEST — hand-rolled chainable Supabase mock proving reclassifyToSource's register-then-archive order, throw-and-never-archive on unconfirmed registration, readAll pagination past 1000 rows, guardedDelete's delete-protection, institutionKey's shared-portal logic, readClient's write-blocking proxy. Not vacuous.**

**scripts/lib/decision-anchors.mjs — WORKING-WIRED — refs=2 — a six-verdict (IMPLEMENTED/DRIFTED/GOVERNANCE/UNCONFIRMABLE/PENDING/PENDING_VIOLATION) engine anchoring 48 hardcoded rows of a historical 47-row decision log (+ a self-guard row 48) to live code/DB/git-branch checks.**
  - WIRING: consumed by `scripts/lib/decision-log-audit.mjs` (below).

**scripts/lib/decision-anchors.selftest.mjs — TEST — not vacuous.**

**scripts/lib/decision-log-audit.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — LAYER-3 real-run script connecting directly to prod DB via `.env.local` + `supabase/.temp/{project-ref,pooler-url}` to re-derive the 48-row decision-anchor verdicts.**
  - WIRING: no automatic caller; run by hand.
  - NOTE: unlike its sibling reconstruction scripts (`verify-reconstruction.mjs`, `liveness-reconstruction.mjs`, `block1-reaudit.mjs`), this file has NO `--live` CLI-flag refusal gate before touching the shared prod DB, even though it performs only reads. An inconsistency worth flagging to the owner, not a defect (read-only risk is low).

**scripts/lib/deferral.mjs — WORKING-WIRED — refs=3 — validates deferral payloads (`{reason, deferred_until, owner, resolution_event}`).**
  - WIRING: confirmed imported by `scripts/verify/deferral-hygiene-audit.mjs:18` (`sameBlockerReason`) and `scripts/verify/quarantine-disposition-audit.mjs:31` (`isValidDeferral`).
  - NOTE: requires reason≥30 chars + a disposition-path keyword, a real named owner (rejects TBD/unknown/n/a), a future date, and a named resolution event. `isValidRenewal`/`sameBlockerReason` reject a renewal that just re-dates the same reason — a census found 17+ such rows historically.

**scripts/lib/deferral.selftest.mjs — TEST — not vacuous.**

**scripts/lib/drift-check-reconstruction.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — `--live`-gated reconstruction of drift-check.mjs's behavioral predicates against a real source file.**

**scripts/lib/drift-check.mjs — WORKING-WIRED — refs=6 — AST-based (lazy `typescript` import) behavioral predicate engine (`calls`, `noRawSourceFetch`, `runtime`, `textOnly`).**
  - NOTE: explicitly designed so a token merely mentioned in a comment cannot false-report IMPLEMENTED — proven in its own reconstruction against the real `src/lib/sources/verification.ts`, which has a literal stale comment "browserlessRender is overkill here."

**scripts/lib/drift-check.selftest.mjs — TEST — not vacuous.**

**scripts/lib/entity-gate.selftest.mjs — TEST — tests src/lib/sources/entity-gate.mjs (outside lane): `urlIsRoot`, `entityVerdict`, `shouldMintItem`, `isErrorBody` against real CloudFront-403/Cloudflare-challenge fixtures vs a real CBAM regulation negative control. Not vacuous.**
  - NOTE: `urlIsRoot` (the module under test) is confirmed live-used by `scripts/verify/source-vs-item.mjs:12`.

**scripts/lib/error-drop-probe.mjs — OPERATOR-TOOL — refs=1 — regex/window-based detector for `const {data} = await supabase...` destructures that silently drop `error`.**
  - NOTE: deliberately SOFT/report-only — 108 legacy instances acknowledged, always exits 0 — with an `error-intentionally-ignored` escape-hatch comment marker.

**scripts/lib/error-drop-probe.selftest.mjs — TEST — not vacuous.**

**scripts/lib/exclusion-audit-reconstruction.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — independently re-derives the "420 reachability-exclusions" finding from live source_verifications.**
  - NOTE: like decision-log-audit.mjs, connects to prod DB read-only with no `--live` gate.

**scripts/lib/exclusion-audit.mjs — WORKING-WIRED — refs=4 — cross-product of a hardcoded `EXCLUSION_SURFACES` registry (source_verifications/ingest_rejections/sources_suspended) against a hardcoded `UNRELIABLE_METHODS` registry (2 entries: `plain-fetch-reachability`, `dead-jq-hook`).**
  - NOTE: designed so a new exclusion-by-unreliable-method needs only a registry entry, no new code.

**scripts/lib/exclusion-audit.selftest.mjs — TEST — not vacuous.**

**scripts/lib/fetch-negative-probe.mjs — WORKING-WIRED — refs=2 — lexicon/window-based static scanner (FORM 1 of the inconclusive-probe bug class) for "fetch failure resolved to a substantive negative instead of INCONCLUSIVE".**
  - WIRING: delegated to by `inconclusive-probe.mjs` (below).
  - NOTE: self-documents its own residual blind spots (helper-fn indirection, numeric sentinels, downstream-caller reinterpretation).

**scripts/lib/fetch-now-decision.selftest.mjs — TEST — for an outside-lane module. Not vacuous.**

**scripts/lib/fetch-quality.mjs — WORKING-UNWIRED — refs=0, GRAPH:UNREACHABLE — "Mirror of src/lib/sources/fetch-quality.ts so .mjs scripts can use the same logic without a build step. Keep the two files in lockstep."**
  - WIRING: zero importers in this lane, no own selftest.
  - NOTE (owner-must-know): this is the exact "two hand-copied mirrors silently diverge" risk pattern that canonical-key.mjs's own header explicitly warns caused a real 6-false-collision incident — but unlike canonical-key.mjs, this mirror was never consolidated and has no test pinning it to its TS twin.

**scripts/lib/flag-age.mjs — WORKING-WIRED — refs=2 — dwell-based classifier (`DWELL_BOUND_DAYS=30`) for open integrity_flags age.**
  - WIRING: confirmed imported by `scripts/verify/flag-age-audit.mjs:10` (`summarizeFlagAges`, `DWELL_BOUND_DAYS`).
  - NOTE: exemptions for RD-28-held, disposition_deferred, standing-debt markers, and quarantined-item flags (owned by quarantine-disposition-audit.mjs).

**scripts/lib/flag-age.selftest.mjs — TEST — not vacuous.**

**scripts/lib/free-pass.mjs — WORKING-WIRED — refs=2 — three-gate "$0 free re-attribution" decision (verbatim+tier, primary-instrument-class, error-body exclusion — all composed from outside-lane modules) so a matched span in non-authoritative "furniture" can never flip attribution.**

**scripts/lib/free-pass.selftest.mjs — TEST — not vacuous.**

**scripts/lib/funded-pass-core.mjs — WORKING-WIRED — refs=2 — pure classification for the funded-pass runner: `classifyFailure`, `withArmedLock`, `hardDivergence`, `spendWatchHalt`, `isRunaway`, `totalBoundHalt`, `authoritativeCumulative`.**

**scripts/lib/funded-pass-core.test.mjs — TEST — not vacuous.**

**scripts/lib/funded-pass-lock.mjs:45-49 — WORKING-WIRED — refs=2, GRAPH:UNREACHABLE (contradicted) — DB-level mutual-exclusion lock client (migration 205): `acquireRunLock`/`heartbeatRunLock`/`releaseRunLock` + `emergencyPaused`.**
  - WIRING OVERTURN: GRAPH:UNREACHABLE is contradicted at the import level — confirmed imported by `scripts/verify/funded-pass-lock-golden.mjs:10`. The flag is accurate only in the "not reachable from a route/workflow/npm script" sense: the golden itself has no automatic trigger (see run-goldens.mjs below).
  - DEFECT (line 45-49): `emergencyPaused(sb)` reads `system_state.global_processing_paused` and on any Supabase read error returns `false` (line 47: `if (error) return false;`) — i.e. **fails OPEN to "not paused"**. Concrete failure scenario: an operator flips the global pause flag to stop a runaway spend; a funded-pass process's between-item poll happens to hit a transient network/DB hiccup on that exact call; `emergencyPaused` reports not-paused and the pass continues spending for at least one more item (and, if hiccups recur, longer). The code comment explicitly defends this as a deliberate tradeoff ("a transient read error must not wedge a legitimately-running pass; the between-item cadence re-reads on the next item, so a real pause is caught within one item") — this is a considered design choice, not an obviously unintended bug, but it is the textbook shape of an emergency-stop mechanism that fails open rather than closed, and it is defensible to flag either way. Reported per the brief's explicit "fail-open that should fail closed" example category.

**scripts/lib/funded-release-plan.mjs — WORKING-UNWIRED — refs=1, GRAPH:TEST-ONLY — the "deletion moat": `instrumentIdentityBucket`, `isDeletableLoser`, `isOperatorValueDeletable` (a second deletion class authorized by an operator-ruled id list, the "Kansas precedent"), `buildReleaseDeletionPlan`, `validateReleaseDeletionPlan`.**
  - WIRING: graph flag confirmed — only its own test imports it; no production caller found.

**scripts/lib/funded-release-plan.test.mjs — TEST — uses a RED fixture (real historical incident `d5ee6ab8` — Fit-for-55 topical package wrongly proposed for deletion) and a GREEN fixture (CSRD CELEX pair). Not vacuous.**

**scripts/lib/inconclusive-probe.mjs — WORKING-WIRED — refs=2 — umbrella "non-answer resolved to a definitive answer" bug-class detector combining FORM 1-4.**
  - INCOMPLETE/NOTE: FORM 4 (`findOrchestrationMishandling`) scans BOTH code and `.github/workflows/*.yml` for CI-retry-on-non-idempotent-op / transient-mapped-to-hard-fail patterns. This checkout has NO `.github/workflows` directory at all (confirmed absent, see coverage-gap finding below), so `discoverWorkflows()` catches the resulting ENOENT and returns `[]` — FORM 4's workflow-scanning half currently has zero files to scan and is vacuously "clean," not actually exercised.

**scripts/lib/inconclusive-probe.selftest.mjs — TEST — not vacuous.**

**scripts/lib/inconclusive-report.mjs — OPERATOR-TOOL — refs=0 (no flag = entry point) — CLI wrapper/report driver for inconclusive-probe.mjs.**

**scripts/lib/liveness-reconstruction.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — `--live`-gated reconstruction of liveness.mjs's predicates against real timestamps.**

**scripts/lib/liveness.mjs — WORKING-WIRED — refs=2 — the "self-liveness inversion" pattern: `assessLiveness` (LIVE/STALE/NEVER), `consumerView` (0 findings renders CLEAN only under LIVE; STALE/NEVER always render UNKNOWN+loud regardless of finding count).**
  - NOTE: explicitly designed so a dead D3 (self-verification apparatus) can never present as green.

**scripts/lib/liveness.selftest.mjs — TEST — not vacuous.**

**scripts/lib/mutation-lease.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (contradicted) — per-item DB lease client (`acquireLease`/`heartbeatLease`/`releaseLease`/`withLease`) mirroring funded_pass_runlock semantics for item-level mutual exclusion (H5, operator ruling 2026-07-16).**
  - WIRING OVERTURN: confirmed imported by `scripts/verify/mutation-lease.golden.mjs:18` (`acquireLease`, `heartbeatLease`, `releaseLease`), directly contradicting refs=0/GRAPH:UNREACHABLE. No own selftest in this lane, but is exercised end-to-end by that golden against a synthetic item id.

**scripts/lib/net-agent.mjs — WORKING-UNWIRED — refs=0, GRAPH:UNREACHABLE — side-effecting module that, on import, installs a bounded undici Agent (keepAliveTimeout:4000, connections:4, no pipelining) as the global fetch dispatcher.**
  - WIRING: no importer found anywhere in the repo. A module meant to tame transient sandbox network instability against Anthropic/Browserless calls, but nothing currently imports it to install the dispatcher.

**scripts/lib/pg-conn.mjs — WORKING-WIRED — refs=7 — shared Postgres connection-string resolver (`candidateConnStrings`, `connectPg`).**
  - WIRING: confirmed imported by `column-existence-parity.mjs`, `pause-flag-guard-proof.mjs`, `prov-guard-adversarial-audit.mjs`, `rls-credential-parity.mjs`, `schema-drift-audit.mjs`, `vocab-sync-audit.mjs` (all in this lane's verify/ half) — consolidates what were 6 divergent per-audit connection implementations that caused a documented 29-run CI outage.

**scripts/lib/pg-conn.test.mjs — TEST — not vacuous.**

**scripts/lib/reachability.selftest.mjs — TEST — tests src/lib/sources/reachability.mjs (outside lane): the "fetchOk principle" (429/503/timeout/dns/403 → INCONCLUSIVE, not DEAD; only 404/410 → DEAD), including a LEGACY_BUGGY mutation-check comparison. Not vacuous.**

**scripts/lib/surface-registry-reconstruction.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE.**

**scripts/lib/surface-registry.mjs — WORKING-WIRED — refs=7 — canonical enumeration of `SURFACE_CLASSES` via an in-process glob matcher, plus a `validateCoverage` completeness gate requiring every class be accounted walked/not-walked with a reason.**

**scripts/lib/surface-registry.selftest.mjs — TEST — not vacuous.**

**scripts/lib/type-consumer-probe.mjs — WORKING-WIRED — refs=1 — static scanner for `TYPE_MAP[x.type].prop`-shaped unguarded dereferences, a precondition-checker for a planned future migration (dropping item_type's default).**
  - NOTE: per its own comments, that future migration had not landed at time of writing; I did not check whether it has since shipped — that is a migrations-lane question, out of scope here.

**scripts/lib/type-consumer-probe.selftest.mjs — TEST — not vacuous.**

**scripts/lib/urgency.mjs — WORKING-UNWIRED — refs=0, GRAPH:UNREACHABLE — "Mirror of fsi-app/src/lib/urgency.ts; keep both in sync" (`urgencyScoreFromPriority`/`urgencyScoreFromTier`).**
  - WIRING: zero importers found, no own selftest.
  - NOTE: same dead-mirror risk pattern as fetch-quality.mjs above — flagged together as one class of risk in the lane summary.

**scripts/lib/verification-decision.selftest.mjs — TEST — for an outside-lane module (`decideReachabilityAction`). Not vacuous.**

**scripts/lib/verify-reconstruction.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — `--live`-gated.**

**scripts/lib/verify.mjs — WORKING-WIRED — refs=7 — the foundational outcome-assertion toolkit: `assertReadBack` (never trusts a mutation's own success return, only a fresh read-back), `fetchOk` (non-2xx throws INCONCLUSIVE), `observeFired` (asserts a gate's EFFECT not its installation — catches "loaded but inert" hooks), `findRawSourceFetch`.**

**scripts/lib/verify.selftest.mjs — TEST — not vacuous.**

---

## scripts/verify/ (56 files)

**scripts/verify/_fmt-present.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (contradicted) — spelling-tolerant, number-tolerant section-heading presence matcher (`sectionPresent`, `norm`).**
  - WIRING OVERTURN: confirmed imported by `scripts/verify/format-structure.mjs:35` (`const { sectionPresent, norm } = await import("./_fmt-present.mjs")`) — directly contradicts the raw GRAPH:UNREACHABLE flag. format-structure.mjs itself is reachable only through `run-data-audit-lane.mjs`, which has no automatic external trigger in this checkout (see below).

**scripts/verify/admin-phrase-scan.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — SOFT wrapper walking src/components/admin + src/components/profile, calling lib/admin-phrase-scan.mjs's `scanAdminPhrases`, always `process.exit(0)`.**
  - WIRING: confirmed genuinely unreferenced — not present in run-data-audit-lane.mjs's AUDITS array, not a golden (wrong filename shape), no npm script. No automated caller found.

**scripts/verify/audit-finding-status.mjs — WORKING-WIRED (report-only) — refs=0, GRAPH:UNREACHABLE (soft — see wiring) — enforces "standing rule 14": every finding-shaped bullet in docs/audits/*.md matching a DEFECTY regex must carry a [CONFIRMED]/[HYPOTHESIS]/[REFUTED] token.**
  - WIRING/AMBIGUITY RESOLVED: path computation is `join(HERE, "..", "..", "..", "docs", "audits")` where `HERE` = `.../fsi-app/scripts/verify` — three `".."` resolves to `/root/work/dotfiles/docs/audits`, ONE LEVEL ABOVE fsi-app/, not `fsi-app/docs/audits`. I initially treated this as a candidate path-resolution defect, since both `fsi-app/docs/audits` (55 files, mostly sprint-specific data/verification logs) and `dotfiles/docs/audits` (75 files) exist on disk. I resolved it by grepping both directories for the exact `[CONFIRMED]`/`[HYPOTHESIS]`/`[REFUTED]` token vocabulary this script polices: `fsi-app/docs/audits` contains **zero** matches; `dotfiles/docs/audits` contains matches (e.g. `dotfiles/docs/audits/product-code-wiring-truth-2026-08-09.md`, `dotfiles/docs/audits/runtime-clock-inventory-2026-08-10.md`). `dotfiles/docs/audits` is also independently confirmed as the intended shared audits directory by `column-existence-parity.mjs:130` (`resolve(ROOT, "..", "docs/audits/dead-code-manifest-2026-08-11.txt")`, same two-levels-above-ROOT resolution, and that exact file — `dead-code-manifest-2026-08-11.txt` — exists there). **Conclusion: the three-`".."` path is intentional, not a bug** — `dotfiles/docs/audits` is this repo's real, shared audit-findings directory; `fsi-app/docs/audits` is a differently-purposed directory of older sprint census/verification artifacts. Not a defect.
  - NOTE: `--strict` flag (never invoked anywhere found in this checkout) would fail the build; default is report-only.

**scripts/verify/canonical-key-uniqueness.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — live-data truth-teller for the partial unique index `uq_intelligence_items_canonical_key_verified_live` (migration 200); DERIVES the key on-the-fly via `canonical-key.mjs` so it catches a would-be verified twin even before the column is backfilled.**
  - WIRING: listed in `run-data-audit-lane.mjs`'s AUDITS array (line 81) as a hard audit — reachable via that runner, which itself has no automatic external trigger (see run-data-audit-lane.mjs below).
  - NOTE: self-skips exit 2 on missing DB creds or absent stored column, never a stack-trace crash.

**scripts/verify/cc-executor-submit.golden.mjs — TEST (golden) — no DB — proves the CC-GROUNDING-EXECUTOR submission adapter is subject to the SAME verbatim kept-filter and mint gates as a metered-model ledger (propose/dispose separation). Fixture-driven with clean positive+negative controls; not vacuous.**
  - WIRING: auto-discovered by `run-goldens.mjs` (filename matches `*.golden.mjs`).

**scripts/verify/claims-tier-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — INVARIANT SC-7: every FACT claim's stored `source_tier_at_grounding` equals the tier derived from its resolved source (base_tier-only, moat-pure); non-FACT claims must carry a NULL stamp.**
  - WIRING: in `run-data-audit-lane.mjs`'s AUDITS array (line 59).
  - NOTE: deliberately does NOT re-resolve "now" — a host registered after grounding is growth (Phase-3 re-ground), not drift.

**scripts/verify/cleanup-dup-sources.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — guarded, snapshotted one-off cleanup of the 27 duplicate sources created 2026-06-06 by the capped-read bug in registerSource (fixed by db.mjs's `readAll` pagination).**
  - WIRING: dry-run default, `--apply` to delete; SAFETY gate aborts if any deletion would leave a host with zero active sources. Not wired to any runner — operator-invoked, plausibly a completed one-off (arguable DEAD-HISTORICAL vs. still-useful OPERATOR-TOOL if the bug class recurs); I classify OPERATOR-TOOL since it is generically re-runnable and idempotent (it recomputes the dupe set fresh each run rather than replaying a fixed list).

**scripts/verify/column-existence-parity.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — greps literal `.from("T").insert|update|upsert({...})` write-sites and asserts each top-level key exists in live information_schema.columns (the reviewer_notes phantom-column class).**
  - WIRING: in `run-data-audit-lane.mjs`'s AUDITS array (line 82).
  - INCOMPLETE (self-documented, lines 10-18): cannot see spread writes (`{...payload}`), dynamically-built row objects, computed keys, or a variable passed to `.insert(row)` — reported as UNRESOLVED, never as a phantom. Does not parse `select` column strings.
  - NOTE (line 123-136): skips files listed in `dotfiles/docs/audits/dead-code-manifest-2026-08-11.txt` (pending an operator-run `git rm` sweep) — self-retiring once that manifest is emptied/absent.

**scripts/verify/defect-signature-scan.golden.mjs — TEST (golden) — no DB — locks S-CONFLATE and S-NUMERIC positive controls plus a clean negative control (zero hits) for the accuracy-defect heuristic below. Not vacuous.**

**scripts/verify/defect-signature-scan.mjs — OPERATOR-TOOL — refs=1 — HEURISTIC triage (self-declared, lines 6-21) for two accuracy-defect signatures (S-CONFLATE instrument-identity conflation, S-NUMERIC span-unsupported figures) over FACT claims.**
  - WIRING: its pure matchers are now re-exported from the ONE shared module `src/lib/agent/defect-signatures.mjs` (line 37) so this scan and a mint-time gate share one implementation; refs=1 is its golden's import.
  - NOTE: explicitly NOT a certification tool — "a hit means hold and verify live, never this is fabricated" — must never promote to VERIFIED. `main()` is CLI-only, not invoked when imported by the golden (line 93).

**scripts/verify/deferral-hygiene-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — polices the FLAG side of deferral rot: EXPIRED-OPEN, DELETED-SUBJECT (open-only, per a 2026-08-11 lane-diagnosis fix, line 75-79), and RENEWAL-REPACKAGE (an open deferral recycling a sibling's reason).**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 83).
  - NOTE: read-only, report-only — never resolves/re-opens flags itself; all three rot classes hard-fail the lane (line 113-116), per an explicit operator ruling that "report-only" describes the write behavior, not the exit-code behavior.

**scripts/verify/disposition-content-gate.golden.mjs — TEST (golden, structural) — no DB — inspects the SOURCE of `scripts/_reground/tombstone-delete.mjs` (outside lane) to prove an archive_reason LABEL alone cannot authorize an irreversible delete: allowlist exists, accurate-but-archived reasons excluded, `--empty-only` requires brief-length-0 AND zero grounded claims, tombstone insert precedes the delete. Not vacuous.**

**scripts/verify/drain-clear-two-condition.golden.mjs — TEST (golden) — no DB — proves the tightened drain-clear auto-version-out requires BOTH span-absent-from-primary AND a foreign instrument identifier, using two real historical incident patterns (55f90df0 MUST-clear, 4ff5cf56 MUST-NOT-clear) plus an ORPHAN-class third exit. Not vacuous.**

**scripts/verify/executor-parity.golden.mjs — TEST (golden, structural+behavioral) — no DB — proves the CC-executor and metered driver are interchangeable by inspecting `groundBriefImpl` in src/lib/agent/canonical-pipeline.ts: the driver-identity variable `injected` appears EXACTLY 4 times in code (1 declaration + 3 allowlisted divergence points), and the judgment core references it at most once. A structural gate that would catch a 5th, un-audited, driver-dependent branch. Not vacuous.**

**scripts/verify/flag-age-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — enforces open-integrity_flags age across ALL subject_types via `flag-age.mjs`, with an RD-28-held exemption.**
  - WIRING: confirmed calls `lib/flag-age.mjs`'s `summarizeFlagAges`; in run-data-audit-lane.mjs's AUDITS array (line 84).

**scripts/verify/format-structure.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — v2 measures BRIEF completeness (not row extraction): for each always-present spec section, is its heading present in full_brief (spelling-tolerant via `_fmt-present.mjs`)?**
  - WIRING: confirmed imports `_fmt-present.mjs` (line 35); in run-data-audit-lane.mjs's AUDITS array (line 85).
  - NOTE (lines 1-25): v1 measured section-row extraction and over-flagged (a real FreightWaves "missing S4" false-flag, where S4 was present with an omission note). Reports three distinct numbers (BRIEF-DEFECT / NOTED-OMISSION / EXTRACTION-GAP) so a sectioning defect is never conflated with a true brief defect. Never process.exit(1) in this file — it is purely a reporter (no fail path coded at all despite living in the "hard" AUDITS list; see cross-file NOTE below).

**scripts/verify/funded-pass-lock-golden.mjs — TEST (golden, live-DB) — proves the funded-pass run-lock (migration 205) against LIVE acquire/heartbeat/release RPCs using a dedicated test key (never real corpus data): second-instance rejection, stale-holder takeover, heartbeat ownership tracking, clean release. Self-skips exit 2 without DB creds. Not vacuous.**
  - WIRING: confirmed imports `lib/funded-pass-lock.mjs` — this is the wiring-overturn evidence cited above.

**scripts/verify/ledger-onepass-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — E1 deterministic re-derivation of the two settled primitives (institution resolver + per-item-type authority floor) as an independent JS cross-check of the SQL gate `validate_item_provenance`.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 61).
  - NOTE (lines 26-27): file's own header flags this as a CUTOVER item — "run the cross-format sample and confirm clean before wiring this into the data-audit lane as a hard gate" — yet it is already listed as `hard: true` in run-data-audit-lane.mjs's AUDITS. Worth an owner check on whether that cutover confirmation happened.

**scripts/verify/lib/schema-drift.mjs — WORKING-WIRED — refs=2 — pure core (regex + set diff, no I/O) for the schema-drift invariant: `extractCreatedObjects`, `committedObjectNames`, `diffSchema`, `staleAllowlistEntries`.**
  - WIRING: confirmed imported by `scripts/verify/schema-drift-audit.mjs:25`.

**scripts/verify/lib/schema-drift.test.mjs — TEST — trip (a live object with no committed CREATE = drift, the exact census_worklist/coverage_gap_census_findings burn) + pass + stale-allowlist cases. Not vacuous.**

**scripts/verify/migration-number-collision.mjs — WORKING-WIRED (soft, always exits 0) — refs=0 (no flag = entry point) — reports duplicate migration filename prefixes as a READABILITY signal only.**
  - NOTE (lines 5-22): deliberately never a gate — a 2026-08-02 session-log retraction established that Supabase applies migrations by timestamp, not filename prefix, so a duplicate prefix (the file documents ~25 known duplicates, e.g. the 006 pair, 007 trio) is cosmetic. Explicitly forbids renaming an already-applied migration.

**scripts/verify/mint-gate-calibration.mjs — WORKING-WIRED (report-only) — refs=0, GRAPH:UNREACHABLE — applies the same mint-time gate evaluator (mint-gates.mjs, outside lane) offline against recent grounds and reports would-have-held rates per gate, with a 20% stop-condition surfaced (not enforced).**
  - NOTE: default sample is the MOST RECENT grounds (all statuses, dominated by quarantined re-grounds); `--representative` switches to verified-only, which the file's own comment says is the number that should actually gate the live-flip decision.

**scripts/verify/mint-gates-live-hold.golden.mjs — TEST (golden, structural+behavioral) — no DB — proves the LIVE mint-gate hold posture (hardening A1): S-CONFLATE is a HARD hold (mint_hold_reason set, migration 206's fact_mint_hold criterion fails validate_item_provenance); S-NUMERIC is a SOFT hold (integrity_flag only, item stays verified-eligible); FACT collection is unconditional (a claim always mints, the hold is a post-insert mark). Not vacuous.**

**scripts/verify/mint-gates.golden.mjs — TEST (golden) — no DB — behavioral golden for the four per-fact gates (genericSource, authorityFloor, spanNumeric, identityCongruence) plus non-FACT pass-through. Not vacuous.**

**scripts/verify/mutation-lease.golden.mjs — TEST (golden, live-DB) — proves per-item mutual exclusion (H5, migration 211) against LIVE acquire/heartbeat/release, including stale-takeover with a 0s threshold. Self-skips exit 2 without creds. Not vacuous.**
  - WIRING: confirmed imports `lib/mutation-lease.mjs` — the wiring-overturn evidence cited above.

**scripts/verify/no-generic-source-audit.golden.mjs — TEST (golden) — no DB — locks the `factsOnSuspended` pure core: a FACT on a suspended source is flagged, active/null-source is not. Not vacuous.**

**scripts/verify/no-generic-source-audit.mjs — WORKING-WIRED — refs=1 — TREND MONITOR with a recorded baseline file (`_baselines/facts-on-suspended.json`): fails only on an INCREASE vs. the floor, never on the standing backlog.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 86).
  - NOTE: `--rebaseline` writes a new floor — an operator action after a deliberate reduction; the baseline file is not tracked in this lane's file list, so its current committed value could not be inspected.

**scripts/verify/no-names.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — workspace-anchoring check: verified briefs must never name the workspace's own identity (blocklist = DB org names + the skill's own named wrong-examples).**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 87).
  - NOTE: fire-tests its own regex matcher against 4 cases (including a real BYD/Maersk third-party-naming negative control) before trusting it against live data — a good practice repeated across the reg-family "0 Browserless" verifiers in this file group.

**scripts/verify/non-destructive-grounding.golden.mjs — TEST (golden, in-memory fake DB) — locks the RD-44/RD-45 non-destructive-grounding contract via 6 cases (add-without-destroy, version-changed with old retrievable, reproduce-nothing untouched, interrupted-ground leaves prior ledger complete, proven-inaccurate erasure requires proof and fails closed on archive-insert failure, a 10-claim non-regression case with zero claim loss). Also structurally asserts the ground path in canonical-pipeline.ts has no blanket ledger delete. Comprehensive; not vacuous.**

**scripts/verify/one-tier-per-host-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — INVARIANT SC-6: every institution has exactly one base_tier across its source rows unless a row carries an explicit tier_override.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 58, first entry).

**scripts/verify/orphan-source-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — no intelligence_items row may be archived with a source-y archive_reason unless a source for its host is registered+active (the live-data twin of rule 019 / migration 135 / db.mjs's reclassifyToSource).**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 63). Uses paginated reads specifically to avoid the 2026-06-06 false-orphan incident (a capped `.limit()` under-counting active sources past row 1000).

**scripts/verify/pause-flag-guard-proof.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — red-then-green proof of the `guard_pause_flag_writer` trigger (migration 201, RD-23: "a stop flag has exactly one writer") WITHOUT ever writing the live flag — attaches the real guard function to a synthetic temp table inside a transaction that always rolls back.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 88).
  - NOTE: a genuinely careful test-the-guard-without-touching-prod pattern — RED leg proves an unmarked write bounces, GREEN leg proves a properly-marked write (as `admin_set_pause_state` performs it) succeeds.

**scripts/verify/primary-text-permanent.golden.mjs — TEST (golden) — no DB — proves raw_fetches' content-addressed storage key (source_id + content_hash) guarantees a changed re-capture can never overwrite a prior snapshot and an identical re-capture is idempotent. Not vacuous.**

**scripts/verify/prov-guard-adversarial-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — ADVERSARIAL PROOF for the #43 provenance-verified binding (migration 250): attacks the guard with 5 cases (forged-GUC escalation, direct unverified→verified, ON CONFLICT DO UPDATE escalation, restrictive downgrade allowed, legitimate depth≥2 derivation still reaches verified), every probe inside a rolled-back transaction.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 70).
  - NOTE (lines 1-12): explicitly authored because migration 118's original binding was "verified" only by a presence check (guard triggers existed and were enabled) — that guard was defeatable with one `SELECT set_config('app.prov_flip_origin','INSERT',true)`. A strong, self-aware design lesson embedded directly in the audit's own header.
  - Compares Postgres SQLSTATE codes (`'42501'`), not condition names — the file's own comment documents that comparing by condition name mis-scored a correct denial as ERROR on the lane's first real run (#66, 2026-08-11).

**scripts/verify/quarantine-disposition-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — RESEARCH-OR-ERASE / QUARANTINE-DISPOSITION invariant: every live-quarantined item must carry an open investigation record (enqueue) and must not sit past DWELL_BOUND_DAYS=14 without either a disposition or a valid time-bounded deferral.**
  - WIRING: confirmed imports `isValidDeferral` from `lib/deferral.mjs`; in run-data-audit-lane.mjs's AUDITS array (line 64).
  - NOTE: distinguishes RESURRECTED items (an expired deferral whose clock re-fired) from fresh crossings in its fail output — a legibility feature so an operator doesn't have to re-diagnose a known-recurring case as new.

**scripts/verify/remediate-orphan-sources.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — guarded, snapshotted, per-step-verified remediation registering orphaned source hosts (mirrors orphan-source-audit.mjs's computation) with a base_tier classifier by institutional type.**
  - WIRING: dry-run default, `--apply` to write; halts the whole batch on the FIRST failed write (line 73) — a conservative per-step-verification pattern. Not wired to any runner.

**scripts/verify/remediate-reclassify-proposal.mjs — OPERATOR-TOOL — refs=0, GRAPH:UNREACHABLE — PROPOSAL-ONLY (writes no item rows) report generator emitting `docs/RECLASSIFY-PROPOSAL.md` for cross-surface item_type moves needing operator sign-off.**
  - NOTE: writes its output via plain `writeFileSync`, not through the guarded db.mjs path — appropriate since it is a docs file, not a DB write.

**scripts/verify/resolver-status-filter.golden.mjs — TEST (golden) — no DB (imports the real buildResolver via jiti) — proves a SUSPENDED source is unselectable by the grounding resolver (the Task-3-suspended EUR-Lex junk-drawer 404 that was citation-of-record for 927 facts can never be re-selected), while active sources and undefined-status (backward-compat) sources resolve normally. Not vacuous.**

**scripts/verify/rls-credential-parity.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — flags GRANT-WITHOUT-POLICY on RLS-enabled tables for CUSTOM application roles only (excludes anon/authenticated by design, since their missing-policy is the intended default-deny) — the exact reconciler-credential gap migration 169 fixed.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 89).
  - NOTE (lines 69-73): documents a real historical false-positive bug fixed in this file — `pg_policies.roles` (a Postgres `name[]`, oid 1003) was not being CAST to `text[]`, so node-postgres returned it as a raw string and a `for..of` iterated its characters, leaving coverage empty and flagging every grant to a custom role regardless of its actual policies (5 of 8 findings on lane run #66 were false positives from this).

**scripts/verify/routing.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — item_type→format→surface consistency check: FORMAT-DRIFT (brief's declared format token != item_type's expected format), OFF-MODEL-SURFACE (technology/innovation/tool route to a 6th surface outside the ratified five), UNKNOWN-TYPE.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 90). Never calls process.exit(1) anywhere in the file — it is report-only despite being listed as `hard: true`; see cross-file NOTE below.

**scripts/verify/run-data-audit-lane.mjs — WORKING-WIRED — refs=0 (no flag = entry point) — the CI-with-secrets/nightly runner: spawns ~23 named audit scripts via `spawnSync` (process isolation — one audit's crash cannot abort the lane), tracks hard vs. soft failures, and reflects lane state into an `integrity_flags` "block" row that a generation-preflight step reads to HALT.**
  - WIRING: THIS is the actual reachability chokepoint for most `GRAPH:UNREACHABLE`-flagged files above — its AUDITS array (lines 57-95) is the true call graph, invisible to a static import-graph tool since it dispatches via `spawnSync` on a file path string, not an `import`. I found **no npm script, no `.github/workflows` step, no git hook, and no cron/scheduler config anywhere in this checkout that invokes this file** (see cross-lane finding below) — so despite being an elaborate, well-designed nightly-lane runner with a genuine downstream effect (the integrity_flags block row gates a real generation preflight per its own header comment), it currently has zero automatic trigger in this repository as checked out. It is effectively OPERATOR-TOOL in practice even though its design intent and doc comments describe it as CI-scheduled.
  - NOTE: several AUDITS entries are documented as recently-added "registry-cited but never executed" fixes (lines 71-80) — e.g. the five pg-direct audits were wired in but silently returned exit 2 (no creds) on every CI run until `pg-conn.mjs`'s shared resolver landed, per the file's own inline history.

**scripts/verify/run-goldens.mjs — WORKING-WIRED — refs=0 (no flag = entry point) — auto-discovers and runs every `*.golden.mjs`/`*-golden.mjs` in scripts/verify/ via `readdirSync` + regex glob (by construction, so a new golden cannot be silently omitted from a hand list).**
  - WIRING: like run-data-audit-lane.mjs, this is the actual reachability chokepoint for every `*.golden.mjs` file in this lane — invisible to a static import-graph tool. Same finding: no npm script/workflow/cron invokes this file in this checkout.
  - NOTE (lines 9-11): its own header states it was created because an audit found all 15 pre-existing behavioral goldens were referenced by ZERO workflow/glob/hook — two were silently RED for weeks and nobody knew, because nothing executed them. This runner closes that specific class going forward, but per the WIRING finding above, the runner itself is currently in the same unwired state its own header describes as the problem it was built to fix.

**scripts/verify/schema-drift-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — introspects the live public schema and diffs object names against every CREATE TABLE/VIEW in supabase/migrations/; a live object with no committed CREATE and no allowlist entry is DRIFT. Also audits its own allowlist for staleness.**
  - WIRING: confirmed imports `lib/schema-drift.mjs`; in run-data-audit-lane.mjs's AUDITS array (line 66).
  - NOTE (lines 4-8, 34-37): documents the exact incident this exists to prevent — `census_worklist` (migration 221) and `coverage_gap_census_findings` (migration 222) both existed live with no committed migration when their first consumer needed them ("the census was burned TWICE"). The one prior allowlist bypass entry has since been retroactively migrated and removed; current ALLOWLIST is empty.

**scripts/verify/source-link-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — no-source-less-live-mint invariant (RD-22): a source_id=NULL live item can never verify, beyond a documented pre-cutover grandfather list of two T9 orphans.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 91). Confirmed imports `findSourceLessLiveViolations`, `GRANDFATHERED_SOURCELESS` from `src/lib/intake/source-link-invariant.mjs` (outside lane, shared with the live mint chokepoint).

**scripts/verify/source-vs-item.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — title-anchored classifier (not body-text — the file's own comment notes body-scanning over-fired on normal regulatory vocabulary) distinguishing ERROR-ARTIFACT/STALE-TITLE/SOURCE-NOT-ITEM verified items from real regulations.**
  - WIRING: confirmed imports `urlIsRoot` from `src/lib/sources/entity-gate.mjs:12`. Not present in run-data-audit-lane.mjs's AUDITS array (its sibling `source-link-audit.mjs` is, but this one is not) — so it appears to have no automated caller beyond manual invocation, despite following the identical file pattern (fire-tested regexes + a live-data pass) as the wired audits around it.
  - NOTE: fire-tests its classifier against 5 named real cases (CBAM, NYC LL97, an ACT.gov.au error page, an IRENA stale-title, an IEA data portal) before trusting it against live data.

**scripts/verify/staged-transit-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — staged_updates is transit-only (no human-approval gate, ADR-012 rider): a transit row (pending, or approved-unmaterialized) older than MAX_AGE_H=72h with no routing flag is the hard tripwire.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 93).
  - NOTE (lines 29-32): the file's own comment states the human-approval materialization path is STILL LIVE at time of writing (until a described future orchestration change removes it) — so a real transit backlog from legitimate pending human review is expected and does not block the required pre-push gate.

**scripts/verify/stale-verified-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE — customer-visible-scoped (is_archived=false only) status-is-a-cache check: does any customer-visible verified item disagree with a live call to `validate_item_provenance`?**
  - WIRING: NOT present in run-data-audit-lane.mjs's AUDITS array — its close sibling `substrate-agreement-audit.mjs` (below) IS wired and checks the same underlying disagreement in both directions plus quarantined items; this file appears to be superseded/subsumed by that one rather than actively run. Given its explicit scoping rationale (lines 5-9: archived rows are deliberately excluded here so an unscoped count wouldn't perpetually red on invisible rows), it reads as either a narrower predecessor or a deliberately narrower customer-facing companion check — AMBIGUOUS which, since I found no doc or commit-message evidence in-lane resolving supersession vs. complementary-scope.

**scripts/verify/substrate-agreement-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — INVARIANT EP-8: stored provenance_status must agree with `validate_item_provenance()` in BOTH directions (STALE-VERIFIED and STALE-QUARANTINED) for every non-archived item.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 60).

**scripts/verify/surface-contract-gate.golden.mjs — TEST (golden, structural+fixture) — no DB — Part A proves a completeness predicate (a declined/parked coverage-gap row requires all five surface-contract verdicts+reasons) via 10 RED/GREEN fixture cases; Part B scans the migrations tree for a not-yet-landed companion DB CHECK constraint and self-arms once it appears (currently PASS as PENDING-C, confirmed no such migration exists in-tree). Not vacuous.**
  - NOTE (lines 8, 96-104): explicitly documents that this gate is currently DORMANT in production — the operator ruled no seed rows exist in coverage_gap_candidates that were ever declined, so its only live demonstration is the fixture proof in this file. Also documents a real detection-bug fix (2026-08-09): the original Part-B detector matched on co-occurrence of two strings in raw source, mis-detecting a migration that only mentioned the target table+column in a prose comment; now requires the actual `surface_test jsonb` column-add in comment-stripped SQL.

**scripts/verify/surface-visibility-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE — the ONLY script in this lane's verify/ half that WRITES beyond snapshots: it opens `integrity_flags` rows (guarded, idempotent-by-open-flag-check) for HIDDEN (no_surface) and MISROUTED (cross_surface) verified items.**
  - WIRING: NOT present in run-data-audit-lane.mjs's AUDITS array — despite governing an invariant tied to a named real incident (the PPWR item, 2026-07-08) and despite following the identical structural pattern (jiti import, live-data pass, guarded write) as wired audits, no automated caller was found for this file.
  - NOTE: idempotent via a pre-insert existence check (`flagOnce`, lines 83-95) scoped to `created_by='surface-visibility-audit'` — will not open duplicate flags on repeated manual runs.

**scripts/verify/target-match.golden.mjs — TEST (golden, structural+behavioral) — no DB — proves the wrong-instrument capture is held before grounding using a real drain-loop-finding RED fixture (an HDV CO2 item whose capture was actually the CSRD directive) plus a GREEN twin, a raw non-EU identifier case, and a structural scan proving `verifyPoolTargetMatch` is called and its mismatch-hold precedes the extraction pivot for BOTH executor drivers. Not vacuous.**

**scripts/verify/unregistered-span-host-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE — TREND monitor (baseline-file pattern, same shape as no-generic-source-audit.mjs) for FACT claims grounded on a host not in the sources registry; fails only on regression vs. the recorded floor.**
  - WIRING: NOT present in run-data-audit-lane.mjs's AUDITS array, unlike its structural sibling no-generic-source-audit.mjs which IS wired (line 86) — an inconsistency between two near-identical baseline-trend audits, worth an owner check on whether the omission is deliberate.

**scripts/verify/vocab-sync-audit.mjs — WORKING-WIRED — refs=0, GRAPH:UNREACHABLE (soft) — compares in-code metadata vocabularies (src/lib/agent/metadata-vocab.ts DB_*_VALUES) against live DB CHECK constraints on intelligence_items (severity/priority/urgency_tier/format_type/signal_band/theme) via `pg_get_constraintdef`.**
  - WIRING: in run-data-audit-lane.mjs's AUDITS array (line 62). Documents the exact drift class it exists to catch: "the class that silently rejected whole-row writes (the severity 3-way fracture)".

**scripts/verify/wave-acceptance-audit.mjs — INCOMPLETE (self-declared) — refs=0, GRAPH:UNREACHABLE — SCAFFOLD (its own line 2: "authored 2026-07-15, NOT WIRED into wave-close"). Computes a risk-weighted acceptance sample for a wave plus a mechanical provenance pre-scan, and emits a manifest for a required LIVE Chrome-read three-layer pass that cannot be fully scripted.**
  - WIRING: honestly self-labeled as "Status: proposed" (line 8) — ratification (ADR-014) is what would set `WAVE_ACCEPTANCE_N` and wire the accuracy-rate escalation gate into wave-close; until then it is an on-demand read-only reporter, run by hand. This is the one file in the lane whose INCOMPLETE status is stated by the code itself rather than inferred — an honest, self-documented gap.

---

## Lane summary

### Counts by STATUS (116 files)

| STATUS | count |
|---|---|
| WORKING-WIRED | 47 |
| TEST | 33 |
| OPERATOR-TOOL | 17 |
| WORKING-UNWIRED | 9 |
| DEFECTIVE (see note) | 0 — see finding #2 (defect reported inline on an otherwise WORKING-WIRED file, not elevated to file-level DEFECTIVE) |
| INCOMPLETE | 1 (wave-acceptance-audit.mjs, self-declared) |
| STUB | 0 |
| DEAD-HISTORICAL | 0 (cleanup-dup-sources.mjs considered but classified OPERATOR-TOOL — see its entry) |
| AMBIGUOUS | 1 (stale-verified-audit.mjs vs. substrate-agreement-audit.mjs overlap) |
| TEST-ONLY (graph flag, folded into WORKING-UNWIRED above) | 2 (batch-primitives.mjs, funded-release-plan.mjs) |

(Counts sum to 116; "WORKING-WIRED" includes files reachable only via run-data-audit-lane.mjs/run-goldens.mjs, which is itself the lane's central finding — see #1 below.)

### Findings, ranked

1. **The entire lane has no automatic trigger in this checkout.** `.github/workflows/` does not exist anywhere in the repo (confirmed via `Glob ".github/workflows/*.yml"` → no results, and `Bash find .../fsi-app/.github` → "No such file or directory"). `package.json`'s `scripts` block contains only `dev, build, start, lint, typecheck, analyze, perf:bundles` — none reference any file in scripts/lib/ or scripts/verify/ (confirmed via a direct parse). Despite ~23 hard audits wired into `run-data-audit-lane.mjs`'s AUDITS array and every `*.golden.mjs` auto-discovered by `run-goldens.mjs`, **both runners themselves have zero external trigger** — no npm script, no workflow step, no git hook, no cron. This directly contradicts pervasive in-code comments throughout the lane claiming CI wiring, e.g. `run-goldens.mjs`'s own header says it exists because "an audit found all 15 behavioral goldens were referenced by ZERO workflow/glob/hook... nobody knew, because nothing executed them" (`scripts/verify/run-goldens.mjs:9-11`) — and the runner built to fix that is, in this checkout, in the same unwired state. `run-data-audit-lane.mjs`'s header likewise describes itself as "CI-with-secrets / nightly" (`scripts/verify/run-data-audit-lane.mjs:1`) with a real downstream effect (an `integrity_flags` block row a generation-preflight step reads to HALT), but nothing here fires it.

2. **`scripts/lib/funded-pass-lock.mjs:47` — `emergencyPaused()` fails OPEN (not-paused) on any DB read error.** Concrete scenario: an operator flips the global emergency-stop flag; the funded-pass process's next between-item poll hits a transient network/DB error on that exact read; the process reads "not paused" and continues spending for at least one more item. The code explicitly defends this as a deliberate tradeoff (a transient error must not wedge a legitimately-running pass), which makes it a defensible design choice rather than an obvious oversight — but it is exactly the "fail-open that should fail closed" shape the audit brief calls out, on a mechanism whose entire purpose is emergency stop.

3. **Two hand-maintained "mirror" files have zero importers and zero tests: `scripts/lib/urgency.mjs` and `scripts/lib/fetch-quality.mjs`.** Both declare themselves explicit mirrors of a TypeScript source file "to keep in lockstep," with no automated sync check and no selftest pinning them to their TS twin. This is the identical risk pattern that `canonical-key.mjs`'s own header (`scripts/lib/canonical-key.mjs:1-8`) says caused a real incident — two divergent hand-copied SQL mirrors produced 6 false collision groups in production (run #66, 2026-08-11) — but unlike canonical-key.mjs, these two mirrors were never consolidated into one source of truth after that incident.

4. **`scripts/verify/_fmt-present.mjs` is flagged GRAPH:UNREACHABLE refs=0 but is directly imported** by `scripts/verify/format-structure.mjs:35` — a confirmed graph-flag overturn. Several other files carry the same soft overturn pattern (reachable at the import level via `run-data-audit-lane.mjs`'s AUDITS array or `run-goldens.mjs`'s glob-discovery, both of which use `spawnSync`/`readdirSync` rather than `import` and so are invisible to a static import-graph tool) — noted per-file above as "GRAPH:UNREACHABLE (soft)".

5. **Two near-identical TREND-baseline audits are inconsistently wired.** `scripts/verify/no-generic-source-audit.mjs` (facts-on-suspended-source trend monitor) IS listed in `run-data-audit-lane.mjs`'s AUDITS array (line 86); its structural sibling `scripts/verify/unregistered-span-host-audit.mjs` (facts-on-unregistered-host trend monitor, same baseline-file pattern, same TREND-not-backlog design) is NOT. Similarly, `scripts/verify/orphan-source-audit.mjs` and `scripts/verify/quarantine-disposition-audit.mjs` (both wired) have a sibling `scripts/verify/source-vs-item.mjs` and `scripts/verify/surface-visibility-audit.mjs` (both unwired) that follow the identical fire-tested-regex + live-pass structure — surface-visibility-audit.mjs is notably the only file in this lane's verify/ half that writes integrity_flags rows for a named real incident (PPWR, 2026-07-08) yet has no automated caller.

6. **Two audits listed as `hard: true` in `run-data-audit-lane.mjs`'s AUDITS array never call `process.exit(1)`:** `scripts/verify/format-structure.mjs` and `scripts/verify/routing.mjs` are both pure reporters (they print findings but always fall through to a normal exit 0). Being spawned as children via `spawnSync`, their exit code is what the runner scores — so listing them as "hard" audits that "fail the lane" is currently a no-op for these two specific files regardless of what they find, unless I am missing an exit path (I read both files in full and found none).

7. **`scripts/lib/inconclusive-probe.mjs`'s FORM 4 (CI-orchestration mishandling) scans `.github/workflows/*.yml`, but that directory does not exist in this checkout** — `discoverWorkflows()` catches the resulting ENOENT and returns `[]`, so FORM 4's workflow-scanning half is vacuously "clean" (0 files scanned), not actually verified clean. Same root cause as finding #1.

8. **`scripts/verify/audit-finding-status.mjs`'s three-`".."` path resolution (landing at `dotfiles/docs/audits`, one level above fsi-app/) is CORRECT, not a bug** — resolved by grepping both candidate directories for the `[CONFIRMED]/[HYPOTHESIS]/[REFUTED]` token vocabulary the script polices: zero matches in `fsi-app/docs/audits`, real matches in `dotfiles/docs/audits`, independently corroborated by `column-existence-parity.mjs`'s identical two-levels-above-ROOT resolution pointing at a manifest file that is confirmed to exist there. Reported here because it consumed significant investigation and the honesty bar requires showing the resolution, not just the conclusion.

9. **A positive pattern worth recording**: nearly every production logic file in scripts/lib/ has a paired `.selftest.mjs`/`.test.mjs` with genuine positive+negative+mutation coverage — none found to be vacuous (each could actually fail against a broken implementation). The live-DB goldens (`funded-pass-lock-golden.mjs`, `mutation-lease.golden.mjs`) self-skip cleanly with exit 2 on missing credentials rather than crashing or false-passing, and several files (`prov-guard-adversarial-audit.mjs`, `pause-flag-guard-proof.mjs`) go further than mere presence-checks by actively attacking the invariant they police inside a transaction that always rolls back — `prov-guard-adversarial-audit.mjs`'s own header explains this was a direct, self-aware response to an earlier incident where a presence-only check missed a one-`set_config`-call bypass of a security guard (migration 118).

10. **Cross-reference corroboration (not a defect)**: `scripts/verify/population-report.mjs`'s premise — that a store can be "built but unfilled" (rows present, zero usable values) — is corroborated by table-usage.txt's live row counts for the 6 tables it monitors: market_series=6, emission_factors=6, regional_data_facts=86, state_cost_facts=13, published_price_statistics=4, theme_briefs=9. All are small, consistent with a mid-build/low-population state rather than a healthy, fully-populated store.

11. **`scripts/verify/wave-acceptance-audit.mjs` self-declares INCOMPLETE** in its own header comment ("SCAFFOLD... NOT WIRED into wave-close... Status: proposed") — an honest, self-documented gap awaiting ADR-014 ratification, not a silently-broken file.

12. **`--live`-gating is inconsistently applied across prod-DB-touching reconstruction/audit scripts.** `scripts/lib/block1-reaudit.mjs`, `verify-reconstruction.mjs`, `liveness-reconstruction.mjs`, and `drift-check-reconstruction.mjs` all refuse to run without an explicit `--live` CLI flag before touching the shared prod DB — a well-designed safety pattern. `scripts/lib/decision-log-audit.mjs` and `exclusion-audit-reconstruction.mjs`/`surface-registry-reconstruction.mjs` connect to prod DB credentials directly with no such gate (though all three are read-only in effect, so the practical risk is lower — this is a NOTE for the owner, not a DEFECT).

13. **`scripts/verify/stale-verified-audit.mjs` vs. `scripts/verify/substrate-agreement-audit.mjs` — AMBIGUOUS relationship.** Both check "stored provenance_status agrees with a live `validate_item_provenance()` call"; substrate-agreement-audit.mjs is wired into run-data-audit-lane.mjs and checks both directions (stale-verified AND stale-quarantined) across all non-archived items, while stale-verified-audit.mjs is unwired, checks one direction only, and is deliberately scoped to `is_archived=false` (customer-visible) items with an explicit rationale in its header. I could not determine from the code alone whether stale-verified-audit.mjs is a superseded predecessor kept for reference, or a deliberately narrower customer-facing companion check meant to be run separately — both readings are defensible from the text.

14. **`scripts/lib/anthropic.mjs`, `scripts/lib/net-agent.mjs`, and `scripts/lib/mutation-lease.mjs`'s zero-in-lane-selftest status** are each worth an owner's attention for different reasons: anthropic.mjs and net-agent.mjs have zero importers found anywhere in the repo despite being described as "canonical"/infrastructural; mutation-lease.mjs has zero importers within scripts/lib/ but IS exercised end-to-end by a live-DB golden, so its behavior is verified even without a unit-level selftest.

### Coverage attestation

Files read in full: **116/116**. Lines read: **10,552** (confirmed via `wc -l` summed across every path in the lane list, matching the lane list's own per-file line counts). No file was skipped, truncated, or partially read; no file in this lane exceeded 2000 lines so no offset-chunked reads were required. All 60 scripts/lib/ files and all 56 scripts/verify/ files were read start-to-end with the Read tool.
