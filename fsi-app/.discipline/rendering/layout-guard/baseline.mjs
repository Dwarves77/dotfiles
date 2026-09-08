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
// shape: a DATED, PER-ENTRY baseline with an expiry wave (`exemptions-375.mjs`, operator ruling
// 2026-09-07: "the exemption is per-page and dated, not a global guard relaxation, so it fails again
// the moment the artboards land and aren't implemented"). Concretely:
//
//   - a finding already in the baseline is REPORTED and does not fail the build;
//   - ANY OTHER finding fails the build. A new card without its top rule, a new absolute-positioned
//     rail, a new card outside the artboard, a regression on a route this lane fixed - all red, from
//     the moment this lands. That is the operator's "no train lands with a failure", enforced today;
//   - the baseline EXPIRES at BASELINE_EXPIRY_WAVE, read through the same `latestTrainWave()` oracle
//     F25 and the 375 exemptions read. When the landed history reaches that wave the baseline stops
//     applying and all 783 go red, exactly as if this file had been deleted.
//
// It is not a way to keep them. It is a dated debt with a mechanical due date, and the routing table
// in docs/audits/layout-guard-2026-09-08.md names the owning part for every one of them.
//
// Regenerate: node .discipline/rendering/layout-guard/run-layout-guard.mjs --write-baseline
// A lane that fixes its findings reruns that and commits the SHRUNKEN file; the diff is the proof.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { latestTrainWave } from '../../fitness/functions/F25-module-liveness.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * The wave the baseline dies at. Train 61 is landing as this is written, so this is four waves of
 * room for six lanes to clear their own rules - not an open-ended hold.
 */
export const BASELINE_EXPIRY_WAVE = 65;

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
 * Split findings into `baselined` (known, dated, reported) and `blocking` (everything else). Once
 * the landed history reaches BASELINE_EXPIRY_WAVE the baseline is inert and everything blocks.
 */
export function applyBaseline(findings, { latestWave = undefined, repoRoot = getRepoRoot() } = {}) {
  let wave = latestWave;
  if (wave === undefined) {
    try { wave = latestTrainWave(repoRoot); } catch { wave = null; }
  }
  const expired = wave !== null && wave >= BASELINE_EXPIRY_WAVE;
  const { keys, meta } = loadBaseline();
  const baselined = [];
  const blocking = [];
  for (const f of findings) {
    if (!expired && keys.has(findingKey(f))) baselined.push(f);
    else blocking.push(f);
  }
  return { baselined, blocking, expired, latestWave: wave, meta };
}
