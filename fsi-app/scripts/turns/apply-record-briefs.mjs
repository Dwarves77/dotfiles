#!/usr/bin/env node
// apply-record-briefs.mjs - the brief-apply driver (task 3.4, brief-chain build plan Part 3,
// 2026-09-11). CLAUDE.md rule 17 binds: a brief is not done until the flywheel has connected it and the
// harness has recorded the outcome. This is the ONE runtime that turns a validated record-briefs file
// (task 3.2's schema.mjs) into a fully connected item: the injected-synthesis seam (task 3.3), THEN
// section/ground/grow (the same three pipeline steps a model-driven brief runs), THEN the exact same
// per-item flywheel participation apply-staged-update.ts's own substantive path runs, THEN the batch-level
// unscoped population-flywheel steps (analyze-corpus / derive-obligations / tag-proposals /
// tag-ratification). Nothing here is a new judgment: every step is an EXISTING pipeline entry point,
// called in the documented order, each wrapped in its own try/catch so a quarantine or a step failure is
// REPORTED (per_item + defects_found in the run artifact), never hidden and never allowed to mask a
// different step's own outcome (the same independent-step posture mint-item.ts / apply-staged-update.ts
// already hold rule 16(a)/(b)/(d) to).
//
// PER-ITEM STEP ORDER (each its own try/catch, outcome recorded - see APPLY_STEP_ORDER below):
//   1. generate - generateBriefFromInjected(itemId, "brief-apply", {body, metadata, sourcePoolHash,
//                  allowBriefOverwrite}) (task 3.3): writes full_brief + metadata; item_grade becomes
//                  'brief' in the same update (ADR-028). Refuses on a stale pool hash or a non-'record'
//                  grade without --allow-brief-overwrite - this driver pre-empts the stale-hash case in
//                  its own PURE plan builder (buildApplyPlan, below) so an item whose pool has moved on is
//                  never even attempted.
//   2. section - sectionBrief(itemId) (existing): sections; harvestItemTimeline fires inside it
//                  (already unlocked, PR #618).
//   3. ground - groundBrief(itemId, "brief-apply", {injectedLedger: entry.claims}) (existing seam): the
//                  claim ledger is judged by the SAME unchanged gates a model-driven ground call uses;
//                  validate_item_provenance fires via the DB trigger. provenance_status is read back and
//                  reported after this step regardless of ground's own ok/fail - a quarantine is reported,
//                  never hidden.
//   4. grow - growSources(itemId) (existing).
//   5. discovery - rule 16(a), via flywheel-steps.mjs's runDiscoveryStep (the SAME shared function
//                  apply-staged-update.ts's substantive update_item path now calls, task 3.4's own
//                  extraction of that logic - see that module's header).
//   6. forward-events - rule 16(b), via flywheel-steps.mjs's runForwardEventsStep (same shared function).
//   7. compliance-deadline - rule 16(b)/17, syncComplianceDeadlineForItem (existing, DATECHAIN 2026-09-11).
//   8. entities - rule 16(e), linkItemEntities (task 1.1). PRE-FLIGHT NOTE: task 1.1's
//                  src/lib/entities/link-item-entities.mjs lives on lane/w9-part1-2026-09-11, which has not
//                  merged into this lane as of this task. Importing it statically would break this file
//                  for everyone until Part 1 merges, so this step resolves it LAZILY via a dynamic import
//                  inside the step itself (importEntitiesModule, below); when the import fails (module not
//                  present on this branch), the step records the named skip outcome
//                  "entities: module not present on this branch" and moves on - this lane builds and tests
//                  green NOW, and gains the real entity-linking the moment Part 1 merges, with no further
//                  code change here.
//
// THEN, FOR THE WHOLE BATCH (not per item): the four steps buildFlywheelPlan
// (scripts/turns/run-population-flywheel.mjs) calls "the unscoped steps" in this task's own brief - 
// analyze-corpus, derive-obligations, tag-proposals, tag-ratification - via that module's own
// runUnscopedFlywheelSteps(mode, batchIds, db) entry point (added by this task: buildFlywheelPlan itself
// already took a bare `batchIds` array rather than a mint-run artifact, so the missing piece was an ids-
// only EXECUTOR - runFlywheelForOneArtifact is mint-run-shaped and does not fit a brief-apply batch, which
// has no mint-run artifact of its own; see that module's own header on the new export for the full
// reasoning). Reuses the SAME per-step handlers that module already has for the mint-run path - the
// analyze-corpus.mjs/derive-obligations.mjs/tag-proposals.mjs/tag-ratification.mjs invocations themselves
// are UNCHANGED.
//
// Usage:
//   node scripts/turns/apply-record-briefs.mjs --briefs path/to/record-briefs-NNN.json [--execute]
//                                                 [--limit N] [--after-id <uuid>]
//                                                 [--allow-brief-overwrite] [--harness-runs-dir dir]
//                                                 [--io-budget-mb N]
//
// IO BUDGET ACCOUNTING RULE (D32, defect-fix-plan-2026-09-12.md, lane L21 - "nothing meters disk IO"): a
// corpus-wide SQL scan that computed the length of result_content for every stored capture, plus one
// sequential 49-item apply, exhausted the Supabase small-tier disk IO burst budget and hung the database
// for three and a half hours on 2026-09-13. This driver now counts the bytes it reads and stops before it
// would spend past --io-budget-mb (default 400 MB, 0 = unlimited). `bytes_read` for a run = the PRE-CHECK
// bytes (every selected item's pool, read once
// by buildPoolContext, whether or not the item later turns out stale) PLUS, for each item this run actually
// APPLIES, that item's own pool bytes times PIPELINE_POOL_REREADS (see that constant's own comment -
// [HYPOTHESIS]: the canonical pipeline re-reads an item's pool once in generate and again in ground; this
// driver cannot observe reads made INSIDE the pipeline, so the factor is an estimate sizing the per-apply
// check, not a measured count). Before each apply, if bytes_read + poolBytes * PIPELINE_POOL_REREADS would
// exceed the budget, the run stops cleanly: every remaining plan entry (including the one that would have
// tipped it over) is recorded `not_applied_io_budget`, `metrics.stop_reason` is set, and the artifact names
// `metrics.last_item_id` so the next dispatch resumes with `--after-id`. Exit code stays 0 - a clean budget
// stop is not a failure. Dry mode never applies anything, so it reports `bytes_read` as the flat pre-check
// total and predicts where an apply run WOULD stop via `metrics.would_stop_at_item_id`, computed the same
// walk (see runApplyLoop, below) without ever calling applyEntry.
// Dry (default): validates the file (reading each item's CURRENT stored pool text/hash for the validator's
//   own verbatim check and this driver's own stale-hash pre-check), builds the plan, and prints what WOULD
//   run - no pipeline step is called, nothing is written to intelligence_items/item_forward_events/
//   entity_refs/integrity_flags. A run artifact IS still written (every run gets one, dry or apply, per
//   CONVENTION.md) recording the dry plan itself (outcome "would_apply" or "stale_pool_hash" per item).
// --execute: runs the full per-item pipeline for real, in the order above, for every non-stale-hash item
//   the plan selected (bounded by --limit / resumed past --after-id).
// Exit 0 done (dry or apply; a per-item step failure is recorded, never a process exit failure - see
//   "quarantine is reported, never hidden" above) · 1 bad args or a malformed/invalid --briefs file ·
//   2 no DB creds · 3 pre-flight refused (D32, defect-fix-plan-2026-09-12.md, lane L21 - see
//   scripts/turns/io-preflight.mjs: apply mode only, before the first item, refuses on a too-recent prior
//   run or a busy/saturated disk; the run artifact still records the refusal, this is a loud CI-visible
//   stop, never a silent no-op).

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
// @supabase/supabase-js is loaded lazily inside main() (see there): a top-level import made this
// module, and therefore apply-record-briefs.test.mjs, unloadable in the no-npm-ci discipline job
// (PR #640, "Cannot find package '@supabase/supabase-js'"), the same transitive-npm class
// run-test-suite.sh's header names. The pure plan builder and the test stay portable.

