#!/usr/bin/env node
// last-turn-date.mjs — tiny state helper for .github/workflows/corpus-turn.yml's `--since` resolution.
// Reads/writes scripts/turns/LAST-TURN.json, the corpus-turn family's own "since when did we last cover
// the corpus" marker: plain, readable JSON (one field), committed to the turn branch alongside the
// harness-run artifacts it accompanies (see docs/runbooks/CORPUS-TURN-RUNBOOK.md).
//
// No args: prints the recorded date to stdout — '1970-01-01' (the runbook's own full-backfill value)
// when no marker exists yet, so a first-ever turn naturally covers the whole live corpus rather than
// silently covering nothing.
//
// --record <ISO date>: overwrites the marker with the given date. corpus-turn.yml calls this AFTER a
// successful apply-mode turn, with THAT RUN'S OWN START TIME (not "now" at record time) — so a later
// turn's --since correctly re-covers anything created mid-run; discover-for-items.mjs and
// export-corpus-for-extraction.mjs are both idempotent over their own outputs, so a slightly wide
// re-cover costs nothing (it re-examines a handful of items already handled, not the whole corpus again).
//
// Exit 0 always for the no-args read path (a missing/corrupt marker degrades to the epoch default, never
// a hard failure — this is bookkeeping, not a gate); --record exits 1 on a bad date argument.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MARKER_PATH = resolve(HERE, "LAST-TURN.json");
export const EPOCH = "1970-01-01"; // the runbook's own full-backfill value — see CORPUS-TURN-RUNBOOK.md

/** Read the recorded since-date, or EPOCH when absent/corrupt/unparseable. PURE-ish (one fs read). */
export function readLastTurnDate(path = DEFAULT_MARKER_PATH) {
  if (!existsSync(path)) return EPOCH;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed.since === "string" && !Number.isNaN(Date.parse(parsed.since))) return parsed.since;
    return EPOCH;
  } catch {
    return EPOCH;
  }
}

/** Overwrite the marker with `date` (validated by the caller). */
export function writeLastTurnDate(date, path = DEFAULT_MARKER_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ since: date, recorded_at: new Date().toISOString() }, null, 2) + "\n", "utf8");
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const args = process.argv.slice(2);
  const recordIdx = args.indexOf("--record");
  if (recordIdx !== -1) {
    const date = args[recordIdx + 1];
    if (!date || Number.isNaN(Date.parse(date))) {
      console.error(`last-turn-date: --record requires a parseable ISO date, got ${JSON.stringify(date)}`);
      process.exit(1);
    }
    writeLastTurnDate(date);
    console.log(`last-turn-date: recorded ${date}`);
    process.exit(0);
  }
  console.log(readLastTurnDate());
  process.exit(0);
}
