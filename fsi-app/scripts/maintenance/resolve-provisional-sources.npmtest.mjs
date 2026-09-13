// resolve-provisional-sources.npmtest.mjs -- real-wiring tests for buildDeps() (defect D22 fix,
// docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-13; the 7.4c pattern -- see
// apply-classifications.test.mjs's own "buildRealDeps" block for the precedent this mirrors).
//
// WHY THIS FILE IS NAMED *.npmtest.mjs, NOT *.test.mjs (hard rule of this lane). buildDeps() calls
// `await import("jiti")` -- a real npm package -- to load the real vertical-fit-gate.ts through the
// `@/lib/...` TS path alias. run-test-suite.sh's own header names the exact reason this kind of proof
// cannot join the no-npm-ci glob (`fsi-app/scripts/maintenance/*.test.mjs`, which
// resolve-provisional-sources.test.mjs's own pure-logic tests already use, deliberately, per that
// file's header, precisely so it never needs jiti): CI's "Discipline engine unit tests" job runs that
// glob WITHOUT `npm ci`, so a jiti import would throw ERR_MODULE_NOT_FOUND there. This file instead
// joins the ".github/workflows/discipline.yml" step "App unit tests requiring npm deps"
// (fsi-app/scripts/**/*.npmtest.mjs is NOT auto-globbed there -- only fsi-app/src/**/*.npmtest.mjs is
// -- so this file is added to that step's NAMED list, the same way
// scripts/turns/apply-record-briefs.npmtest.mjs and
// scripts/turns/record-briefs/section-list-drift.npmtest.mjs were before it).
//
// THE DEFECT THIS PROVES FIXED. buildDeps()'s pre-fix `checkVerticalFitGate` property was the RAW
// jiti-imported function, unwrapped -- `checkVerticalFitGate(supabase, source)`. The real call site
// (applyProvisionalDecision, resolve-provisional-sources.mjs) calls `deps.checkVerticalFitGate({ name,
// url })` with ONE argument (the row). That one argument landed in the real function's FIRST parameter
// (`supabase`), leaving `source` undefined -- `TypeError: Cannot read properties of undefined (reading
// 'name')` at vertical-fit-gate.ts:44, on resolve-provisional-sources' first live apply promote (run
// 34734662726). The dry arm never calls the gate and the pure-logic test file injects a FAKE gate
// (fakeDeps), so every dry run and every existing test passed while this exact wiring had never once
// executed. Fixed: buildDeps() is now EXPORTED and `checkVerticalFitGate` is a one-argument wrapper,
// `(source) => checkVerticalFitGate(client, source)`, closing over the client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { __setWriteClientForTest } from "../lib/db.mjs";
import { buildDeps, main } from "./resolve-provisional-sources.mjs";

