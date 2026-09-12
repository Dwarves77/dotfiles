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
// Dry (default): validates the file (reading each item's CURRENT stored pool text/hash for the validator's
//   own verbatim check and this driver's own stale-hash pre-check), builds the plan, and prints what WOULD
//   run - no pipeline step is called, nothing is written to intelligence_items/item_forward_events/
//   entity_refs/integrity_flags. A run artifact IS still written (every run gets one, dry or apply, per
//   CONVENTION.md) recording the dry plan itself (outcome "would_apply" or "stale_pool_hash" per item).
// --execute: runs the full per-item pipeline for real, in the order above, for every non-stale-hash item
//   the plan selected (bounded by --limit / resumed past --after-id).
// Exit 0 done (dry or apply; a per-item step failure is recorded, never a process exit failure - see
//   "quarantine is reported, never hidden" above) · 1 bad args or a malformed/invalid --briefs file ·
//   2 no DB creds.

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @supabase/supabase-js is loaded lazily inside main() (see there): a top-level import made this
// module, and therefore apply-record-briefs.test.mjs, unloadable in the no-npm-ci discipline job
// (PR #640, "Cannot find package '@supabase/supabase-js'"), the same transitive-npm class
// run-test-suite.sh's header names. The pure plan builder and the test stay portable.

import { isMainModule } from "../lib/is-main.mjs";
import { claimRunId, writeRunArtifact, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { validateRecordBriefsFile } from "./record-briefs/schema.mjs";
import { runUnscopedFlywheelSteps } from "./run-population-flywheel.mjs";
import { hashSourcePool } from "../../src/lib/agent/source-pool-hash.mjs";
import { usableCapturesOrdered } from "../../src/lib/forward-events/read-and-extract.mjs";
import { syncComplianceDeadlineForItem } from "../../src/lib/forward-events/compliance-deadline-sync.mjs";
import { runDiscoveryStep, runForwardEventsStep } from "../../src/lib/intake/flywheel-steps.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
export const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "brief-apply");

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

  return {
    ok: true,
    help: false,
    briefs: values.briefs,
    execute: values.execute === true,
    limit,
    afterId: values["after-id"] || null,
    allowBriefOverwrite: values["allow-brief-overwrite"] === true,
    harnessRunsDir: values["harness-runs-dir"] || null,
  };
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
 *  identical way the write site will recompute it). @param {object} sb @param {string} itemId */
async function readCurrentPool(sb, itemId) {
  const { data: rows, error } = await sb
    .from("agent_run_searches")
    .select("result_url, result_content, result_index")
    .eq("intelligence_item_id", itemId);
  if (error) throw new Error(`agent_run_searches read failed for ${itemId}: ${error.message}`);
  return usableCapturesOrdered(rows ?? [])
    .filter((r) => typeof r.result_url === "string")
    .map((r) => ({ url: r.result_url, text: r.result_content }));
}

/** Builds the two maps the rest of this driver needs from one pass over each item's current pool:
 *  `poolTextByItemId` (validateRecordBriefsFile's own FACT-verbatim check input) and
 *  `currentHashByItemId` (buildApplyPlan's stale-hash pre-check input). One read per item, not one per
 *  concern - the same rows feed both maps. @param {object} sb @param {string[]} itemIds */
