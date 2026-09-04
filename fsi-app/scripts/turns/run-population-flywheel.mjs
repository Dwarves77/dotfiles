#!/usr/bin/env node
// run-population-flywheel.mjs — the population family's own downstream flywheel pass (lane TANDEM,
// 2026-09-04).
//
// THE DEFECT [CONFIRMED] this closes. MINT-RUNBOOK.md §8 ("MANDATORY, post-apply — the flywheel":
// discovery, forward-event extraction, recluster, IN ORDER, before a batch is considered closed) and §9
// (--outcomes enrichment) were documented as a separate, hand-run coordinator pass. population-turn.yml
// itself ended after apply-mint-batch.mjs + propose-tags.mjs --dry — nothing in the runtime ever ran §8,
// and nothing ever computed §9's metrics. Population runs #15-#20 (2026-09-03/04, 934 items measured
// [CONFIRMED] — 177+168+156+152+141+140, mint-run-017..022) were applied with no flywheel pass and no
// outcomes: every one of those items carries
// zero item_cross_references, zero item_forward_events, no obligations, no tags, no signals — minted,
// live, and invisible to every consumer that reads the graph rather than the raw item row. Operator ruling
// (2026-09-04), verbatim: "there is no thing within this entire build that works on its own ever.
// Everything works in tandem... Everything works together, that's the purpose of the flywheel and the
// harness." This script is the runtime that makes that literally true for a population-turn batch: a
// mint-run artifact that reaches --outcomes enrichment has, by construction, already had discovery,
// forward-event extraction, and (the whole-corpus passes) recluster/derive-obligations/tag-ratification
// run over it — the coordinator's job becomes reading the outcomes, never chasing them down by hand.
//
// WHAT THIS SCRIPT IS, AND ISN'T. A thin orchestrator, same discipline as run-mint-batch.mjs /
// run-change-detection.mjs / run-source-sweep.mjs: it reuses every family's OWN scoring/write logic —
// either by importing an exported main()/pure function (derive-obligations.mjs, tag-proposals.mjs,
// tag-ratification.mjs — all three already take {mode, arg} + injected deps, built here the same way
// each script's own IS_MAIN block builds them) or by invoking a sibling script as a child process with
// its OWN documented flags (discover-for-items.mjs, run-extraction.mjs, apply-extraction-output.mjs,
// analyze-corpus.mjs — none of these four export a combined "run everything and write the artifact"
// function; their real orchestration lives inside an un-exported main() gated on their own IS_MAIN check,
// and analyze-corpus.mjs has no exported functions or IS_MAIN guard AT ALL — it is a bare top-level
// script, so importing it would execute it on import; a child process is the only correct way to reuse
// it). Nothing here re-implements discovery scoring, extraction rules, obligation derivation, or tag
// confidence — every decision of substance stays in the module that already owns it.
//
// NOT a new harness-run family. scripts/lib/run-artifact.mjs's ALLOWED_FAMILIES and
// .discipline/fitness/functions/F28-harness-run-integrity.mjs's GOVERNING_FILES are both out of this
// lane's write set, so this script registers no family of its own — it enriches the EXISTING `mint`
// family's artifact (run-mint-batch.mjs --outcomes, §9) and triggers the EXISTING `forward-events`
// family's own self-emitting run (run-extraction.mjs --execute writes its own
// scripts/harness-runs/forward-events/forward-events-run-NNN.json unmodified, exactly as corpus-turn.yml
// already triggers it). discover-for-items.mjs / analyze-corpus.mjs / derive-obligations.mjs /
// tag-proposals.mjs / tag-ratification.mjs are none of them harness-run families either (confirmed:
// scripts/harness-runs/ has no directory for any of the five) — they are plain guarded-write DB scripts,
// same as when corpus-turn.yml / maintenance.yml call them directly.
//
// STEP ORDER (MINT-RUNBOOK.md §8, reproduced here as code, not prose to forget):
//   1. discovery                — discover-for-items.mjs --ids <this batch's minted item ids>
//   2. corpus-export            — build the {items:[...]} corpus file run-extraction.mjs consumes,
//                                  scoped to EXACTLY this batch's ids (export-corpus-for-extraction.mjs's
//                                  own CLI only scopes by --since/default, not --ids, and that file is
//                                  out of this lane's write set — so this step reuses its EXPORTED
//                                  buildCorpusItems()/chunk() pure helpers directly over an id-scoped
//                                  read, never re-implementing that shaping logic).
//   3. forward-event-extraction — run-extraction.mjs --input <that corpus file> [--execute]
//   4. forward-event-apply      — apply-extraction-output.mjs --events <run-extraction's own output>
//                                  --execute (apply mode only — there is no events file to apply in dry
//                                  mode, since run-extraction.mjs writes nothing without --execute)
//   5. analyze-corpus           — recluster + gap/anticipate/signal detection, scoped the way
//                                  corpus-turn.yml scopes it: UNSCOPED (analyze-corpus.mjs takes no
//                                  --ids/--since of its own — it always reads the whole live corpus,
//                                  the same shape corpus-turn.yml already runs it in every turn)
//   6. derive-obligations       — also unscoped (its own wrapper takes no id/date selector either);
//                                  run every population-turn pass regardless of batch size, same posture
//   7. tag-proposals            — --arg "ids:<this batch's minted item ids>" (the ids: selector
//                                  tag-proposals.mjs already documents and tests)
//   8. tag-ratification         — --arg "auto" (its own auto-adoption sweep has no id-scoped variant —
//                                  see the step's own comment below for why this is run as-is, not faked
//                                  into a false scope)
//   9. compute-outcomes         — the §9 metrics (edges_discovered, forward_events_extracted,
//                                  isolated_items), computed from the live tables per
//                                  scripts/harness-runs/PROPOSER-RUNBOOK.md §7's own SQL shape,
//                                  reproduced here as guarded reads (this environment has no raw-SQL
//                                  execution path — only the PostgREST query builder db.mjs already
//                                  wraps) — recorded even when every number is zero (MINT-RUNBOOK.md §9:
//                                  "record it every batch, even when the number is zero")
//  10. write-outcomes           — run-mint-batch.mjs --outcomes <computed metrics> --run-id <this
//                                  batch's own mint-run-NNN> (apply mode only — see that CLI mode's own
//                                  header: it has NO dry/preview path of its own, so this script never
//                                  invokes it in dry mode, only prints what it would write)
//  11. record-last-turn         — writeLastTurnDate(this run's own start time) — last-turn-date.mjs's
//                                  OWN exported writer, the exact mechanism corpus-turn.yml uses, so a
//                                  later corpus-turn dispatch's blank --since does not re-cover (and
//                                  re-spend fetch/discovery effort on) items this flywheel already
//                                  covered (apply mode only, same as corpus-turn.yml's own "apply mode
//                                  only" marker-write rule)
//
// SCOPING HONESTY. Steps 1-4 and 7 are scoped to EXACTLY this batch's minted item ids (extracted from the
// mint-run artifact's own per_item, see extractMintedItemIds below) and are cleanly SKIPPED — never
// silently no-op'd, never faked with an empty selector that would error — when a run minted zero items
// (an all-dry population-turn dispatch, or an apply dispatch whose entire batch was M4-blocked/
// apply_failed/validation_failed). Steps 5-6 are genuinely unscoped by the scripts they call and run
// every dispatch regardless. Step 8 (tag-ratification --arg auto) is MECHANICALLY unscoped — its own
// "auto" mode sweeps every OPEN flywheel-tag: flag system-wide, not only this batch's — but this driver
// still SKIPS it when this batch minted zero items, rather than running a batch-independent global sweep
// under a step whose whole purpose is "connect what this batch just minted"; see buildFlywheelPlan's own
// comment on step 8 for why mixing tag-ratification's ratify-marker id-path with its auto-adoption
// evaluation would be WRONG, not merely inconvenient.
//
// EVERY STEP IS DRY-ABLE. --mode dry runs each step's own dry/preview path (discover-for-items.mjs
// without --execute, run-extraction.mjs without --execute, analyze-corpus.mjs --dry, the three
// maintenance wrappers with mode:"dry") and writes NOTHING to the database or the filesystem beyond what
// those dry paths already write (nothing) — --mode apply performs every real write, in order, and
// aborts (throws, stops the remaining steps, exits 1) the moment any one step fails, so population-turn.yml
// failing this step is the honest signal "minted, but NOT fully connected."
//
// Usage:
//   node scripts/turns/run-population-flywheel.mjs --mint-run scripts/harness-runs/mint/mint-run-NNN.json --mode dry|apply
//     [--harness-runs-dir dir]   (the mint family's own harness-runs dir; default scripts/harness-runs/mint)
//   node scripts/turns/run-population-flywheel.mjs --check-gate [--harness-runs-dir dir]
//     THE GATE (population-turn.yml, apply mode, run BEFORE export-census-rows.mjs): reads EVERY
//     mint-run-NNN.json already on the checkout — not only the newest — and refuses (exit 1) if ANY of
//     them minted items but was left without §9 outcomes. Pure filesystem check (readRunHistory +
//     checkAllSlicesConnected/checkPriorSliceConnected below) — no DB creds needed, so it runs before
//     "Verify required secrets" in the workflow, cheaply, every apply dispatch.
//   node scripts/turns/run-population-flywheel.mjs --backlog --mode dry|apply
//     [--harness-runs-dir dir] [--max-artifacts N]
//     THE FIX for a gate refusal (lane TANDEM-2, 2026-09-04): clears the backlog THE GATE reports,
//     oldest slice first, WITHOUT minting anything new — see "BACKLOG MODE" below.
// Exit 0 done · 1 bad args, a step failed, or the gate refused · 2 no DB creds (a real dry/apply run, or
//   a --backlog apply run, needs the same NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY pair every
//   guarded script needs; --check-gate and a --backlog DRY run never need DB creds at all — both are
//   pure filesystem reads).
//
// THE GATE, WIDENED (lane TANDEM-2, 2026-09-04). THE DEFECT [CONFIRMED by the coordinator reading the
// landed code]: checkPriorSliceConnected only ever saw ONE artifact — readRunHistory(dir).runs.at(-1),
// the newest BY started_at. A DRY mint-run artifact (rows_file preview, or a live export that minted
// nothing) has metrics.minted absent/0 by construction, so whenever a dry artifact happened to be the
// newest, the gate read ONLY it, said "nothing was minted by this slice, no flywheel pass required," and
// let a brand-new apply through — while every apply artifact BEHIND that dry one on the timeline still
// carried no edges_discovered/forward_events_extracted/isolated_items. Any dry run reset the gate to a
// false green. Fixed: checkAllSlicesConnected (below) scans EVERY artifact readRunHistory returns, not
// merely the newest; a dry artifact still never counts (checkPriorSliceConnected's own per-artifact
// "minted=0 → ok" rule, reused unchanged, IS that exemption — it just no longer gets to stand in for the
// artifacts behind it).
//
// THE FULL BACKLOG, MEASURED [CONFIRMED, 2026-09-04, this lane — re-run `--check-gate` any time to
// re-measure, these numbers drift as new runs land]: widening the gate to scan every artifact (not the
// six most recent) surfaces MORE history than the coordinator's own read of the code first named —
// checkAllSlicesConnected finds **15 of 23** mint-run artifacts on this checkout minted items and were
// never connected, not six: mint-run-001, 004, 005, 006, 011, 012, 013, 014, 016, 017, 018, 019, 020,
// 021, 022. Of those, **13 are auto-connectable by --backlog (1,272 minted items total)**:
// mint-run-004/006 (retired outcome label "minted_verified_first_pass" — see
// extractMintedItemIds' own MINTED_OUTCOME_VALUES for why these count), mint-run-011-014/016 (43+39+30+
// 40+177 = 329 items, pre-TANDEM population runs), and mint-run-017-022 (177+168+156+152+141+140 = 934
// items, the six runs the coordinator's own defect description named). **2 are NOT auto-connectable by
// EITHER --mint-run or --backlog**: mint-run-001 (metrics.minted=6) and mint-run-005 (metrics.minted=5)
// — both predate the per_item.item_id field entirely (their per_item entries carry a CELEX id and an
// outcome like "minted"/"minted_validator_pass", never a real intelligence_items.id), so
// extractMintedItemIds has nothing to recover — see hasRecoverableMintedIds below for the full mechanism
// and why running the flywheel over either one refuses rather than silently writing a false
// zero-valued outcomes record. CONSEQUENCE the operator/coordinator must decide on, not this lane: even
// after every --backlog dispatch this lane makes possible, THE GATE will keep refusing EVERY population-
// turn apply (new work included) until mint-run-001 and mint-run-005 are resolved by some OTHER means —
// e.g. hand-matching their per_item CELEX ids against intelligence_items.canonical_instrument_key and
// hand-writing their outcomes — which is out of this lane's write set and not attempted here.
//
// BACKLOG MODE (lane TANDEM-2, 2026-09-04). THE DEFECT [CONFIRMED]: population-turn.yml's own
// --mint-run flywheel step only ever ran over the run's OWN newly-minted batch — there was no
// dispatchable way to connect a backlog of ALREADY-minted, ALREADY-stale artifacts (the 15 THE GATE
// above was failing to see, 13 of them fixable this way — see "THE FULL BACKLOG, MEASURED" above).
// --backlog closes that: it selects every AUTO-CONNECTABLE stale mint-run artifact (hasRecoverableMintedIds
// true — an artifact with no recoverable item id is reported but never selected, see
// selectBacklogArtifacts' own header for why), oldest first (readRunHistory's own sort order), enriches
// each ONE AT A TIME with the EXACT SAME per-artifact step plan/executor a normal --mint-run apply uses
// (runFlywheelForOneArtifact, below — one code path implements "how a mint-run artifact gets connected,"
// never two), and — in apply mode only — writes each artifact's §9 outcomes back to its own
// mint-run-NNN.json via run-mint-batch.mjs --outcomes (the SAME existing, no-dry-path §9 write the
// normal per-batch flow already uses; nothing new was added to that script). export-census-rows.mjs and
// run-mint-batch.mjs's own minting gate never run under --backlog — this mode mints NOTHING, it only
// connects what earlier runs already minted. A DRY backlog run (--mode dry) lists the stale artifacts and
// each one's item count and writes nothing at all, DB creds or no.
//
// --max-artifacts bounds ONE dispatch's work (default DEFAULT_BACKLOG_MAX_ARTIFACTS below) so a single
// job neither starves under GitHub Actions' timeout nor silently attempts the whole backlog in one shot.
// PER-ARTIFACT CHECKPOINTING: each selected artifact's write-outcomes step (the SAME step the normal
// per-batch flow runs) writes that artifact's mint-run-NNN.json to disk the moment IT finishes — before
// the next artifact in the loop even starts — so a job that is killed by the workflow's timeout mid-loop
// still leaves every artifact processed SO FAR fully enriched on disk; population-turn.yml's own commit
// step (`if: always()`) picks up whatever changed regardless of how the job ended, and the next
// --check-gate sees a correctly NARROWED backlog (fewer stale artifacts), never a wasted or repeated
// enrichment. On a genuine step FAILURE (not a timeout) the backlog loop stops at that artifact rather
// than pressing on to the next one — same "fail loud, never `|| true`" posture the normal per-batch flow
// already has; artifacts processed before the failure stay enriched (the same checkpointing property).
//
// COST PROJECTION FOR DEFAULT_BACKLOG_MAX_ARTIFACTS [INFERRED — no --backlog run has executed for real
// yet; every prior population-turn apply was refused or hand-run before this driver's own flywheel step
// existed]. The only load-bearing timing evidence on this checkout is
// scripts/harness-runs/forward-events/*.json: forward-events-run-001 (2026-09-01) processed 322 items in
// 22m42s (~4.2s/item, wall clock, includes whatever DB round trips that run made); runs 002-004
// (2026-09-02/03), 185/53/481 items, each finished in well under a second. That thousand-fold spread is
// unexplained by anything in this session's own evidence (possibly a cold-cache/first-run cost, possibly
// a different code path) — so the WORST observed rate, not the best, is the one this projection uses.
// discover-for-items.mjs's own discovery scoring (discover.mjs, O(candidates) per item against the whole
// verified corpus, no LLM calls anywhere in this chain — the $0 rule holds throughout) has NO timing
// evidence on this checkout at all; this projection does not assume it is free. At the worst measured
// per-item rate, one AVERAGE auto-connectable stale artifact (~98 items — measured [CONFIRMED]: the
// 13-artifact auto-connectable backlog this lane found averages 1272/13 ≈ 97.8) costs on the order of
// 98 * 4.2s ≈ 6.9 minutes for forward-event-extraction ALONE, before discovery, corpus-export,
// forward-event-apply, tag-proposals, or either of the two unscoped whole-corpus passes (analyze-corpus,
// derive-obligations) are counted; the LARGEST individual artifacts in this backlog (mint-run-016/017 at
// 177 items each) cost close to double that on this one step alone. DEFAULT_BACKLOG_MAX_ARTIFACTS is
// therefore set to 2, not higher — two near-largest artifacts already approach the workflow's
// PRE-EXISTING 30-minute timeout at this worst-case rate, so this lane also raises population-turn.yml's
// timeout-minutes (30 → 60) to give the default real headroom; --max-artifacts is left overridable so a
// coordinator who has watched a real --backlog dry/apply pair's actual wall time can widen it with
// evidence instead of this projection's guess. Clearing the full 13-artifact auto-connectable backlog at
// the default therefore takes on the order of ceil(13/2) = 7 dispatches, not three — this lane's own
// first estimate (from the six-artifact reading in the coordinator's own defect description, before this
// lane widened the measurement to the full checkout) undercounted the backlog; a coordinator may pass a
// larger --max-artifacts once the first live run reports real per-artifact timing. The 2 unrecoverable
// artifacts (mint-run-001/005, above) are NEVER selected by any number of dispatches — clearing them
// needs a different fix, outside --backlog entirely.

