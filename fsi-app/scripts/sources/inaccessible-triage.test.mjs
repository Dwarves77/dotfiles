// Unit tests for the inaccessible-source ladder triage. Pure + dep-injected: fake fetch (no network),
// fake readAll/guardedUpdateByIds (no DB). The ladder pieces reused (fetchPrimaryWithFallback,
// generateCandidates, officialnessOf, classTierForHost) run FOR REAL — this proves the composition, not
// a mocked-out shell — with only the network fetch faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, createHostThrottle, runBounded, probeHead, probeGet, qualifiesAtFloor,
  fetchStatusForDossier, triageOneSource, applyFetchStatus, main,
  DEFAULT_CONCURRENCY, MAX_CONCURRENCY, DEFAULT_HOST_INTERVAL_MS, DEFAULT_TIME_BUDGET_MIN,
} from "./inaccessible-triage.mjs";

const EN = (n) => "The regulation requires covered entities to submit annual emissions reports. ".repeat(Math.ceil(n / 72)).slice(0, n);

// ── parseArgs ─────────────────────────────────────────────────────────────────────────────────────
test("parseArgs: defaults", () => {
  const a = parseArgs(["node", "script.mjs"]);
  assert.equal(a.apply, false);
  assert.equal(a.limit, null);
  assert.equal(a.concurrency, DEFAULT_CONCURRENCY);
  assert.equal(a.hostIntervalMs, DEFAULT_HOST_INTERVAL_MS);
  assert.equal(a.timeBudgetMs, DEFAULT_TIME_BUDGET_MIN * 60000);
  assert.equal(a.outDir, "dossiers");
});

test("parseArgs: --apply, --limit, --out-dir parsed", () => {
  const a = parseArgs(["node", "script.mjs", "--apply", "--limit", "20", "--out-dir", "/tmp/d"]);
  assert.equal(a.apply, true);
  assert.equal(a.limit, 20);
  assert.equal(a.outDir, "/tmp/d");
});

test("parseArgs: concurrency clamped to MAX_CONCURRENCY (never honors a higher value)", () => {
  const a = parseArgs(["node", "script.mjs", "--concurrency", "99"]);
  assert.equal(a.concurrency, MAX_CONCURRENCY);
});

test("parseArgs: host-interval clamped UP to the minimum politeness bound", () => {
  const a = parseArgs(["node", "script.mjs", "--host-interval-ms", "10"]);
  assert.equal(a.hostIntervalMs, DEFAULT_HOST_INTERVAL_MS);
});

test("parseArgs: a non-integer --limit is ignored (null, no cap)", () => {
  const a = parseArgs(["node", "script.mjs", "--limit", "abc"]);
  assert.equal(a.limit, null);
});

// ── createHostThrottle ────────────────────────────────────────────────────────────────────────────
test("host throttle: waits out the remaining interval for the SAME host, not a different one", async () => {
  let clock = 0;
  const sleeps = [];
  const now = () => clock;
  const sleep = async (ms) => { sleeps.push(ms); clock += ms; };
  const waitTurn = createHostThrottle({ minIntervalMs: 1000, now, sleep });

  await waitTurn("a.example"); // first hit — no wait
  assert.deepEqual(sleeps, []);
  clock += 200; // only 200ms elapsed
  await waitTurn("a.example"); // same host — must wait the remaining 800ms
  assert.deepEqual(sleeps, [800]);

  await waitTurn("b.example"); // a DIFFERENT host — no wait, even though a.example is throttled
  assert.deepEqual(sleeps, [800]);
});

test("host throttle: no wait once >=minIntervalMs has genuinely elapsed", async () => {
  let clock = 0;
  const sleeps = [];
  const waitTurn = createHostThrottle({ minIntervalMs: 1000, now: () => clock, sleep: async (ms) => { sleeps.push(ms); } });
  await waitTurn("a.example");
  clock += 1500;
  await waitTurn("a.example");
  assert.deepEqual(sleeps, []);
});

