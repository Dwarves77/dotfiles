#!/usr/bin/env node
// governing-files.mjs — THE SINGLE SOURCE for every harness family's governing-file list (Wave
// GOV-SINGLE, 2026-09-04).
//
// WHY THIS EXISTS. Before this file, the SAME fact — "which files' content hash is this family's
// harness_version" — had TWO homes for every family with a canonical runner script: F28's own
// GOVERNING_FILES constant (.discipline/fitness/functions/F28-harness-run-integrity.mjs, the copy F28's
// rule (c) staleness coupling actually re-hashes and enforces against) and that runner's own
// `*_GOVERNING_FILES` export (the copy the runner hashes ITSELF with, to stamp `harness_version` on the
// artifacts it writes). Nothing forced the two to agree beyond a per-runner "matches F28's hardcoded
// entry" test that only THREE of eight runners even carried, and — proven live, 2026-09-04 — the two
// copies for `mint` had already drifted: F28's `GOVERNING_FILES.mint` gained
// `src/lib/agent/gate-a-scan.mjs` and `gate-a-match.mjs` (the Gate-A single-source collapse, PR #580)
// while `run-mint-batch.mjs`'s `MINT_GOVERNING_FILES` never did, because nothing checked the two against
// each other for that pair. Consequence: `mint-run-024/025/026` all stamped `harness_version
// sha256:4f09523532bb7aee` (the runner's own pre-fix 8-file hash — independently reproduced by hashing its
// exact pre-fix file list against this tree) while F28 (and the mint `PENDING-RUN.md` marker) compute
// `sha256:28c98ae2309a416a`, the 10-file hash — the mint marker can never be discharged by a real run
// until the two copies agree, because F28 rule (c) requires an artifact's OWN recorded `harness_version`
// to match the hash F28 itself computes. This is the "wrong copy of the truth" pattern
// `meta-harness-run-008` names as the wave's recurring defect, applied to itself.
//
// THE FIX: one array, here, per family. F28 imports it (see that file's own header for why a fitness
// function importing from `scripts/` is fine — it already did, for `run-artifact.mjs` and, before this
// change, for `screen-worklist.mjs`'s `SCREEN_GOVERNING_FILES`; no fitness/discipline rule forbids a
// cross-import from `.discipline/` into `scripts/`, and `getRepoRoot()`-relative resolution is unaffected
// by which file the import comes from). Every family's own canonical runner script (screen-worklist.mjs,
// run-mint-batch.mjs, run-extraction.mjs, run-ledger-consume.mjs, run-propagation-drain.mjs,
// run-change-detection.mjs, run-source-sweep.mjs) imports its ONE entry from here and re-exports it under
// its old `*_GOVERNING_FILES` name, so every existing importer/test keeps working unchanged and every
// runner's own self-hash (the thing it stamps onto the artifacts it writes) and F28's re-hash (the thing
// rule (c) checks a landed artifact against) are now, by construction, the identical array — not two
// hand-maintained copies a coordinator has to remember to keep in sync.
//
// WHERE THIS LIVES, AND WHY (coordinator's stated preference, verified against the fitness runner's own
// module-resolution rules before landing here): `scripts/harness-runs/` — the harness layer's own home,
// next to `CONVENTION.md` (the markdown table this module is now the machine-checked source for) — NOT
// under `.discipline/`. `.discipline/fitness/functions/F28-harness-run-integrity.mjs` already imports
// `scripts/lib/run-artifact.mjs` directly (`hashHarnessVersion`, `validateRunArtifact`, `ALLOWED_FAMILIES`)
// and, before this change, `scripts/mint/screen-worklist.mjs` (`SCREEN_GOVERNING_FILES`) — a fitness
// function importing from `scripts/` is therefore already the established pattern this repo's own gate
// runs on every push, not a new exception this file introduces. No F-function in
// `.discipline/fitness/functions/` forbids a cross-import in either direction (checked: F25's
// module-liveness import graph tracks orphaned MODULES, not import DIRECTION; F27's producer-seam-proof
// is about `resolveSpecifier`/`isTestFile` reuse, an unrelated seam). This module itself has NO imports
// (pure data, filesystem-free, $0, same discipline every other harness-run module — `run-artifact.mjs`,
// `screen-worklist.mjs` — already carries) — it cannot introduce a cycle: F28 and every runner import
// FROM here, nothing here imports back.
//
// SELF-REFERENTIAL, LIKE F28: this file is itself now one of `meta-harness`'s own GOVERNING_FILES — it
// now defines what governs the other eight families, exactly the role F28-harness-run-integrity.mjs
// already held alone (see that entry's own note below, and
// `scripts/harness-runs/meta-harness/PENDING-RUN.md`, written the same commit this file lands in, for
// the hash this change moves and the run that will supersede it).
//
// CONVENTION.md's own harness_version table documents these same file lists for a human reader; the
// CONVENTION-TABLE-PARITY test (F28-harness-run-integrity.test.mjs) parses that table and asserts it
// matches this module's GOVERNING_FILES export exactly — so CONVENTION.md is documentation CHECKED
// against this module, never a third hand-maintained copy of its own.
//
// No I/O side effects on import. No network, no DB.

