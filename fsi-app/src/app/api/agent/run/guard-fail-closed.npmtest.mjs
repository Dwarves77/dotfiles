// guard-fail-closed.npmtest.mjs: lane SEC-10 (2026-10-11), BACKLOG B-0001.
// POST /api/agent/run has two per-item guards (provenance short-circuit, one-hour cooldown). Both used to be
// warn-only: a read error on the provenance read let a verified item regenerate, a read error on the cooldown
// read disabled the cooldown. Attack: a guard client whose read returns { error } must yield 503
// { error: "guard_unavailable" } and the durable workflow must NOT start. The healthy paths are pinned too
// (verified without refresh is 200 skipped, a cooldown hit is 429, a clear item starts the workflow), and the
// route must build ONE service-role client through getServiceSupabase (not three createClient calls).
// The guard, workflow start, audit hook, error capture and both client factories are stubs through jiti aliases.
//
// Run: node --test fsi-app/src/app/api/agent/run/guard-fail-closed.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "agent-run-guard-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const ITEM = "44444444-4444-4444-8444-444444444444";

const state = {
  results: {},
  startCalls: [],
  serviceCalls: 0,
  createClientCalls: 0,
  auditCalls: 0,
};
globalThis.__sec10RunState = state;

// A thenable chain: every query method returns the chain, awaiting it (or maybeSingle()) yields the table's result.
function fakeClient() {
  return {
    from(table) {
      const chain = new Proxy(function () {}, {
        get(_t, k) {
          if (k === "then") return (res, rej) => Promise.resolve(state.results[table]).then(res, rej);
          return () => chain;
        },
        apply() { return chain; },
      });
      return chain;
    },
  };
}
globalThis.__sec10RunClient = fakeClient();

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireAdminRoute() { return { userId: "admin-1", supabase: globalThis.__sec10RunClient, headers: {} }; }
`),
  "@/lib/supabase-service": f("svc.mjs", `
export function getServiceSupabase() { globalThis.__sec10RunState.serviceCalls++; return globalThis.__sec10RunClient; }
`),
  "@supabase/supabase-js": f("sbjs.mjs", `
export function createClient() { globalThis.__sec10RunState.createClientCalls++; return globalThis.__sec10RunClient; }
`),
  "@/lib/d3/hooks.mjs": f("d3.mjs", `
export async function d3AuditEvent() { globalThis.__sec10RunState.auditCalls++; }
`),
  "@/lib/telemetry/capture-error": f("cap.mjs", `export function withErrorCapture(_n, h) { return h; }\n`),
  "workflow/api": f("wf.mjs", `
export async function start(wf, args) { globalThis.__sec10RunState.startCalls.push(args); return { runId: "run-1" }; }
`),
  "@/workflows/generate-brief": f("gen.mjs", `export const generateBriefWorkflow = function generateBriefWorkflow() {};\n`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");
const { POST } = await jiti.import("./route.ts");

const ok = { data: null, error: null };
const reset = () => {
  state.results = { intelligence_items: ok, agent_runs: { data: [], error: null } };
  state.startCalls.length = 0;
  state.serviceCalls = 0;
  state.createClientCalls = 0;
  state.auditCalls = 0;
};
const post = (body) =>
  POST(new NextRequest("http://x/api/agent/run", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

test("provenance read error: 503 guard_unavailable, the workflow does not start", async () => {
  reset();
  state.results.intelligence_items = { data: null, error: { message: "provenance read down" } };
  const res = await post({ itemId: ITEM });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "guard_unavailable");
  assert.equal(body.detail, "provenance read down");
  assert.equal(state.startCalls.length, 0);
});

test("cooldown read error: 503 guard_unavailable, the workflow does not start", async () => {
  reset();
  state.results.agent_runs = { data: null, error: { message: "cooldown read down" } };
  const res = await post({ itemId: ITEM });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "guard_unavailable");
  assert.equal(body.detail, "cooldown read down");
  assert.equal(state.startCalls.length, 0);
});

test("a verified item without refresh is 200 skipped already_verified, no workflow", async () => {
  reset();
  state.results.intelligence_items = { data: { provenance_status: "verified" }, error: null };
  const res = await post({ itemId: ITEM });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.skipped, "already_verified");
  assert.equal(state.startCalls.length, 0);
});

test("a cooldown hit is 429 and the workflow does not start (refresh does not bypass it)", async () => {
  reset();
  state.results.agent_runs = { data: [{ created_at: new Date().toISOString() }], error: null };
  const res = await post({ itemId: ITEM, refresh: true });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "cooldown");
  assert.equal(state.startCalls.length, 0);
});

test("a clear item starts the workflow once with (itemId, refresh) and answers 202", async () => {
  reset();
  const res = await post({ itemId: ITEM });
  assert.equal(res.status, 202);
  assert.deepEqual(state.startCalls, [[ITEM, false]]);
});

test("the route builds its service-role client once through getServiceSupabase, never through createClient", async () => {
  reset();
  await post({ itemId: ITEM });
  assert.equal(state.createClientCalls, 0, "no createClient construction in the route");
  assert.equal(state.serviceCalls, 1, "exactly one getServiceSupabase call per request");
});