import { parseArgs as nodeParseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readRunHistory } from "../lib/run-artifact.mjs";
import { buildCorpusItems, chunk } from "./export-corpus-for-extraction.mjs";
import { writeLastTurnDate } from "./last-turn-date.mjs";
import { main as deriveObligationsMain } from "../maintenance/derive-obligations.mjs";
import { main as tagProposalsMain, CITE as TAG_PROPOSALS_CITE } from "../maintenance/tag-proposals.mjs";
import { main as tagRatificationMain, CITE as TAG_RATIFICATION_CITE } from "../maintenance/tag-ratification.mjs";
import { TAG_NAMESPACE } from "../../src/lib/connections/flag-namespaces.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const DEFAULT_MINT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "mint");
const SNAPSHOTS_ROOT = resolve(FSI_ROOT, "scripts", "_snapshots");

// See the module header's "COST PROJECTION" paragraph for the full [INFERRED] reasoning behind 2.
export const DEFAULT_BACKLOG_MAX_ARTIFACTS = 2;

function usage() {
  return [
    "Usage:",
    "  node scripts/turns/run-population-flywheel.mjs --mint-run path/to/mint-run-NNN.json --mode dry|apply",
    "                                                   [--harness-runs-dir dir]",
    "  node scripts/turns/run-population-flywheel.mjs --check-gate [--harness-runs-dir dir]",
    "  node scripts/turns/run-population-flywheel.mjs --backlog --mode dry|apply",
    `                                                   [--harness-runs-dir dir] [--max-artifacts N (default ${DEFAULT_BACKLOG_MAX_ARTIFACTS})]`,
  ].join("\n");
}

