#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// not exported (lane DEAD-EXEC, 2026-09-04): used only within this file, as the default `path` argument
// to readLastTurnDate/writeLastTurnDate below — no external caller names it directly, per the wiring
// audit's Appendix B (dead exports, 2026-09-04).
const DEFAULT_MARKER_PATH = resolve(HERE, "LAST-TURN.json");
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