import { isMainModule } from "../lib/is-main.mjs";
import { claimRunId, writeRunArtifact, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { validateRecordBriefsFile, RECORD_BRIEFS_SCHEMA_VERSION } from "./record-briefs/schema.mjs";
import { runUnscopedFlywheelSteps } from "./run-population-flywheel.mjs";
import { hashSourcePool } from "../../src/lib/agent/source-pool-hash.mjs";
import { usableCapturesOrdered } from "../../src/lib/forward-events/read-and-extract.mjs";
import { syncComplianceDeadlineForItem } from "../../src/lib/forward-events/compliance-deadline-sync.mjs";
import { runDiscoveryStep, runForwardEventsStep } from "../../src/lib/intake/flywheel-steps.mjs";
import { recordItemChange } from "../lib/changelog.mjs";
import { revalidateTags, itemTag, PUBLIC_ITEMS_TAG } from "../lib/revalidate.mjs";
import {
  preflightOrRefuse,
  recordApplyRunStart,
  recordApplyRunFinish,
  deriveMetricsUrl,
  PREFLIGHT_STOP_REASON,
  DEFAULT_COOLDOWN_MIN,
  DEFAULT_IO_BUSY_MAX,
  DEFAULT_IO_READ_MBPS_MAX,
} from "./io-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
export const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "brief-apply");

// D32 (defect-fix-plan-2026-09-12.md, lane L21): the IO budget defaults and unit conversion. 0 means
// unlimited (never stops) - see runApplyLoop's own header for the full accounting rule.
export const DEFAULT_IO_BUDGET_MB = 400;
export const BYTES_PER_MB = 1024 * 1024;

// canonical-pipeline.ts and flywheel-defect.ts both use "@/..." (tsconfig paths) internal imports, which
// plain node ESM cannot resolve - the SAME reason scripts/_reground/executor-ground.mjs already resolves
// groundBrief through jiti rather than a plain import. LAZY (not top-level await): the pure exports this
// module's own test file drives (parseArgs, buildApplyPlan, APPLY_STEP_ORDER, ...) must load instantly,
// with zero jiti/canonical-pipeline.ts overhead, when nothing in this module actually calls the pipeline - 
// only applyOneEntry (the I/O-bearing per-item executor) ever awaits these, and each is resolved once
// (memoized) for the life of one process.
let _pipelinePromise = null;
function loadPipeline() {
  if (!_pipelinePromise) {
    _pipelinePromise = (async () => {
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(FSI_ROOT, "src") } });
      return jiti.import("../../src/lib/agent/canonical-pipeline.ts");
    })();
  }
  return _pipelinePromise;
}
let _flywheelDefectPromise = null;
function loadFlywheelDefect() {
  if (!_flywheelDefectPromise) {
    _flywheelDefectPromise = (async () => {
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(FSI_ROOT, "src") } });
      return jiti.import("../../src/lib/intake/flywheel-defect.ts");
    })();
  }
  return _flywheelDefectPromise;
}

// PRE-FLIGHT (see module header): resolved lazily, relative to THIS file, so this lane builds and tests
// green whether or not lane/w9-part1-2026-09-11 has merged its src/lib/entities/link-item-entities.mjs.
const ENTITIES_MODULE_SPECIFIER = "../../src/lib/entities/link-item-entities.mjs";
export const ENTITIES_MODULE_NOT_PRESENT = "entities: module not present on this branch";

function usage() {
  return [
    "Usage:",
    "  node scripts/turns/apply-record-briefs.mjs --briefs path/to/record-briefs-NNN.json [--execute]",
    "                                                [--limit N] [--after-id <uuid>]",
    "                                                [--allow-brief-overwrite] [--harness-runs-dir dir]",
    "",
    "Dry (default): validate + plan + print, no database writes (a run artifact is still written to disk,",
    "every run gets one). --execute runs the full per-item pipeline for real (generate -> section ->",
    "ground -> grow -> discovery -> forward-events -> compliance-deadline -> entities), in order, for",
    "every item the plan selected.",
  ].join("\n");
}