/**
 * Pure CLI arg parse/validate — no I/O, no process.exit. @param {string[]} argv
 * @returns {{ok:true, help?:true} |
 *   {ok:true, checkGate:true, backlog:false, harnessRunsDir:string|null} |
 *   {ok:true, checkGate:false, backlog:true, mode:"dry"|"apply", maxArtifacts:number, harnessRunsDir:string|null} |
 *   {ok:true, checkGate:false, backlog:false, mintRun:string, mode:"dry"|"apply", harnessRunsDir:string|null} |
 *   {ok:false, error:string}}
 */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        "mint-run": { type: "string" },
        mode: { type: "string", default: "dry" },
        "harness-runs-dir": { type: "string" },
        "check-gate": { type: "boolean", default: false },
        backlog: { type: "boolean", default: false },
        "max-artifacts": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (values.help) return { ok: true, help: true };
  if (values["check-gate"] && values.backlog) {
    return { ok: false, error: "--check-gate and --backlog are mutually exclusive." };
  }
  if (values["check-gate"]) {
    return { ok: true, checkGate: true, backlog: false, harnessRunsDir: values["harness-runs-dir"] || null };
  }
  if (values.backlog) {
    if (values["mint-run"]) {
      return { ok: false, error: "--backlog selects its own artifacts — do not pass --mint-run with it." };
    }
    if (values.mode !== "dry" && values.mode !== "apply") {
      return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
    }
    let maxArtifacts = DEFAULT_BACKLOG_MAX_ARTIFACTS;
    if (values["max-artifacts"] !== undefined) {
      const n = Number.parseInt(values["max-artifacts"], 10);
      if (!Number.isInteger(n) || n <= 0 || String(n) !== values["max-artifacts"].trim()) {
        return {
          ok: false,
          error: `--max-artifacts must be a positive integer (got ${JSON.stringify(values["max-artifacts"])}).`,
        };
      }
      maxArtifacts = n;
    }
    return {
      ok: true,
      checkGate: false,
      backlog: true,
      mode: values.mode,
      maxArtifacts,
      harnessRunsDir: values["harness-runs-dir"] || null,
    };
  }
  if (!values["mint-run"]) {
    return { ok: false, error: "--mint-run <path/to/mint-run-NNN.json> is required (or pass --check-gate/--backlog)." };
  }
  if (values.mode !== "dry" && values.mode !== "apply") {
    return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  return {
    ok: true,
    checkGate: false,
    backlog: false,
    mintRun: values["mint-run"],
    mode: values.mode,
    harnessRunsDir: values["harness-runs-dir"] || null,
  };
}

// ── extracting the batch's minted item ids from an (already apply-mint-batch-enriched) mint-run artifact ──

// Recognized "this per_item entry names a real, newly-minted intelligence_items row" outcome strings.
// "minted_verified" / "minted_unverified" are the CURRENT (apply-mint-batch.mjs) schema. "minted_verified_
// first_pass" is a retired label from before the verified/unverified split existed (mint-run-004,
// mint-run-006 on this checkout — measured [CONFIRMED] 2026-09-04: every entry carrying it also carries a
// real item_id, unlike "minted"/"minted_validator_pass"/"minted_hardened_validator_pass", which never do in
// their original artifacts BUT ARE STILL REAL MINTED ITEMS that need id recovery via canonical_instrument_key).
const MINTED_OUTCOME_VALUES = Object.freeze([
  "minted_verified", "minted_unverified", "minted_verified_first_pass",
  "minted", "minted_validator_pass", "minted_hardened_validator_pass",
]);

// Recognized fields used to resolve item_id when not present directly (pre-item_id artifacts).
// Priority order: canonical_instrument_key (CELEX id), then instrument_identifier, then
// source_url + title exact match. An entry that resolves to zero or >1 item is reported unresolved.
const RESOLVER_KEY_PRIORITY = Object.freeze(["canonical_instrument_key", "instrument_identifier", "source_url_plus_title"]);

/**
 * Every item this batch actually minted — i.e. apply-mint-batch.mjs's own per_item outcomes
 * "minted_verified" / "minted_unverified" (both carry a real intelligence_items.id; every other
 * outcome — not_applied_*, apply_failed, would_apply* — never has a live row to connect), plus the
 * retired "minted_verified_first_pass" label (see MINTED_OUTCOME_VALUES). PURE.
 * In a dry population-turn dispatch the mint-run artifact handed here is exactly what
 * run-mint-batch.mjs --execute wrote (apply-mint-batch.mjs's own dry path never touches the file at
 * all — see that script's header), so per_item carries only "apply_ready"/"validation_failed" and this
 * always returns []. That is not a bug in this function — it is the honest reflection of "nothing was
 * actually minted yet." The SAME empty return also happens for a small number of pre-item_id-era
 * artifacts on this checkout (mint-run-001, mint-run-005 — outcomes "minted"/"minted_validator_pass",
 * measured [CONFIRMED] to carry NO item_id on any entry) whose own metrics.minted is nonetheless > 0 —
 * that is NOT "nothing was minted," it is "this artifact predates the field this function needs." Callers
 * that care about the difference use hasRecoverableMintedIds, below, rather than treating [] as "clean."
 * @param {{per_item?: Array<{outcome?:string, item_id?:string}>}} artifact
 * @returns {string[]} deduplicated item ids, in per_item order
 */
export function extractMintedItemIds(artifact) {
  const perItem = Array.isArray(artifact?.per_item) ? artifact.per_item : [];
  const seen = new Set();
  const ids = [];
  for (const entry of perItem) {
    const isMinted = MINTED_OUTCOME_VALUES.includes(entry?.outcome);
    if (isMinted && typeof entry?.item_id === "string" && entry.item_id.length > 0 && !seen.has(entry.item_id)) {
      seen.add(entry.item_id);
      ids.push(entry.item_id);
    }
  }
  return ids;
}

/**
 * Whether this driver could, in principle, auto-connect a mint-run artifact whose metrics.minted claims
 * items were minted — i.e. whether extractMintedItemIds can name even one of them. THE DEFECT this closes
 * [CONFIRMED, 2026-09-04, measured against every artifact on this checkout]: mint-run-001 (metrics.minted
 * =6, outcome "minted") and mint-run-005 (metrics.minted=5, outcome "minted_validator_pass") both predate
 * the per_item.item_id field entirely — every one of their per_item entries carries NO item_id at all, so
 * extractMintedItemIds necessarily returns [] for them, exactly the same [] a genuinely-zero-minted
 * artifact returns. Treating those two cases alike would be WRONG here specifically: checkAllSlicesConnected
 * (THE GATE) must still refuse an artifact like this (it minted real items nothing has ever connected —
 * CLAUDE.md rule 17 does not carve out an exception for "we lost the id"), but selectBacklogArtifacts (THE
 * FIX) must NEVER select it — running the id-scoped flywheel steps over an empty batchIds array would
 * "succeed" by writing edges_discovered=0/isolated_items=0, a FALSE record of connection this driver must
 * never produce (runFlywheelForOneArtifact's own guard refuses instead, for exactly this reason) — and
 * because --backlog selects oldest-first, leaving an unrecoverable artifact selectable would let it stall
 * every dispatch forever at the very artifact it can never fix, blocking progress on every recoverable one
 * behind it. PURE.
 * @param {object} artifact
 * @returns {boolean} true when there is nothing to recover (metrics.minted is 0/absent) OR at least one
 *   item id was actually recovered; false only for the "claims minted, but the ids are gone" case.
 */
export function hasRecoverableMintedIds(artifact) {
  const minted = Number(artifact?.metrics?.minted ?? 0);
  if (!(minted > 0)) return true;
  if (extractMintedItemIds(artifact).length > 0) return true;
  // LEGACY-2 (coordinator, 2026-09-04, first backlog dry after BACKLOG-LEGACY landed): this sync guard ran
  // BEFORE resolveMintedItemIds and still answered false for mint-run-001/005, so the resolver written for
  // exactly those artifacts never ran and the backlog dry kept listing them as "CANNOT be auto-connected".
  // A minted entry that carries a resolvable key (per_item.id, the CELEX/canonical key those artifacts
  // record) IS recoverable; whether every entry resolves to exactly one item is the resolver's verdict at
  // run time (it throws with the unresolved list rather than proceeding on a partial batch).
  return (Array.isArray(artifact?.per_item) ? artifact.per_item : []).some(
    (e) => MINTED_OUTCOME_VALUES.includes(e?.outcome) && typeof e?.id === "string" && e.id.length > 0,
  );
}

/**
 * Resolve minted item IDs from an artifact, handling both modern (per_item.item_id) and pre-item_id
 * artifacts. Queries the database to match identity fields when item_id is absent, using this priority:
 *   1. per_item.id as canonical_instrument_key (CELEX ids in mint-run-001/005)
 *   2. per_item.instrument_identifier
 *   3. per_item.source_url + per_item.title exact match
 *
 * Rejects any entry that resolves to zero or more than one item.
 *
 * For each minted per_item entry:
 *   1. If item_id is present, use it directly (modern path).
 *   2. Otherwise, try resolvers in priority order — if one matches exactly one item, use it.
 *   3. If a resolver finds 0 or 2+ matches, report that entry as unresolved.
 *   4. If no field is present to resolve, report as unresolved.
 *
 * Returns {ids: [...], idsResolvedByKey, unresolved: [{entry, attemptedKey, matchCount}, ...]},
 * or throws if the DB query itself fails.
 *
 * @param {{per_item?: Array<{outcome?:string, item_id?:string, id?:string, [key:string]:any}>}} artifact
 * @param {object} db — { readAll } function from scripts/lib/db.mjs
 * @returns {Promise<{ids:string[], idsResolvedByKey:number, unresolved:Array<{entry:object, attemptedKey:string, matchCount:number}>}>}
 */
