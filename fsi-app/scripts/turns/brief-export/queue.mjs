// scripts/turns/brief-export/queue.mjs -- the brief-export auto-queue, now database-shaped (lane R22,
// 2026-10-02, coordinator-directed, closing the consequence the previous commit flagged against PR #824 /
// CLAUDE.md rule 17: "no artifact branches or Actions PRs; harness_runs is the durable record").
//
// WHAT CHANGED. run-population-flywheel.mjs's step 12 used to write
// scripts/turns/brief-export/pending/<mint-run-id>.json (a TRACKED file population-turn.yml's own commit
// step pushed to an artifact branch) so a session lane could later read it. That branch push is gone
// (this lane's own prior commit); this module is the replacement shape: the SAME export content (parts,
// each item's claims/sections + full agent_run_searches pool text) rides a `brief-export` family
// harness_runs row's own `inputs_ref` column (migration 331) instead of a file -- the row is landed the
// SAME way every other harness artifact already is (scripts/lib/record-harness-run.mjs, called by
// deliver-artifact-branch.sh, which scans scripts/harness-runs/*/*-run-*.json by construction -- no new
// transport, no new DB writer to register in the shared-writer registry, because record-harness-run.mjs
// already owns every write to harness_runs).
//
// TWO ENDS WIRED:
//   PRODUCER (run-population-flywheel.mjs's stepBriefExport): buildQueueArtifact + readExportedParts
//   below build and write the artifact LOCALLY (writeRunArtifact, same as every sibling family), never a
//   git command, exactly like every other step in that file.
//   CONSUMER (scripts/turns/read-brief-export-queue.mjs, population-report.mjs's "briefs pending" entry):
//   isPendingQueueRow / pendingQueueRows read harness_runs rows (deps-injected, no file at all) to decide
//   what is still waiting for a session lane.
//
// PURE throughout (no I/O beyond the one documented fs read in readExportedParts' thin wrapper), so a
// fixture-driven test proves both ends without a database. "Drained" is a DERIVED read, not a mutation:
// a queue row needs no UPDATE once landed, so no new writer touches harness_runs at all (see
// pendingQueueRows' own header note for the exact, named-honest definition of "drained").
//
// NOT part of this skill's brief-content contract: this module writes a harness-run ARTIFACT (run
// bookkeeping metadata), never an intelligence_items row or a full_brief. No format, no severity label,
// no 26-field YAML contract applies here -- that contract governs session lanes' OWN authored output
// once they read this queue's content, not the queue entry itself.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { buildRunArtifactEnvelope } from "../../lib/run-artifact.mjs";

export const FAMILY = "brief-export";

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * PURE: given the --out path export-corpus-for-extraction.mjs --with-pool-text was called with, and a
 * directory listing (sibling file names, no path prefix), returns the part file names it wrote
 * (<name>-part<N><ext>), in ascending part order. Never throws on an empty or non-matching listing.
 * @param {string} outPath
 * @param {string[]} dirEntries
 * @returns {string[]}
 */
