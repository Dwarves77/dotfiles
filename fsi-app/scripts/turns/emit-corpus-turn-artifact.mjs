#!/usr/bin/env node
// emit-corpus-turn-artifact.mjs — corpus-turn's own harness-run artifact writer (lane TURNREQ,
// 2026-09-04). "Emission is CODE" — the same posture run-mint-batch.mjs / run-extraction.mjs /
// screen-worklist.mjs already hold for their own families (PROPOSER-RUNBOOK.md §5, "forgetting is not
// possible"): .github/workflows/corpus-turn.yml calls this after every one of its own steps (its own
// `if: always() && steps.turn.outcome == 'success'` step), dry or apply, so a corpus-turn dispatch that
// selected 0 tickets or ran into a downstream failure STILL leaves a record — "record it every batch,
// even when zero," MINT-RUNBOOK.md's own rule, applied here.
//
// This is NOT a canonical entry point in the same shape run-mint-batch.mjs/run-extraction.mjs are (it
// runs no discovery, no extraction, no analysis — corpus-turn.yml's own earlier steps already did all of
// that, through scripts that belong to OTHER already-governed families or to this family's own
// consume-turn-requests.mjs/export-corpus-for-extraction.mjs). Its only job is: read back what THIS run's
// own earlier steps already produced (a tickets snapshot, a corpus-file path, the freshest forward-events
// artifact this same job wrote) and record it as this family's own CONVENTION.md-shaped artifact.
//
// Reads its configuration entirely from environment variables (CT_*), set by corpus-turn.yml's own
// "Record this turn's own harness-run artifact" step — this script has no CLI flags because it has
// exactly one caller and that caller already has every value as a workflow-step output.
//
// Exit 0 on a successful write. Throws (non-zero exit) on a schema-invalid artifact (writeRunArtifact's
// own fail-closed validation) or an id-claim collision after 50 attempts (claimRunId) — both real
// conditions a coordinator should see, not swallow.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, claimRunId, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "corpus-turn";
const FAMILY_DIR = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY);
const FORWARD_EVENTS_DIR = resolve(FSI_ROOT, "scripts/harness-runs/forward-events");

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * PURE. The per_item rows for this run's artifact, read from a prior --out snapshot written by
 * consume-turn-requests.mjs (buildOutputPayload's own shape). CONVENTION.md's "per_item at scale" rule:
 * a --limit-bounded ticket batch (tens to a couple hundred) is small enough that every item is the
 * natural per_item unit — never invented, never paraphrased, one row per snapshot request row. Returns
 * [] for a missing/unreadable/malformed file (never throws — a per_item gap is honestly empty, not a
 * crash of the whole artifact write).
 * @param {string|null} absPath
 * @param {string} mode - "dry" | "apply"
 * @returns {Array<{id:string, outcome:string, verdict:string, evidence_refs:string[], error:null}>}
 */
export function perItemFromTicketsSnapshot(absPath, mode) {
  if (!absPath || !existsSync(absPath)) return [];
  let payload;
  try {
    payload = JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return [];
  }
  const requests = Array.isArray(payload?.requests) ? payload.requests : [];
  return requests.map((r) => ({
    id: r?.intelligence_item_id || r?.id || "(unknown)",
    outcome: mode === "apply" ? "turned" : "would_turn",
    verdict: r?.reason || "",
    evidence_refs: [],
    error: null,
  }));
}

/**
 * PURE-ish (one directory read). The latest valid-looking forward-events artifact under `dir` — this
 * SAME job's own run-extraction.mjs step self-emits one before this script ever runs, so "latest by
 * filename sort" is this turn's own artifact, not a stale one from a prior turn (run ids are monotonic
 * and claimed atomically — see run-artifact.mjs's claimRunId). Returns { count: null, path: null } for a
 * missing directory, no files, or unparseable JSON — never throws.
 * @param {string} dir
 * @returns {{count: number|null, path: string|null}}
 */
export function latestForwardEventsCount(dir) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return { count: null, path: null };
  }
  if (!files.length) return { count: null, path: null };
  const path = join(dir, files.at(-1));
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const count = typeof parsed?.metrics?.events_emitted === "number" ? parsed.metrics.events_emitted : null;
    return { count, path };
  } catch {
    return { count: null, path: null };
  }
}