/**
 * Governing files per harness family, fsi-app-relative — the content `hashHarnessVersion`
 * (scripts/lib/run-artifact.mjs) hashes into that family's `harness_version`. THE single source: F28
 * imports this whole object; every family's own canonical runner script imports its one entry and
 * re-exports it under its historical `*_GOVERNING_FILES` name.
 *
 * `screen`'s list moved here from `scripts/mint/screen-worklist.mjs` (which used to declare
 * `SCREEN_GOVERNING_FILES` directly and was F28's one already-imported family) — screen-worklist.mjs now
 * imports it back from here like every other family's runner does, so screen's list is no longer a
 * special case; it is the same shape as the other seven.
 *
 * `mint` has no single canonical entry point of its own (see its own comment below). `mint` DOES now
 * have a canonical script (`run-mint-batch.mjs`, Wave MH-5), and its entry here is what that script
 * imports back (see its own header for the drift this fixes). `fetch-drain` lacked a canonical script
 * (its governing file was the Deno function `supabase/functions/capture-worker/` alone, imported by
 * nothing this repo loads as a Node module) until lane M1 (2026-09-18, build plan section 6.1 row M1)
 * gave it `scripts/turns/run-fetch-drain.mjs`; its entry below now includes that runner too, the same
 * shape every scripted family already has.
 *
 * `meta-harness` (Wave MH-4, build plan §3 "self-application") is the meta-harness layer's own family, so
 * its list is declared here too — and it is the one entry that is SELF-REFERENTIAL TWICE over: both
 * `F28-harness-run-integrity.mjs` (F28's own rules) and THIS FILE (what defines every family's governing
 * files, meta-harness's own included) are named in meta-harness's own list. A future edit to either file
 * moves the meta-harness family's own harness_version exactly like editing `validate-mint-payload.mjs`
 * moves mint's — the literal mechanism by which "the loop applies to itself" (plan §1) is enforced, not
 * just narrated.
 */
