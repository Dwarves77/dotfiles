// L10 - the manifest loader, the deviation register, and the EXPIRY the operator asked for.
// Lane layoutguard, 2026-09-08.
//
// ONE CORRECTION TO HIS FRAMING, stated once and not argued. L10 says the manifest "replaces the
// deviation log that was never written to". The deviation log HAS been written to throughout:
// docs/design/handoff-2026-09-06/DEVIATION-LOG.md carries the ten operator rulings R1-R10 and a
// dated per-lane section for every UI lane in trains 59, 60 and 61. What it cannot do is FAIL A
// BUILD, and that is exactly what the manifest adds. So this file does not replace the log; it
// reads it. `deviationsFromLog()` parses the log's own deviation tables, so a card a lane has
// already justified there does not need a second entry in a second vocabulary, and the two cannot
// drift.
//
// THE EXPIRY IS ENFORCED THE WAY F25 ENFORCES ITS OWN DATES. `activeDeviations()` reads the same
// `latestTrainWave()` oracle F25-module-liveness.mjs and exemptions-375.mjs read: once the landed
// history reaches an entry's `expiryWave`, the entry stops excusing anything and the card fails
// again, exactly as if the entry had been deleted.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestTrainWave } from '../../fitness/functions/F25-module-liveness.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { normaliseCardTitle } from './rules.mjs';
import { generateManifests } from './generate-manifests.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * Deviations declared BY THIS GUARD: a card the build renders that the artboard does not draw, with
 * a reason and a wave it expires at. Every field is required and the test asserts it - an entry
 * with no reason or no expiry is not an escape, it is a hole.
 *
 * Empty at the moment this guard was written: the first run's findings are in the audit document
 * beside this file, routed to the lanes that own the parts, NOT waved through here. A deviation is
 * for a card the operator has ruled may stay, not for a card nobody has fixed yet.
 */
export const CARD_DEVIATIONS = [];

/**
 * Deviations the DEVIATION LOG already carries. The log's per-lane sections use a five-column table
 * (`| Date | Page | Deviation | Reason | Who ruled |`); a row whose Page names a route and whose
 * Deviation names a card is read here as covering that card, so the log and the manifest speak one
 * vocabulary. Rows the parser cannot bind to a route+card are ignored rather than guessed at: an
 * unreadable log row must never silently excuse a card.
 */
export function deviationsFromLog(repoRoot = getRepoRoot()) {
  const path = join(repoRoot, 'docs/design/handoff-2026-09-06/DEVIATION-LOG.md');
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const [, date, page, deviation, reason, who] = cells;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const route = page.startsWith('/') ? page.split(/\s|\(/)[0] : null;
    if (!route) continue;
    const card = /card\s+"([^"]+)"|"([^"]+)"\s+card/i.exec(deviation);
    if (!card) continue;
    out.push({
      route,
      card: card[1] || card[2],
      reason,
      dated: date,
      source: `DEVIATION-LOG.md (${who})`,
      expiryWave: null, // a log row carries no wave; it is read, never given an expiry it does not state
      fromLog: true,
    });
  }
  return out;
}

/** Entries still in force: a `null` expiryWave (a log row) never expires; a numbered one does. */
export function activeDeviations(entries, latestWave) {
  return entries.filter((e) => e.expiryWave === null || latestWave === null || latestWave < e.expiryWave);
}

/** Every deviation in force for one route, from both sources. */
export function deviationsForRoute(route, { repoRoot = getRepoRoot(), latestWave = undefined } = {}) {
  let wave = latestWave;
  if (wave === undefined) {
    try { wave = latestTrainWave(repoRoot); } catch { wave = null; }
  }
  const all = [...CARD_DEVIATIONS, ...deviationsFromLog(repoRoot)];
  return activeDeviations(all, wave).filter((e) => e.route === route);
}

/**
 * The generated manifests. The checked-in `manifests.json` is the fast path; when it is absent the
 * manifests are DERIVED FROM THE ARTBOARDS on the spot rather than the guard silently running with
 * no L10 at all - a missing generated file must never turn a rule off.
 */
export function loadManifests() {
  const path = join(HERE, 'manifests.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  return {
    generatedFrom: 'docs/design/handoff-2026-09-06/Caros Ledge UI System.dc.html',
    generatedAt: 'derived at run time',
    manifests: generateManifests(),
  };
}

/** The manifest for one route, in the shape checkL10 takes. */
export function manifestFor(route, manifests = loadManifests()) {
  const m = manifests?.manifests?.[route];
  if (!m) return null;
  return { artboard: m.artboard, cards: m.cards, rail: m.rail, note: m.note ?? null };
}

export { normaliseCardTitle };