/**
 * LEGACY-3 (coordinator, 2026-09-04, backlog apply #25): the live table carries more than one row per
 * canonical key for several of mint-run-001's items (32015R0757: two live rows; 32023R1804: two live +
 * one archived duplicate), so a bare key match answered "2 matches" and the run refused. The artifact
 * minted ONE of them, at its own started_at. Disambiguation, in order, each step applied only while more
 * than one candidate remains: (1) drop archived rows; (2) keep the rows created within a day of the
 * artifact's started_at (the row this very run minted); (3) keep the single verified row when the run's own
 * row was archived as a duplicate of it. Anything still ambiguous stays ambiguous and the caller refuses,
 * never guesses. PURE. Returns ids.
 * @param {Array<{id:string, is_archived?:boolean, created_at?:string}>} rows
 * @param {string|undefined} startedAt
 * @returns {string[]}
 */
export function disambiguateByArtifactTime(rows, startedAt) {
  let cands = rows.filter((r) => r && typeof r.id === "string");
  if (cands.length > 1) {
    const live = cands.filter((r) => r.is_archived !== true);
    if (live.length >= 1) cands = live;
  }
  if (cands.length > 1 && startedAt) {
    const t0 = Date.parse(startedAt);
    if (Number.isFinite(t0)) {
      const near = cands.filter((r) => {
        const t = Date.parse(r.created_at ?? "");
        return Number.isFinite(t) && Math.abs(t - t0) <= 24 * 3600 * 1000;
      });
      if (near.length >= 1) cands = near;
    }
  }
  // (3) the run's own row was later archived as a duplicate of an older verified item (32023R1804: the
  // 2026-09-01 row is archived `duplicate_of_verified`, two older live rows remain): the item the
  // flywheel must connect is the surviving VERIFIED one, when exactly one is verified.
  if (cands.length > 1) {
    const verified = cands.filter((r) => r.provenance_status === "verified");
    if (verified.length === 1) cands = verified;
  }
  return cands.map((r) => r.id);
}

export async function resolveMintedItemIds(artifact, db) {
  const perItem = Array.isArray(artifact?.per_item) ? artifact.per_item : [];
  const resolvedIds = [];
  const resolvedByKey = [];
  const unresolved = [];
  const seen = new Set();

  // Pre-fetch all canonical_instrument_keys (via per_item.id field for CELEX) to batch queries
  const celexKeysToResolve = new Set();
  for (const entry of perItem) {
    const isMinted = MINTED_OUTCOME_VALUES.includes(entry?.outcome);
    if (!isMinted) continue;
    if (entry?.item_id) continue; // modern path, no resolution needed
    // Resolver 1: per_item.id as canonical_instrument_key (pre-item_id CELEX artifacts)
    if (typeof entry?.id === "string" && entry.id.length > 0) {
      celexKeysToResolve.add(entry.id);
    }
  }

  const celexMap = new Map(); // canonical_instrument_key → [intelligence_items.id, ...]
  if (celexKeysToResolve.size > 0) {
    const celexArray = Array.from(celexKeysToResolve);
    for (const chunk of chunkArray(celexArray, 100)) {
      if (!chunk.length) continue;
      const rows = await db.readAll("intelligence_items", "id, canonical_instrument_key, is_archived, created_at, provenance_status", {
        match: (q) => q.in("canonical_instrument_key", chunk),
      });
      for (const row of rows) {
        const key = row.canonical_instrument_key;
        if (!celexMap.has(key)) celexMap.set(key, []);
        celexMap.get(key).push(row);
      }
    }
  }

  // Process each minted entry
  for (const entry of perItem) {
    const isMinted = MINTED_OUTCOME_VALUES.includes(entry?.outcome);
    if (!isMinted) continue;

    // Modern path: direct item_id (no resolution needed)
    if (typeof entry?.item_id === "string" && entry.item_id.length > 0) {
      if (!seen.has(entry.item_id)) {
        seen.add(entry.item_id);
        resolvedIds.push(entry.item_id);
      }
      continue;
    }

    // Pre-item_id path: try resolvers in priority order
    let resolved = false;

    // Resolver 1: per_item.id as canonical_instrument_key (CELEX for mint-run-001/005)
    if (typeof entry?.id === "string" && entry.id.length > 0) {
      const matches = disambiguateByArtifactTime(celexMap.get(entry.id) ?? [], artifact?.started_at);
      if (matches.length === 1) {
        const id = matches[0];
        if (!seen.has(id)) {
          seen.add(id);
          resolvedIds.push(id);
          resolvedByKey.push("canonical_instrument_key");
        }
        resolved = true;
      } else if (matches.length > 1) {
        unresolved.push({
          entry,
          attemptedKey: "canonical_instrument_key",
          matchCount: matches.length,
        });
        resolved = true; // tried but failed
      }
    }

    // Resolver 2: instrument_identifier (if not resolved yet)
    if (!resolved && entry?.instrument_identifier) {
      const matches = await db.readAll("intelligence_items", "id", {
        match: (q) => q.eq("instrument_identifier", entry.instrument_identifier),
      });
      if (matches.length === 1) {
        const id = matches[0].id;
        if (!seen.has(id)) {
          seen.add(id);
          resolvedIds.push(id);
          resolvedByKey.push("instrument_identifier");
        }
        resolved = true;
      } else if (matches.length > 1) {
        unresolved.push({
          entry,
          attemptedKey: "instrument_identifier",
          matchCount: matches.length,
        });
        resolved = true;
      }
    }

    // Resolver 3: source_url + title exact match (if not resolved yet)
    if (!resolved && entry?.source_url && entry?.title) {
      const matches = await db.readAll("intelligence_items", "id", {
        match: (q) => q.eq("source_url", entry.source_url).eq("title", entry.title),
      });
      if (matches.length === 1) {
        const id = matches[0].id;
        if (!seen.has(id)) {
          seen.add(id);
          resolvedIds.push(id);
          resolvedByKey.push("source_url_plus_title");
        }
        resolved = true;
      } else if (matches.length > 1) {
        unresolved.push({
          entry,
          attemptedKey: "source_url_plus_title",
          matchCount: matches.length,
        });
        resolved = true;
      }
    }

    // Entry had no recoverable fields or all resolvers came up empty
    if (!resolved) {
      unresolved.push({
        entry,
        attemptedKey: null,
        matchCount: 0,
      });
    }
  }

  return {
    ids: resolvedIds,
    idsResolvedByKey: resolvedByKey.length,
    unresolved,
  };
}

// Helper to chunk an array (local, since buildCorpusItems already imports chunk from export-corpus-for-extraction.mjs)
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── the ordered step plan (pure — no I/O, drives both dry-mode reporting and the real apply loop) ────

/**
 * The full, ordered §8/§9 step plan for one flywheel run. PURE — depends only on `mode` and `batchIds`,
 * so step ordering and every skip/write decision is independently testable without touching a DB or
 * spawning a process. See the module header for the full step-by-step rationale.
 * @param {"dry"|"apply"} mode
 * @param {string[]} batchIds
 * @returns {Array<{name:string, scoped:boolean, skip:boolean, skipReason:string|null, willWrite:boolean}>}
 */
export function buildFlywheelPlan(mode, batchIds) {
  const apply = mode === "apply";
  const hasItems = Array.isArray(batchIds) && batchIds.length > 0;
  const noItemsReason = "0 minted item(s) this run — nothing to connect (see this script's own header on why a dry-mode mint-run artifact always lands here empty).";

  return [
    {
      name: "discovery",
      scoped: true,
      skip: !hasItems,
      skipReason: hasItems ? null : noItemsReason,
      willWrite: apply && hasItems,
    },
    {
      name: "corpus-export",
      scoped: true,
      skip: !hasItems,
      skipReason: hasItems ? null : noItemsReason,
      willWrite: false, // a local file only — never a DB write, in either mode
    },
    {
      name: "forward-event-extraction",
      scoped: true,
      skip: !hasItems,
      skipReason: hasItems ? null : noItemsReason,
      willWrite: apply && hasItems, // run-extraction.mjs writes its events file + its OWN harness artifact only on --execute
    },
    {
      name: "forward-event-apply",
      scoped: true,
      skip: !hasItems || !apply,
      skipReason: !hasItems
        ? noItemsReason
        : !apply
          ? "dry mode — run-extraction.mjs wrote no events file (apply-extraction-output.mjs has nothing to read without --execute upstream)."
          : null,
      willWrite: apply && hasItems,
    },
    {
      // Unscoped by construction (analyze-corpus.mjs takes no --ids/--since) — run every dispatch,
      // exactly the way corpus-turn.yml already runs it every turn regardless of that turn's own --since.
      name: "analyze-corpus",
      scoped: false,
      skip: false,
      skipReason: null,
      willWrite: apply, // --dry --signals writes nothing; --signals (apply) writes themes/gaps/edges
    },
    {
      // Unscoped by construction (derive-obligations.mjs's wrapper takes no id/date selector) — run
      // every dispatch; harmless and idempotent (guardedInsertMany dedupes on forward_event_id) when
      // this batch minted nothing new to derive from.
      name: "derive-obligations",
      scoped: false,
      skip: false,
      skipReason: null,
      willWrite: apply,
    },
    {
      // tag-proposals.mjs's own "ids:<uuid,uuid,...>" selector — exactly this batch, nothing wider.
      name: "tag-proposals",
      scoped: true,
      skip: !hasItems,
      skipReason: hasItems ? null : noItemsReason,
      willWrite: apply && hasItems,
    },
    {
      // tag-ratification.mjs's "auto" arg has NO id-scoped variant — its own evaluateAutoAdoption/
      // autoAdoptTags path sweeps every OPEN flywheel-tag: flag system-wide by confidence, not by an
      // operator-curated id list (that is the OTHER, ratify-marker arg path, which needs a
      // pre-resolved/RESOLVED flag id list this driver has no way to derive without duplicating
      // apply-tags.mjs's own confidence evaluation into a second, DIFFERENT write path — the id path
      // expects a resolved+ratify:tags flag, the auto path an open+confidence-eligible one; mixing them
      // would silently apply the wrong criterion, not merely widen scope). Run as documented, own scope
      // and all — but still SKIPPED when this batch minted zero items, so a step whose whole reason for
      // being on this batch's chain does not fire a global sweep under an empty batch's name.
      name: "tag-ratification",
      scoped: true,
      skip: !hasItems,
      skipReason: hasItems ? null : noItemsReason,
      willWrite: apply && hasItems,
    },
    {
      // Always computed and reported, even at zero (MINT-RUNBOOK.md §9: "record it every batch, even
      // when the number is zero") — a read-only DB query either way, never a write.
      name: "compute-outcomes",
      scoped: true,
      skip: false,
      skipReason: null,
      willWrite: false,
    },
    {
      // run-mint-batch.mjs --outcomes has NO dry/preview path of its own (loadOutcomes/
      // enrichRunArtifactMetrics/writeRunArtifact always write) — so this driver never invokes it in dry
      // mode at all; it only PRINTS the metrics compute-outcomes computed.
      name: "write-outcomes",
      scoped: true,
      skip: !apply,
      skipReason: apply ? null : "dry mode — run-mint-batch.mjs --outcomes has no dry/preview path; printing the computed metrics instead of writing them.",
      willWrite: apply,
    },
    {
      // Advanced only on a successful apply, matching corpus-turn.yml's own "apply mode only" marker rule.
      name: "record-last-turn",
      scoped: false,
      skip: !apply,
      skipReason: apply ? null : "dry mode — scripts/turns/LAST-TURN.json is advanced only on a successful apply run.",
      willWrite: apply,
    },
  ];
}

