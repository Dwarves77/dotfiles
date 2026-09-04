#!/usr/bin/env node
// last-turn-date.mjs — RETIRED as corpus-turn's own selection mechanism (lane TURNREQ, 2026-09-04; see
// docs/runbooks/CORPUS-TURN-RUNBOOK.md and B1-modules.md Gap #2/B2 §1 of the 2026-09-04 wiring audit).
// Was: the tiny state helper for .github/workflows/corpus-turn.yml's default `--since` resolution —
// reading/writing scripts/turns/LAST-TURN.json, a marker file guessing "since when did we last cover the
// corpus" from wall-clock time. Now: corpus-turn.yml selects its default item scope from
// `corpus_turn_requests` (migration 277's trigger-fed ticket queue, via
// scripts/turns/consume-turn-requests.mjs) instead — a real record of WHICH items changed and WHY, not a
// date proxy that (a) had no way to express "this specific item needs a turn" versus "everything since a
// timestamp," and (b) coexisted with the ticket queue as a SECOND "what changed" mechanism that nothing
// wired to the first ever consumed (1,709 open tickets, 0 consumed, before this lane). `--since` on
// corpus-turn.yml is now an EXPLICIT BACKFILL OVERRIDE ONLY (bypasses the ticket queue entirely, scopes by
// date the old way) — it no longer reads this marker for its default; corpus-turn.yml no longer calls
// this file's `--record` path either. One mechanism, not two.
//
// WHY THIS FILE STILL EXISTS (grep-confirmed, 2026-09-04): `scripts/turns/run-population-flywheel.mjs`
// (lane TANDEM's population-turn flywheel driver, its own step 11 "record-last-turn" — outside this
// lane's write set) still imports `writeLastTurnDate` and calls it after a successful apply, "so a later
// corpus-turn dispatch's blank --since does not re-cover" — a purpose that no longer exists now that
// corpus-turn.yml's default path does not read this marker at all. That write is now a residual with no
// reader (grep across fsi-app/scripts, fsi-app/src, and .github/workflows found no remaining
// `readLastTurnDate` call site or `node scripts/turns/last-turn-date.mjs` invocation with no --record
// flag) — a real gap, left for the coordinator: run-population-flywheel.mjs is a different lane's file,
// not this lane's to edit. Deleting THIS file outright would break that still-landed import, so the
// module and its exports stay, unchanged, purely as a library any future caller can still use — not
// wired into corpus-turn.yml's own flow any more.
//
// No args: prints the recorded date to stdout — '1970-01-01' (EPOCH) when no marker exists yet.
// --record <ISO date>: overwrites the marker with the given date.
//
// Exit 0 always for the no-args read path (a missing/corrupt marker degrades to the epoch default, never
// a hard failure — this is bookkeeping, not a gate); --record exits 1 on a bad date argument.
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
