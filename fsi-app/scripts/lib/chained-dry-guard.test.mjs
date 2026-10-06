// chained-dry-guard.test.mjs, lane CHAINED-DRY-GUARD, 2026-09-29. Proves the rule 16 build-mode
// decision (resolveChainedRunMode) and the fail-closed Supabase read (readScrapeCadence, dependency-
// injected fetch, no real network call).
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test scripts/lib/chained-dry-guard.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { resolveChainedRunMode, readScrapeCadence, parseArgs, isMergeRef } from "./chained-dry-guard.mjs";

// ── resolveChainedRunMode ────────────────────────────────────────────────────────────────────────────

test("workflow_dispatch (explicit dispatch) always keeps its own requested mode, cadence irrelevant", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: "apply", cadence: "off" });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "workflow_dispatch" });
});

test("push event keeps its own requested mode too (only workflow_run is ever forced)", () => {
  const r = resolveChainedRunMode({ eventName: "push", requestedMode: "apply", cadence: "off" });
  assert.equal(r.mode, "apply");
  assert.equal(r.forcedDry, false);
});

test("workflow_run + cadence off (build mode): FORCED to dry regardless of the requested mode", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_run", requestedMode: "apply", cadence: "off" });
  assert.deepEqual(r, { mode: "dry", forcedDry: true, triggerLabel: "workflow_run (forced dry: build mode)" });
});

test("workflow_run + cadence not off: requested mode passes through unchanged", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_run", requestedMode: "apply", cadence: "daily" });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "workflow_run" });
});

test("RED: workflow_run + cadence off must never resolve to apply, no matter what was requested", () => {
  for (const requested of ["apply", "dry", "plan"]) {
    const r = resolveChainedRunMode({ eventName: "workflow_run", requestedMode: requested, cadence: "off" });
    assert.notEqual(r.mode, "apply");
    assert.equal(r.forcedDry, true);
  }
});

// ── --chained: a machine-fired workflow_dispatch (lane CHAINED-DRY-GUARD-2, 2026-09-29) ────────────
// [CONFIRMED live, runs 36612225468/36612325034]: downstream-chain.yml's own F60 explicit-dispatch
// fallback delivers a genuine workflow_dispatch event, not workflow_run, to propagation-drain.yml. The
// original (eventName === "workflow_run") test alone let this slip past the force-dry branch entirely.

test("a PLAIN workflow_dispatch (chained not passed, i.e. an operator's own hand dispatch) is UNCHANGED: never forced, regardless of cadence", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: "apply", cadence: "off" });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "workflow_dispatch" });
});

test("ATTACK: a machine-fired workflow_dispatch (chained: true) requesting apply under cadence off MUST resolve dry", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: "apply", cadence: "off", chained: true });
  assert.equal(r.mode, "dry");
  assert.equal(r.forcedDry, true);
  assert.equal(r.triggerLabel, "workflow_dispatch (forced dry: build mode, chained)");
});

test("a machine-fired workflow_dispatch (chained: true) under a LIVE cadence passes its requested mode through, labelled as chained", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: "apply", cadence: "daily", chained: true });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "workflow_dispatch (chained)" });
});

test("chained: true has NO effect on a non-workflow_dispatch event (workflow_run's own force-dry logic is unchanged)", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_run", requestedMode: "apply", cadence: "off", chained: true });
  assert.deepEqual(r, { mode: "dry", forcedDry: true, triggerLabel: "workflow_run (forced dry: build mode)" });
});

test("RED: a machine-fired workflow_dispatch under cadence off must never resolve to apply, whatever chained_apply_mode-style requested value was passed", () => {
  for (const requested of ["apply", "dry", "plan"]) {
    const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: requested, cadence: "off", chained: true });
    assert.notEqual(r.mode, "apply");
    assert.equal(r.forcedDry, true);
  }
});

// ── readScrapeCadence (dependency-injected fetch, fail-closed) ──────────────────────────────────────

test("readScrapeCadence: reads scrape_cadence from a successful response", async () => {
  const fakeFetch = async (url, opts) => {
    assert.match(url, /system_state\?select=scrape_cadence&id=eq\.true/);
    assert.equal(opts.headers.apikey, "test-key");
    return { ok: true, json: async () => [{ scrape_cadence: "daily" }] };
  };
  const cadence = await readScrapeCadence("https://example.supabase.co", "test-key", fakeFetch);
  assert.equal(cadence, "daily");
});

test("readScrapeCadence: empty row array fails closed to off", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => [] });
  const cadence = await readScrapeCadence("https://example.supabase.co", "test-key", fakeFetch);
  assert.equal(cadence, "off");
});

test("readScrapeCadence: a non-ok response fails closed to off", async () => {
  const fakeFetch = async () => ({ ok: false, json: async () => { throw new Error("should not be called"); } });
  const cadence = await readScrapeCadence("https://example.supabase.co", "test-key", fakeFetch);
  assert.equal(cadence, "off");
});