// ── §9 metrics: edges_discovered / isolated_items (fake-db-testable, pure) ────────────────────────────

/**
 * The §9 edges_discovered / isolated_items pair, per
 * scripts/harness-runs/PROPOSER-RUNBOOK.md §7's own SQL shape, reproduced here as a pure reduction over
 * already-fetched item_cross_references rows (this environment has no raw-SQL execution path — only the
 * PostgREST query builder db.mjs wraps — so the SQL in that runbook is translated to an equivalent
 * fetch-then-reduce, not run verbatim). PURE — no I/O, so a fake edge-row list drives the whole test.
 *
 * `edges_discovered` picks PROPOSER-RUNBOOK.md §7's NARROWER, TO-VERIFY reading: "edges created BY the
 * discovery pass this turn" (origin='provenance_discovery'), not "every edge touching a batch item" —
 * this is the number step 1 (discovery) of THIS run itself actually produced, which is what a
 * population-turn's own §9 metric should mean; the runbook's own header says the coordinator's report
 * should state which reading it used, so this one does, here.
 *
 * `isolated_items` is ANY origin (MINT-RUNBOOK.md §9's own definition: "count of items MINTED IN THIS
 * BATCH that have ZERO item_cross_references rows... after discovery has run") — an item already carrying
 * an entity_extraction/agent_semantic edge from elsewhere is not isolated just because discovery itself
 * found nothing new for it.
 *
 * Each edge row counts once per endpoint (source_item_id / target_item_id) that lands in `batchIds` — the
 * runbook's own "each edge counts once per endpoint it touches" convention, including a same-batch-
 * internal edge counting toward BOTH items' totals (deliberately not deduplicated — see that runbook's
 * own caveat on `total_edge_endpoints`).
 * @param {string[]} batchIds
 * @param {Array<{source_item_id:string, target_item_id:string, origin?:string}>} edgeRows every
 *   item_cross_references row (any origin) with at least one endpoint in `batchIds`
 * @returns {{edges_discovered:number, isolated_items:number}}
 */
export function computeCorpusOutcomes(batchIds, edgeRows) {
  const batchSet = new Set(batchIds ?? []);
  const touchedByAnyOrigin = new Set();
  let edgesDiscovered = 0;

  for (const row of edgeRows ?? []) {
    const sourceIn = batchSet.has(row?.source_item_id);
    const targetIn = batchSet.has(row?.target_item_id);
    if (sourceIn) touchedByAnyOrigin.add(row.source_item_id);
    if (targetIn) touchedByAnyOrigin.add(row.target_item_id);
    if (row?.origin === "provenance_discovery") {
      if (sourceIn) edgesDiscovered += 1;
      if (targetIn) edgesDiscovered += 1;
    }
  }

  const isolatedItems = (batchIds ?? []).filter((id) => !touchedByAnyOrigin.has(id)).length;
  return { edges_discovered: edgesDiscovered, isolated_items: isolatedItems };
}

// ── THE GATE: a prior slice must be fully connected before a new one is minted (pure, tested) ─────────

const OUTCOME_KEYS = Object.freeze(["edges_discovered", "forward_events_extracted", "isolated_items"]);
// Mirrors run-mint-batch.mjs's own (un-exported) KNOWN_OUTCOME_KEYS by value — that file is out of this
// lane's write set beyond its --outcomes path, so this is a duplicated CONSTANT, never duplicated logic.

/**
 * THE GATE (population-turn.yml, apply mode, run before export-census-rows.mjs). PURE — takes the
 * already-loaded newest mint-run artifact (or null when none exists on this checkout yet) and decides
 * whether a NEW slice may proceed. A prior slice that minted nothing (metrics.minted is 0/absent) has
 * nothing to connect and never blocks. A prior slice that minted ≥1 item but whose metrics block is
 * missing any of the three §9 keys means the flywheel never ran over it — refused, with the exact
 * command that closes the gap.
 * @param {object|null} newestArtifact
 * @returns {{ok:boolean, reason:string}}
 */
export function checkPriorSliceConnected(newestArtifact) {
  if (!newestArtifact) {
    return { ok: true, reason: "no prior mint-run artifact on this checkout — nothing to gate." };
  }
  const metrics = newestArtifact.metrics ?? {};
  const minted = Number(metrics.minted ?? 0);
  const runId = newestArtifact.run_id ?? "(no run_id)";
  if (!(minted > 0)) {
    return { ok: true, reason: `${runId}: metrics.minted=${minted} — nothing was minted by this slice, no flywheel pass required.` };
  }
  const missing = OUTCOME_KEYS.filter((k) => metrics[k] === undefined);
  if (missing.length) {
    return {
      ok: false,
      reason:
        `${runId} minted ${minted} item(s) but its metrics block is missing ${missing.join(", ")} — the population ` +
        "flywheel (discovery + forward-event extraction + recluster, MINT-RUNBOOK.md §8) never ran over this " +
        "slice. THE RULE (operator, 2026-09-04): a runtime that ends without triggering its downstream is a defect " +
        `in the runtime, not a note for a coordinator. FIX: node scripts/turns/run-population-flywheel.mjs ` +
        `--mint-run scripts/harness-runs/mint/${runId}.json --mode apply — then re-dispatch this workflow.`,
    };
  }
  return {
    ok: true,
    reason:
      `${runId}: outcomes present (edges_discovered=${metrics.edges_discovered}, ` +
      `forward_events_extracted=${metrics.forward_events_extracted}, isolated_items=${metrics.isolated_items}).`,
  };
}

/**
 * THE GATE, WIDENED (lane TANDEM-2, 2026-09-04) — see the module header's "THE GATE, WIDENED" paragraph
 * for THE DEFECT this closes. PURE — checks EVERY artifact given, not merely the newest, reusing
 * checkPriorSliceConnected's own per-artifact verdict/reason text so there is exactly one authority for
 * "is this one artifact connected." A dry artifact (metrics.minted absent/0) never counts on its own
 * merits (checkPriorSliceConnected already says so) AND never masks a stale artifact elsewhere in the
 * list — every artifact is checked independently. A stale artifact with no recoverable item ids
 * (hasRecoverableMintedIds false — measured [CONFIRMED] on this checkout: mint-run-001, mint-run-005,
 * both predating per_item.item_id) is reported SEPARATELY from the rest: it still refuses (it minted real
 * items nothing has ever connected — CLAUDE.md rule 17 carves out no exception for "the ids are gone"),
 * but it is named as needing manual/operator resolution rather than handed the standard --mint-run/
 * --backlog fix commands, neither of which can actually connect it (see hasRecoverableMintedIds' own
 * header and runFlywheelForOneArtifact's guard for why running either over it refuses rather than
 * "fixing" it with a false zero-valued outcomes record).
 * @param {object[]} artifacts every mint-run artifact on this checkout, from readRunHistory(dir).runs
 *   (already sorted ascending by started_at — oldest first — that order is preserved in the message but
 *   not required by this function, which checks every element regardless of order)
 * @returns {{ok:boolean, reason:string}}
 */