/**
 * PURE. Builds the corpus-turn CONVENTION.md-shaped artifact object. Takes `harnessVersion`/`runId`
 * pre-computed (both need real filesystem I/O — hashHarnessVersion reads the governing files, claimRunId
 * touches a claims directory — kept OUT of this function so the shaping logic itself stays unit-testable
 * without a real repo tree or filesystem writes).
 * @param {object} opts
 * @returns {object} a CONVENTION.md-shaped artifact (validate with validateRunArtifact before writing)
 */
export function buildArtifact({
  runId,
  harnessVersion,
  startedAt,
  mode,
  selection,
  limit,
  since,
  ticketCount,
  consumed,
  signals,
  ticketsPathRel,
  corpusPathRel,
  forwardEvents, // { count: number|null, pathRel: string|null }
  perItem,
}) {
  const fullTraceRefs = [];
  const inputsRef = [];
  if (ticketsPathRel) {
    fullTraceRefs.push(ticketsPathRel);
    inputsRef.push(ticketsPathRel);
  }
  if (corpusPathRel) {
    fullTraceRefs.push(corpusPathRel);
    inputsRef.push(corpusPathRel);
  }
  if (forwardEvents?.pathRel) fullTraceRefs.push(forwardEvents.pathRel);
  // Defensive fallback only — every real dispatch produces at least a tickets snapshot (ticket mode, even
  // 0 tickets: consume-turn-requests.mjs always writes --out) or a corpus file (since-override mode:
  // export-corpus-for-extraction.mjs always writes --out, even for 0 matched items). This branch exists
  // so writeRunArtifact's fail-closed "full_trace_refs must be non-empty" check has somewhere real to
  // point even in a configuration this script did not anticipate, never so it can be relied on in practice.
  if (fullTraceRefs.length === 0) fullTraceRefs.push("docs/runbooks/CORPUS-TURN-RUNBOOK.md");

  return {
    harness_family: "corpus-turn",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    config: {
      mode,
      selection,
      limit: limit ? Number(limit) : null,
      since: since || null,
      signals: !!signals,
    },
    inputs_ref: inputsRef,
    per_item: perItem,
    metrics: {
      tickets_selected: Number(ticketCount) || 0,
      forward_events_extracted: forwardEvents?.count ?? null,
      consumed: !!consumed,
    },
    defects_found: [],
    full_trace_refs: fullTraceRefs,
    proposer_notes: "",
  };
}

if (IS_MAIN) main();

function main() {
  const mode = process.env.CT_MODE || "dry";
  const selection = process.env.CT_SELECTION || "since";
  const limit = process.env.CT_LIMIT || null;
  const since = process.env.CT_SINCE || null;
  const ticketCount = process.env.CT_TICKET_COUNT || "0";
  const consumed = process.env.CT_CONSUMED === "true";
  const signals = process.env.CT_SIGNALS === "true";
  const startedAt = process.env.CT_STARTED_AT || new Date().toISOString();
  const hasScope = process.env.CT_HAS_SCOPE === "true";

  const ticketsPathEnv = process.env.CT_TICKETS_PATH || null; // fsi-app-relative, e.g. "scripts/_snapshots/turn-123/tickets.json"
  const corpusPathEnv = process.env.CT_CORPUS_PATH || null; // fsi-app-relative

  const ticketsPathRel = ticketsPathEnv && existsSync(resolve(FSI_ROOT, ticketsPathEnv)) ? ticketsPathEnv : null;
  const corpusPathRel = hasScope && corpusPathEnv && existsSync(resolve(FSI_ROOT, corpusPathEnv)) ? corpusPathEnv : null;

  const perItem = selection === "tickets" ? perItemFromTicketsSnapshot(ticketsPathRel ? resolve(FSI_ROOT, ticketsPathRel) : null, mode) : [];
  const fe = hasScope ? latestForwardEventsCount(FORWARD_EVENTS_DIR) : { count: null, path: null };
  const feRel = fe.path ? `scripts/harness-runs/forward-events/${fe.path.split("/").pop()}` : null;

  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], FSI_ROOT);
  const runId = claimRunId(FAMILY_DIR, FAMILY);

  const artifact = buildArtifact({
    runId,
    harnessVersion,
    startedAt,
    mode,
    selection,
    limit,
    since,
    ticketCount,
    consumed,
    signals,
    ticketsPathRel,
    corpusPathRel,
    forwardEvents: { count: fe.count, pathRel: feRel },
    perItem,
  });

  const outPath = writeRunArtifact(FAMILY_DIR, artifact);
  console.log(`emit-corpus-turn-artifact: wrote ${outPath}`);
}
