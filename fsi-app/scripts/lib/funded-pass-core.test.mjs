// GOLDEN — funded-pass runner core (sanctioned machine-gated run, operator 2026-07-14). Proves the HALT
// classification and BOTH lock-disarm paths (end + halt) red-then-green, plus divergence + spend-watch.
// Run: node --test scripts/lib/funded-pass-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFailure, withArmedLock, lockArmed, hardDivergence, spendWatchHalt, isRunaway, RUNAWAY_ITEM_USD,
  totalBoundHalt,
} from "./funded-pass-core.mjs";

// ── classifyFailure: item walls continue, mechanism/bug failures halt the run ──
test("classifyFailure: expected external item walls -> named_wall (hold item, continue)", () => {
  for (const [n, m] of [
    ["Error", "fetch failed"], ["Error", "ETIMEDOUT"], ["Error", "getaddrinfo ENOTFOUND egazette.gov.in"],
    ["AnthropicError", "status 529 overloaded"], ["Error", "HTTP 403 from planalto.gov.br"],
    ["Error", "fact_below_authority_floor"], ["Error", "no floor-qualifying primary in pool"],
    ["Error", "grounding produced 0 claims"],
  ]) assert.equal(classifyFailure(n, m), "named_wall", `${n}: ${m}`);
});

test("classifyFailure: gate mechanism failure (lock/hold) -> run_halt", () => {
  assert.equal(classifyFailure("AcquireLockError", "GROUNDING_ACQUIRE_LOCKED"), "run_halt");
  assert.equal(classifyFailure("FetchHoldError", "FETCH_HOLD_ENGAGED"), "run_halt");
});

test("classifyFailure: internal bug -> run_halt (never hide a code defect as an item wall)", () => {
  for (const m of [
    "x.map is not a function", "Cannot read properties of undefined (reading 'id')",
    "column source_span does not exist", "null value violates not-null constraint",
  ]) assert.equal(classifyFailure("TypeError", m), "run_halt", m);
});

// ── withArmedLock: disarm on BOTH paths ──
test("withArmedLock: arms during fn, DISARMS on normal return (unset -> removed)", async () => {
  const env = {};
  let sawArmed = false;
  const r = await withArmedLock(env, async () => { sawArmed = lockArmed(env); return 42; });
  assert.equal(sawArmed, true);      // armed inside
  assert.equal(r, 42);
  assert.equal(lockArmed(env), false); // disarmed after
  assert.equal("GROUNDING_ACQUIRE_ENABLED" in env, false); // key removed (was unset before)
});

test("withArmedLock: DISARMS on throw/halt (the run-level-halt disarm path)", async () => {
  const env = {};
  await assert.rejects(() => withArmedLock(env, async () => { assert.equal(lockArmed(env), true); throw new Error("run-level halt"); }), /run-level halt/);
  assert.equal(lockArmed(env), false); // disarmed even though fn threw
  assert.equal("GROUNDING_ACQUIRE_ENABLED" in env, false);
});

test("withArmedLock: restores a PRE-EXISTING value rather than deleting", async () => {
  const env = { GROUNDING_ACQUIRE_ENABLED: "prior" };
  await withArmedLock(env, async () => { assert.equal(env.GROUNDING_ACQUIRE_ENABLED, "1"); });
  assert.equal(env.GROUNDING_ACQUIRE_ENABLED, "prior"); // restored, not removed
});

// ── hardDivergence: contradictions go HELD, valid targets pass ──
test("hardDivergence: verified item / missing source / skip-portal -> reason; valid quarantined target -> null", () => {
  assert.match(hardDivergence({ cls: "acquire" }, { provenance_status: "verified", source_url: "https://x.gov" }), /already verified/);
  assert.match(hardDivergence({ cls: "acquire" }, { provenance_status: "quarantined", source_url: null }), /no fetchable source_url/);
  assert.match(hardDivergence({ cls: "acquire" }, { provenance_status: "quarantined", source_url: "https://nashville.gov/x" }), /SKIP-flagged/);
  assert.match(hardDivergence({ cls: "acquire" }, { provenance_status: "quarantined", source_url: "https://iea.org/reports/x" }), /SKIP-flagged/);
  assert.equal(hardDivergence({ cls: "acquire" }, { provenance_status: "quarantined", source_url: "https://eur-lex.europa.eu/x" }), null);
  assert.match(hardDivergence({ cls: "resynth" }, null), /not found/);
});

// ── PER-PATH KEYING (portal-guard resynth fix, 2026-07-14): a RESYNTH re-grounds from the HELD pool and never
// fetches source_url, so a portal/paywall (or missing) source_url must NOT hold it — the 5 false-held items. ──
test("hardDivergence: RESYNTH is NOT held on a portal source_url (held pool used, source_url never fetched)", () => {
  for (const url of [
    "https://iea.org/reports/global-hydrogen-review-2025",
    "https://epa.gov/greenvehicles/fast-facts-transportation",
    "https://participate.melbourne.vic.gov.au/amendment-c376",
    "https://nashville.gov/x", "https://gov.uk/guidance/y", "https://support.usgbc.org/hc/z",
  ]) assert.equal(hardDivergence({ cls: "resynth" }, { provenance_status: "quarantined", source_url: url }), null, url);
});

test("hardDivergence: RESYNTH with a missing source_url is NOT held (pool-grounded, not fetch)", () => {
  assert.equal(hardDivergence({ cls: "resynth" }, { provenance_status: "quarantined", source_url: null }), null);
});

test("hardDivergence: verified is held on BOTH paths (never mutate a verified brief)", () => {
  assert.match(hardDivergence({ cls: "resynth" }, { provenance_status: "verified", source_url: "https://iea.org/x" }), /already verified/);
});

// ── spendWatch + runaway ──
test("spendWatchHalt: an unticketed paid row triggers a run-level halt; ticketed rows are clean", () => {
  assert.equal(spendWatchHalt([{ cost: 0.12, itemId: "i1", sourceId: "s1" }], "i1"), null);
  assert.match(spendWatchHalt([{ cost: 0.20, itemId: null, sourceId: null }], "i1"), /unticketed paid row/);
  assert.equal(spendWatchHalt([{ cost: 0, itemId: null, sourceId: null }], "i1"), null); // $0 unattributed row is not a spend
});

test("isRunaway: over the soft per-item cap flags runaway (item held, run continues)", () => {
  assert.equal(isRunaway(0.4), false);
  assert.equal(isRunaway(RUNAWAY_ITEM_USD + 0.01), true);
});

// ── totalBoundHalt: the operator's $ bound is a HARD ceiling ("halt at the bound", 2026-07-14) ──
test("totalBoundHalt: halts once cumulative reaches the bound; clean below it", () => {
  assert.equal(totalBoundHalt(10.5, 20), null);       // under bound -> run continues
  assert.equal(totalBoundHalt(19.99, 20), null);      // just under -> continues
  assert.match(totalBoundHalt(20, 20), /spend bound reached/);      // at the bound -> halt
  assert.match(totalBoundHalt(21.3, 20), /\$21\.3000 >= operator bound \$20\.00/); // over -> halt (one-item overshoot)
});

test("totalBoundHalt: no bound set -> never halts (unbounded/dry)", () => {
  assert.equal(totalBoundHalt(999, null), null);
  assert.equal(totalBoundHalt(999, 0), null);
  assert.equal(totalBoundHalt(999, undefined), null);
});
