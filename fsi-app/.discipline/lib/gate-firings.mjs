// Firing records for the governance gates and the consistency runner (lane GATE-8, 2026-10-08, brief item 7: every
// refusal is a logged firing). The fitness runner already writes one record per violation to
// .discipline/out/fitness-firings.json (lane GATE-3) and the rules engine appends to governance/.hook-firings.log
// (lane GATE-1). The memory gate, the closure gate, the invariant-coverage meta-gate and the consistency checks
// (C3, C4, C5) refused through an exit code and a console line only, so a later count of what fired had nothing to
// read. They now write the same record shape the fitness artifact uses, { gate, verdict, file, line, evidence },
// to .discipline/out/governance-firings.json, one array, replaced per gate on each run (a gate that passes clears
// its own records). Logging never changes a verdict: every failure to write is swallowed.
//
// DISCIPLINE_GATE_FIRINGS=<path> redirects the file, =off disables it. Pure builder plus one writer; node builtins.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOVERNANCE_FIRINGS_ARTIFACT = 'governance-firings.json';
export const EVIDENCE_MAX = 200;

const HERE = dirname(fileURLToPath(import.meta.url));

/** Pure: failures [{ file?, path?, line?, location?, message?, reason?, detail? }] to firing records for `gate`. */
export function buildGateFiringRecords(gate, failures) {
  return (failures ?? []).map((f) => ({
    gate,
    verdict: 'fail',
    file: f.file ?? f.path ?? f.location ?? null,
    line: f.line ?? null,
    evidence: String(f.message ?? f.reason ?? f.detail ?? f.id ?? f.table ?? f).replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_MAX),
  }));
}

/** Where the records go. Honours DISCIPLINE_GATE_FIRINGS (a path, or "off" for null). */
export function governanceFiringsPath(env = process.env) {
  if (env.DISCIPLINE_GATE_FIRINGS === 'off') return null;
  if (env.DISCIPLINE_GATE_FIRINGS) return resolve(env.DISCIPLINE_GATE_FIRINGS);
  return join(HERE, '..', 'out', GOVERNANCE_FIRINGS_ARTIFACT);
}

/**
 * Replace this gate's records in the artifact with `records` (an empty array clears them), keeping every other gate's.
 * Returns the path written, or null when logging is off or the write failed. Never throws.
 */
export function writeGateFirings(gate, records, env = process.env) {
  try {
    const path = governanceFiringsPath(env);
    if (path === null) return null;
    let existing = [];
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      if (Array.isArray(parsed)) existing = parsed;
    } catch { /* first write, or an unreadable file: start clean */ }
    const next = [...existing.filter((r) => r?.gate !== gate), ...records];
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return path;
  } catch {
    return null;
  }
}

/** Convenience: build the records for `failures` and write them (clearing the gate when there are none). */
export function recordGateFirings(gate, failures, env = process.env) {
  return writeGateFirings(gate, buildGateFiringRecords(gate, failures), env);
}