test("readScrapeCadence: a thrown network error fails closed to off, never throws", async () => {
  const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
  await assert.doesNotReject(async () => {
    const cadence = await readScrapeCadence("https://example.supabase.co", "test-key", fakeFetch);
    assert.equal(cadence, "off");
  });
});

test("readScrapeCadence: missing url or key fails closed to off without calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, json: async () => [{ scrape_cadence: "daily" }] }; };
  assert.equal(await readScrapeCadence("", "test-key", fakeFetch), "off");
  assert.equal(await readScrapeCadence("https://example.supabase.co", "", fakeFetch), "off");
  assert.equal(called, false);
});

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --event and --requested-mode are both required", () => {
  assert.equal(parseArgs([]).ok, false);
  assert.equal(parseArgs(["--event", "workflow_run"]).ok, false);
  assert.equal(parseArgs(["--requested-mode", "apply"]).ok, false);
});

test("parseArgs: a valid pair parses; chained defaults false when --chained is omitted", () => {
  const r = parseArgs(["--event", "workflow_run", "--requested-mode", "apply"]);
  assert.equal(r.ok, true);
  assert.equal(r.eventName, "workflow_run");
  assert.equal(r.requestedMode, "apply");
  assert.equal(r.chained, false);
});

test("parseArgs: --chained true parses as boolean true", () => {
  const r = parseArgs(["--event", "workflow_dispatch", "--requested-mode", "apply", "--chained", "true"]);
  assert.equal(r.ok, true);
  assert.equal(r.chained, true);
});

test("parseArgs: --chained with any non-'true' string (including the empty-string GitHub Actions renders for a falsy expression) parses as false", () => {
  for (const value of ["false", "", "TRUE", "1"]) {
    const r = parseArgs(["--event", "workflow_dispatch", "--requested-mode", "apply", "--chained", value]);
    assert.equal(r.ok, true);
    assert.equal(r.chained, false);
  }
});

// ── push to master: the merge of a drain batch PR (lane G6-DRAIN, 2026-10-06, coordinator ruling) ───
// An apply workflow carries a push trigger on its own committed batch directory. A merge is a machine
// firing, so under build mode the guard, not the trigger, holds the population ruling.

test("ATTACK: a push to master requesting apply under cadence off MUST resolve dry", () => {
  for (const ref of ["refs/heads/master", "master", "refs/heads/main"]) {
    const r = resolveChainedRunMode({ eventName: "push", requestedMode: "apply", cadence: "off", ref });
    assert.equal(r.mode, "dry", ref);
    assert.equal(r.forcedDry, true, ref);
    assert.equal(r.triggerLabel, "push (forced dry: build mode, merge to master)");
  }
});

test("RED: a push to master under cadence off never resolves to apply, whatever mode was requested", () => {
  for (const requested of ["apply", "dry", "plan"]) {
    const r = resolveChainedRunMode({ eventName: "push", requestedMode: requested, cadence: "off", ref: "refs/heads/master" });
    assert.notEqual(r.mode, "apply");
    assert.equal(r.forcedDry, true);
  }
});

test("a push to master under a LIVE cadence passes its requested mode through, labelled as a merge", () => {
  const r = resolveChainedRunMode({ eventName: "push", requestedMode: "apply", cadence: "weekly", ref: "refs/heads/master" });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "push (merge to master)" });
});

test("a push to an operator request branch (turn/**) or with no ref is unchanged: never forced", () => {
  assert.deepEqual(
    resolveChainedRunMode({ eventName: "push", requestedMode: "apply", cadence: "off", ref: "refs/heads/turn/2026-10-06" }),
    { mode: "apply", forcedDry: false, triggerLabel: "push" },
  );
  assert.deepEqual(
    resolveChainedRunMode({ eventName: "push", requestedMode: "apply", cadence: "off" }),
    { mode: "apply", forcedDry: false, triggerLabel: "push" },
  );
});

test("a ref passed on a workflow_dispatch changes nothing", () => {
  const r = resolveChainedRunMode({ eventName: "workflow_dispatch", requestedMode: "apply", cadence: "off", ref: "refs/heads/master" });
  assert.deepEqual(r, { mode: "apply", forcedDry: false, triggerLabel: "workflow_dispatch" });
});

test("isMergeRef: master and main only, bare or qualified; nothing that merely contains them", () => {
  assert.equal(isMergeRef("refs/heads/master"), true);
  assert.equal(isMergeRef("main"), true);
  for (const bad of ["", undefined, null, "refs/heads/turn/master", "refs/heads/master2", "refs/tags/master", "refs/heads/feature/main"]) {
    assert.equal(isMergeRef(bad), false, String(bad));
  }
});

test("parseArgs: --ref parses through and defaults to empty", () => {
  assert.equal(parseArgs(["--event", "push", "--requested-mode", "apply", "--ref", "refs/heads/master"]).ref, "refs/heads/master");
  assert.equal(parseArgs(["--event", "push", "--requested-mode", "apply"]).ref, "");
});
