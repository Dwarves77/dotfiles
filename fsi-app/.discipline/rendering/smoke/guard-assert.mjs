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
 *  with `label` for the caller's summary. Pure: no DOM, no page, no browser. */
export function assertGuardClean(label, { measurements, texts }) {
  const failures = [];
  const overflows = detectOverflows(measurements);
  if (overflows.length > 0) {
    failures.push(`${label}: horizontal overflow — ${overflows.map((o) => `${o.name} +${o.overflowBy}px`).join(', ')}`);
  }
  const placeholders = findPlaceholderLiterals(texts);
  if (placeholders.length > 0) {
    failures.push(`${label}: placeholder literal rendered — ${placeholders.join(', ')}`);
  }
  return failures;
}

export { detectOverflows, findPlaceholderLiterals };