async function buildPoolContext(sb, itemIds) {
  const poolTextByItemId = {};
  const currentHashByItemId = {};
  for (const itemId of itemIds) {
    const pool = await readCurrentPool(sb, itemId);
    poolTextByItemId[itemId] = pool.map((p) => p.text).join("\n\n");
    currentHashByItemId[itemId] = hashSourcePool(pool);
  }
  return { poolTextByItemId, currentHashByItemId };
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
 * @param {{sb:object, allowBriefOverwrite:boolean, deps?: Partial<{
 *   generateBriefFromInjected:Function, sectionBrief:Function, groundBrief:Function, growSources:Function,
 *   recordFlywheelDefect:Function, runDiscoveryStep:Function, runForwardEventsStep:Function,
 *   syncComplianceDeadlineForItem:Function, importLinkItemEntities:Function
 * }>}} ctx
 * @returns {Promise<{itemId:string, generated:boolean, provenanceStatus:string|null, steps:Array<{id:string,outcome:string,error:string|null}>}>}
 */
export async function applyOneEntry({ itemId, entry }, { sb, allowBriefOverwrite, deps = {} }) {
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
  try {
    const r = await sectionBrief(itemId);
    record("section", r.ok ? "sectioned" : "section_failed", r.ok ? null : r.detail);
  } catch (e) {
    record("section", "section_failed", e instanceof Error ? e.message : String(e));
  }

  // 3. ground (injected ledger - the metered acquire-lock gate does not apply, see groundBrief's own
  //    CC-GROUNDING-EXECUTOR SEAM header) ───────────────────────────────────────────────────────────────
  try {
    const r = await groundBrief(itemId, "brief-apply", { injectedLedger: entry.claims });
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
  let runError = null;

  try {
    runId = claimRunId(runsDir, "brief-apply");

    let raw;
    try {
      raw = JSON.parse(readFileSync(resolve(parsed.briefs), "utf8"));
    } catch (err) {
      throw new Error(`failed to read/parse --briefs: ${err.message}`);
    }

    const rawItemIds = Array.isArray(raw?.entries)
      ? [...new Set(raw.entries.map((e) => e?.item_id).filter((id) => typeof id === "string"))]
      : [];

    // The client is built only when the file names at least one item (lazy: see the import note above).
    // A file with no entries needs no database at all: its refusal, and the artifact that records it, are
    // proven by the no-npm discipline job where @supabase/supabase-js is not installed (the PR #640 red).
    // Every later use of `sb` (buildPoolContext's reads, applyOneEntry) is reached only through an entry
    // that carries an item_id, so `sb` is never null where it is used.
    let sb = null;
    if (rawItemIds.length > 0) {
      const { createClient } = await import("@supabase/supabase-js");
      sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
    }
    const { poolTextByItemId, currentHashByItemId } = await buildPoolContext(sb, rawItemIds);

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

    console.log(
      `apply-record-briefs: ${plan.length} item(s) selected (of ${validated.entries.length} in file), ` +
        `mode=${parsed.execute ? "apply" : "dry"}.`,
    );

    metrics = {
      file_valid: true,
      entries_in_file: validated.entries.length,
      selected: plan.length,
      skipped_stale_hash: 0,
      applied: 0,
      quarantined: 0,
      generate_failed: 0,
    };

    for (const planned of plan) {
      if (planned.skip) {
        metrics.skipped_stale_hash += 1;
        perItem.push({ id: planned.itemId, outcome: "stale_pool_hash", error: planned.skipReason });
        console.log(`  ${planned.itemId}: SKIP (${planned.skipReason})`);
        continue;
      }
      if (!parsed.execute) {
        perItem.push({ id: planned.itemId, outcome: "would_apply", error: null });
        console.log(`  ${planned.itemId}: would apply (${APPLY_STEP_ORDER.join(" -> ")})`);
        continue;
      }
      const result = await applyOneEntry(planned, { sb, allowBriefOverwrite: parsed.allowBriefOverwrite });
      for (const step of result.steps) perItem.push(step);
      if (!result.generated) {
        metrics.generate_failed += 1;
      } else {
        appliedItemIds.push(result.itemId);
        if (result.provenanceStatus && result.provenanceStatus !== "verified") metrics.quarantined += 1;
        else metrics.applied += 1;
      }
      console.log(
        `  ${planned.itemId}: generated=${result.generated} provenance_status=${result.provenanceStatus ?? "(unknown)"}`,
      );
    }

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
    }
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
  } finally {
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
        metrics: { ...metrics, applied_item_ids: appliedItemIds, unscoped_flywheel: unscoped },
        defects_found: defectsFound,
        full_trace_refs: [parsed.briefs],
        proposer_notes: "",
      });
      console.log(`apply-record-briefs: wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`apply-record-briefs: FAILED - ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