// ── runBounded ────────────────────────────────────────────────────────────────────────────────────
test("runBounded: never exceeds the concurrency bound", async () => {
  let inFlight = 0, maxInFlight = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  const worker = async () => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return "ok";
  };
  const results = await runBounded(items, worker, { concurrency: 3 });
  assert.ok(maxInFlight <= 3, `max in-flight ${maxInFlight} must be <= 3`);
  assert.equal(results.length, 10);
  assert.ok(results.every((r) => !r.skipped && r.result === "ok"));
});

test("runBounded: a worker error is captured per-item, not thrown out of the runner", async () => {
  const results = await runBounded([1, 2], async (i) => { if (i === 2) throw new Error("boom"); return "ok"; }, { concurrency: 2 });
  const err = results.find((r) => r.item === 2);
  const ok = results.find((r) => r.item === 1);
  assert.equal(err.error, "boom");
  assert.equal(ok.result, "ok");
});

test("runBounded: past the deadline, no NEW item starts — the remainder is skipped", async () => {
  let clock = 0;
  const now = () => clock;
  const started = [];
  const items = [1, 2, 3, 4];
  const worker = async (i) => { started.push(i); clock += 100; return "ok"; };
  const results = await runBounded(items, worker, { concurrency: 1, deadlineAt: 150, now });
  // item 1 starts (clock=0 <= 150), runs, clock -> 100; item 2 starts (100 <= 150), runs, clock -> 200;
  // item 3: now()=200 > 150 -> skipped, and everything after it too.
  assert.deepEqual(started, [1, 2]);
  const skipped = results.filter((r) => r.skipped).map((r) => r.item);
  assert.deepEqual(skipped, [3, 4]);
});

// ── qualifiesAtFloor ──────────────────────────────────────────────────────────────────────────────
test("qualifiesAtFloor: an unclassified host never qualifies, even with no floor (no guess)", () => {
  assert.equal(qualifiesAtFloor(null, null), false);
  assert.equal(qualifiesAtFloor(null, 5), false);
});
test("qualifiesAtFloor: a classified host qualifies against a null floor", () => {
  assert.equal(qualifiesAtFloor(1, null), true);
});
test("qualifiesAtFloor: numerically <= the floor qualifies; a weaker (higher-numbered) tier does not", () => {
  assert.equal(qualifiesAtFloor(1, 2), true);  // tier 1 (best) clears a tier-2 floor
  assert.equal(qualifiesAtFloor(2, 2), true);  // equal clears
  assert.equal(qualifiesAtFloor(4, 2), false); // tier 4 is WEAKER than a tier-2 floor — no downgrade
});

// ── fetchStatusForDossier ─────────────────────────────────────────────────────────────────────────
test("fetchStatusForDossier: recovered -> ok", () => {
  assert.equal(fetchStatusForDossier({ outcome: "recovered", probe: {} }), "ok");
});
test("fetchStatusForDossier: mirrors fetchStatusFromPf's cdn_block / soft_404 / catch-all-blocked vocabulary", () => {
  assert.equal(fetchStatusForDossier({ outcome: "still_inaccessible", probe: { primary: { reason: "cdn_block" } } }), "cdn_block");
  assert.equal(fetchStatusForDossier({ outcome: "still_inaccessible", probe: { primary: { reason: "soft_404" } } }), "soft_404");
  assert.equal(fetchStatusForDossier({ outcome: "still_inaccessible", probe: { primary: { reason: "challenge_stub" } } }), "blocked");
  assert.equal(fetchStatusForDossier({ outcome: "alternative_found", probe: { primary: { reason: "empty_stub" } } }), "blocked");
});
test("fetchStatusForDossier: no determinate reason -> null (ambiguous, leave unchanged)", () => {
  assert.equal(fetchStatusForDossier({ outcome: "still_inaccessible", probe: {} }), null);
  assert.equal(fetchStatusForDossier({ outcome: "still_inaccessible", probe: { primary: { reason: "ok" } } }), null);
});

// ── probeHead / probeGet (fake fetch, no network) ────────────────────────────────────────────────
function fakeResponse({ status = 200, text = "", redirected = false, url }) {
  return { status, redirected, url, text: async () => text };
}

