#!/usr/bin/env node
// routes-attacked.mjs -- the ATTACKED lens on every API route method, run against `next start` on a disposable local
// stack (lane TESTS-2, 2026-10-10; CLAUDE.md rule 15, a guard is proven by attack, not by presence;
// docs/audits/aud-at2-route-guard-register-2026-10-08.md section 5; routes1 log "What is NOT done").
//
// AUD-AT-2 traced the guard of every route method statically (EXISTS and CALLED) and wrote the ATTACKED lens as owed: "no
// disposable runtime for routes exists". This is that runtime's test. Its input is the register itself (section 6, parsed
// by parseRegister): every route method with its guard class, its service-client-write class and its status. It sends one
// request per route method per persona to the running app and holds these invariants over the status codes:
//
//   COVERAGE     every (route method x persona) probe returned a status. A probe that could not complete (connection
//                refused, timeout) is BROKEN; more than MAX_BROKEN of them, or any when the server is down, is red.
//   TOKENS       the sessions work: every signed-in persona was accepted (a status other than 401) by at least one session or
//                admin class route (an unguarded route accepts anyone, so it proves nothing about a token),
//                and the platform admin was admitted past the admin guard (a status other than 401 or 403) on at least one
//                admin-class GET. Without this, "every route refused every persona" would pass as a security result.
//   ANON         no anonymous request to an admin, worker or session route returns 2xx.
//   ADMIN        no non-admin persona (viewer, other-org member, org member) gets 2xx from an admin-class route.
//   WORKER       no persona, signed in or not, gets 2xx from a worker-class route (the shared secret is not sent).
//   WRITES       the AT2-4/AT2-10 set (service-client write with no role check on shared rows, and every route method whose
//                status is HYPOTHESIS): a mutating request with an EMPTY JSON body from the org VIEWER or from a member of
//                ANOTHER org must not return 2xx, except the entries in route-attack-expected-open.json (each with a reason
//                and a register row, checked for staleness). An empty body is a request that names no target; a 2xx to it
//                from a caller with no role is a write that no role check stood in front of.
//
// What is NOT asserted: 5xx statuses are counted and listed but never fail the run (a route that fails closed because a
// secret is unset answers 500 or 503 on the stack), and the unguarded class ("none") has no expectation. The report
// carries route paths, methods, personas and status codes only; never a body, a token or a header.
//
// The per-persona pace stays under the app's 60 requests per minute per user limit (route-guard checkRateLimit); a 429 is
// retried after a wait and counted as inconclusive, never as a refusal that satisfied an invariant.
//
// LOCAL ONLY: refuses (exit 2) unless the environment is the local stack's (run-attacks.mjs assertLocalOnly) and the app's
// base url names a loopback host. Exit: 0 every invariant held; 1 at least one did not; 2 cannot run.
//
// Usage: node scripts/verify/attacks/routes-attacked.mjs [--base-url http://127.0.0.1:3100] [--out-dir <dir>] [--register <file>]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/is-main.mjs";
import { isLoopbackHost } from "../../lib/pg-conn.mjs";
import { assertLocalOnly } from "../../proof/attacks/run-attacks.mjs";
import { setupRoutePersonas, teardownRoutePersonas } from "../fixtures/route-personas.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
export const REGISTER_PATH = join(REPO_ROOT, "docs", "audits", "aud-at2-route-guard-register-2026-10-08.md");
export const EXPECTED_OPEN_PATH = join(HERE, "..", "fixtures", "route-attack-expected-open.json");

export const MAX_BROKEN = 3;
export const PACE_MS = 1300; // 46 requests a minute per signed-in persona, under the 60 a minute limit
export const REQUEST_TIMEOUT_MS = 30_000;
export const PLACEHOLDER_ID = "00000000-0000-4000-8000-0000000000ff";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A GUARDED class is one whose handler runs a principal check before its first read or write. */
export const GUARDED_CLASSES = Object.freeze(["admin", "worker", "session"]);