export function checkAllSlicesConnected(artifacts) {
  const list = Array.isArray(artifacts) ? artifacts : [];
  if (list.length === 0) {
    return { ok: true, reason: "no prior mint-run artifact on this checkout — nothing to gate." };
  }

  const stale = [];
  const unrecoverable = [];
  for (const artifact of list) {
    const result = checkPriorSliceConnected(artifact);
    if (result.ok) continue;
    const runId = artifact?.run_id ?? "(no run_id)";
    if (hasRecoverableMintedIds(artifact)) {
      stale.push({ runId, reason: result.reason });
    } else {
      const minted = Number(artifact?.metrics?.minted ?? 0);
      // Deliberately NOT result.reason: checkPriorSliceConnected's own text always ends in a
      // `--mint-run ... --mode apply` FIX command, and running that exact command against an
      // unrecoverable artifact refuses (runFlywheelForOneArtifact's own guard) rather than fixing
      // anything — this per-artifact detail line must never repeat a command that cannot work.
      unrecoverable.push({
        runId,
        minted,
        reason:
          `${runId} minted ${minted} item(s) but its per_item carries no recoverable item id (it predates ` +
          "the item_id field) — CANNOT be auto-connected by --mint-run or --backlog; needs manual/operator " +
          "resolution, not the standard fix command.",
      });
    }
  }

  if (stale.length === 0 && unrecoverable.length === 0) {
    return {
      ok: true,
      reason:
        `${list.length} mint-run artifact(s) checked — every slice that minted anything carries its §9 ` +
        "outcomes (or minted nothing itself).",
    };
  }

  const allStaleRunIds = [...stale, ...unrecoverable].map((s) => s.runId).join(", ");
  const perRunFixCommands = stale
    .map(
      (s) =>
        `    node scripts/turns/run-population-flywheel.mjs --mint-run scripts/harness-runs/mint/${s.runId}.json --mode apply`,
    )
    .join("\n");
  const fixSection = stale.length
    ? "FIX (preferred — clears the whole backlog, oldest first, with per-artifact checkpointing): dispatch " +
      "population-turn.yml with mode=apply and flywheel_backlog=true (the backlog dispatch — see " +
      "docs/runbooks/POPULATION-TURN-RUNBOOK.md's backlog section, or run " +
      "`node scripts/turns/run-population-flywheel.mjs --backlog --mode apply` directly).\n" +
      "FIX (one artifact at a time, equivalent):\n" +
      perRunFixCommands +
      "\n— then re-dispatch this workflow.\n\n"
    : "";
  const unrecoverableSection = unrecoverable.length
    ? `${unrecoverable.length} artifact(s) CANNOT be auto-connected by --mint-run or --backlog (both refuse ` +
      "rather than write a false zero-valued outcomes record — see hasRecoverableMintedIds' own header): " +
      unrecoverable.map((s) => `${s.runId} (metrics.minted=${s.minted}, no recoverable item id)`).join(", ") +
      ". These need manual/operator resolution — identify what each one actually minted by another means " +
      "(e.g. matching per_item's own id field against intelligence_items by hand) before the flywheel can " +
      "run over them; until then THE GATE keeps refusing for these specifically, independent of any " +
      "--backlog progress on the rest.\n\n"
    : "";
  return {
    ok: false,
    reason:
      `${stale.length + unrecoverable.length} of ${list.length} mint-run artifact(s) minted items but were ` +
      `never connected: ${allStaleRunIds}. Every artifact on this checkout is checked, not only the newest ` +
      "— a dry artifact never counts on its own and never masks a stale one behind it. THE RULE (operator, " +
      "2026-09-04): a runtime that ends without triggering its downstream is a defect in the runtime, not a " +
      "note for a coordinator.\n" +
      fixSection +
      unrecoverableSection +
      "Per-artifact detail:\n" +
      [...stale, ...unrecoverable].map((s) => `  - ${s.reason}`).join("\n"),
  };
}

// ── BACKLOG MODE: selecting which stale artifacts one dispatch enriches (pure, tested) ─────────────────

/**
 * Which stale mint-run artifacts a --backlog run will process THIS dispatch, oldest first, capped at
 * `maxArtifacts`. PURE — depends only on its arguments, so the selection/ordering/cap logic is
 * independently testable without touching a DB or spawning a process. Re-sorts by started_at itself
 * (ties broken by run_id, matching readRunHistory's own convention) rather than trusting caller order, so
 * it is correct even if a caller hands it artifacts out of order.
 *
 * A stale artifact with no recoverable item ids (hasRecoverableMintedIds false) is NEVER selected — it is
 * reported separately, in `unrecoverable`, and does not consume any of `maxArtifacts`' budget. THE DEFECT
 * this avoids [CONFIRMED, 2026-09-04]: selecting it anyway would either (a) have
 * runFlywheelForOneArtifact refuse on it (its own guard — see that function's header), which, given
 * oldest-first ordering, would stall EVERY dispatch forever at the one artifact this driver can never fix,
 * blocking progress on every recoverable artifact behind it, or (b) absent that guard, silently write a
 * false zero-valued outcomes record. Excluding it from selection lets --backlog keep making real progress
 * on everything it CAN fix while still surfacing what it can't.
 * @param {object[]} artifacts every mint-run artifact on this checkout, from readRunHistory(dir).runs
 * @param {number} maxArtifacts cap on how many of the stale artifacts this dispatch selects (the rest are
 *   left for a later dispatch) — see DEFAULT_BACKLOG_MAX_ARTIFACTS for the default and its rationale
 * @returns {{staleTotal:number, staleTotalItems:number, selected:Array<{runId:string, artifact:object,
 *   itemCount:number}>, selectedItems:number, remaining:number,
 *   unrecoverable:Array<{runId:string, minted:number}>}}
 */
export function selectBacklogArtifacts(artifacts, maxArtifacts) {
  const list = (Array.isArray(artifacts) ? artifacts.slice() : []).sort((a, b) => {
    const byTime = Date.parse(a?.started_at) - Date.parse(b?.started_at);
    if (Number.isNaN(byTime) || byTime === 0) {
      const aId = a?.run_id ?? "";
      const bId = b?.run_id ?? "";
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    }
    return byTime;
  });

  const stale = [];
  const unrecoverable = [];
  for (const artifact of list) {
    const result = checkPriorSliceConnected(artifact);
    if (result.ok) continue;
    const runId = artifact?.run_id ?? "(no run_id)";
    if (hasRecoverableMintedIds(artifact)) {
      stale.push({ runId, artifact, itemCount: extractMintedItemIds(artifact).length });
    } else {
      unrecoverable.push({ runId, minted: Number(artifact?.metrics?.minted ?? 0) });
    }
  }

  const cap = Number.isInteger(maxArtifacts) && maxArtifacts > 0 ? maxArtifacts : DEFAULT_BACKLOG_MAX_ARTIFACTS;
  const selected = stale.slice(0, cap);
  return {
    staleTotal: stale.length,
    staleTotalItems: stale.reduce((n, s) => n + s.itemCount, 0),
    selected,
    selectedItems: selected.reduce((n, s) => n + s.itemCount, 0),
    remaining: stale.length - selected.length,
    unrecoverable,
  };
}

/**
 * Human-readable report for a --backlog dispatch (both dry and apply print this before doing anything
 * else). PURE — string formatting only, over selectBacklogArtifacts' own output, so its exact shape is
 * testable without a subprocess.
 * @param {ReturnType<typeof selectBacklogArtifacts>} selection
 * @returns {string}
 */
export function formatBacklogReport(selection) {
  const unrecoverable = selection?.unrecoverable ?? [];
  const unrecoverableLines = unrecoverable.length
    ? [
        `[population-flywheel] backlog: ${unrecoverable.length} additional stale artifact(s) CANNOT be ` +
          "auto-connected (no recoverable item id — pre-dates per_item.item_id) and are never selected; " +
          "these need manual/operator resolution:",
        ...unrecoverable.map((s) => `  - ${s.runId}: metrics.minted=${s.minted}, no recoverable item id`),
      ]
    : [];

  if (!selection || selection.staleTotal === 0) {
    const base = "[population-flywheel] backlog: 0 stale mint-run artifact(s) — every slice that minted anything is already connected.";
    return [base, ...unrecoverableLines].join("\n");
  }
  const lines = [
    `[population-flywheel] backlog: ${selection.staleTotal} stale mint-run artifact(s) found ` +
      `(${selection.staleTotalItems} item(s) total, oldest first) — selecting ${selection.selected.length} ` +
      `this dispatch (${selection.selectedItems} item(s)), ${selection.remaining} left for a later dispatch:`,
    ...selection.selected.map((s) => `  - ${s.runId}: ${s.itemCount} minted item(s)`),
  ];
  if (selection.remaining > 0) {
    lines.push(
      `  ... ${selection.remaining} more stale artifact(s) not selected this dispatch — raise ` +
        "--max-artifacts (or backlog_max_artifacts on the workflow dispatch) or dispatch again once this one lands.",
    );
  }
  return [...lines, ...unrecoverableLines].join("\n");
}

// ── step handlers (I/O — child processes and guarded DB calls; each throws on failure) ─────────────────

function runChild(scriptRelPath, args) {
  const scriptPath = resolve(FSI_ROOT, scriptRelPath);
  console.log(`[population-flywheel] $ node ${scriptRelPath} ${args.join(" ")}`);
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: "inherit", env: process.env });
  if (res.error) throw res.error;
  if (typeof res.status === "number" && res.status !== 0) {
    throw new Error(`${scriptRelPath} exited ${res.status} (args: ${args.join(" ")})`);
  }
}

async function stepDiscovery(ctx) {
  const args = ["--ids", ctx.batchIds.join(",")];
  if (ctx.apply) args.push("--execute");
  runChild("scripts/connections/discover-for-items.mjs", args);
  return { ids: ctx.batchIds.length, execute: ctx.apply };
}

async function stepCorpusExport(ctx) {
  const { readAll } = ctx.db;
  const claimRows = [];
  const sectionRows = [];
  for (const idChunk of chunk(ctx.batchIds, 200)) {
    if (!idChunk.length) continue;
    const claims = await readAll(
      "section_claim_provenance",
      "id, intelligence_item_id, claim_kind, claim_text, source_span",
      { match: (q) => q.in("intelligence_item_id", idChunk).in("claim_kind", ["FACT", "GAP"]) },
    );
    claimRows.push(...claims);
    const sections = await readAll("intelligence_item_sections", "id, item_id, section_key, content_md", {
      match: (q) => q.in("item_id", idChunk),
    });
    sectionRows.push(...sections);
  }
  const items = ctx.batchIds.map((id) => ({ id }));
  const corpusItems = buildCorpusItems(items, claimRows, sectionRows);

  mkdirSync(ctx.workDir, { recursive: true });
  const corpusPath = join(ctx.workDir, "corpus.json");
  writeFileSync(corpusPath, JSON.stringify({ items: corpusItems }, null, 2) + "\n", "utf8");
  ctx.state.corpusPath = corpusPath;
  const withContent = corpusItems.filter((it) => it.claims.length || it.sections.length).length;
  return { corpusPath, items: corpusItems.length, with_content: withContent };
}