/** Pure CLI arg parse/validate - no I/O, no process.exit. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        briefs: { type: "string" },
        execute: { type: "boolean", default: false },
        limit: { type: "string" },
        "after-id": { type: "string" },
        "allow-brief-overwrite": { type: "boolean", default: false },
        "harness-runs-dir": { type: "string" },
        "io-budget-mb": { type: "string" },
        "cooldown-min": { type: "string" },
        "io-busy-max": { type: "string" },
        "io-read-mbps-max": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (values.help) return { ok: true, help: true };
  if (!values.briefs) return { ok: false, error: "--briefs <path.json> is required." };

  let limit = null;
  if (values.limit !== undefined) {
    const n = Number.parseInt(values.limit, 10);
    if (!Number.isInteger(n) || n < 0 || String(n) !== values.limit.trim()) {
      return { ok: false, error: `--limit must be a non-negative integer (got ${JSON.stringify(values.limit)}).` };
    }
    limit = n;
  }

  // D32 (defect-fix-plan-2026-09-12.md, lane L21): default 400 MB, 0 means unlimited. Validated the SAME
  // way --limit is (a strict non-negative integer string, no trailing garbage).
  let ioBudgetMb = DEFAULT_IO_BUDGET_MB;
  if (values["io-budget-mb"] !== undefined) {
    const n = Number.parseInt(values["io-budget-mb"], 10);
    if (!Number.isInteger(n) || n < 0 || String(n) !== values["io-budget-mb"].trim()) {
      return {
        ok: false,
        error: `--io-budget-mb must be a non-negative integer (got ${JSON.stringify(values["io-budget-mb"])}).`,
      };
    }
    ioBudgetMb = n;
  }

  // D32 part (c): the pre-flight thresholds. cooldownMin is a non-negative integer (minutes); the two
  // disk-sample thresholds are non-negative numbers (a fraction and a MB/s rate, so fractional values are
  // valid input, unlike --limit/--io-budget-mb).
  let cooldownMin = DEFAULT_COOLDOWN_MIN;
  if (values["cooldown-min"] !== undefined) {
    const n = Number.parseInt(values["cooldown-min"], 10);
    if (!Number.isInteger(n) || n < 0 || String(n) !== values["cooldown-min"].trim()) {
      return { ok: false, error: `--cooldown-min must be a non-negative integer (got ${JSON.stringify(values["cooldown-min"])}).` };
    }
    cooldownMin = n;
  }
  let ioBusyMax = DEFAULT_IO_BUSY_MAX;
  if (values["io-busy-max"] !== undefined) {
    const n = Number.parseFloat(values["io-busy-max"]);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `--io-busy-max must be a non-negative number (got ${JSON.stringify(values["io-busy-max"])}).` };
    }
    ioBusyMax = n;
  }
  let ioReadMbpsMax = DEFAULT_IO_READ_MBPS_MAX;
  if (values["io-read-mbps-max"] !== undefined) {
    const n = Number.parseFloat(values["io-read-mbps-max"]);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `--io-read-mbps-max must be a non-negative number (got ${JSON.stringify(values["io-read-mbps-max"])}).` };
    }
    ioReadMbpsMax = n;
  }

  return {
    ok: true,
    help: false,
    briefs: values.briefs,
    execute: values.execute === true,
    limit,
    afterId: values["after-id"] || null,
    allowBriefOverwrite: values["allow-brief-overwrite"] === true,
    harnessRunsDir: values["harness-runs-dir"] || null,
    ioBudgetMb,
    cooldownMin,
    ioBusyMax,
    ioReadMbpsMax,
  };
}

// ── D27 (defect-fix-plan-2026-09-12.md, W9 lane L18): a --briefs path that does not resolve to an
// existing file, or that resolves to a file parsing to ZERO entries, must be a fatal, named refusal
// BEFORE any DB client is built - in both dry and apply mode. Evidence: batch 003 was dispatched with a
// briefs_file value that did not resolve from the workflow's own working directory (fsi-app), so the
// driver read zero entries, planned zero items, and both the dry and the apply run completed GREEN with
// nothing written - the failure was found only by reading the run artifact after the fact. This function
// is PURE (fs access is injected via `deps`, the same injected-fake pattern this module already uses for
// `sb`/`deps` elsewhere), so the refusal is unit-tested directly without a subprocess.
/**
 * Resolve and read a --briefs file, refusing (never guessing) when the path does not exist or the file
 * parses to zero entries. Every refusal message names BOTH the path as given on the command line AND the
 * fully resolved absolute path, so a workflow-relative-path mistake (the D27 evidence: a value that only
 * resolves from the repo root, dispatched from a workflow whose working-directory is fsi-app) is
 * diagnosable from the message alone, with no need to re-derive what the driver actually looked at.
 * @param {string} briefsPathGiven the raw --briefs value, exactly as passed on the command line
 * @param {{existsFn?: (p: string) => boolean, readFileFn?: (p: string, enc: string) => string}} [deps]
 * @returns {{ok: true, resolvedPath: string, raw: object, entries: object[]} | {ok: false, error: string, resolvedPath: string}}
 */
export function resolveBriefsInput(briefsPathGiven, deps = {}) {
  const existsFn = deps.existsFn ?? existsSync;
  const readFileFn = deps.readFileFn ?? readFileSync;
  const resolvedPath = resolve(briefsPathGiven);

  if (!existsFn(resolvedPath)) {
    return {
      ok: false,
      resolvedPath,
      error:
        `--briefs file does not exist. Path as given: ${JSON.stringify(briefsPathGiven)} ; resolved ` +
        `absolute path: ${resolvedPath}`,
    };
  }

  let raw;
  try {
    raw = JSON.parse(readFileFn(resolvedPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      resolvedPath,
      error:
        `failed to read/parse --briefs. Path as given: ${JSON.stringify(briefsPathGiven)} ; resolved ` +
        `absolute path: ${resolvedPath} ; ${err.message}`,
    };
  }

  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  if (entries.length === 0) {
    return {
      ok: false,
      resolvedPath,
      error:
        `--briefs file parses to ZERO entries - refusing (an empty file would silently apply nothing). ` +
        `Path as given: ${JSON.stringify(briefsPathGiven)} ; resolved absolute path: ${resolvedPath}`,
    };
  }

  return { ok: true, resolvedPath, raw, entries };
}

// ── the ordered per-item step plan (pure, no I/O) ───────────────────────────────────────────────────────

export const APPLY_STEP_ORDER = Object.freeze([
  "generate",
  "section",
  "ground",
  "grow",
  "discovery",
  "forward-events",
  "compliance-deadline",
  "entities",
]);

/**
 * The per-item apply plan over a validated record-briefs file's entries. PURE - depends only on `entries`
 * and the caller-supplied `currentHashByItemId` (a fresh read of each item's CURRENT stored pool hash, via
 * hashSourcePool - the SAME function export-corpus-for-extraction.mjs stamps with and
 * generateBriefFromInjected re-checks against at write time), so order, --after-id/--limit selection, and
 * the stale-hash pre-emptive skip are all independently testable without touching a DB.
 *
 * skip-on-stale-hash: when the entry's own `source_pool_hash` no longer matches the item's CURRENT stored
 * pool hash, this driver never even calls generateBriefFromInjected for that item - it would refuse
 * anyway (task 3.3's own "stale pool" gate), so pre-empting it here means the run artifact records ONE
 * honest "stale_pool_hash" outcome instead of a step-by-step cascade of downstream no-ops. An item whose
 * id is absent from `currentHashByItemId` (the caller could not read a pool for it at all) is treated as
 * NOT stale here - the real generate call will refuse it on its own terms (e.g. "item not found") if that
 * is genuinely the problem; this plan builder never guesses a verdict it cannot support from what it was
 * given.
 * @param {Array<{item_id:string, source_pool_hash:string}>} entries validateRecordBriefsFile's own
 *   `entries` output
 * @param {{currentHashByItemId?: Record<string,string>, limit?: number|null, afterId?: string|null}} [opts]
 * @returns {Array<{itemId:string, entry:object, skip:boolean, skipReason:string|null, steps:string[]}>}
 */
export function buildApplyPlan(entries, opts = {}) {
  const { currentHashByItemId = {}, limit = null, afterId = null } = opts;
  const list = Array.isArray(entries) ? entries : [];

  let selected = list;
  if (afterId) {
    const idx = selected.findIndex((e) => e?.item_id === afterId);
    selected = idx === -1 ? selected : selected.slice(idx + 1);
  }
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    selected = selected.slice(0, limit);
  }

  return selected.map((entry) => {
    const itemId = entry?.item_id;
    const currentHash = currentHashByItemId[itemId];
    const staleHash = typeof currentHash === "string" && currentHash !== entry?.source_pool_hash;
    if (staleHash) {
      return {
        itemId,
        entry,
        skip: true,
        skipReason:
          `stale pool: recorded source_pool_hash (${entry?.source_pool_hash}) does not match the item's ` +
          `current stored pool hash (${currentHash}) - the lane read pool text that no longer matches what ` +
          "is stored; generateBriefFromInjected would refuse this on its own terms, so this plan skips it " +
          "before any step runs.",
        steps: [],
      };
    }
    return { itemId, entry, skip: false, skipReason: null, steps: [...APPLY_STEP_ORDER] };
  });
}

