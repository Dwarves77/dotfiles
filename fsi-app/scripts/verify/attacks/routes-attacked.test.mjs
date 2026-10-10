// routes-attacked.test.mjs -- unit tests of the routes ATTACKED run (lane TESTS-2, 2026-10-10), against a scripted fake of
// the app. The run itself needs `next start` and the local stack; here the register parse, the probe plan, the invariants
// and the CLI refusals are proven red-then-green, including an attack on the attacker for each leak: a server that lets an
// anonymous caller through an admin route, a viewer through a shared write, a persona through a worker route, and a server
// whose sessions are all refused (a result that would otherwise look like perfect security).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRegister, routeUrlPath, planProbes, personasFor, runProbes, evaluate, expectedOpenProblems, isWriteAttackRow,
  cliMain, REGISTER_PATH, EXPECTED_OPEN_PATH, PLACEHOLDER_ID, MAX_BROKEN,
} from "./routes-attacked.mjs";
import { setupRoutePersonas, teardownRoutePersonas, creationStatements, ROUTE_PERSONAS } from "../fixtures/route-personas.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const MINI = `
## 5. Not run, owed

## 6. Route table (every route.ts, every exported method)

| # | path | method | guard | class | roles | client | svc-write | wbg | anon | status |
|---|---|---|---|---|---|---|---|---|---|---|
| R001 | api/admin/a/route.ts | GET | g | admin | r | c | gated | no | to-guard | [CONFIRMED: x] |
| R002 | api/admin/a/route.ts | POST | g | admin | r | c | gated | no | to-guard | [CONFIRMED: x] |
| R003 | api/worker/w/route.ts | POST | g | worker | r | c | gated | no | to-guard | [CONFIRMED: x] |
| R004 | api/things/[id]/route.ts | GET | g | session | r | c | none | no | to-guard | [CONFIRMED: x] |
| R005 | api/things/[id]/route.ts | DELETE | g | session | r | c | norole-shared | no | to-guard | [CONFIRMED: x] |
| R006 | api/open/route.ts | GET | none | none | r | c | none | no | open | [CONFIRMED: x] |
| R007 | api/hyp/route.ts | POST | g | session | r | c | none | no | to-guard | [HYPOTHESIS: rls] |