/** Parse the register's section 6 route table. PURE. Rows: { id, path, method, cls, svcWrite, status }. */
export function parseRegister(text) {
  const start = String(text ?? "").indexOf("## 6. Route table");
  if (start < 0) return [];
  const rest = String(text).slice(start + 5);
  const end = rest.search(/\n## \d/);
  const section = end < 0 ? rest : rest.slice(0, end);
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\|\s*R\d+\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 11) continue;
    rows.push({
      id: cells[0], path: cells[1], method: cells[2].toUpperCase(), cls: cells[4],
      svcWrite: cells[7], status: cells[10],
    });
  }
  return rows;
}

/** The URL path of a route file path as the register writes it (api/x/[id]/route.ts). PURE. */
export function routeUrlPath(filePath) {
  const segs = String(filePath).replace(/\\/g, "/").replace(/\/route\.ts$/, "").split("/").filter(Boolean);
  const out = [];
  for (const s of segs) {
    if (/^\(.*\)$/.test(s)) continue; // a route group is not part of the URL
    if (/^\[\[\.\.\..+\]\]$/.test(s)) continue; // optional catch-all
    if (/^\[\.\.\..+\]$/.test(s)) out.push("x"); // catch-all
    else if (/^\[.+\]$/.test(s)) out.push(PLACEHOLDER_ID); // dynamic segment
    else out.push(s);
  }
  return "/" + out.join("/");
}

/** The probe sets. PURE. */
export function isWriteAttackRow(row) {
  return MUTATING.has(row.method) && (/^norole-shared$/.test(row.svcWrite) || /HYPOTHESIS/.test(row.status));
}

/** Which personas probe a route method. The platform admin sends only GETs: it is the positive control, and a mutating call by an admin has no expectation to hold. PURE. */
export function personasFor(row, personaIds) {
  return personaIds.filter((p) => (p === "PA" ? row.method === "GET" && row.cls === "admin" : true));
}

/** Build the full probe list. PURE. */
export function planProbes(rows, personaIds) {
  const probes = [];
  for (const row of rows) {
    for (const persona of personasFor(row, personaIds)) {
      probes.push({ persona, row, method: row.method, urlPath: routeUrlPath(row.path) });
    }
  }
  return probes;
}

const statusClass = (s) => (s === null ? "none" : `${Math.floor(s / 100)}xx`);

/** Send one probe. Resolves to { status } or { error }. Never throws. */
export async function sendProbe({ fetchImpl, baseUrl, probe, token, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method: probe.method, headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) };
  if (MUTATING.has(probe.method)) {
    headers["Content-Type"] = "application/json";
    init.body = "{}";
  }
  try {
    const res = await fetchImpl(baseUrl + probe.urlPath, init);
    try { await res.arrayBuffer?.(); } catch { /* the body is never read for content */ }
    return { status: res.status };
  } catch (e) {
    return { error: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "unreachable" };
  }
}

/**
 * Run every probe. Personas run concurrently; within a signed-in persona probes are sequential and paced. A 429 is
 * retried up to three times after `retryWaitMs`. Returns result rows { persona, id, path, method, cls, status|null, error?, limited }.
 */
export async function runProbes({ probes, tokens, baseUrl, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), paceMs = PACE_MS, retryWaitMs = 20_000, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const byPersona = new Map();
  for (const p of probes) {
    if (!byPersona.has(p.persona)) byPersona.set(p.persona, []);
    byPersona.get(p.persona).push(p);
  }
  const results = [];
  await Promise.all([...byPersona.entries()].map(async ([persona, list]) => {
    const token = persona === "P1" ? null : tokens[persona] ?? undefined;
    for (const probe of list) {
      let out = await sendProbe({ fetchImpl, baseUrl, probe, token, timeoutMs });
      let limited = false;
      for (let attempt = 0; attempt < 3 && out.status === 429; attempt++) {
        limited = true;
        await sleep(retryWaitMs);
        out = await sendProbe({ fetchImpl, baseUrl, probe, token, timeoutMs });
      }
      results.push({
        persona, id: probe.row.id, path: probe.row.path, method: probe.method, cls: probe.row.cls,
        status: out.status ?? null, ...(out.error ? { error: out.error } : {}), limited,
        write: isWriteAttackRow(probe.row),
      });
      if (persona !== "P1" && paceMs > 0) await sleep(paceMs);
    }
  }));
  return results;
}

