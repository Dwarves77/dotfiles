#!/usr/bin/env node
// producer-summary.mjs -- lane M9d (2026-09-20, build plan section 6.1 row M9, brief-m9d Amendment 1
// section C item 1). THE ONE HOME every producer script that producers.yml runs with --apply calls on
// its own exit path, so a producer run leaves a small per-producer record even though no producer writes
// its own harness-run artifact directly (that job belongs to emit-producers-artifact.mjs, item 4 of the
// same amendment, which reads back what every summary this module wrote this run).
//
// WHY A SEPARATE SUMMARY FILE PER PRODUCER, NOT ONE writeRunArtifact CALL PER PRODUCER SCRIPT. Lane M5's
// own report named the alternative (a writeRunArtifact call inlined into each of the eleven producer call
// sites) and rejected it: eleven call sites would be eleven copies of the identical artifact-header block
// and eleven claimed run ids for what producers.yml treats as ONE firing. This module writes a plain,
// small, schema-free JSON summary instead -- no run_id claim, no harness_family, no validation against
// ALLOWED_FAMILIES -- so eleven call sites cost eleven one-line calls, not eleven copies of the harness
// artifact shape. emit-producers-artifact.mjs is the ONE place that turns a directory of these summaries
// into this run's single producers-run-NNN.json.
//
// NO-OP OUTSIDE THE GUARDED WORKFLOW RUN. `PRODUCER_SUMMARY_DIR` is set by producers.yml at job level
// (Amendment 1 item 5); a local dev run of any producer script (no env var set) calls this and gets `null`
// back, writes nothing, and behaves exactly as it did before this lane -- no new required env var, no new
// failure mode for a script run by hand.
//
// PURE PATH/SHAPE LOGIC, UNIT-TESTED (see producer-summary.test.mjs): this module does no argv parsing, no
// process.exit, no network, no DB -- filesystem-only, same discipline as scripts/lib/run-artifact.mjs.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const VALID_STATUS = Object.freeze(["ok", "failed"]);

/**
 * Write one producer's own run summary to `<PRODUCER_SUMMARY_DIR>/<producer>.json`. A no-op (returns
 * `null`, writes nothing) when `PRODUCER_SUMMARY_DIR` is unset -- the local-run posture every producer
 * script already has today, unchanged.
 *
 * @param {{
 *   producer: string,               // this script's own producer name, e.g. "ecb-fx" -- becomes the filename
 *   status: "ok" | "failed",        // "failed" records the M5 assertEdgesAuthored throw (or any other
 *                                   //   fatal condition) BEFORE the caller's own non-zero exit
 *   rows_changed: number,           // rows created + updated this run (0 for a clean no-op run)
 *   edges_authored: number | null,  // derivation_edges authored this run; null for a producer with no
 *                                   //   notion of edges (never 0 standing in for "not applicable")
 *   reason?: string | null,         // required in substance (not shape) when status is "failed" -- the
 *                                   //   thrown error's own message, so a coordinator reading the summary
 *                                   //   sees why without re-reading the workflow log
 *   counts?: object,                // whatever else the producer already computed and printed (created,
 *                                   //   updated, skipped, warnings, ...), carried through verbatim
 * }} args
 * @returns {string | null} the path written, or null when PRODUCER_SUMMARY_DIR is unset
 */
export function writeProducerSummary({ producer, status, rows_changed, edges_authored, reason = null, counts = {} }) {
  const dir = process.env.PRODUCER_SUMMARY_DIR;
  if (!dir) return null;

  if (typeof producer !== "string" || producer.trim().length === 0) {
    throw new Error("writeProducerSummary: producer must be a non-empty string");
  }
  if (!VALID_STATUS.includes(status)) {
    throw new Error(`writeProducerSummary: status must be one of ${JSON.stringify(VALID_STATUS)} (got ${JSON.stringify(status)})`);
  }
  if (typeof rows_changed !== "number" || !Number.isFinite(rows_changed)) {
    throw new Error(`writeProducerSummary: rows_changed must be a finite number (got ${JSON.stringify(rows_changed)})`);
  }
  if (edges_authored !== null && (typeof edges_authored !== "number" || !Number.isFinite(edges_authored))) {
    throw new Error(`writeProducerSummary: edges_authored must be a finite number or null (got ${JSON.stringify(edges_authored)})`);
  }

  const summary = {
    producer,
    status,
    rows_changed,
    edges_authored,
    reason: status === "failed" ? (reason ?? "no reason recorded") : null,
    counts: counts && typeof counts === "object" && !Array.isArray(counts) ? counts : {},
    written_at: new Date().toISOString(),
  };

  const resolvedDir = resolve(dir);
  mkdirSync(resolvedDir, { recursive: true });
  const outPath = join(resolvedDir, `${producer}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  return outPath;
}
