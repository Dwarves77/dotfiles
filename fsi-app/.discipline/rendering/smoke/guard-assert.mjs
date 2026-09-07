// Pure guard-assertion helper for the SM smoke specs (Lane GATES-1, 2026-09-02). Split out of
// harness.mjs DELIBERATELY: harness.mjs imports esbuild (an npm package, needed for the actual
// bundling), which makes anything importing harness.mjs ineligible for the no-npm `node --test`
// discipline suite (glob-portability.test.mjs's contract — see run-test-suite.sh's header for the
// pg/batch-primitives precedent this follows). This module imports only the existing, already-
// portable `../assertions.mjs` (itself npm-free), so `assertGuardClean` gets a real red-then-green
// node --test proof (guard-assert.test.mjs) without dragging esbuild into the no-npm suite.
// harness.mjs re-exports this file's exports for spec-file convenience; specs never import this file
// directly — they import from harness.mjs.

import { detectOverflows, findPlaceholderLiterals } from '../assertions.mjs';

/** Run the overflow + placeholder-literal detectors against a `measureGuard()`-shaped result
 *  (`{ measurements, texts }`) and return human-readable failure strings (empty = clean), prefixed
 *  with `label` for the caller's summary. Pure: no DOM, no page, no browser.
 *
 *  `known` (UILISTS lane, 2026-09-06) is an optional allowlist of literal texts the CALLER has
 *  disclosed as real, working-as-designed vocabulary rather than a fabricated/no-data placeholder —
 *  e.g. BAND_ORDER's static "Action" band-tile label (src/lib/urgency/bands.ts), which every one of
 *  this lane's five list surfaces now renders via the shared ListSurfaceShell/BandTile, and which
 *  happens to also be a bare match in source-entry-filter.mjs's HEADER_LITERALS vocabulary (built
 *  for §14 timeline / §3 action-column table HEADERS, unrelated to a band name) — the same
 *  disclosed, confirmed-safe carve-out regulations-rows-smoke.mjs's own
 *  `assertGuardCleanExceptBandLabel` established per-spec before this lane made the label common to
 *  every surface. Empty by default: a caller that does not pass `known` gets the exact behaviour
 *  this function always had. */
export function assertGuardClean(label, { measurements, texts }, known = []) {
  const failures = [];
  const overflows = detectOverflows(measurements);
  if (overflows.length > 0) {
    failures.push(`${label}: horizontal overflow — ${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')}`);
  }
  const knownSet = new Set(known);
  const placeholders = findPlaceholderLiterals(texts).filter((p) => !knownSet.has(p));
  if (placeholders.length > 0) {
    failures.push(`${label}: placeholder literal rendered — ${placeholders.join(', ')}`);
  }
  return failures;
}

export { detectOverflows, findPlaceholderLiterals };