export const GOVERNING_FILES = Object.freeze({
  mint: Object.freeze([
    'scripts/mint/MINT-RUNBOOK.md',
    'scripts/mint/validate-mint-payload.mjs',
    'scripts/mint/payload-schema.json',
    'scripts/mint/item-type-required-slots.json',
    // 'scripts/mint/lib/gate-a-scan.mjs' / 'gate-a-match.mjs' REMOVED (lane DEAD-EXEC, 2026-09-04): the
    // two re-export shims (added Wave GOV-SINGLE) were pure `export * from "../../../src/lib/agent/..."`
    // pass-throughs with no logic of their own; their only real importer, validate-mint-payload.mjs, and
    // their one test importer, src/lib/intake/record-facts.npmtest.mjs, now both import the src/lib/agent/
    // files directly (below) — deleting the shims changes NOTHING about what content this family hashes,
    // only removes two indirection files from the list.
    'src/lib/agent/gate-a-scan.mjs', // THE Gate-A scanner (single source, imported directly since 2026-09-04)
    'src/lib/agent/gate-a-match.mjs', // THE Gate-A matcher (same)
    'scripts/mint/lib/canonicalize-citation-url.mjs',
    'src/lib/intake/record-facts.mjs', // record-grade payload builder (lane POP, 2026-09-01)
  ]),
  screen: Object.freeze([
    'scripts/mint/screen-rules.mjs',
    'scripts/mint/screen-worklist.mjs',
  ]),
  // fetch-drain (extended by lane M1, 2026-09-18, build plan section 6.1 row M1): the capture-worker
  // Edge Function itself, plus the runner that now invokes it over HTTPS from a workflow. Before this
  // lane the only governing file was the Deno function (no Node-importable driver existed at all; every
  // drain was a coordinator issuing pg_net batches by hand, see run-fetch-drain.mjs's own header).
  'fetch-drain': Object.freeze([
    'supabase/functions/capture-worker/index.ts',
    'scripts/turns/run-fetch-drain.mjs',
  ]),
  'meta-harness': Object.freeze([
    'scripts/harness-runs/CONVENTION.md',
    'scripts/harness-runs/PROPOSER-RUNBOOK.md',
    'scripts/lib/run-artifact.mjs',
    '.discipline/fitness/functions/F28-harness-run-integrity.mjs',
    'scripts/harness-runs/governing-files.mjs', // THIS file — added Wave GOV-SINGLE, 2026-09-04 (see header)
  ]),
  // forward-events (registered by lane FE-3): a single-pass extraction harness, not a mint/screen/
  // fetch-drain shape — one run is one extraction pass over a defined corpus slice.
  'forward-events': Object.freeze([
    'src/lib/forward-events/extract-forward-events.mjs',
    'scripts/harness-runs/forward-events/PROTOCOL.md',
  ]),
  // source-sweep (registered by lane RT, 2026-09-01, harness+flywheel completion train): the runtime
  // scripts/connections/*.mjs and scripts/mint|forward-events/run-*.mjs already had for their own
  // families, extended to src/lib/sources/register-walk.mjs and feed-walk.mjs — two dormant, pure,
  // dep-injected enumeration modules that had no caller anywhere in the repo before
  // scripts/turns/run-source-sweep.mjs gave them one.
  'source-sweep': Object.freeze([
    'scripts/turns/run-source-sweep.mjs',
    'src/lib/sources/register-walk.mjs',
    'src/lib/sources/feed-walk.mjs',
  ]),
  // ledger-consume (registered by Lane CONSUME, system-completion plan 2026-09-02): the runtime
  // scripts/turns/run-*.mjs already had for source-sweep/forward-events, extended to
  // src/lib/intake/portal-harvest.ts's consumePortalCandidates and src/lib/llm/first-fetch-classify.ts,
  // the LLM content gate it calls.
  'ledger-consume': Object.freeze([
    'scripts/turns/run-ledger-consume.mjs',
    'src/lib/intake/portal-harvest.ts',
    'src/lib/llm/first-fetch-classify.ts',
  ]),
  // change-detection (registered by lane CD, change-detection runtime, 2026-09-02): the runtime the
  // detect -> reconcile -> drain chain never had. Governing files are the driver plus the two library
  // modules it drives directly (reconcile.ts's dryRun projection, run-intake-cycle.ts's now-exported
  // drain entry).
  'change-detection': Object.freeze([
    'scripts/turns/run-change-detection.mjs',
    'src/lib/sources/reconcile.ts',
    'src/lib/intake/run-intake-cycle.ts',
  ]),
  // propagation (registered by lane DP-ENGINE, 2026-09-02, system-completion train): the drain driver
  // plus the two propagation-engine modules whose behaviour a run actually exercises — drain.ts (the
  // governed recompute/invalidate loop) and admissible-for.ts (the pollution barrier every consumer
  // reads through).
  propagation: Object.freeze([
    'scripts/turns/run-propagation-drain.mjs',
    'src/lib/propagation/drain.ts',
    'src/lib/propagation/admissible-for.ts',
  ]),
  // corpus-turn (registered by lane TURNREQ, 2026-09-04 — closing the audit's B1 Gap #2 / B2 §1 finding:
  // "the corpus-turn harness family has zero run artifacts... not registered in governing-files.mjs
  // either"). Unlike every family above, corpus-turn has no single canonical `run-*.mjs` entry point —
  // .github/workflows/corpus-turn.yml itself is the orchestrator, chaining scripts that already belong to
  // OTHER families (discover-for-items.mjs, forward-events's own run-extraction.mjs) with the two scripts
  // this family actually owns and that this same lane gave their first real corpus-turn wiring:
  // consume-turn-requests.mjs (the ticket-queue selection this family's own turns now run over — see that
  // file's header) and export-corpus-for-extraction.mjs (the corpus-file builder those selected ids feed
  // into run-extraction.mjs through, extended this lane with --ids to accept exactly that selection). A
  // change to either is a change to what a "corpus turn" actually selects and exports — the governing
  // files a corpus-turn harness_version should move on, same as any other family's own scoring/export
  // logic. discover-for-items.mjs and run-extraction.mjs stay OUT of this list deliberately: they are
  // already governed as part of item_cross_references' plain writer set and the forward-events family
  // respectively, and CONVENTION.md's own convention is one governing-file set per family, not a file
  // double-counted into two families' hashes.
  'corpus-turn': Object.freeze([
    'scripts/turns/consume-turn-requests.mjs',
    'scripts/turns/export-corpus-for-extraction.mjs',
  ]),
  // brief-apply (task 3.4, brief-chain build plan Part 3, 2026-09-11): the runtime that turns a validated
  // record-briefs file (task 3.2's schema.mjs) into a fully connected item: generate (the injected-
  // synthesis seam, task 3.3), section, ground, grow, then the per-item flywheel (discovery/forward-
  // events/compliance-deadline/entities), then the batch-level unscoped flywheel steps. Governing files are
  // the driver itself, the record-briefs validator it calls first, the ONE write site the injected-
  // synthesis seam lives in, and the two per-item flywheel steps this driver shares with apply-staged-
  // update.ts (task 3.4's own extraction, so the two callers can never independently drift on the dedupe
  // key or the stale-events detection). scripts/turns/run-population-flywheel.mjs (the batch-level unscoped
  // steps this driver also calls) is DELIBERATELY excluded: it is already governed nowhere as a harness
  // family of its own (see that file's own header, "NOT a new harness-run family"), and this family's own
  // governing-file set tracks brief-apply's OWN behavior-bearing surface, not every module it happens to
  // import, the same restraint corpus-turn's own entry above states for discover-for-items.mjs/
  // run-extraction.mjs.
  'brief-apply': Object.freeze([
    'scripts/turns/apply-record-briefs.mjs',
    'scripts/turns/record-briefs/schema.mjs',
    'src/lib/agent/canonical-pipeline.ts',
    'src/lib/intake/flywheel-steps.mjs',
    // D32 (defect-fix-plan-2026-09-12.md, lane L21): the pre-flight IO check + durable run record - both
    // gate whether an --execute run even starts, so both are behavior-bearing for this harness family.
    'scripts/turns/io-preflight.mjs',
  ]),
  // inaccessible-triage (registered by lane M8, 2026-09-18, closing S1's "no committed harness
  // artifact" finding -- docs/audits/stage-audit-2026-09-18/s1-collect.md row "Inaccessible-source
  // triage ladder"): the suspended-source acquisition-ladder driver plus the four ladder modules a
  // triage run actually exercises the behavior of -- primary-fallback.mjs (step 1, the declared-primary
  // re-probe + roadblock classification), seek-more.mjs (step 2, the bounded $0/no-LLM alternative
  // search), officialness.mjs and host-authority.ts (step 3, same-floor qualification -- the MOAT: an
  // alternative may never confer authority a static host-class table would not). A change to any of
  // these five files is a change to what the ladder actually does, the same governing-file discipline
  // every other family applies to the modules its own driver calls, never every module it happens to
  // import (see corpus-turn's/brief-apply's own entries above for the same restraint).
  'inaccessible-triage': Object.freeze([
    'scripts/sources/inaccessible-triage.mjs',
    'src/lib/sources/primary-fallback.mjs',
    'src/lib/sources/seek-more.mjs',
    'src/lib/sources/officialness.mjs',
    'src/lib/sources/host-authority.ts',
  ]),
  // maintenance (lane M9b, 2026-09-18 -- stage-audit-2026-09-18 s6-gates-harness.md finding: the
  // maintenance.yml family's runs were recorded only as an ephemeral upload-artifact, never a
  // scripts/harness-runs/ family, so a proposer reading this substrate's history found nothing for the
  // 62-step MAINT orchestrator's own runs even though those runs already had a structured per-step
  // summary.json contract, scripts/maintenance/lib/cli.mjs's runCli). Unlike every family above,
  // maintenance has no single canonical runner script (each step is its own scripts/maintenance/<step>.mjs
  // wrapper, or the ./.github/actions/maintenance-step composite action); the file whose edits actually
  // change what a "maintenance run" IS is the workflow itself (which step exists, what it is gated on, what
  // it writes) plus the one file every wrapper's CLI shape is built on, scripts/maintenance/lib/cli.mjs
  // (--mode/--arg/--out parsing, the summary.json contract this family's own artifact writer reads back) --
  // the same "orchestrator file is the governing file" call corpus-turn's own entry above makes for
  // .github/workflows/corpus-turn.yml. The path escapes fsi-app/ with '../' since maintenance.yml lives at
  // the repo root's .github/workflows/, one level above fsi-app -- the same escape meta-harness's own
  // '../lib/run-artifact.mjs' entry already uses; hashHarnessVersion resolves every entry independently
  // against fsi-app root (baseDir), so this is not order-sensitive.
  maintenance: Object.freeze([
    '../.github/workflows/maintenance.yml',
    'scripts/maintenance/lib/cli.mjs',
  ]),
});
