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
import { BUILD_MODE } from '../../governance/build-mode.mjs';

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

/**
 * The baseline is inert from BASELINE_EXPIRY_DATE onward. A pure date comparison: BUILD_MODE does not
 * change this answer, it changes what the callers DO with it (applyBaseline, needsRenewal).
 */
export function isExpired(date = today()) {
  return date >= BASELINE_EXPIRY_DATE;
}

/**
 * BUILD MODE PAUSE (operator ruling 2026-10-08, verbatim: "We are building the fucking site. Make it
 * simple and pause the 7 day rule until the site goes live."; CLAUDE.md rule 16). While BUILD_MODE
 * (.discipline/governance/build-mode.mjs) is true, neither the hard expiry below nor the 7-day renewal
 * warning fails: the baseline keeps covering its entries past BASELINE_EXPIRY_DATE and needsRenewal is
 * false. Everything that measures present state is untouched (a new finding still blocks, the file must
 * still parse, the count may still only shrink). Each function takes an injectable `buildMode` so the
 * pause AND the old behaviour are both provable by attack; flipping BUILD_MODE to false at go-live
 * restores the old behaviour with no other edit.
 */

/** Whole days from `fromDate` to `toDate`, both YYYY-MM-DD; negative when `toDate` is earlier. */
function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

/**
 * The baseline's age and expiry as information, for the log. Null when build mode is off (the gate then
 * speaks through its failures, not a notice). Never a failure itself.
 */
export function baselineAgeNotice({
  date = today(),
  expiryDate = BASELINE_EXPIRY_DATE,
  writtenAt = loadBaseline().meta?.writtenAt,
  buildMode = BUILD_MODE,
} = {}) {
  if (!buildMode) return null;
  const age = typeof writtenAt === 'string' && writtenAt ? `written ${writtenAt}, ${daysBetween(writtenAt, date)} day(s) old` : 'writtenAt unknown';
  const left = daysBetween(date, expiryDate);
  const expiry = left > 0 ? `expiry ${expiryDate} is ${left} day(s) away` : `expiry ${expiryDate} is ${-left} day(s) past`;
  return `layout-guard baseline: ${age}; ${expiry}. The expiry and the ${WARNING_WINDOW_DAYS}-day renewal rule are PAUSED by BUILD_MODE (operator ruling 2026-10-08) until go-live.`;
}

/**
 * RENEWAL WARNING GATE (lane R23 item 4, 2026-10-02, coordinator-directed: "add a check that fails 7
 * days before expiry unless the baseline was re-measured"). The hard cliff above (isExpired) is a
 * deliberate all-or-nothing cutoff: it is correct, but it gives zero advance notice -- a baseline can
 * sit untouched for weeks and then every one of its findings blocks on the exact expiry date, with no
 * warning beforehand that a renewal decision is due. This function is a SEPARATE, earlier-firing check:
 * once `date` is within WARNING_WINDOW_DAYS of BASELINE_EXPIRY_DATE (and the baseline has not already
 * expired -- that is isExpired's own failure mode, not this one's), it fails UNLESS the baseline file's
 * own `writtenAt` falls on or after the window's start, i.e. someone re-ran
 * `run-layout-guard.mjs --write-baseline` (which rewrites `writtenAt` to that run's date) DURING the
 * window -- the mechanical definition of "re-measured" here, deliberately: re-running the guard and
 * recommitting whatever it still finds is the renewal act, whether or not that run also shrank the
 * baseline or moved the expiry date. A missing/unparseable `writtenAt` fails closed (cannot prove a
 * renewal happened, so none is credited).
 */
export const WARNING_WINDOW_DAYS = 7;

/** `dateStr` minus `days`, both YYYY-MM-DD, so the two can compare as strings. */
function daysBefore(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The first date (YYYY-MM-DD) the renewal warning can fire: `windowDays` before `expiryDate`. */
export function warningWindowStart(expiryDate = BASELINE_EXPIRY_DATE, windowDays = WARNING_WINDOW_DAYS) {
  return daysBefore(expiryDate, windowDays);
}

/**
 * True when the baseline is due for renewal RIGHT NOW and nobody has renewed it: `date` is inside the
 * warning window, the baseline is not yet expired (isExpired covers that separately), and `writtenAt`
 * predates the window's own start. Pure and fully injectable (`date`, `expiryDate`, `writtenAt`) so the
 * window boundaries can be proven by attack without waiting on the real clock; the CLI/test default
 * reads the real date and the real baseline.json's `writtenAt`.
 */
export function needsRenewal({ date = today(), expiryDate = BASELINE_EXPIRY_DATE, writtenAt = loadBaseline().meta?.writtenAt, buildMode = BUILD_MODE } = {}) {
  if (buildMode) return false; // paused until go-live (operator ruling 2026-10-08), see the BUILD MODE PAUSE note
  if (isExpired(date)) return false; // the hard cliff is the failure mode past expiry, not this one
  const windowStart = warningWindowStart(expiryDate);
  if (date < windowStart) return false; // not yet in the warning window: nothing due yet
  if (typeof writtenAt !== 'string' || !writtenAt) return true; // no provable renewal: fail closed
  return writtenAt < windowStart; // renewed DURING the window if writtenAt >= windowStart
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
export function applyBaseline(findings, { date = today(), buildMode = BUILD_MODE } = {}) {
  const pastExpiry = isExpired(date);
  // In build mode a past-expiry baseline keeps applying (the pause); `pastExpiry` and `notice` still report it.
  const expired = pastExpiry && !buildMode;
  const notice = baselineAgeNotice({ date, buildMode });
  const { keys, meta } = loadBaseline();
  const baselined = [];
  const blocking = [];
  for (const f of findings) {
    if (!expired && keys.has(findingKey(f))) baselined.push(f);
    else blocking.push(f);
  }
  return { baselined, blocking, expired, pastExpiry, notice, date, expiryDate: BASELINE_EXPIRY_DATE, meta };
}