export function partFileNames(outPath, dirEntries) {
  const { name, ext } = parse(outPath);
  const extension = ext || ".json";
  const re = new RegExp(`^${escapeRegExp(name)}-part(\\d+)${escapeRegExp(extension)}$`);
  return (dirEntries ?? [])
    .map((entry) => ({ entry, m: String(entry).match(re) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => x.entry);
}

/**
 * Thin fs wrapper (the ONE I/O boundary in this module): reads every part file written beside outPath,
 * parsed JSON, in part order. Returns [] when the directory or the files are missing (an export that
 * resolved zero ids writes no parts at all -- not an error, see buildBriefExportArgs' own caller).
 * @param {string} outPath
 * @param {{readdirSyncFn?: Function, readFileSyncFn?: Function}} [deps]
 * @returns {object[]}
 */
export function readExportedParts(outPath, { readdirSyncFn = readdirSync, readFileSyncFn = readFileSync } = {}) {
  const dir = dirname(outPath);
  let entries;
  try {
    entries = readdirSyncFn(dir);
  } catch {
    return [];
  }
  const names = partFileNames(outPath, entries);
  return names.map((n) => JSON.parse(readFileSyncFn(join(dir, n), "utf8")));
}

/**
 * Build this batch's brief-export QUEUE artifact -- PURE, no I/O. The export content itself (parts: each
 * item's stored claims/sections + full captured agent_run_searches pool text) rides `inputs_ref`, so the
 * row is self-contained once landed in harness_runs: no file is needed afterward.
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.harnessVersion
 * @param {string} opts.startedAt
 * @param {string|null} opts.mintRunId
 * @param {string[]} opts.ids -- this batch's minted item ids (the ids this queue entry carries).
 * @param {object[]} opts.parts -- readExportedParts' own return shape, zero or more.
 * @param {string|null} [opts.upstreamName]
 * @param {string|null} [opts.upstreamRunId]
 * @param {string|null} [opts.loopRunId]
 * @returns {object}
 */
export function buildQueueArtifact({
  runId,
  harnessVersion,
  startedAt,
  mintRunId,
  ids,
  parts,
  upstreamName = null,
  upstreamRunId = null,
  loopRunId = null,
}) {
  const idList = Array.isArray(ids) ? ids : [];
  const partList = Array.isArray(parts) ? parts : [];

  const perItem = idList.map((id) => ({
    id,
    outcome: partList.length ? "queued" : "not_queued",
    verdict: partList.length
      ? `auto-queued in ${partList.length} part(s)`
      : "no part written this run (export produced nothing for this batch)",
    evidence_refs: [],
    error: null,
  }));

  const defectsFound = [];
  if (idList.length > 0 && partList.length === 0) {
    defectsFound.push({
      description: `${idList.length} id(s) minted this batch but no brief-export part was written`,
      root_cause: "export-corpus-for-extraction.mjs produced zero parts for this batch's ids",
      fix_ref: null,
    });
  }

  // config.auto_queued (true) + config.drained (always false at write time) are what
  // isPendingQueueRow/pendingQueueRows below read; this row is never updated after landing (no writer
  // flips drained -- see pendingQueueRows' own header for why that's a deliberate, named-honest choice,
  // not an oversight).
  const config = {
    mode: "auto",
    selection: "flywheel-batch",
    mint_run_id: mintRunId ?? null,
    upstream_name: upstreamName,
    upstream_run_id: upstreamRunId,
    loop_run_id: loopRunId,
    auto_queued: true,
    drained: false,
  };

  const proposerNotes =
    idList.length === 0
      ? "This batch minted no items; no brief-export queue entry has anything to carry. Recorded anyway " +
        "per MINT-RUNBOOK.md's \"record it every batch, even when zero.\""
      : `Auto-queued by run-population-flywheel.mjs step 12 for ${idList.length} newly-minted item(s), ` +
        `${partList.length} part(s). Read back via scripts/turns/read-brief-export-queue.mjs, never a file.`;

  return buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config,
    inputsRef: partList,
    perItem,
    metrics: { ids_queued: idList.length, parts_written: partList.length },
    defectsFound,
    // full_trace_refs must be non-empty (run-artifact.mjs's own validateRunArtifact, "a run artifact
    // must point at its full raw trace") -- [CONFIRMED by a real writeRunArtifact call during this
    // lane's own dry-run proof, which threw on an empty array before this fix]. This family's own full
    // trace is no longer a separate file (that is the whole point of this module): it is `inputs_ref`
    // on THIS SAME row. Point at this module's own source, the authoritative explanation of where the
    // trace lives, rather than inventing a file path that does not exist (the emit-brief-export-
    // artifact.mjs precedent for a batch-less run points at a runbook; this points at the file that
    // explains why there is no separate trace file at all).
    fullTraceRefs: ["scripts/turns/brief-export/queue.mjs"],
    proposerNotes,
  });
}

/**
 * True when a harness_runs row (or a local run-artifact object, same field names) is an auto-queued
 * brief-export entry that has not been marked drained.
 * @param {{harness_family?: string, config?: object}} row
 * @returns {boolean}
 */
export function isPendingQueueRow(row) {
  return row?.harness_family === FAMILY && row?.config?.auto_queued === true && row?.config?.drained !== true;
}

/**
 * PURE correlation (no DB call here -- the caller reads both row sets and hands them in): a pending
 * queue row is treated as DRAINED once every id it queued appears in SOME later `brief-apply` family
 * row's own `per_item` ids, regardless of that attempt's outcome.
 *
 * [HYPOTHESIS, named rather than silently assumed]: this is id-COVERAGE ("a session lane looked at this
 * item"), not outcome correctness ("this item's brief was successfully applied"). A failed apply
 * (`stale_pool_hash`, a thrown generate step) still counts as drained here, so the queue does not
 * re-offer an item a session lane already attempted and could not apply. A stricter "applied
 * successfully" definition would need io-preflight.mjs's/apply-record-briefs.mjs's own per-step outcome
 * vocabulary (APPLY_STEP_ORDER) read apart from the coverage question; out of scope for this lane, which
 * closes "never a file that needs a branch push," not "perfectly track brief-apply success."
 * @param {object[]} exportRows -- harness_runs rows (or local artifacts) for family "brief-export".
 * @param {object[]} applyRows -- harness_runs rows (or local artifacts) for family "brief-apply".
 * @returns {object[]} the subset of exportRows still pending.
 */
export function pendingQueueRows(exportRows, applyRows) {
  const appliedIds = new Set();
  for (const row of applyRows ?? []) {
    for (const item of row?.per_item ?? []) {
      if (item?.id != null) appliedIds.add(String(item.id));
    }
  }
  return (exportRows ?? []).filter(isPendingQueueRow).filter((row) => {
    const ids = (row.per_item ?? []).map((it) => String(it.id));
    return ids.length === 0 || !ids.every((id) => appliedIds.has(id));
  });
}