// ── a minimal fake Supabase client (the 7.4c / apply-classifications.test.mjs pattern) ─────────────
//
// Every query builder method records its call and returns the SAME builder so calls chain the way the
// real supabase-js query builder does; `.range()` records and CHAINS (never settles) because
// db.mjs's own `readAll` applies `.range(from, to)` BEFORE its caller-supplied `match()` filter
// (`q = q.range(from, to); if (match) q = match(q);` -- scripts/lib/db.mjs), so a `.range()` that
// settled immediately would break every `readAll` call this file's real buildDeps() makes. Settling
// happens only at `.single()`, `.maybeSingle()`, or when the builder itself is awaited (`.then()`).
function makeClient(handler) {
  const calls = [];
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    function settle() {
      calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() });
      return Promise.resolve(handler(state));
    }
    const b = {
      select(c) {
        if (state.verb !== "insert" && state.verb !== "update") state.verb = "select";
        state.ops.push(["select", c]);
        return b;
      },
      insert(p) { state.verb = "insert"; state.ops.push(["insert", p]); return b; },
      update(p) { state.verb = "update"; state.ops.push(["update", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      ilike(c, v) { state.ops.push(["ilike", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      single() { return settle(); },
      maybeSingle() { return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls };
}

test.afterEach(() => {
  // Restore the real write-client factory so no other test file (run in the same process by
  // run-goldens.mjs's npmtest step) inherits a stubbed client left behind by this one.
  __setWriteClientForTest(null);
});

// ── Test 1 (D22's own required test): buildDeps() through the REAL import graph, arg order proven ──

test("buildDeps().checkVerticalFitGate: through the REAL import graph (real jiti load of vertical-fit-gate.ts), the client reaches the gate FIRST and the source SECOND -- no TypeError, no swapped args", async () => {
  const negativeListRows = [{ url: "https://retired.example/old-page" }];
  const client = makeClient((s) => {
    if (s.table === "sources" && s.verb === "select") {
      // The negative-list query the real gate runs: .select("url").eq("status","suspended")
      // .ilike("notes","%off_vertical_suspended%"). Proves the CLIENT (not the source object, which
      // has no .from method at all) is what buildDeps() closed over and handed the gate as its first
      // argument -- the pre-fix bug handed the SOURCE object where the client goes, and a plain
      // {name,url} object has no .from() to call, so the pre-fix wiring would throw a DIFFERENT,
      // earlier TypeError right here rather than ever reaching this handler.
      const hasStatusEq = s.ops.some((o) => o[0] === "eq" && o[1] === "status" && o[2] === "suspended");
      const hasNotesIlike = s.ops.some((o) => o[0] === "ilike" && o[1] === "notes");
      assert.ok(hasStatusEq, "expected the negative-list query's own eq(status, suspended)");
      assert.ok(hasNotesIlike, "expected the negative-list query's own ilike(notes, %off_vertical_suspended%)");
      return { data: negativeListRows, error: null };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  });
  __setWriteClientForTest(() => client);

  const deps = await buildDeps();
  assert.equal(typeof deps.checkVerticalFitGate, "function");

  // The SOURCE argument (second position) determines the outcome: a url matching the stubbed
  // negative-list host is blocked; a url that does not match is allowed. If the wrapper still passed
  // args in the wrong order (or passed the client as `source`), `source.url` would read as `undefined`
  // both times (a client object has no `.url`), so both calls would return the SAME
  // "no parseable host" result regardless of which url is passed -- the two assertions below would be
  // unable to differ. They must differ, proving `source` (the second wrapper argument) really drives
  // `hostOf(source.url)` inside the real, unmodified vertical-fit-gate.ts.
  const blocked = await deps.checkVerticalFitGate({ name: "Retired Corp", url: "https://retired.example/new-page" });
  assert.equal(blocked.allow, false, "a source whose host is on the negative list must be blocked");
  assert.match(blocked.reason, /retired\.example/, "the reason names the SOURCE's own host, proving source flowed through as the second argument");

  const allowed = await deps.checkVerticalFitGate({ name: "Fresh Corp", url: "https://fresh.example/page" });
  assert.equal(allowed.allow, true, "a source whose host is NOT on the negative list must be allowed");
  assert.notEqual(allowed.reason, blocked.reason);

  // The client was genuinely queried twice (once per checkVerticalFitGate call) -- proves position 1.
  assert.equal(client.__calls.filter((c) => c.table === "sources" && c.verb === "select").length, 2);
});

// ── Test 2 (D22's own required test): one apply-mode promote through the REAL wrapper, negative-list
//    query stubbed empty, asserting the promote write is reached ──────────────────────────────────

test("main({mode:'apply'}) with the REAL buildDeps(): a class-table promote reaches the real gate and the real promote write (sources insert + provisional_sources/no-op update), never throwing on the gate call", async () => {
  const pendingRow = { id: "p-edu-1", name: null, url: "https://some.edu/policy-page", status: "pending_review" };
  const client = makeClient((s) => {
    if (s.table === "provisional_sources" && s.verb === "select") {
      const isPendingRead = s.ops.some((o) => o[0] === "in" && o[1] === "status");
      // The pending-provisional read (readPendingProvisional) vs. guardedUpdate's own prior-state
      // snapshot read (keyed by id, no `in(status,...)` op) -- same table, different query shape.
      return { data: isPendingRead ? [pendingRow] : [{ id: pendingRow.id }], error: null };
    }
    if (s.table === "provisional_sources" && s.verb === "update") {
      return { data: [{ id: pendingRow.id, status: "promoted" }], error: null };
    }
    if (s.table === "sources" && s.verb === "select") {
      // Every "sources" select this run makes (readActiveSources with no filter, readProvisionalSourcesRows
      // with status=provisional, the negative-list gate query with status=suspended, promoteProvisional's
      // own host-match dedup ilike) is stubbed empty -- forcing rule (b), the SC-13 class table, to fire
      // (some.edu -> academic T4, per host-authority.ts's ACADEMIC_TLD rule -- the SAME resolution this
      // module's own pure-logic test file already proves for classTierForHostAcrossNames("some.edu"))
      // and the negative-list gate query "stubbed empty" exactly as this lane's spec requires.
      return { data: [], error: null };
    }
    if (s.table === "sources" && s.verb === "insert") {
      return { data: { id: "new-source-id" }, error: null };
    }
    throw new Error(`unexpected call: ${s.table}/${s.verb} ops=${JSON.stringify(s.ops)}`);
  });
  __setWriteClientForTest(() => client);

  const deps = await buildDeps();
  const summary = await main({ mode: "apply" }, deps);

  assert.equal(summary.counts.promote, 1, "the class-table rule must promote, not worklist or reject");
  assert.equal(summary.counts.reject, 0, "the negative-list gate is stubbed empty -- allow, never reject");

  // The promote write was REACHED: the real applyProvisionalDecision called the real (fixed)
  // deps.checkVerticalFitGate without throwing, got allow:true, and proceeded into promoteProvisional's
  // real guardedInsert against "sources" -- the exact statement that never ran in production (run
  // 34734662726 crashed one call earlier, at the gate itself, so this INSERT never fired).
  const insertCalls = client.__calls.filter((c) => c.table === "sources" && c.verb === "insert");
  assert.equal(insertCalls.length, 1, "expected exactly one sources insert (the promote write)");
  const insertedRow = insertCalls[0].ops.find((o) => o[0] === "insert")[1];
  assert.equal(insertedRow.base_tier, 4, "some.edu resolves to the academic class tier (4)");

  // ...and the provisional_sources row was updated to its promoted terminal state.
  const updateCalls = client.__calls.filter((c) => c.table === "provisional_sources" && c.verb === "update");
  assert.equal(updateCalls.length, 1);
  const patch = updateCalls[0].ops.find((o) => o[0] === "update")[1];
  assert.equal(patch.status, "promoted");
  assert.equal(patch.promoted_to_source_id, "new-source-id");
});
