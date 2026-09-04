#!/usr/bin/env node
// run-population-flywheel.mjs — the population family's own downstream flywheel pass (lane TANDEM,
// 2026-09-04).
//
// THE DEFECT [CONFIRMED] this closes. MINT-RUNBOOK.md §8 ("MANDATORY, post-apply — the flywheel":
// discovery, forward-event extraction, recluster, IN ORDER, before a batch is considered closed) and §9
// (--outcomes enrichment) were documented as a separate, hand-run coordinator pass. population-turn.yml
// itself ended after apply-mint-batch.mjs + propose-tags.mjs --dry — nothing in the runtime ever ran §8,
// and nothing ever computed §9's metrics. Population runs #15-#20 (2026-09-03/04, ~650 items,
// mint-run-017..022) were applied with no flywheel pass and no outcomes: every one of those items carries
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
//     THE GATE (population-turn.yml, apply mode, run BEFORE export-census-rows.mjs): reads the newest
//     mint-run-NNN.json already on the checkout and refuses (exit 1) if a batch that minted items was
//     left without §9 outcomes — i.e. a prior slice this runtime (or a hand-run predecessor) never
//     connected. Pure filesystem check (readRunHistory + checkPriorSliceConnected below) — no DB creds
//     needed, so it runs before "Verify required secrets" in the workflow, cheaply, every apply dispatch.
// Exit 0 done · 1 bad args, a step failed, or the gate refused · 2 no DB creds (a real dry/apply run
//   needs the same NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY pair every guarded script needs;
//   --check-gate never needs DB creds at all).

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

function usage() {
  return [
    "Usage:",
    "  node scripts/turns/run-population-flywheel.mjs --mint-run path/to/mint-run-NNN.json --mode dry|apply",
    "                                                   [--harness-runs-dir dir]",
    "  node scripts/turns/run-population-flywheel.mjs --check-gate [--harness-runs-dir dir]",
  ].join("\n");
}

/**
 * Pure CLI arg parse/validate — no I/O, no process.exit. @param {string[]} argv
 * @returns {{ok:true, help?:true} | {ok:true, checkGate:true, harnessRunsDir:string|null} |
 *   {ok:true, checkGate:false, mintRun:string, mode:"dry"|"apply", harnessRunsDir:string|null} |
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
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (values.help) return { ok: true, help: true };
  if (values["check-gate"]) {
    return { ok: true, checkGate: true, harnessRunsDir: values["harness-runs-dir"] || null };
  }
  if (!values["mint-run"]) {
    return { ok: false, error: "--mint-run <path/to/mint-run-NNN.json> is required (or pass --check-gate)." };
  }
  if (values.mode !== "dry" && values.mode !== "apply") {
    return { ok: false, error: `--mode must be "dry" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  return {
    ok: true,
    checkGate: false,
    mintRun: values["mint-run"],
    mode: values.mode,
    harnessRunsDir: values["harness-runs-dir"] || null,
  };
}

// ── extracting the batch's minted item ids from an (already apply-mint-batch-enriched) mint-run artifact ──

/**
 * Every item this batch actually minted — i.e. apply-mint-batch.mjs's own per_item outcomes
 * "minted_verified" / "minted_unverified" (both carry a real intelligence_items.id; every other
 * outcome — not_applied_*, apply_failed, would_apply* — never has a live row to connect). PURE.
 * In a dry population-turn dispatch the mint-run artifact handed here is exactly what
 * run-mint-batch.mjs --execute wrote (apply-mint-batch.mjs's own dry path never touches the file at
 * all — see that script's header), so per_item carries only "apply_ready"/"validation_failed" and this
 * always returns []. That is not a bug in this function — it is the honest reflection of "nothing was
 * actually minted yet."
 * @param {{per_item?: Array<{outcome?:string, item_id?:string}>}} artifact
 * @returns {string[]} deduplicated item ids, in per_item order
 */
export function extractMintedItemIds(artifact) {
  const perItem = Array.isArray(artifact?.per_item) ? artifact.per_item : [];
  const seen = new Set();
  const ids = [];
  for (const entry of perItem) {
    const isMinted = entry?.outcome === "minted_verified" || entry?.outcome === "minted_unverified";
    if (isMinted && typeof entry?.item_id === "string" && entry.item_id.length > 0 && !seen.has(entry.item_id)) {
      seen.add(entry.item_id);
      ids.push(entry.item_id);
    }
  }
  return ids;
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
    updateStale: (ids) =>
      db.guardedUpdate(
        "integrity_flags",
        (qb) => qb.in("id", ids),
        {
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: "tag-proposals.mjs (MAINT)",
          resolution_note: `${TAG_NAMESPACE} finding no longer applicable (item now carries connection-signature tags, or fell outside this run's selection scope).`,
        },
        { cite: TAG_PROPOSALS_CITE },
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
    return { edges_discovered: 0, isolated_items: 0, forward_events_extracted: ctx.state.forwardEventsExtracted, edge_rows_read: 0 };
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
  };
}

async function stepWriteOutcomes(ctx) {
  const payload = {
    run_id: ctx.mintRunId,
    edges_discovered: ctx.state.edgesDiscovered ?? 0,
    forward_events_extracted: ctx.state.forwardEventsExtracted ?? 0,
    isolated_items: ctx.state.isolatedItems ?? 0,
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
    const newest = runs.at(-1) ?? null;
    const result = checkPriorSliceConnected(newest);
    console.log(`[population-flywheel] gate: ${result.reason}`);
    process.exit(result.ok ? 0 : 1);
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

  const mode = parsed.mode;
  const apply = mode === "apply";
  const batchIds = extractMintedItemIds(artifact);
  const plan = buildFlywheelPlan(mode, batchIds);
  const mintRunDir = resolve(parsed.harnessRunsDir || dirname(mintRunPath));
  const mintRunId = artifact.run_id ?? null;
  const workDir = join(SNAPSHOTS_ROOT, `population-flywheel-${mintRunId ?? "unknown"}`);
  const startedAt = new Date().toISOString();

  console.log(
    `run-population-flywheel: mode=${mode} mint_run=${mintRunId ?? "(no run_id)"} minted_item_ids=${batchIds.length}`,
  );

  const { readAll, guardedInsertMany, guardedUpdate, readClient } = await import("../lib/db.mjs");
  const db = { readAll, guardedInsertMany, guardedUpdate, readClient };

  const ctx = {
    mode,
    apply,
    batchIds,
    mintRunPath,
    mintRunDir,
    mintRunId,
    workDir,
    db,
    state: {},
    startedAt,
  };

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

  console.log("\n[population-flywheel] SUMMARY");
  console.log(
    JSON.stringify(
      { mode, mint_run: mintRunId, minted_item_ids: batchIds.length, ok: !failed, results },
      null,
      2,
    ),
  );

  process.exit(failed ? 1 : 0);
}