test("probeHead: records status/redirect/finalUrl; a throw is reported, not thrown", async () => {
  const fetchImpl = async (u, init) => { assert.equal(init.method, "HEAD"); return fakeResponse({ status: 200, redirected: true, url: u + "/final" }); };
  const h = await probeHead(fetchImpl, "https://x.example/a", 5000);
  assert.deepEqual(h, { status: 200, redirected: true, finalUrl: "https://x.example/a/final" });

  const throwingFetch = async () => { throw new Error("dns fail"); };
  const h2 = await probeHead(throwingFetch, "https://x.example/b", 5000);
  assert.equal(h2.status, null);
  assert.equal(h2.err, "dns fail");
});

test("probeGet: a 403 on the primary fingerprint retries ONCE with the alt fingerprint (capture-worker's own rule)", async () => {
  const calls = [];
  const fetchImpl = async (u, init) => {
    calls.push(init.headers["User-Agent"]);
    if (calls.length === 1) return fakeResponse({ status: 403, url: u });
    return fakeResponse({ status: 200, text: EN(300), url: u });
  };
  const r = await probeGet(fetchImpl, "https://x.example/a", 5000);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1], "the retry must present a DIFFERENT browser fingerprint");
  assert.equal(r.status, 200);
  assert.equal(r.usedAlt, true);
  assert.equal(r.text, EN(300));
});

test("probeGet: a 403 that survives BOTH fingerprints terminalizes as 403, no infinite retry", async () => {
  const fetchImpl = async (u) => fakeResponse({ status: 403, url: u });
  const r = await probeGet(fetchImpl, "https://x.example/a", 5000);
  assert.equal(r.status, 403);
  assert.equal(r.usedAlt, false);
});

test("probeGet: a network throw returns a zero-status non-throwing result", async () => {
  const r = await probeGet(async () => { throw new Error("ETIMEDOUT"); }, "https://x.example/a", 5000);
  assert.equal(r.status, 0);
  assert.equal(r.text, "");
  assert.equal(r.err, "ETIMEDOUT");
});

// ── triageOneSource (fake fetch; REAL ladder wiring: fetchPrimaryWithFallback + generateCandidates +
//    officialnessOf + classTierForHost) ──────────────────────────────────────────────────────────
const noThrottle = async () => {};

test("triageOneSource: a healthy primary -> recovered, no alternative search needed", async () => {
  const source = { id: "s1", url: "https://reg.example/page", name: "Example Regulator", base_tier: 3 };
  const fetchImpl = async (u, init) => fakeResponse({ status: 200, text: EN(3000), url: u, redirected: false });
  const d = await triageOneSource(source, { fetchImpl, throttle: noThrottle, perFetchMs: 5000 });
  assert.equal(d.outcome, "recovered");
  assert.equal(d.source_id, "s1");
  assert.equal(d.probe.primary.status, 200);
  assert.equal(d.ladder_steps.length, 1);
  assert.equal(d.ladder_steps[0].role, "declared_primary");
});

test("triageOneSource: primary roadblocked, UK jurisdiction -> the ladder's own search surface finds a qualifying alternative", async () => {
  const source = { id: "s2", url: "https://dead.example/portal", name: "UK Freight Rules Register", jurisdictions: ["UK"], base_tier: 2 };
  const fetchImpl = async (u, init) => {
    if (u.includes("dead.example")) return fakeResponse({ status: 200, text: "", url: u }); // empty stub — roadblock
    if (u.includes("legislation.gov.uk")) return fakeResponse({ status: 200, text: EN(5000), url: u });
    return fakeResponse({ status: 404, url: u });
  };
  const d = await triageOneSource(source, { fetchImpl, throttle: noThrottle, perFetchMs: 5000 });
  assert.equal(d.outcome, "alternative_found");
  assert.equal(d.evidence.qualifies, true);
  assert.equal(d.evidence.hostTier, 1); // legislation.gov.uk is LEGAL_PRIMARY -> codified tier 1
  assert.ok(d.evidence.qualifiedUrl.includes("legislation.gov.uk"));
  assert.ok(d.ladder_steps.length >= 2, "primary + at least one alternative attempt recorded");
});

