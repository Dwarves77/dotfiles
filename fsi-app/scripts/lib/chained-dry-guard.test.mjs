// chained-dry-guard.test.mjs, lane CHAINED-DRY-GUARD, 2026-09-29. Proves the rule 16 build-mode
// decision (resolveChainedRunMode) and the fail-closed Supabase read (readScrapeCadence, dependency-
// injected fetch, no real network call).
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test scripts/lib/chained-dry-guard.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { resolveChainedRunMode, readScrapeCadence, parseArgs } from "./chained-dry-guard.mjs";

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

test("parseArgs: a valid pair parses", () => {
  const r = parseArgs(["--event", "workflow_run", "--requested-mode", "apply"]);
  assert.equal(r.ok, true);
  assert.equal(r.eventName, "workflow_run");
  assert.equal(r.requestedMode, "apply");
});