## 7. Page table
| R999 | api/not/route.ts | GET | g | admin | r | c | none | no | x | [CONFIRMED: x] |
`;

test("parseRegister reads section 6 only and keeps class, svc-write and status", () => {
  const rows = parseRegister(MINI);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[4], { id: "R005", path: "api/things/[id]/route.ts", method: "DELETE", cls: "session", svcWrite: "norole-shared", status: "[CONFIRMED: x]" });
  assert.equal(rows.some((r) => r.id === "R999"), false, "a row after section 6 is not a route row");
  assert.deepEqual(parseRegister("no register here"), []);
});

test("the real register parses to 153 route methods with the four classes the register counts", () => {
  const rows = parseRegister(readFileSync(REGISTER_PATH, "utf8"));
  assert.equal(rows.length, 153);
  const by = {};
  for (const r of rows) by[r.cls] = (by[r.cls] ?? 0) + 1;
  assert.deepEqual(by, { admin: 47, worker: 8, session: 89, none: 9 });
  assert.ok(rows.filter(isWriteAttackRow).length >= 20, "the write-attack set is the AT2-4 and AT2-10 rows");
});

test("routeUrlPath: dynamic segments get a placeholder id, groups vanish, catch-alls become x", () => {
  assert.equal(routeUrlPath("api/things/[id]/route.ts"), `/api/things/${PLACEHOLDER_ID}`);
  assert.equal(routeUrlPath("api/(grp)/a/[...rest]/route.ts"), "/api/a/x");
  assert.equal(routeUrlPath("api/a/[[...opt]]/route.ts"), "/api/a");
  assert.equal(routeUrlPath("api/version/route.ts"), "/api/version");
});

test("the platform admin probes only admin-class GETs; every other persona probes every method", () => {
  const rows = parseRegister(MINI);
  const probes = planProbes(rows, ["P1", "P2", "PA"]);
  assert.equal(probes.filter((p) => p.persona === "PA").length, 1);
  assert.equal(probes.filter((p) => p.persona === "P1").length, 7);
  assert.deepEqual(personasFor(rows[1], ["P1", "PA"]), ["P1"]);
});

/** A scripted app: statusFor(method, path, authorization) -> status. */
function fakeApp(statusFor) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const auth = init.headers?.Authorization ?? null;
    seen.push({ method: init.method, path, auth, body: init.body });
    return { status: statusFor(init.method, path, auth), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { fetchImpl, seen };
}
const TOKENS = { PA: "tok-admin", P2: "tok-viewer", P3: "tok-other", P4: "tok-member" };
const personaOf = (auth) => ({ null: "P1", "Bearer tok-admin": "PA", "Bearer tok-viewer": "P2", "Bearer tok-other": "P3", "Bearer tok-member": "P4" })[auth];

/** The app as it should behave: guards hold, sessions work. */
function goodApp(path, method, auth) {
  const who = personaOf(auth);
  if (path.startsWith("/api/open")) return 200;
  if (who === "P1") return 401;
  if (path.startsWith("/api/admin")) return who === "PA" ? 200 : 403;
  if (path.startsWith("/api/worker")) return 401;
  if (method === "GET") return 200;
  return 400; // an empty body names no target
}

async function runAgainst(statusFor, rows = parseRegister(MINI)) {
  const { fetchImpl, seen } = fakeApp((m, p, a) => statusFor(p, m, a));
  const probes = planProbes(rows, ["P1", "P2", "P3", "P4", "PA"]);
  const results = await runProbes({ probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", fetchImpl, sleep: async () => {}, paceMs: 0, retryWaitMs: 0 });
  return { probes, results, seen, verdict: evaluate({ results, probes, expectedOpen: [] }) };
}

test("a correctly guarded app holds every invariant; an empty JSON body is sent on mutating methods and none on GET", async () => {
  const { verdict, seen, results, probes } = await runAgainst(goodApp);
  assert.deepEqual(verdict.violations, []);
  assert.equal(results.length, probes.length);
  assert.ok(seen.filter((s) => s.method === "POST").every((s) => s.body === "{}"));
  assert.ok(seen.filter((s) => s.method === "GET").every((s) => s.body === undefined));
  assert.ok(seen.some((s) => s.auth === null) && seen.some((s) => s.auth === "Bearer tok-viewer"));
});

test("ATTACK ON THE ATTACKER: an anonymous request admitted by an admin route turns the run red", async () => {
  const { verdict } = await runAgainst((p, m, a) => (p.startsWith("/api/admin") && a === null ? 200 : goodApp(p, m, a)));
  assert.ok(verdict.violations.some((v) => v.startsWith("ANON:") && v.includes("R001")), verdict.violations.join("\n"));
});

test("ATTACK ON THE ATTACKER: a viewer admitted by an admin route turns the run red", async () => {
  const { verdict } = await runAgainst((p, m, a) => (p.startsWith("/api/admin") && a === "Bearer tok-viewer" ? 200 : goodApp(p, m, a)));
  assert.ok(verdict.violations.some((v) => v.startsWith("ADMIN:")), verdict.violations.join("\n"));
});

test("ATTACK ON THE ATTACKER: a worker route answering any persona 2xx turns the run red", async () => {
  const { verdict } = await runAgainst((p, m, a) => (p.startsWith("/api/worker") && a === "Bearer tok-member" ? 202 : goodApp(p, m, a)));
  assert.ok(verdict.violations.some((v) => v.startsWith("WORKER:")), verdict.violations.join("\n"));
});

test("ATTACK ON THE ATTACKER: a shared write accepted from the viewer or the other-org member turns the run red; the member is not judged", async () => {
  const leak = (who) => (p, m, a) => (m === "DELETE" && personaOf(a) === who ? 200 : goodApp(p, m, a));
  for (const who of ["P2", "P3"]) {
    const { verdict } = await runAgainst(leak(who));
    assert.ok(verdict.violations.some((v) => v.startsWith("WRITES:") && v.includes(`as ${who}`)), `${who}: ${verdict.violations.join("\n")}`);
  }
  const member = await runAgainst(leak("P4"));
  assert.deepEqual(member.verdict.violations, []);
});

test("a HYPOTHESIS row's mutating method is in the write-attack set even with no service-client write", async () => {
  const { verdict } = await runAgainst((p, m, a) => (p === "/api/hyp" && personaOf(a) === "P2" ? 201 : goodApp(p, m, a)));
  assert.ok(verdict.violations.some((v) => v.includes("R007")), verdict.violations.join("\n"));
});

test("an expected-open entry excuses exactly its method, route and persona, and a stale entry is reported", async () => {
  const rows = parseRegister(MINI);
  const { fetchImpl } = fakeApp((m, p, a) => (m === "DELETE" && personaOf(a) === "P2" ? 200 : goodApp(p, m, a)));
  const probes = planProbes(rows, ["P1", "P2", "P3", "P4", "PA"]);
  const results = await runProbes({ probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", fetchImpl, sleep: async () => {}, paceMs: 0, retryWaitMs: 0 });
  const entry = { path: "api/things/[id]/route.ts", method: "DELETE", persona: "P2", register: "R005", reason: "test" };
  assert.deepEqual(evaluate({ results, probes, expectedOpen: [entry] }).violations, []);
  assert.ok(evaluate({ results, probes, expectedOpen: [{ ...entry, persona: "P3" }] }).violations.length > 0, "an entry for P3 does not excuse P2");
  assert.deepEqual(expectedOpenProblems([entry], rows), []);
  assert.ok(expectedOpenProblems([{ ...entry, register: "R404" }], rows).length > 0);
  assert.ok(expectedOpenProblems([{ ...entry, reason: "" }], rows).length > 0);
});

test("ATTACK ON THE ATTACKER: an app that refuses every session (401) is not a pass: the TOKENS invariant fails", async () => {
  const { verdict } = await runAgainst((p, m, a) => (a === null || p.startsWith("/api/open") ? goodApp(p, m, a) : 401));
  assert.ok(verdict.violations.some((v) => v.startsWith("TOKENS: persona")), verdict.violations.join("\n"));
  assert.ok(verdict.violations.some((v) => v.includes("platform admin")), verdict.violations.join("\n"));
});

test("a refused admin guard for the admin persona on every admin GET fails TOKENS", async () => {
  const { verdict } = await runAgainst((p, m, a) => (p.startsWith("/api/admin") ? 403 : goodApp(p, m, a)));
  assert.ok(verdict.violations.some((v) => v.includes("admin guard is broken")), verdict.violations.join("\n"));
});

test("a server that is down is red, 5xx answers are counted but never fail, and a few timeouts are tolerated", async () => {
  const rows = parseRegister(MINI);
  const probes = planProbes(rows, ["P1", "P2", "P3", "P4", "PA"]);
  const down = await runProbes({ probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", fetchImpl: async () => { throw new TypeError("fetch failed"); }, sleep: async () => {}, paceMs: 0 });
  const v = evaluate({ results: down, probes });
  assert.ok(v.violations.some((m) => m.includes("could not reach the server")));
  const five = await runAgainst((p, m, a) => (p.startsWith("/api/worker") ? 503 : goodApp(p, m, a)));
  assert.deepEqual(five.verdict.violations, []);
  assert.ok(five.verdict.serverErrors > 0);
  const slow = await runProbes({
    probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", sleep: async () => {}, paceMs: 0,
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      const auth = init.headers.Authorization ?? null;
      if (path === "/api/open" && auth === null) { const e = new Error("t"); e.name = "TimeoutError"; throw e; }
      return { status: goodApp(path, init.method, auth), arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  assert.ok(slow.filter((r) => r.error === "timeout").length <= MAX_BROKEN);
});

test("a 429 is retried and counted as limited, never taken as a refusal that satisfied the run", async () => {
  let n = 0;
  const rows = parseRegister(MINI).slice(0, 1);
  const probes = planProbes(rows, ["P2"]);
  const results = await runProbes({
    probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", sleep: async () => {}, paceMs: 0, retryWaitMs: 0,
    fetchImpl: async () => ({ status: ++n < 3 ? 429 : 403, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  assert.equal(results[0].status, 403);
  assert.equal(results[0].limited, true);
});

test("the expected-open list on disk is not stale against the real register", () => {
  const rows = parseRegister(readFileSync(REGISTER_PATH, "utf8"));
  const entries = JSON.parse(readFileSync(EXPECTED_OPEN_PATH, "utf8"));
  assert.deepEqual(expectedOpenProblems(entries, rows), []);
});

test("route personas: the creation statements make a platform admin, a viewer and a member of org A, a member of org B", () => {
  const users = Object.fromEntries(ROUTE_PERSONAS.map((p) => [p.key, { id: `00000000-0000-4000-8000-00000000${p.key.length}00`.slice(0, 36), email: `${p.key}@x.invalid` }]));
  const st = creationStatements(users);
  const memberships = st.filter((s) => s.label.startsWith("org_memberships"));
  assert.deepEqual(memberships.map((s) => s.params[2]).sort(), ["member", "member", "viewer"]);
  const admin = st.find((s) => s.label === "profiles admin");
  assert.equal(admin.params[3], true);
  assert.ok(st.filter((s) => s.label.startsWith("profiles ")).filter((s) => s.params[3] === true).length === 1);
});

test("route personas: sign-in failures and missing keys name the step, never a credential", async () => {
  const client = { query: async () => ({}) };
  await assert.rejects(() => setupRoutePersonas({ client, env: {} }), /API url or keys are missing/);
  const env = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" };
  await assert.rejects(
    () => setupRoutePersonas({ client, env, tag: "t", makePassword: () => "pw-secret", fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) }),
    (e) => /create admin: auth service answered 500/.test(e.message) && !/pw-secret/.test(e.message),
  );
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes("/admin/users")) return { ok: true, status: 200, json: async () => ({ id: `00000000-0000-4000-8000-0000000000${10 + calls}` }) };
    return { ok: true, status: 200, json: async () => ({ access_token: `tok-${calls}` }) };
  };
  const out = await setupRoutePersonas({ client, env, tag: "t", fetchImpl });
  assert.deepEqual(Object.keys(out.tokens).sort(), ["admin", "member_a", "member_b", "viewer_a"]);
  await teardownRoutePersonas({ client, userIds: out.userIds, env, fetchImpl });
});

test("cliMain refuses outside the local stack and when the app is not on a loopback host, and exits 0 on a good run", async () => {
  const logs = [];
  const base = { log: (m) => logs.push(m), connect: async () => null };
  assert.equal(await cliMain({ ...base, argv: [], env: {} }), 2);
  const localEnv = { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" };
  assert.equal(await cliMain({ ...base, argv: ["--base-url", "https://app.example.com"], env: localEnv }), 2);
  assert.ok(logs.some((l) => l.includes("loopback")));
  assert.equal(await cliMain({ ...base, argv: [], env: localEnv }), 2, "no database connection");

  const real = parseRegister(readFileSync(REGISTER_PATH, "utf8"));
  const classOf = new Map(real.map((r) => [`${r.method} ${routeUrlPath(r.path)}`, r.cls]));
  const realApp = (path, method, auth) => {
    const cls = classOf.get(`${method} ${path}`);
    const who = personaOf(auth);
    if (cls === "none") return 200;
    if (who === "P1") return 401;
    if (cls === "admin") return who === "PA" ? 200 : 403;
    if (cls === "worker") return 401;
    return method === "GET" ? 200 : 400;
  };
  const writes = [];
  const client = { query: async () => ({}), end: async () => {} };
  const run = (statusFor) => async ({ probes }) => runProbes({ probes, tokens: TOKENS, baseUrl: "http://127.0.0.1:3100", fetchImpl: fakeApp(statusFor).fetchImpl, sleep: async () => {}, paceMs: 0 });
  const drive = (statusFor) => cliMain({
    log: (m) => logs.push(m), argv: ["--out-dir", "OUT"], env: localEnv, connect: async () => client,
    writeFile: (p, c) => writes.push([p, c]), makeDir: () => {},
    setup: async () => ({ tokens: { admin: "tok-admin", viewer_a: "tok-viewer", member_b: "tok-other", member_a: "tok-member" }, userIds: {} }),
    teardown: async () => {}, run: run(statusFor),
  });
  assert.equal(await drive((m, p, a) => realApp(p, m, a)), 0, logs.slice(-5).join(" | "));
  assert.equal(writes.length, 1);
  assert.match(writes[0][0], /routes-attacked-report\.json$/);
  assert.ok(!/tok-/.test(writes[0][1]), "the report carries no token");
  // the same run with one anonymous leak is red (exit 1)
  assert.equal(await drive((m, p, a) => (p === "/api/admin/attention" && a === null ? 200 : realApp(p, m, a))), 1);
  // a register that parses to fewer than 100 rows is refused, not run
  assert.equal(await cliMain({ log: (m) => logs.push(m), argv: ["--register", "MINI"], env: localEnv, connect: async () => client, readText: (p) => (p === "MINI" ? MINI : readFileSync(p, "utf8")) }), 2);
});