async function stepForwardEventExtraction(ctx) {
  const args = ["--input", ctx.state.corpusPath, "--out-dir", ctx.workDir, "--out-basename", "corpus"];
  if (ctx.apply) args.push("--execute");
  runChild("scripts/forward-events/run-extraction.mjs", args);

  if (ctx.apply) {
    const eventsPath = join(ctx.workDir, "corpus.events.json");
    ctx.state.eventsPath = eventsPath;
    try {
      const events = JSON.parse(readFileSync(eventsPath, "utf8"));
      ctx.state.forwardEventsExtracted = Array.isArray(events) ? events.length : 0;
    } catch {
      ctx.state.forwardEventsExtracted = 0;
    }
  }
  return { execute: ctx.apply, events_emitted: ctx.state.forwardEventsExtracted ?? null };
}

async function stepForwardEventApply(ctx) {
  runChild("scripts/turns/apply-extraction-output.mjs", ["--events", ctx.state.eventsPath, "--execute"]);
  return { eventsPath: ctx.state.eventsPath };
}

async function stepAnalyzeCorpus(ctx) {
  const args = ctx.apply ? ["--signals"] : ["--dry", "--signals"];
  runChild("scripts/connections/analyze-corpus.mjs", args);
  return { execute: ctx.apply, signals: true };
}

async function stepDeriveObligations(ctx) {
  const summary = await deriveObligationsMain({ mode: ctx.mode }, ctx.db);
  if (typeof summary?.exitCode === "number" && summary.exitCode !== 0) {
    throw new Error(`derive-obligations: ${summary.note ?? JSON.stringify(summary)}`);
  }
  return summary;
}

/** Mirrors tag-proposals.mjs's own IS_MAIN buildDeps — wiring only, no logic duplicated (the same
 *  connection-signature + created_at column set that file's own header says is kept in lockstep by hand). */
function buildTagProposalsDeps(db) {
  const SIG =
    "id, title, canonical_instrument_key, jurisdiction_iso, jurisdictions, full_brief, " +
    "operational_scenario_tags, compliance_object_tags, topic_tags, created_at";
  return {
    readCorpus: () =>
      db.readAll("intelligence_items", SIG, { match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false) }),
    readExistingOpen: () =>
      db.readAll("integrity_flags", "id, subject_ref, created_by", {
        match: (q) => q.eq("status", "open").like("created_by", `${TAG_NAMESPACE}%`),
      }),
    insertMany: (rows) => db.guardedInsertMany("integrity_flags", rows, { cite: TAG_PROPOSALS_CITE, select: "id" }),
    // IN-CHUNK (2026-09-04): chunked by id (100 per request, ~4 KB URL); one `.in("id", <all>)` GET
    // with an unbounded list is what killed analyze-corpus in backlog applies #24 and #26.
    updateStale: (ids) =>
      db.guardedUpdateByIds(
        "integrity_flags",
        ids,
        {
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: "tag-proposals.mjs (MAINT)",
          resolution_note: `${TAG_NAMESPACE} finding no longer applicable (item now carries connection-signature tags, or fell outside this run's selection scope).`,
        },
        { cite: TAG_PROPOSALS_CITE, select: "id", chunk: 100 },
      ),
  };
}

async function stepTagProposals(ctx) {
  const arg = `ids:${ctx.batchIds.join(",")}`;
  const summary = await tagProposalsMain({ mode: ctx.mode, arg }, buildTagProposalsDeps(ctx.db));
  if (typeof summary?.exitCode === "number" && summary.exitCode !== 0) {
    throw new Error(`tag-proposals: ${summary.note ?? JSON.stringify(summary)}`);
  }
  return summary;
}