// ── I/O helpers (not unit-tested directly - same discipline as run-population-flywheel.mjs's own step
// handlers; the PURE logic they feed, buildApplyPlan above, is fully covered without touching a DB) ──────

/** This item's CURRENT stored pool, in the exact `{url, text}` shape hashSourcePool/generateBriefFromInjected
 *  use (usableCapturesOrdered's 200-char floor + a result_url presence filter - the SAME filter task 3.1's
 *  export and task 3.3's write site both apply, so this driver's own pre-check hash is computed the
 *  identical way the write site will recompute it), PLUS the bytes this read actually fetched (D32,
 *  defect-fix-plan-2026-09-12.md, lane L21) - Buffer.byteLength of every row's result_content, including
 *  rows below the 200-char usable-capture floor, since they were read off the wire regardless of whether
 *  usableCapturesOrdered's own filter later excludes them from the pool text. This is the measurable IO
 *  unit the run's own io-budget accounting (see module header) is built on.
 *  @param {object} sb @param {string} itemId @returns {Promise<{pool: Array<{url:string,text:string}>, bytes:number}>} */
async function readCurrentPool(sb, itemId) {
  const { data: rows, error } = await sb
    .from("agent_run_searches")
    .select("result_url, result_content, result_index")
    .eq("intelligence_item_id", itemId);
  if (error) throw new Error(`agent_run_searches read failed for ${itemId}: ${error.message}`);
  const allRows = rows ?? [];
  const bytes = allRows.reduce((sum, r) => sum + Buffer.byteLength(r?.result_content ?? "", "utf8"), 0);
  const pool = usableCapturesOrdered(allRows)
    .filter((r) => typeof r.result_url === "string")
    .map((r) => ({ url: r.result_url, text: r.result_content }));
  return { pool, bytes };
}

/** Builds the three maps the rest of this driver needs from one pass over each item's current pool:
 *  `poolTextByItemId` (validateRecordBriefsFile's own FACT-verbatim check input), `currentHashByItemId`
 *  (buildApplyPlan's stale-hash pre-check input), and `poolBytesByItemId` (D32: the pre-check IO-budget
 *  input runApplyLoop's own accounting rule starts from - see module header). One read per item, not one
 *  per concern - the same rows feed all three maps. @param {object} sb @param {string[]} itemIds */
async function buildPoolContext(sb, itemIds) {
  const poolTextByItemId = {};
  const currentHashByItemId = {};
  const poolBytesByItemId = {};
  for (const itemId of itemIds) {
    const { pool, bytes } = await readCurrentPool(sb, itemId);
    poolTextByItemId[itemId] = pool.map((p) => p.text).join("\n\n");
    currentHashByItemId[itemId] = hashSourcePool(pool);
    poolBytesByItemId[itemId] = bytes;
  }
  return { poolTextByItemId, currentHashByItemId, poolBytesByItemId };
}

/** Dynamic import of task 1.1's entity-linking writer - see the module header's PRE-FLIGHT note. Returns
 *  the module's `linkItemEntities` export, or null when the module is not present (never throws for that
 *  specific case; any OTHER import-time error still propagates, since that is a real defect in a module
 *  that DOES exist, not the expected pre-merge gap). `specifier` defaults to the real module path; the
 *  test file overrides it with a deliberately nonexistent path to exercise the absent-module branch on
 *  its own terms, independent of whether Part 1 has actually merged onto this branch. */
export async function importLinkItemEntities(specifier = ENTITIES_MODULE_SPECIFIER) {
  try {
    const mod = await import(specifier);
    return mod.linkItemEntities ?? null;
  } catch (err) {
    if (err && (err.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module/.test(String(err.message ?? "")))) {
      return null;
    }
    throw err;
  }
}

/**
 * Run every per-item step, in order, each its own try/catch, over one plan entry that was NOT skipped.
 * Returns one result per step (`{id: "<itemId>#<step>", outcome, error}`, CONVENTION.md's own per_item
 * shape) plus the item-level facts a caller needs for its own metrics (whether generate succeeded, and the
 * provenance_status read back after grounding - reported REGARDLESS of ground's own ok/fail, "a quarantine
 * is reported, never hidden").
 *
 * FIX ROUND 1 (coordinator, 2026-09-11): every step's real implementation is now an OVERRIDABLE dependency
 * via `deps`, defaulting to the real jiti-loaded pipeline / flywheel-steps.mjs / entities import when not
 * given - the same injected-fake pattern this function already uses for `sb`. This is what lets
 * apply-record-briefs.test.mjs (plain `node --test`, no jiti) drive the FULL 8-step order and outcome
 * vocabulary against pure fakes, deterministically and fast, while the real production call (from `main()`,
 * no `deps` passed) is byte-identical to before this round.
 * @param {{itemId:string, entry:object}} planned
 * @param {{sb:object, allowBriefOverwrite:boolean, batch?:string, batchId?:string|null, deps?: Partial<{
 *   generateBriefFromInjected:Function, sectionBrief:Function, groundBrief:Function, growSources:Function,
 *   recordFlywheelDefect:Function, runDiscoveryStep:Function, runForwardEventsStep:Function,
 *   syncComplianceDeadlineForItem:Function, importLinkItemEntities:Function, recordItemChange:Function
 * }>}} ctx `batchId` (D29, defect-fix-plan-2026-09-12): the record-briefs file's own `batch` field,
 *   threaded through to groundBrief's `opts.batchId` (recorded on every replace-ledger archive's `note`).
 * @returns {Promise<{itemId:string, generated:boolean, provenanceStatus:string|null, steps:Array<{id:string,outcome:string,error:string|null}>}>}
 */