/** Read the expected-open file. Each entry: { path, method, persona, reason, register }. */
export function loadExpectedOpen(path = EXPECTED_OPEN_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Staleness of the expected-open list against the register. PURE. Returns messages. */
export function expectedOpenProblems(entries, rows) {
  const out = [];
  for (const e of entries) {
    for (const k of ["path", "method", "persona", "reason", "register"]) {
      if (typeof e?.[k] !== "string" || !e[k].trim()) out.push(`expected-open entry ${JSON.stringify(e)} lacks "${k}"`);
    }
    const hit = rows.find((r) => r.id === e?.register && r.path === e?.path && r.method === e?.method);
    if (!hit) out.push(`expected-open entry ${e?.method} ${e?.path} (${e?.register}) names no register row: stale`);
  }
  return out;
}

const is2xx = (s) => s !== null && s >= 200 && s < 300;
const NON_ADMIN = ["P1", "P2", "P3", "P4"];

/** Evaluate the invariants. PURE. Returns { violations, counts }. */
export function evaluate({ results, probes, expectedOpen = [] }) {
  const violations = [];
  const broken = results.filter((r) => r.status === null);
  if (results.length !== probes.length) violations.push(`COVERAGE: ${results.length} results for ${probes.length} probes`);
  const unreachable = broken.filter((r) => r.error === "unreachable").length;
  if (unreachable > 0) violations.push(`COVERAGE: ${unreachable} probes could not reach the server (connection refused or reset)`);
  if (broken.length > MAX_BROKEN) violations.push(`COVERAGE: ${broken.length} probes ended without a status (limit ${MAX_BROKEN})`);

  // TOKENS: the sessions work, the admin passes the admin guard.
  for (const persona of ["P2", "P3", "P4"]) {
    const mine = results.filter((r) => r.persona === persona && r.status !== null && (r.cls === "session" || r.cls === "admin"));
    if (mine.length > 0 && !mine.some((r) => r.status !== 401)) violations.push(`TOKENS: persona ${persona} was refused 401 on every route, so its session is not accepted and no result for it proves a guard`);
  }
  const adminGets = results.filter((r) => r.persona === "PA" && r.status !== null);
  if (adminGets.length === 0) violations.push("TOKENS: the platform admin probed no admin-class GET");
  else if (!adminGets.some((r) => r.status !== 401 && r.status !== 403)) violations.push("TOKENS: the platform admin was refused (401 or 403) by every admin-class GET, so the admin session or the admin guard is broken");

  const open = new Set(expectedOpen.map((e) => `${e.method} ${e.path} ${e.persona}`));
  for (const r of results) {
    if (r.status === null) continue;
    const tag = `${r.id} ${r.method} ${r.path} as ${r.persona} -> ${r.status}`;
    if (r.persona === "P1" && GUARDED_CLASSES.includes(r.cls) && is2xx(r.status)) violations.push(`ANON: ${tag} (class ${r.cls})`);
    if (r.cls === "admin" && NON_ADMIN.includes(r.persona) && r.persona !== "P1" && is2xx(r.status)) violations.push(`ADMIN: ${tag}`);
    if (r.cls === "worker" && is2xx(r.status)) violations.push(`WORKER: ${tag}`);
    if (r.write && (r.persona === "P2" || r.persona === "P3") && is2xx(r.status) && !open.has(`${r.method} ${r.path} ${r.persona}`)) {
      violations.push(`WRITES: ${tag} (an empty-body mutating request from a caller with no role was accepted)`);
    }
  }
  const counts = {};
  for (const r of results) {
    const k = `${r.persona} ${statusClass(r.status)}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { violations, counts, broken: broken.length, limited: results.filter((r) => r.limited).length, serverErrors: results.filter((r) => r.status !== null && r.status >= 500).length };
}

/** The CLI body with every side effect injectable. Returns the exit code. */
export async function cliMain({
  argv = process.argv.slice(2), env = process.env,
  connect = async () => (await import("../../lib/pg-conn.mjs")).connectPg(),
  fetchImpl = fetch, readText = (p) => readFileSync(p, "utf8"),
  writeFile = writeFileSync, makeDir = mkdirSync, log = console.log,
  setup = setupRoutePersonas, teardown = teardownRoutePersonas,
  run = runProbes,
}) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const baseUrl = (arg("--base-url") ?? env.ROUTES_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
  let host = null;
  try { host = new URL(baseUrl).hostname; } catch { /* handled below */ }
  const local = assertLocalOnly(env);
  if (!local.ok || !isLoopbackHost(host)) {
    log("routes-attacked: REFUSED, the environment or the app url is not the local stack's:");
    local.violations.forEach((v) => log(`  - ${v}`));
    if (!isLoopbackHost(host)) log("  - the app base url does not name a loopback host");
    return 2;
  }
  let rows;
  let expectedOpen;
  try {
    rows = parseRegister(readText(arg("--register") ?? REGISTER_PATH));
    expectedOpen = JSON.parse(readText(EXPECTED_OPEN_PATH));
  } catch (e) { log(`routes-attacked: cannot read the register or the expected-open list (${e.message}). Exit 2.`); return 2; }
  if (rows.length < 100) { log(`routes-attacked: the register parsed to ${rows.length} route rows (a register has 150 or more). Exit 2.`); return 2; }
  const stale = expectedOpenProblems(expectedOpen, rows);
  if (stale.length) { stale.forEach((m) => log(`VIOLATION ${m}`)); return 1; }
  const client = await connect();
  if (!client) { log("routes-attacked: no database connection to the local stack. Cannot verify, exit 2."); return 2; }
  let personas = null;
  try {
    personas = await setup({ client, fetchImpl, env });
    const tokens = { PA: personas.tokens.admin, P2: personas.tokens.viewer_a, P3: personas.tokens.member_b, P4: personas.tokens.member_a };
    const probes = planProbes(rows, ["P1", "P2", "P3", "P4", "PA"]);
    log(`routes-attacked: ${rows.length} route methods in the register, ${probes.length} probes against ${baseUrl}`);
    const results = await run({ probes, tokens, baseUrl, fetchImpl });
    const verdict = evaluate({ results, probes, expectedOpen });
    log(`routes-attacked: ${results.length} probes done; broken ${verdict.broken}, rate-limited ${verdict.limited}, 5xx ${verdict.serverErrors}`);
    for (const [k, n] of Object.entries(verdict.counts).sort()) log(`  ${k}: ${n}`);
    for (const v of verdict.violations) log(`VIOLATION ${v}`);
    const outDir = arg("--out-dir") ?? env.CP_OUT_DIR ?? env.MP_OUT_DIR ?? null;
    if (outDir) {
      makeDir(outDir, { recursive: true });
      writeFile(join(outDir, "routes-attacked-report.json"), JSON.stringify({ baseUrl, probes: probes.length, verdict, results }, null, 2) + "\n", "utf8");
    } else {
      log("routes-attacked: no output directory (--out-dir, CP_OUT_DIR or MP_OUT_DIR); the report was not written.");
    }
    return verdict.violations.length === 0 ? 0 : 1;
  } catch (e) {
    log(`routes-attacked: cannot run (${String(e.message).split("\n")[0]}). Exit 2.`);
    return 2;
  } finally {
    if (personas) {
      try { await teardown({ client, userIds: personas.userIds, fetchImpl, env }); } catch (e) { log(`routes-attacked: teardown failed (${String(e.message).split("\n")[0]})`); }
    }
    await client.end?.();
  }
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain({}));
}
