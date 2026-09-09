// SITE-WIDE LAYOUT GUARD - the dated baseline, and why the guard is wired as a gate today rather
// than "when the backlog is clear". Lane layoutguard, 2026-09-08.
//
// THE PROBLEM THIS SOLVES. The operator asked for two things in the same dispatch: "fix the shared
// part responsible, rerun, post the table" AND "add the guard to the 1440/1024 rendering check so no
// train lands with a failure". The first full run found 941 findings across 17 routes; this lane
// fixed the ones that are unambiguously the shared parts' (the frame, the card, the command bar,
// the state note, the card foot) and 783 remain, every one of them in a part another lane is
// actively rewriting - the list row, the filters rail, the fact cell, the operations matrix, the
// admin frame, the detail shell. Fixing them here would be this lane reaching into six other lanes'
// write sets while their worktrees are live, which CLAUDE.md rule 7 forbids.
//
// The two instructions therefore meet in the mechanism this repo already uses for exactly this
// shape: a DATED, PER-ENTRY baseline with a mechanical expiry (`exemptions-375.mjs`, operator ruling
// 2026-09-07: "the exemption is per-page and dated, not a global guard relaxation, so it fails again
// the moment the artboards land and aren't implemented"). Concretely:
//
//   - a finding already in the baseline is REPORTED and does not fail the build;
//   - ANY OTHER finding fails the build. A new card without its top rule, a new absolute-positioned
//     rail, a new card outside the artboard, a regression on a route this lane fixed - all red, from
//     the moment this lands. That is the operator's "no train lands with a failure", enforced today;
//   - the baseline EXPIRES on BASELINE_EXPIRY_DATE, evaluated against the current date. On that day
//     the baseline stops applying and all of them go red, exactly as if this file had been deleted.
//
// It is not a way to keep them. It is a dated debt with a mechanical due date, and the routing table
// in docs/audits/layout-guard-2026-09-08.md names the owning part for every one of them.
//
// Regenerate: node .discipline/rendering/layout-guard/run-layout-guard.mjs --write-baseline
// A lane that fixes its findings reruns that and commits the SHRUNKEN file; the diff is the proof.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * THE DATE THE BASELINE DIES AT. Operator ruling, 2026-09-09, verbatim:
 *
 *   "Guard expiry: extend the layout-guard baseline to 2026-10-15. Land as wave65. Clearing the 622
 *    findings is scheduled after the UI round, as before; do not start it now."
 *
 * A DATE, and the wave threshold is GONE rather than raised. The old mechanism expired the baseline
 * when the landed history reached wave 65, and this train lands as wave 65: that rule would have turned the
 * 622 reported findings into blocking failures on the very commit that carries his extension. Raising
 * the number to 70 would only move that trap five trains along, so the oracle is dropped and the
 * expiry is the day he named, read from the clock.
 *
 * Everything else about the baseline is unchanged: it may only SHRINK, every entry keeps the owning
 * part named in docs/audits/layout-guard-2026-09-08.md, and the findings themselves are untouched
 * because clearing them is scheduled after the UI round.
 */
export const BASELINE_EXPIRY_DATE = '2026-10-15';

/** Today as YYYY-MM-DD, the form BASELINE_EXPIRY_DATE is written in, so the two compare as strings. */
export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** The baseline is inert from BASELINE_EXPIRY_DATE onward. */
export function isExpired(date = today()) {
  return date >= BASELINE_EXPIRY_DATE;
}

/** One finding's identity, stable across runs: rule + route + width + the element it named. */
export function findingKey(f) {
  return `${f.rule}|${f.route}|${f.width}|${f.element}`;
}

export function loadBaseline() {
  const path = join(HERE, 'baseline.json');
  if (!existsSync(path)) return { keys: new Set(), meta: null };
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return { keys: new Set(raw.keys), meta: raw };
}

/**
 * Split findings into `baselined` (known, dated, reported) and `blocking` (everything else). From
 * BASELINE_EXPIRY_DATE onward the baseline is inert and everything blocks. `date` is injectable so
 * the expiry can be proven by attack in both directions rather than waited for.
 */
export function applyBaseline(findings, { date = today() } = {}) {
  const expired = isExpired(date);
  const { keys, meta } = loadBaseline();
  const baselined = [];
  const blocking = [];
  for (const f of findings) {
    if (!expired && keys.has(findingKey(f))) baselined.push(f);
    else blocking.push(f);
  }
  return { baselined, blocking, expired, date, expiryDate: BASELINE_EXPIRY_DATE, meta };
}