/** Mirrors tag-ratification.mjs's own IS_MAIN buildDeps — wiring only, no logic duplicated. */
function buildTagRatificationDeps(db) {
  const FLAG_COLUMNS = "id, subject_ref, created_by, status, resolved_by, resolution_note, description";
  const sb = db.readClient();
  async function pageFlags(status) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("integrity_flags")
        .select(FLAG_COLUMNS)
        .eq("status", status)
        .like("created_by", `${TAG_NAMESPACE}%`)
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(`run-population-flywheel: tag-ratification ${status}-candidate read failed: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return rows;
  }
  return {
    listResolvedCandidates: () => pageFlags("resolved"),
    listOpenCandidates: () => pageFlags("open"),
    readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
    readItem: (id) =>
      sb.from("intelligence_items").select("id, operational_scenario_tags, compliance_object_tags, topic_tags").eq("id", id).maybeSingle(),
    updateItem: async (id, patch) => {
      const res = await db.guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), patch, { cite: TAG_RATIFICATION_CITE });
      return { updated: res.updated, snapshot: res.snapshot };
    },
    resolveFlag: async (id, note) => {
      const res = await db.guardedUpdate(
        "integrity_flags",
        (qb) => qb.eq("id", id),
        { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "apply-tags.mjs", resolution_note: note },
        { cite: TAG_RATIFICATION_CITE },
      );
      return { updated: res.updated, snapshot: res.snapshot };
    },
  };
}

async function stepTagRatification(ctx) {
  const summary = await tagRatificationMain({ mode: ctx.mode, arg: "auto" }, buildTagRatificationDeps(ctx.db));
  if (typeof summary?.exitCode === "number" && summary.exitCode !== 0) {
    throw new Error(`tag-ratification: ${summary.note ?? JSON.stringify(summary)}`);
  }
  return summary;
}

/** Chunked, deduplicated read of every item_cross_references row (any origin) touching `batchIds` on
 *  either endpoint — two chunked .in() reads (source side, target side), merged by row id since
 *  PostgREST's query builder has no single-call "col_a IN (...) OR col_b IN (...)" across two different
 *  columns at this chunk size without an .or() string long enough to risk a URL limit. */
async function fetchEdgeRowsForBatch(readAll, batchIds) {
  const byId = new Map();
  for (const idChunk of chunk(batchIds, 150)) {
    if (!idChunk.length) continue;
    const bySource = await readAll("item_cross_references", "id, source_item_id, target_item_id, origin", {
      match: (q) => q.in("source_item_id", idChunk),
    });
    for (const r of bySource) byId.set(r.id, r);
    const byTarget = await readAll("item_cross_references", "id, source_item_id, target_item_id, origin", {
      match: (q) => q.in("target_item_id", idChunk),
    });
    for (const r of byTarget) byId.set(r.id, r);
  }
  return [...byId.values()];
}

async function stepComputeOutcomes(ctx) {
  if (ctx.state.forwardEventsExtracted === undefined) ctx.state.forwardEventsExtracted = 0;
  if (!ctx.batchIds.length) {
    ctx.state.edgesDiscovered = 0;
    ctx.state.isolatedItems = 0;
    return { edges_discovered: 0, isolated_items: 0, forward_events_extracted: ctx.state.forwardEventsExtracted, edge_rows_read: 0, ids_resolved_by_key: ctx.state.idsResolvedByKey ?? 0 };
  }
  const edgeRows = await fetchEdgeRowsForBatch(ctx.db.readAll, ctx.batchIds);
  const { edges_discovered, isolated_items } = computeCorpusOutcomes(ctx.batchIds, edgeRows);
  ctx.state.edgesDiscovered = edges_discovered;
  ctx.state.isolatedItems = isolated_items;
  return {
    edges_discovered,
    isolated_items,
    forward_events_extracted: ctx.state.forwardEventsExtracted,
    edge_rows_read: edgeRows.length,
    ids_resolved_by_key: ctx.state.idsResolvedByKey ?? 0,
  };
}

async function stepWriteOutcomes(ctx) {
  const payload = {
    run_id: ctx.mintRunId,
    edges_discovered: ctx.state.edgesDiscovered ?? 0,
    forward_events_extracted: ctx.state.forwardEventsExtracted ?? 0,
    isolated_items: ctx.state.isolatedItems ?? 0,
    ids_resolved_by_key: ctx.state.idsResolvedByKey ?? 0,
  };
  mkdirSync(ctx.workDir, { recursive: true });
  const outcomesPath = join(ctx.workDir, "outcomes.json");
  writeFileSync(outcomesPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  runChild("scripts/mint/run-mint-batch.mjs", [
    "--outcomes",
    outcomesPath,
    "--run-id",
    ctx.mintRunId,
    "--harness-runs-dir",
    ctx.mintRunDir,
  ]);
  return payload;
}

async function stepRecordLastTurn(ctx) {
  writeLastTurnDate(ctx.startedAt);
  return { since: ctx.startedAt };
}

const STEP_HANDLERS = Object.freeze({
  discovery: stepDiscovery,
  "corpus-export": stepCorpusExport,
  "forward-event-extraction": stepForwardEventExtraction,
  "forward-event-apply": stepForwardEventApply,
  "analyze-corpus": stepAnalyzeCorpus,
  "derive-obligations": stepDeriveObligations,
  "tag-proposals": stepTagProposals,
  "tag-ratification": stepTagRatification,
  "compute-outcomes": stepComputeOutcomes,
  "write-outcomes": stepWriteOutcomes,
  "record-last-turn": stepRecordLastTurn,
});

// ── the shared per-artifact executor — the ONE code path that runs §8/§9 over one mint-run artifact,
// used by BOTH the normal --mint-run apply/dry path AND every artifact a --backlog apply run processes
// (never two divergent implementations of "how a mint-run artifact gets connected") ────────────────────

/**
 * Run the full ordered §8/§9 step plan (buildFlywheelPlan) over ONE mint-run artifact and return its
 * result. I/O-bearing (child processes + guarded DB calls via `db`) — not unit-tested directly, same
 * discipline as the rest of this file's step handlers (see run-population-flywheel.test.mjs's own
 * header); the PURE logic it drives (step order, skip/write decisions, the gate, backlog selection,
 * hasRecoverableMintedIds' own check below) is fully covered without touching a DB or spawning a process.
 *
 * REFUSES BEFORE ANY I/O (safety net, THE DEFECT this closes [CONFIRMED, 2026-09-04]) when the artifact's
 * own metrics.minted claims items were minted but extractMintedItemIds cannot name any of them
 * (hasRecoverableMintedIds false — mint-run-001/mint-run-005 on this checkout, both predating
 * per_item.item_id). --backlog's own selectBacklogArtifacts already excludes such artifacts, so this
 * never fires on the backlog path in practice — this guard exists for the direct `--mint-run <path>`
 * path, which selectBacklogArtifacts never sees, so nothing else would stop it being pointed at one by
 * hand. Without this guard, batchIds would be [] exactly as it is for a genuinely-zero-minted artifact,
 * buildFlywheelPlan would skip every item-scoped step, and compute-outcomes/write-outcomes would happily
 * write edges_discovered=0/isolated_items=0 — a FALSE record that this artifact is connected, when in
 * truth its items were never even identified, let alone discovered. Failing loud here, before any step
 * runs, is the same "a runtime that ends without triggering its downstream is a defect in the runtime"
 * posture this driver already applies everywhere else — never a silent, wrong "ok".
 * @param {{mintRunPath:string, artifact:object, mode:"dry"|"apply", harnessRunsDir:string, db:object,
 *   startedAt:string}} args
 * @returns {Promise<{mintRunId:string|null, batchIds:string[], ok:boolean, results:object[]}>}
 */
export async function runFlywheelForOneArtifact({ mintRunPath, artifact, mode, harnessRunsDir, db, startedAt }) {
  const apply = mode === "apply";
  const runIdForMessage = artifact?.run_id ?? mintRunPath ?? "(unknown)";

  // Check if artifact has any minted items at all
  if (!hasRecoverableMintedIds(artifact)) {
    throw new Error(
      `run-population-flywheel: ${runIdForMessage}'s own metrics.minted=${Number(artifact?.metrics?.minted ?? 0)} ` +
        "but no item id could be recovered from per_item (it predates the item_id field this driver needs to " +
        "scope discovery/extraction against — see extractMintedItemIds' own header). Refusing rather than " +
        "writing a false zero-valued outcomes record. This artifact needs manual/operator resolution.",
    );
  }

  // Resolve item IDs, handling both modern (item_id) and pre-item_id artifacts (via canonical_instrument_key, etc.)
  const resolution = await resolveMintedItemIds(artifact, db);
  const batchIds = resolution.ids;

  if (resolution.unresolved.length > 0) {
    const unresolvedList = resolution.unresolved
      .map((u) => `${u.entry?.id ?? "(no id)"} via ${u.attemptedKey ?? "no fields"} (${u.matchCount} match${u.matchCount !== 1 ? "es" : ""})`)
      .join(", ");
    throw new Error(
      `run-population-flywheel: ${runIdForMessage} has ${resolution.unresolved.length} minted item(s) that could not be resolved to a single intelligence_items row: ${unresolvedList}. ` +
        "Refusing rather than proceeding with a partial/uncertain batch.",
    );
  }
  const plan = buildFlywheelPlan(mode, batchIds);
  const mintRunDir = resolve(harnessRunsDir || dirname(mintRunPath));
  const mintRunId = artifact.run_id ?? null;
  const workDir = join(SNAPSHOTS_ROOT, `population-flywheel-${mintRunId ?? "unknown"}`);

  console.log(
    `run-population-flywheel: mode=${mode} mint_run=${mintRunId ?? "(no run_id)"} minted_item_ids=${batchIds.length} ids_resolved_by_key=${resolution.idsResolvedByKey}`,
  );

  const ctx = { mode, apply, batchIds, mintRunPath, mintRunDir, mintRunId, workDir, db, state: { idsResolvedByKey: resolution.idsResolvedByKey }, startedAt };

  const results = [];
  let failed = false;
  for (const step of plan) {
    if (step.skip) {
      console.log(`\n[population-flywheel] --- ${step.name}: SKIPPED (${step.skipReason}) ---`);
      results.push({ step: step.name, skipped: true, reason: step.skipReason });
      continue;
    }
    console.log(`\n[population-flywheel] === ${step.name} ===`);
    try {
      const detail = await STEP_HANDLERS[step.name](ctx);
      results.push({ step: step.name, ok: true, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[population-flywheel] STEP FAILED: ${step.name}: ${message}`);
      results.push({ step: step.name, ok: false, error: message });
      failed = true;
      break;
    }
  }

  return { mintRunId, batchIds, ok: !failed, results };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try {
    process.loadEnvFile(resolve(FSI_ROOT, ".env.local"));
  } catch {
    /* CI: env injected */
  }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-population-flywheel: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }
  if (parsed.help) {
    console.log(usage());
    return;
  }

  if (parsed.checkGate) {
    const dir = resolve(parsed.harnessRunsDir || DEFAULT_MINT_HARNESS_RUNS_DIR);
    const { runs } = readRunHistory(dir);
    const result = checkAllSlicesConnected(runs);
    console.log(`[population-flywheel] gate: ${result.reason}`);
    process.exit(result.ok ? 0 : 1);
    return;
  }

  if (parsed.backlog) {
    const dir = resolve(parsed.harnessRunsDir || DEFAULT_MINT_HARNESS_RUNS_DIR);
    const { runs } = readRunHistory(dir);
    const selection = selectBacklogArtifacts(runs, parsed.maxArtifacts);
    console.log(formatBacklogReport(selection));

    if (parsed.mode === "dry") {
      console.log("[population-flywheel] backlog dry run — writes nothing.");
      process.exit(0);
      return;
    }

    if (selection.selected.length === 0) {
      const note = selection.unrecoverable.length
        ? ` (${selection.unrecoverable.length} artifact(s) above need manual/operator resolution — --backlog cannot auto-connect them)`
        : "";
      console.log(`[population-flywheel] backlog: nothing selected — nothing to connect, exiting 0.${note}`);
      process.exit(0);
      return;
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("run-population-flywheel: no DB creds — cannot run --backlog --mode apply here (exit 2).");
      process.exit(2);
      return;
    }

    const { readAll, guardedInsertMany, guardedUpdate, guardedUpdateByIds, readClient } = await import("../lib/db.mjs");
    const db = { readAll, guardedInsertMany, guardedUpdate, guardedUpdateByIds, readClient };

    const artifactResults = [];
    let failed = false;
    for (const { runId, artifact } of selection.selected) {
      console.log(`\n[population-flywheel] ##### backlog artifact ${runId} #####`);
      const mintRunPath = join(dir, `${runId}.json`);
      const startedAt = new Date().toISOString();
      const result = await runFlywheelForOneArtifact({ mintRunPath, artifact, mode: "apply", harnessRunsDir: dir, db, startedAt });
      artifactResults.push(result);
      if (!result.ok) {
        failed = true;
        break; // checkpointed: every artifact before this one already has its outcomes written to disk.
      }
    }

    console.log("\n[population-flywheel] BACKLOG SUMMARY");
    console.log(
      JSON.stringify(
        {
          mode: "apply",
          max_artifacts: parsed.maxArtifacts,
          stale_total: selection.staleTotal,
          selected: selection.selected.length,
          processed: artifactResults.length,
          remaining_after_this_dispatch: selection.remaining + (failed ? selection.selected.length - artifactResults.length : 0),
          unrecoverable_needs_manual_resolution: selection.unrecoverable,
          ok: !failed,
          artifacts: artifactResults,
        },
        null,
        2,
      ),
    );

    process.exit(failed ? 1 : 0);
    return;
  }

  const mintRunPath = resolve(parsed.mintRun);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(mintRunPath, "utf8"));
  } catch (err) {
    console.error(`run-population-flywheel: failed to read --mint-run ${mintRunPath}: ${err.message}`);
    process.exit(1);
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-population-flywheel: no DB creds — cannot run here (exit 2).");
    process.exit(2);
    return;
  }

  const { readAll, guardedInsertMany, guardedUpdate, guardedUpdateByIds, readClient } = await import("../lib/db.mjs");
  const db = { readAll, guardedInsertMany, guardedUpdate, guardedUpdateByIds, readClient };
  const startedAt = new Date().toISOString();

  let outcome;
  try {
    outcome = await runFlywheelForOneArtifact({
      mintRunPath,
      artifact,
      mode: parsed.mode,
      harnessRunsDir: parsed.harnessRunsDir,
      db,
      startedAt,
    });
  } catch (err) {
    // runFlywheelForOneArtifact's own hasRecoverableMintedIds guard lands here directly (thrown before
    // any step ran) — the same "refuse before writing a false outcome" case selectBacklogArtifacts
    // already keeps out of --backlog, surfaced here for the direct --mint-run path, which has no such
    // pre-filter to protect it.
    console.error(`run-population-flywheel: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  const { mintRunId, batchIds, ok, results } = outcome;
  console.log("\n[population-flywheel] SUMMARY");
  console.log(
    JSON.stringify({ mode: parsed.mode, mint_run: mintRunId, minted_item_ids: batchIds.length, ok, results }, null, 2),
  );

  process.exit(ok ? 0 : 1);
}