test("triageOneSource: primary roadblocked, no jurisdiction/scheme match -> still_inaccessible (honest exhaustion)", async () => {
  const source = { id: "s3", url: "https://dead.example/x", name: "An Unclassifiable Portal", base_tier: 4 };
  const fetchImpl = async (u) => fakeResponse({ status: 200, text: "", url: u }); // always an empty stub
  const d = await triageOneSource(source, { fetchImpl, throttle: noThrottle, perFetchMs: 5000 });
  assert.equal(d.outcome, "still_inaccessible");
  assert.equal(d.evidence.candidatesTried, 0, "no scheme matched, so the deterministic ladder found nothing to try");
});

test("triageOneSource: a fetchable alternative that does NOT clear the floor is recorded, never promoted", async () => {
  // Inject a fake generateCandidates so the alternative lands on an unclassified host (classTierForHost -> null)
  // — proves the moat holds even when real content IS fetched at the alternative.
  const source = { id: "s4", url: "https://dead.example/x", name: "X", base_tier: 2 };
  const fetchImpl = async (u) => {
    if (u.includes("dead.example")) return fakeResponse({ status: 200, text: "", url: u });
    return fakeResponse({ status: 200, text: EN(3000), url: u }); // real content, but on an unranked host
  };
  const d = await triageOneSource(source, {
    fetchImpl, throttle: noThrottle, perFetchMs: 5000,
    generateCandidatesFn: async () => ["https://unranked.example/found"],
  });
  assert.equal(d.outcome, "still_inaccessible");
  assert.equal(d.evidence.qualifies, false);
  assert.equal(d.evidence.hostTier, null);
  assert.equal(d.evidence.qualifiedUrl, "https://unranked.example/found");
});

// ── applyFetchStatus ──────────────────────────────────────────────────────────────────────────────
test("applyFetchStatus: groups dossiers by fetch_status and writes each group through the guarded path", async () => {
  const dossiers = [
    { source_id: "a", outcome: "recovered", probe: {} },
    { source_id: "b", outcome: "still_inaccessible", probe: { primary: { reason: "cdn_block" } } },
    { source_id: "c", outcome: "still_inaccessible", probe: { primary: { reason: "cdn_block" } } },
    { source_id: "d", outcome: "still_inaccessible", probe: {} }, // ambiguous — excluded
  ];
  const calls = [];
  const guardedUpdateByIds = async (table, ids, patch, opts) => { calls.push({ table, ids, patch, cite: opts.cite }); return { updated: ids.length }; };
  const r = await applyFetchStatus(dossiers, { guardedUpdateByIds });
  assert.equal(r.attempted, true);
  assert.equal(r.updated, 3);
  assert.equal(calls.length, 2);
  const ok = calls.find((c) => c.patch.fetch_status === "ok");
  const cdn = calls.find((c) => c.patch.fetch_status === "cdn_block");
  assert.deepEqual(ok.ids, ["a"]);
  assert.deepEqual(cdn.ids.sort(), ["b", "c"]);
  assert.ok(ok.cite.skill && ok.cite.reason, "every write carries a governing-skill cite (rule 015)");
});

test("applyFetchStatus: a missing sources.fetch_status column degrades gracefully (dossiers stand as the artifact)", async () => {
  const dossiers = [{ source_id: "a", outcome: "recovered", probe: {} }];
  const guardedUpdateByIds = async () => { throw new Error('column "fetch_status" of relation "sources" does not exist'); };
  const r = await applyFetchStatus(dossiers, { guardedUpdateByIds });
  assert.equal(r.column_exists, false);
  assert.match(r.note, /migration 147 not applied/);
});

test("applyFetchStatus: no determinate dossier -> attempted:false, no call made", async () => {
  const dossiers = [{ source_id: "a", outcome: "still_inaccessible", probe: {} }];
  let called = false;
  const r = await applyFetchStatus(dossiers, { guardedUpdateByIds: async () => { called = true; } });
  assert.equal(r.attempted, false);
  assert.equal(called, false);
});

// ── main (dry + apply, fake readAll/DB/fetch/fs) ─────────────────────────────────────────────────
function fakeReadAll(sources) {
  return async (table, cols, { match } = {}) => {
    assert.equal(table, "sources");
    // simulate the .eq("status","suspended") filter applied by main()
    let q = { _eq: null };
    if (match) match({ eq: (col, val) => { q._eq = [col, val]; return q; } });
    return sources.filter((s) => (q._eq ? s[q._eq[0]] === q._eq[1] : true));
  };
}

