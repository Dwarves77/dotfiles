#!/usr/bin/env node

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