export async function applyOneEntry({ itemId, entry }, { sb, allowBriefOverwrite, batch = "unbatched", batchId = null, deps = {} }) {
  const needsPipeline = !(deps.generateBriefFromInjected && deps.sectionBrief && deps.groundBrief && deps.growSources);
  const pipeline = needsPipeline ? await loadPipeline() : null;
  const generateBriefFromInjected = deps.generateBriefFromInjected ?? pipeline.generateBriefFromInjected;
  const sectionBrief = deps.sectionBrief ?? pipeline.sectionBrief;
  const groundBrief = deps.groundBrief ?? pipeline.groundBrief;
  const growSources = deps.growSources ?? pipeline.growSources;
  const recordFlywheelDefect = deps.recordFlywheelDefect ?? (await loadFlywheelDefect()).recordFlywheelDefect;
  const doDiscoveryStep = deps.runDiscoveryStep ?? runDiscoveryStep;
  const doForwardEventsStep = deps.runForwardEventsStep ?? runForwardEventsStep;
  const doComplianceSync = deps.syncComplianceDeadlineForItem ?? syncComplianceDeadlineForItem;
  const doImportLinkItemEntities = deps.importLinkItemEntities ?? importLinkItemEntities;
  // D23(a): the real implementation talks to item_changelog through the {findExisting, insert}
  // adapter changelog.mjs's own header explains (not a raw client chain) - built here, lazily, only
  // if a test has not already overridden the whole step via `deps.recordItemChange`.
  const doRecordItemChange = deps.recordItemChange ?? recordItemChange;
  const changelogClient = {
    findExisting: async ({ itemId: id, field, batch: b }) => {
      const { data, error } = await sb.from("item_changelog").select("id").eq("item_id", id).eq("field", field).eq("new_value", b).limit(1);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    },
    insert: async (row) => {
      const { error } = await sb.from("item_changelog").insert(row);
      return { error };
    },
  };

  const steps = [];
  const record = (step, outcome, error = null) => {
    steps.push({ id: `${itemId}#${step}`, outcome, error: error ?? null });
  };
  const flywheelDefect = async (subtype, message) => {
    try {
      await recordFlywheelDefect(sb, itemId, subtype, message, { context: "brief-apply" });
    } catch {
      /* best-effort, same posture recordFlywheelDefect's own callers already take */
    }
  };

  // 1. generate ─────────────────────────────────────────────────────────────────────────────────────────
  let generated = false;
  try {
    const r = await generateBriefFromInjected(
      itemId,
      "brief-apply",
      {
        body: entry.body,
        metadata: entry.metadata,
        sourcePoolHash: entry.source_pool_hash,
        allowBriefOverwrite,
      },
      sb,
    );
    generated = r.ok === true;
    record("generate", r.ok ? "generated" : "generate_failed", r.ok ? null : r.detail);
  } catch (e) {
    record("generate", "generate_failed", e instanceof Error ? e.message : String(e));
  }

  // 2. section ──────────────────────────────────────────────────────────────────────────────────────────
  let sectioned = false;
  try {
    const r = await sectionBrief(itemId);
    sectioned = r.ok === true;
    record("section", r.ok ? "sectioned" : "section_failed", r.ok ? null : r.detail);
  } catch (e) {
    record("section", "section_failed", e instanceof Error ? e.message : String(e));
  }

  // 3. ground (injected ledger - the metered acquire-lock gate does not apply, see groundBrief's own
  //    CC-GROUNDING-EXECUTOR SEAM header). D29 (defect-fix-plan-2026-09-12): --allow-brief-overwrite means
  //    this entry's claims ARE the complete, author-checked ledger for the item - replaceLedger:true tells
  //    groundBrief to archive (not keep) a prior claim the entry does not reproduce, per its own
  //    "REPLACE-LEDGER EXCEPTION" doctrine comment (canonical-pipeline.ts / ledger-apply.mjs); batchId
  //    names the record-briefs batch on every archive this ground writes. Without allowBriefOverwrite this
  //    is byte-for-byte today's call. ─────────────────────────────────────────────────────────────────
  let grounded = false;
  try {
    const r = await groundBrief(itemId, "brief-apply", { injectedLedger: entry.claims, replaceLedger: allowBriefOverwrite, batchId });
    grounded = r.ok === true;
    record("ground", r.ok ? "grounded" : "ground_failed", r.ok ? null : r.detail);
  } catch (e) {
    record("ground", "ground_failed", e instanceof Error ? e.message : String(e));
  }

  // provenance_status is read back and reported REGARDLESS of ground's own ok/fail - a quarantine is
  // reported, never hidden.
  let provenanceStatus = null;
  try {
    const { data: it, error } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
    if (error) throw new Error(error.message);
    provenanceStatus = it?.provenance_status ?? null;
    record("provenance-status", provenanceStatus ?? "unknown");
  } catch (e) {
    record("provenance-status", "provenance_status_read_failed", e instanceof Error ? e.message : String(e));
  }

  // changelog (D23(a), defect-fix-plan-2026-09-12.md): a regenerated brief is a customer-visible
  // change - only for a VERIFIED item (a quarantined one has nothing new to show a customer yet).
  // Idempotent per (itemId, "full_brief", batch): a resumed run over the same --briefs file writes
  // nothing a second time (recordItemChange's own idempotency read).
  //
  // FIX ROUND 1 (review-l15.md, C2): gating on `provenanceStatus === "verified"` alone is a false
  // "brief regenerated" claim when THIS run's own generate/section/ground steps all fail while the
  // item was already verified from an earlier, unrelated success - the write must never be decided
  // from the read-back DB status alone. Gate on this run's own step outcomes first: `generated`
  // (generate's own r.ok), `sectioned` (section's own r.ok), `grounded` (ground's own r.ok). Only
  // when all three of THIS run's steps succeeded, AND the read-back status is verified, does a
  // changelog row get written.
  if (generated && sectioned && grounded && provenanceStatus === "verified") {
    try {
      const claimCount = Array.isArray(entry.claims) ? entry.claims.length : 0;
      const r = await doRecordItemChange(changelogClient, {
        itemId,
        field: "full_brief",
        batch,
        severity: entry.metadata?.severity ?? null,
        note: `Batch ${batch}: brief regenerated with ${claimCount} claim(s).`,
        apply: true,
      });
      record("changelog", r.written ? "changelog:written" : "changelog:skipped", r.written ? null : r.reason);
    } catch (e) {
      record("changelog", "changelog_failed", e instanceof Error ? e.message : String(e));
    }
  }

  // 4. grow ─────────────────────────────────────────────────────────────────────────────────────────────
  try {
    const r = await growSources(itemId);
    record("grow", r.ok ? "grown" : "grow_failed", r.ok ? null : r.detail);
  } catch (e) {
    record("grow", "grow_failed", e instanceof Error ? e.message : String(e));
  }

  // 5. discovery (rule 16(a), flywheel-steps.mjs - the SAME shared function apply-staged-update.ts's own
  //    substantive path calls) ──────────────────────────────────────────────────────────────────────────
  try {
    const { written } = await doDiscoveryStep(sb, itemId);
    record("discovery", written > 0 ? `discovery:${written}` : "discovery:0");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await flywheelDefect("discovery", msg);
    record("discovery", "discovery_failed", msg);
  }

  // 6. forward-events (rule 16(b), flywheel-steps.mjs) ─────────────────────────────────────────────────
  try {
    const { attempted, insertedCount, collision, staleRows } = await doForwardEventsStep(sb, itemId);
    if (staleRows.length) {
      await flywheelDefect(
        "stale-events",
        `${staleRows.length} existing item_forward_events row(s) reference a claim/section no longer present: ${staleRows.map((r) => r.id).join(", ")}`,
      );
      record("forward-events-stale", `stale-events:${staleRows.length}`);
    }
    const outcome = attempted === 0 || collision ? "forward-events:0" : `forward-events:${insertedCount}`;
    record("forward-events", outcome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await flywheelDefect("forward-events", msg);
    record("forward-events", "forward-events_failed", msg);
  }

  // 7. compliance-deadline (rule 16(b)/17) ─────────────────────────────────────────────────────────────
  try {
    const cd = await doComplianceSync(sb, itemId);
    record("compliance-deadline", cd.changed ? `compliance-deadline:${cd.value}` : "compliance-deadline:unchanged");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await flywheelDefect("compliance-deadline", msg);
    record("compliance-deadline", "compliance-deadline_failed", msg);
  }

  // 8. entities (rule 16(e), task 1.1 - lazy import, see module header PRE-FLIGHT note) ─────────────────
  try {
    const linkItemEntities = await doImportLinkItemEntities();
    if (!linkItemEntities) {
      record("entities", "entities_skipped_module_not_present", ENTITIES_MODULE_NOT_PRESENT);
    } else {
      const { data: it, error } = await sb
        .from("intelligence_items")
        .select("id, jurisdiction_iso, canonical_instrument_key")
        .eq("id", itemId)
        .single();
      if (error || !it) throw new Error(`intelligence_items re-read for entities failed${error ? `: ${error.message}` : ""}`);
      const r = await linkItemEntities(sb, it);
      const outcome = r.refs > 0 || r.instrumentEntityId ? `entities:${r.refs}${r.instrumentEntityId ? "+instrument" : ""}` : "entities:0";
      record("entities", outcome);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await flywheelDefect("entities", msg);
    record("entities", "entities_failed", msg);
  }

  return { itemId, generated, provenanceStatus, steps };
}

// ── IO budget loop (D32, defect-fix-plan-2026-09-12.md, lane L21) ──────────────────────────────────────

// [HYPOTHESIS]: the canonical pipeline's generate and ground steps each re-read the item's pool once (two
// reads total) - this driver has no visibility into reads made INSIDE canonical-pipeline.ts, so this is an
// estimate sizing the per-apply budget check below, not a measured count. Calibrate from the first metered
// runs (see docs/runbooks/MAINTENANCE-RUNBOOK.md section 57).
export const PIPELINE_POOL_REREADS = 2;
export const IO_BUDGET_STOP_REASON = "io_budget";

/**
 * Runs the per-item apply loop over `plan` (buildApplyPlan's own output), metering bytes read against
 * `ioBudgetBytes` and stopping cleanly before it would be exceeded. Extracted from main() so it is testable
 * without a real database (see the module header's own accounting-rule paragraph for the full rule).
 *
 * Two passes share one budget-walk: PRE-CHECK bytes (every plan entry's pool, read once by
 * buildPoolContext before this function ever runs, whether or not the entry later turns out stale) seed
 * the running total; then, in EXECUTE mode, each non-skipped entry is checked in file order - if applying
 * it (its own pool bytes times PIPELINE_POOL_REREADS) would push the running total past the budget, the
 * run stops: this entry and every remaining one are recorded `not_applied_io_budget`, naming the budget
 * and the bytes already read, `metrics.stop_reason` is set to IO_BUDGET_STOP_REASON, and
 * `metrics.last_item_id` names the last item actually applied (so the next dispatch resumes with
 * `--after-id`). A budget of 0 means unlimited - the check never fires. DRY mode never calls `applyEntry`
 * (every non-skipped entry stays `would_apply`, unchanged); instead it walks the SAME projected-cost
 * simulation to predict `metrics.would_stop_at_item_id` - the item an apply run of this same plan would
 * stop at - while `metrics.bytes_read` stays the flat pre-check total (nothing was actually spent).
 *
 * @param {{plan: Array, execute: boolean, ioBudgetBytes: number, poolBytesByItemId: Record<string,number>,
 *   applyEntry: (planned: object) => Promise<{itemId:string, generated:boolean, provenanceStatus:string|null, steps:Array}>,
 *   log: (msg: string) => void}} args
 * @returns {Promise<{perItem: Array, metrics: object, appliedItemIds: string[], stopped: boolean}>}
 */
export async function runApplyLoop({ plan, execute, ioBudgetBytes, poolBytesByItemId, applyEntry, log }) {
  const list = Array.isArray(plan) ? plan : [];
  const bytesOf = (itemId) => {
    const v = poolBytesByItemId?.[itemId];
    return Number.isFinite(v) ? v : 0;
  };
  const overBudget = (projected) => ioBudgetBytes > 0 && projected > ioBudgetBytes;

  // Pre-check bytes: every plan entry's pool was already read once by buildPoolContext, before this
  // function ever runs, whether or not the entry later turns out stale.
  const precheckBytes = list.reduce((sum, p) => sum + bytesOf(p.itemId), 0);

  // The SAME projected-cost walk drives both the real apply-mode stop AND the dry-mode prediction - find
  // the first non-skipped entry (if any) where applying it would exceed the budget.
  let projectedRunning = precheckBytes;
  let wouldStopAtItemId = null;
  for (const planned of list) {
    if (planned.skip) continue;
    const projected = projectedRunning + bytesOf(planned.itemId) * PIPELINE_POOL_REREADS;
    if (overBudget(projected)) {
      wouldStopAtItemId = planned.itemId;
      break;
    }
    projectedRunning = projected;
  }

  const metrics = {
    skipped_stale_hash: 0,
    applied: 0,
    quarantined: 0,
    generate_failed: 0,
    bytes_read: precheckBytes,
    io_budget_bytes: ioBudgetBytes,
    stop_reason: null,
    last_item_id: null,
    would_stop_at_item_id: wouldStopAtItemId,
  };
  const perItem = [];
  const appliedItemIds = [];

  if (!execute) {
    for (const planned of list) {
      if (planned.skip) {
        metrics.skipped_stale_hash += 1;
        perItem.push({ id: planned.itemId, outcome: "stale_pool_hash", error: planned.skipReason });
        log(`  ${planned.itemId}: SKIP (${planned.skipReason})`);
        continue;
      }
      perItem.push({ id: planned.itemId, outcome: "would_apply", error: null });
      log(`  ${planned.itemId}: would apply (${APPLY_STEP_ORDER.join(" -> ")})`);
    }
    return { perItem, metrics, appliedItemIds, stopped: false };
  }

  let bytesRead = precheckBytes;
  let lastItemId = null;
  let stopped = false;

  for (const planned of list) {
    if (planned.skip) {
      metrics.skipped_stale_hash += 1;
      perItem.push({ id: planned.itemId, outcome: "stale_pool_hash", error: planned.skipReason });
      log(`  ${planned.itemId}: SKIP (${planned.skipReason})`);
      continue;
    }

    if (stopped) {
      perItem.push({
        id: planned.itemId,
        outcome: "not_applied_io_budget",
        error: `io budget ${ioBudgetBytes} byte(s) reached (${bytesRead} byte(s) already read) - not applied.`,
      });
      continue;
    }

    const poolBytes = bytesOf(planned.itemId);
    const projected = bytesRead + poolBytes * PIPELINE_POOL_REREADS;
    if (overBudget(projected)) {
      stopped = true;
      metrics.stop_reason = IO_BUDGET_STOP_REASON;
      const msg = `apply-record-briefs: io budget reached - ${ioBudgetBytes} byte(s) budget, ${bytesRead} byte(s) read, next item would add ~${poolBytes * PIPELINE_POOL_REREADS} byte(s) (pool ${poolBytes} byte(s) x PIPELINE_POOL_REREADS ${PIPELINE_POOL_REREADS}). Stopping before ${planned.itemId}; resume with --after-id ${lastItemId ?? "(none - nothing applied this run)"}.`;
      log(`::warning::${msg}`);
      perItem.push({
        id: planned.itemId,
        outcome: "not_applied_io_budget",
        error: `io budget ${ioBudgetBytes} byte(s) reached (${bytesRead} byte(s) already read) - not applied.`,
      });
      continue;
    }

    const result = await applyEntry(planned);
    bytesRead = projected;
    lastItemId = planned.itemId;
    for (const step of result.steps) perItem.push(step);
    if (!result.generated) {
      metrics.generate_failed += 1;
    } else {
      appliedItemIds.push(result.itemId);
      if (result.provenanceStatus && result.provenanceStatus !== "verified") metrics.quarantined += 1;
      else metrics.applied += 1;
    }
    log(`  ${planned.itemId}: generated=${result.generated} provenance_status=${result.provenanceStatus ?? "(unknown)"}`);
  }

  metrics.bytes_read = bytesRead;
  metrics.last_item_id = lastItemId;
  return { perItem, metrics, appliedItemIds, stopped };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

if (isMainModule(import.meta.url)) await main();

async function main() {
  try {
    process.loadEnvFile(resolve(FSI_ROOT, ".env.local"));
  } catch {
    /* CI: env injected */
  }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-record-briefs: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("apply-record-briefs: no DB creds - cannot run here (exit 2).");
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const runsDir = parsed.harnessRunsDir ?? DEFAULT_HARNESS_RUNS_DIR;
  const config = {
    briefs: parsed.briefs,
    execute: parsed.execute,
    limit: parsed.limit,
    afterId: parsed.afterId,
    allowBriefOverwrite: parsed.allowBriefOverwrite,
    // Fix round 1, finding 5 (review-6.2b.md): RECORD_BRIEFS_SCHEMA_VERSION had no reader anywhere in the
    // codebase -- stamped here so the run artifact records which validator contract judged this batch,
    // without needing a version-comparison gate (validateRecordBriefsFile is re-run fresh every time; this
    // is a durable record for forensics, not a live enforcement check).
    recordBriefsSchemaVersion: RECORD_BRIEFS_SCHEMA_VERSION,
  };
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES["brief-apply"], FSI_ROOT);

  // FIX ROUND 1 (coordinator, 2026-09-11): the run artifact write happens in `finally`, unconditionally,
  // so a thrown error anywhere in the body below (an unguarded Supabase read in buildPoolContext, a
  // throw inside runUnscopedFlywheelSteps, a malformed --briefs file, a validation refusal) still leaves
  // a schema-valid record naming the failure - rule 17: a run that ends without recording its own outcome
  // is a defect in the run, never a note for a coordinator. Mirrors run-mint-batch.mjs's own crash-safety
  // shape exactly: `runId` is claimed first (inside the try, so a claim failure itself still exits
  // cleanly with no artifact, the same rare edge case run-mint-batch.mjs accepts unchanged), every
  // mutable result is declared here so `finally` can see it however far the run got, and there is exactly
  // ONE writeRunArtifact call site for both the success and the failure path.
  let runId = null;
  let perItem = [];
  let metrics = {};
  let appliedItemIds = [];
  let unscoped = null;
  let revalidateResult = null;
  let runError = null;
  // D32 (defect-fix-plan-2026-09-12.md, lane L21, part (c)): hoisted so the `finally` block below can see
  // them however far the run got - the SAME crash-safety shape the block above this one already documents
  // for perItem/metrics/appliedItemIds.
  let sb = null;
  let preflightRefused = null;
  let startedApplyRun = false;

  try {
    runId = claimRunId(runsDir, "brief-apply");

    // D27: refuse a missing/unresolvable path or a zero-entry file HERE, before rawItemIds/sb are ever
    // computed - the same posture in both dry and apply mode, since parsed.execute has not been branched
    // on yet at this point in the function.
    const resolvedInput = resolveBriefsInput(parsed.briefs);
    if (!resolvedInput.ok) {
      throw new Error(resolvedInput.error);
    }
    const raw = resolvedInput.raw;

    const rawItemIds = [...new Set(resolvedInput.entries.map((e) => e?.item_id).filter((id) => typeof id === "string"))];

    // The client is built only when the file names at least one item (lazy: see the import note above).
    // resolveBriefsInput (D27) already refused a zero-entry file above, before this line is ever reached;
    // rawItemIds can still be empty here only when every entry lacks a string item_id, itself a
    // validateRecordBriefsFile refusal a few lines down - so this branch stays defensive, not the primary
    // no-DB-needed path. The no-npm discipline job (where @supabase/supabase-js is not installed, PR #640)
    // still proves this lazy-import path never runs when it need not. Every later use of `sb`
    // (buildPoolContext's reads, applyOneEntry) is reached only through an entry that carries an item_id,
    // so `sb` is never null where it is used.
    if (rawItemIds.length > 0) {
      const { createClient } = await import("@supabase/supabase-js");
      sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
    }
    const { poolTextByItemId, currentHashByItemId, poolBytesByItemId } = await buildPoolContext(sb, rawItemIds);

    const validated = validateRecordBriefsFile(raw, { poolTextByItemId });
    if (!validated.ok) {
      metrics = { file_valid: false, error_count: validated.errors.length };
      console.error(`apply-record-briefs: file failed validation (${validated.errors.length} error(s)):`);
      for (const e of validated.errors) console.error(`  - ${e}`);
      throw new Error(
        `record-briefs file failed validateRecordBriefsFile (${validated.errors.length} error(s)): ${validated.errors.join("; ")}`,
      );
    }

    const plan = buildApplyPlan(validated.entries, {
      currentHashByItemId,
      limit: parsed.limit,
      afterId: parsed.afterId,
    });

    // D23(a): the changelog idempotency key ("has this batch already been recorded for this item")
    // is the --briefs file's own identity, never a fresh per-run id - a resumed run over the SAME
    // file must find its own prior rows, not double-record them.
    const batch = basename(parsed.briefs).replace(/\.json$/i, "");

    console.log(
      `apply-record-briefs: ${plan.length} item(s) selected (of ${validated.entries.length} in file), ` +
        `mode=${parsed.execute ? "apply" : "dry"}.`,
    );

    // D32 (defect-fix-plan-2026-09-12.md, lane L21, part (c)): pre-flight, apply mode only, before the
    // first item, after the plan is built. `sb` is null only in the defensive every-entry-lacked-an-id
    // edge case noted above (D27 already refuses the primary zero-entry case) - pre-flight has nothing to
    // read in that case and is skipped rather than thrown on.
    if (parsed.execute && sb) {
      const metricsUrl = deriveMetricsUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
      const decision = await preflightOrRefuse({
        sb,
        cooldownMinutes: parsed.cooldownMin,
        metricsUrl,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        busyMax: parsed.ioBusyMax,
        readMbpsMax: parsed.ioReadMbpsMax,
        log: (msg) => console.log(msg),
      });
      if (!decision.ok) preflightRefused = decision.reason;
    }

    if (preflightRefused) {
      // Refusal is loud (D32 part (c)): named on stderr AND as a ::error:: line, so the workflow's own
      // apply-record-briefs step fails visibly - never a silent, easy-to-miss log line. The run artifact
      // still gets written (the `finally` block below runs regardless), naming stop_reason so a coordinator
      // reading the artifact after the fact sees exactly why nothing ran.
      console.error(`apply-record-briefs: REFUSED pre-flight: ${preflightRefused}`);
      console.error(`::error::apply-record-briefs: REFUSED pre-flight: ${preflightRefused}`);
      metrics = {
        file_valid: true,
        entries_in_file: validated.entries.length,
        selected: plan.length,
        stop_reason: PREFLIGHT_STOP_REASON,
      };
    } else {
      // D32 part (c): the durable run record. Apply mode only, best-effort (never fails the run) - see
      // io-preflight.mjs's own header. Dry mode writes nothing.
      if (parsed.execute && sb) {
        await recordApplyRunStart(sb, { runId, startedAt }, { log: (msg) => console.log(msg) });
        startedApplyRun = true;
      }

      // D32 part (b): ioBudgetBytes=0 means unlimited (parseArgs already validated ioBudgetMb as a
      // non-negative integer, default DEFAULT_IO_BUDGET_MB).
      const ioBudgetBytes = parsed.ioBudgetMb * BYTES_PER_MB;
      console.log(
        `apply-record-briefs: io budget = ${parsed.ioBudgetMb} MB (${ioBudgetBytes === 0 ? "unlimited" : `${ioBudgetBytes} byte(s)`}).`,
      );

      const loopResult = await runApplyLoop({
        plan,
        execute: parsed.execute,
        ioBudgetBytes,
        poolBytesByItemId,
        // batchId (D29): the record-briefs file's own  field, named on every replace-ledger archive.
        applyEntry: (planned) =>
          applyOneEntry(planned, { sb, allowBriefOverwrite: parsed.allowBriefOverwrite, batch, batchId: raw.batch ?? null }),
        log: (msg) => console.log(msg),
      });
      perItem = loopResult.perItem;
      appliedItemIds = loopResult.appliedItemIds;
      metrics = {
        file_valid: true,
        entries_in_file: validated.entries.length,
        selected: plan.length,
        ...loopResult.metrics,
      };

      // Batch-level unscoped flywheel steps (analyze-corpus / derive-obligations / tag-proposals /
      // tag-ratification), scoped to exactly the items this run actually applied - never in dry mode (there
      // is nothing new to connect; the same "nothing was minted, nothing to connect" posture
      // run-population-flywheel.mjs's own buildFlywheelPlan already documents for its own dry path).
      if (parsed.execute) {
        // Pass the WHOLE ../lib/db.mjs module (task 6.1b, fix D) -- the same object run-population-
        // flywheel.mjs's own main passes to runFlywheelForOneArtifact. The prior five-function subset
        // (readAll/guardedInsertMany/guardedUpdate/guardedUpdateByIds/readClient) omitted readAllByIds,
        // which stepDeriveObligations' own deriveObligationsMain call requires (derive-obligations.mjs's
        // own `main({ mode }, { readAll, readAllByIds, guardedInsertMany })`) -- the pilot's `readAllByIds
        // is not a function` throw from scripts/obligations/derive-obligations.mjs:161. A namespace import
        // exposes every named export as a property, so this can never omit a function a future flywheel
        // step handler starts calling.
        const db = await import("../lib/db.mjs");
        unscoped = await runUnscopedFlywheelSteps("apply", appliedItemIds, db);
        console.log(`apply-record-briefs: unscoped flywheel steps: ${JSON.stringify(unscoped)}`);

        // D23(c): flush the public listing cache and every applied item's own detail cache after a
        // successful apply, the same way apply-mint-batch.mjs's own precedent call does. Best-effort
        // by construction (revalidateTags never throws; a flush failure never fails this apply - see
        // that helper's own header) and logged either way so a missing APP_URL/WORKER_SECRET shows
        // up in the run's own log line rather than as silent staleness.
        revalidateResult = await revalidateTags([PUBLIC_ITEMS_TAG, ...appliedItemIds.map((id) => itemTag(id))], {
          apply: true,
        });
        console.log(`apply-record-briefs: revalidate: ${JSON.stringify(revalidateResult)}`);
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
  } finally {
    // D32 part (c): update THIS run's own brief_apply_runs row however far the run got (a thrown failure
    // included - the same crash-safety posture the run-artifact write below already has). Only when a
    // start row was actually inserted (apply mode, preflight NOT refused, sb present) - dry mode and a
    // refused preflight never started one. Routes through db.mjs's guardedUpdate internally (rule 015) -
    // never needs `sb` itself, it manages its own write client.
    if (startedApplyRun && sb) {
      await recordApplyRunFinish(
        {
          runId,
          finishedAt: new Date().toISOString(),
          bytesRead: metrics.bytes_read ?? 0,
          itemsApplied: metrics.applied ?? 0,
          stopReason: metrics.stop_reason ?? null,
        },
        { log: (msg) => console.log(msg) },
      );
    }
    if (runId) {
      const defectsFound = runError
        ? [
            {
              description: `apply-record-briefs.mjs threw during a run: ${runError.message}`,
              root_cause: runError.stack ?? "",
              fix_ref: null,
            },
          ]
        : [];
      const artifactPath = writeRunArtifact(runsDir, {
        harness_family: "brief-apply",
        harness_version: harnessVersion,
        run_id: runId,
        started_at: startedAt,
        config,
        inputs_ref: [parsed.briefs],
        per_item: perItem,
        metrics: { ...metrics, applied_item_ids: appliedItemIds, unscoped_flywheel: unscoped, revalidate: revalidateResult },
        defects_found: defectsFound,
        full_trace_refs: [parsed.briefs],
        proposer_notes: "",
      });
      console.log(`apply-record-briefs: wrote ${artifactPath}`);
    }
  }

  if (preflightRefused) {
    // The refusal was already logged loudly (stderr + ::error::) above, before the run artifact was
    // written - exit 3 is a distinct code from both "done" (0) and "thrown failure" (1) so a coordinator
    // (or a script) can tell a clean pre-flight stop apart from a real defect.
    process.exit(3);
  }
  if (runError) {
    console.error(`apply-record-briefs: FAILED - ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