test("main: dry run triages every suspended source, writes dossiers, mutates nothing", async () => {
  const sources = [
    { id: "s1", url: "https://ok.example/a", name: "OK Source", status: "suspended", base_tier: 3 },
    { id: "s2", url: "https://dead.example/b", name: "Dead Source", status: "suspended", base_tier: 3 },
    { id: "s3", url: "https://ok.example/c", name: "Active Source", status: "active", base_tier: 3 },
  ];
  const fetchImpl = async (u) => (u.includes("ok.example") ? { status: 200, redirected: false, url: u, text: async () => EN(2000) }
                                                             : { status: 200, redirected: false, url: u, text: async () => "" });
  const written = [];
  let dbCalled = false;
  const r = await main(
    { apply: false, concurrency: 2, hostIntervalMs: 0, timeBudgetMs: 5 * 60000 },
    {
      readAll: fakeReadAll(sources),
      guardedUpdateByIds: async () => { dbCalled = true; },
      fetchImpl,
      writeDossierFile: (dir, d) => written.push(d.source_id),
      writeSummaryFile: () => {},
    },
  );
  assert.equal(r.summary.suspended, 2, "only status=suspended sources are read (active is excluded)");
  assert.equal(r.summary.triaged, 2);
  assert.equal(r.summary.recovered, 1);
  assert.equal(r.summary.still_inaccessible, 1);
  assert.deepEqual(written.sort(), ["s1", "s2"]);
  assert.equal(dbCalled, false, "dry run must not touch the DB");
  assert.equal(r.dbWrite.attempted, false);
});

test("main: --apply writes sources.fetch_status through the guarded path", async () => {
  const sources = [{ id: "s1", url: "https://ok.example/a", name: "OK Source", status: "suspended", base_tier: 3 }];
  const fetchImpl = async (u) => ({ status: 200, redirected: false, url: u, text: async () => EN(2000) });
  const dbCalls = [];
  const r = await main(
    { apply: true, concurrency: 1, hostIntervalMs: 0, timeBudgetMs: 5 * 60000 },
    {
      readAll: fakeReadAll(sources),
      guardedUpdateByIds: async (table, ids, patch, opts) => { dbCalls.push({ table, ids, patch }); return { updated: ids.length }; },
      fetchImpl,
      writeDossierFile: () => {},
      writeSummaryFile: () => {},
    },
  );
  assert.equal(dbCalls.length, 1);
  assert.equal(dbCalls[0].table, "sources");
  assert.deepEqual(dbCalls[0].ids, ["s1"]);
  assert.equal(dbCalls[0].patch.fetch_status, "ok");
  assert.equal(r.dbWrite.updated, 1);
});

test("main: the time budget stops starting new triages but already-triaged sources still get a dossier", async () => {
  const sources = [
    { id: "s1", url: "https://ok.example/a", name: "A", status: "suspended", base_tier: 3 },
    { id: "s2", url: "https://ok.example/b", name: "B", status: "suspended", base_tier: 3 },
  ];
  let clock = 0;
  const now = () => clock;
  const fetchImpl = async (u) => { clock += 1000; return { status: 200, redirected: false, url: u, text: async () => EN(2000) }; };
  const written = [];
  const r = await main(
    { apply: false, concurrency: 1, hostIntervalMs: 0, timeBudgetMs: 500 }, // budget exhausted after the 1st source's fetches
    {
      readAll: fakeReadAll(sources), guardedUpdateByIds: async () => {}, fetchImpl,
      writeDossierFile: (dir, d) => written.push(d.source_id), writeSummaryFile: () => {},
      now, sleep: async () => {},
    },
  );
  assert.equal(r.summary.triaged, 1);
  assert.equal(r.summary.skipped_time_budget, 1);
  assert.deepEqual(written, ["s1"]);
});

// ── optional live smoke test (no network in normal CI runs) ─────────────────────────────────────────
test("LIVE: a single HEAD probe against a real free host", { skip: process.env.LIVE_PROBE !== "1" }, async () => {
  const h = await probeHead(fetch, "https://www.legislation.gov.uk/", 8000);
  assert.ok(typeof h.status === "number" || h.err, "either a real status or an honestly-recorded error");
});
