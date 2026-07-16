#!/usr/bin/env node
// hold-loop.golden.mjs — proves the hold-resolution loop's spend bindings (E3 increment 3, RD-43).
// Source-scan of scripts/hold-loop.mjs (no spend) + the pure bound-halt behavior. Locks: the loop takes the
// run-lock, polls emergencyPaused, gates every item on authoritativeCumulative >= bound, refuses --apply
// without an operator --bound (no standing default), exits on a floor-clearing re-ground and records-attempt
// (cycle-safety) otherwise, is holdings-gated (stored-first re-ground), and runs one pass. RD-43.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { totalBoundHalt } from "../lib/funded-pass-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(resolve(ROOT, "scripts/hold-loop.mjs"), "utf8");
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// spend bindings present
check("takes the run-lock (acquireRunLock) + exits ZERO-spend on a live holder", src.includes("acquireRunLock(") && /lock\.ok/.test(src) && /exit\(6\)/.test(src));
check("polls emergencyPaused between items (flag-flip stop)", /emergencyPaused\(sb\)/.test(src));
check("heartbeats the lock between items", /heartbeatRunLock\(/.test(src));
check("gates every item on the bound (authoritativeCumulative >= bound)", src.includes("cumulativeSince") && /totalBoundHalt\(/.test(src));
check("--apply REQUIRES an operator --bound (no standing default)", /BOUND == null[\s\S]{0,80}exit\(5\)/.test(src) || /REFUSED[\s\S]{0,120}--bound/.test(src));
check("holdings-gate: re-grounds from the STORED pool first (generateBriefFromStored)", src.includes("generateBriefFromStored") && !/forceRefresh/.test(src));
check("no-gain tripwire halts consecutive holds without gain", /no-gain tripwire/.test(src) && /NO_GAIN_HALT/.test(src));
// ladder outcomes: exit on valid, record-attempt (cycle-safety) on fail
check("EXITs the hold on a floor-clearing (valid) re-ground", /v\.valid/.test(src) && /hrqExit\(/.test(src));
check("records a failed attempt otherwise (cycle-safety auto-escalates on the 2nd)", /recordAttempt\(sb[\s\S]{0,60}"failed"/.test(src) && src.includes("escalated"));
check("releases the run-lock in finally", /finally\s*\{[\s\S]{0,120}releaseRunLock\(/.test(src));

// pure bound-halt behavior (reused from funded-pass-core): the ceiling is hard, checked before the next item
check("bound halt fires at/above the ceiling", totalBoundHalt(100, 100) !== null && totalBoundHalt(99.99, 100) === null);
check("no bound set -> never halts (only --apply requires one)", totalBoundHalt(500, null) === null);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
