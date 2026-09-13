// capture-static-primaries.test.mjs -- D25 (defect-fix-plan-2026-09-12.md, lane L16). Run:
// node --test scripts/maintenance/capture-static-primaries.test.mjs -- no real DB, no real network;
// every fetch is a stubbed global.fetch or an injected fetchImpl, and every DB call is either a fake
// `deps` object (main() orchestration) or db.mjs's own write-client test seam (buildDeps real-wiring,
// the D22 pattern -- apply-classifications.test.mjs's own buildRealDeps section is the template).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  isStaticTextHost, htmlToText, deriveCelexTxtHtmlUrl, classifyCaptureOutcome, maxPoolLenByItem,
  partitionByPoolState, buildRow, buildRoadblockSummaryFlag, computeHostWaitMs, paceHost, parseIdsArg,
  makeDirectFetch, main, buildDeps, CITE, STATIC_TEXT_HOSTS, REG_FAMILY_ITEM_TYPES,
} from "./capture-static-primaries.mjs";
import { __setWriteClientForTest } from "../lib/db.mjs";

// ── isStaticTextHost / STATIC_TEXT_HOSTS ────────────────────────────────────────────────────────────────

test("isStaticTextHost: eur-lex.europa.eu and both legislation.gov.uk spellings match (hostOf strips www)", () => {
  assert.equal(isStaticTextHost("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115"), true);
  assert.equal(isStaticTextHost("https://www.legislation.gov.uk/uksi/2024/1/made"), true);
  assert.equal(isStaticTextHost("https://legislation.gov.uk/uksi/2024/1/made"), true);
  assert.equal(isStaticTextHost("https://www.federalregister.gov/documents/x"), true);
  assert.equal(isStaticTextHost("https://www.ecfr.gov/current/title-40"), true);
  assert.equal(isStaticTextHost("https://www.govinfo.gov/app/details/x"), true);
});

test("isStaticTextHost: an unrelated or malformed host/url is false, never throws", () => {
  assert.equal(isStaticTextHost("https://iso.org/standard/1"), false);
  assert.equal(isStaticTextHost("not a url"), false);
  assert.equal(isStaticTextHost(null), false);
  assert.equal(isStaticTextHost(undefined), false);
});

// ── htmlToText ──────────────────────────────────────────────────────────────────────────────────────────

test("htmlToText: strips tags/script/style, collapses whitespace", () => {
  const html = "<html><head><style>.x{color:red}</style></head><body><script>evil()</script><h1>Title</h1><p>Body   text.</p></body></html>";
  assert.equal(htmlToText(html), "Title Body text.");
});

test("htmlToText: never throws on null/undefined", () => {
  assert.equal(htmlToText(null), "");
  assert.equal(htmlToText(undefined), "");
});

// ── deriveCelexTxtHtmlUrl ───────────────────────────────────────────────────────────────────────────────

test("deriveCelexTxtHtmlUrl: derives the clean-text form from a CELEX landing-page URL", () => {
  const url = deriveCelexTxtHtmlUrl("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115", null);
  assert.equal(url, "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1115");
});

test("deriveCelexTxtHtmlUrl: derives from instrument_identifier when the URL itself carries no CELEX token", () => {
  const url = deriveCelexTxtHtmlUrl("https://eur-lex.europa.eu/some/other/path", "32023R1115");
  assert.equal(url, "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1115");
});

test("deriveCelexTxtHtmlUrl: null when no CELEX id resolves anywhere", () => {
  assert.equal(deriveCelexTxtHtmlUrl("https://eur-lex.europa.eu/nothing", null), null);
});

test("deriveCelexTxtHtmlUrl: null when the URL is already the TXT/HTML clean-text form (no infinite retry)", () => {
  assert.equal(deriveCelexTxtHtmlUrl("https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1115", null), null);
});

// ── classifyCaptureOutcome ──────────────────────────────────────────────────────────────────────────────

test("classifyCaptureOutcome: a content outcome is ok with its text", () => {
  const r = classifyCaptureOutcome({ outcome: "content", text: "Article 1. Real law text.".repeat(20) });
  assert.equal(r.ok, true);
  assert.ok(r.text.length > 200);
});

test("classifyCaptureOutcome: a no_reachable_source outcome carries holdReason as the reason", () => {
  const r = classifyCaptureOutcome({ outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE", reason: "cdn_block" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NO_REACHABLE_SOURCE");
});

test("classifyCaptureOutcome: a seek_more outcome carries the not-found class as the reason", () => {
  const r = classifyCaptureOutcome({ outcome: "seek_more", reason: "http_404" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "http_404");
});

// ── maxPoolLenByItem / partitionByPoolState ─────────────────────────────────────────────────────────────

test("maxPoolLenByItem: keeps the LONGEST result_content per item", () => {
  const m = maxPoolLenByItem([
    { intelligence_item_id: "a", result_content: "x".repeat(50) },
    { intelligence_item_id: "a", result_content: "x".repeat(300) },
    { intelligence_item_id: "b", result_content: "x".repeat(10) },
  ]);
  assert.equal(m.get("a"), 300);
  assert.equal(m.get("b"), 10);
  assert.equal(m.has("c"), false);
});

test("partitionByPoolState: an item at or above 200 chars is idempotently skipped (alreadyCaptured)", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const poolMax = new Map([["a", 500], ["b", 200], ["c", 199]]);
  const { toCapture, alreadyCaptured } = partitionByPoolState(items, poolMax);
  assert.deepEqual(toCapture.map((i) => i.id), ["b", "c"]); // exactly 200 is NOT "over 200" -> still capture
  assert.deepEqual(alreadyCaptured.map((i) => i.id), ["a"]);
});

// ── buildRow / buildRoadblockSummaryFlag ────────────────────────────────────────────────────────────────

test("buildRow: the exact pool row shape the export and the driver read", () => {
  const row = buildRow("item-1", "https://eur-lex.europa.eu/x", "Article 1 text.", "2026-09-13T00:00:00.000Z");
  assert.deepEqual(row, {
    intelligence_item_id: "item-1",
    search_query: "canonical ground",
    result_url: "https://eur-lex.europa.eu/x",
    result_title: "source",
    result_index: 0,
    result_content: "Article 1 text.",
    searched_at: "2026-09-13T00:00:00.000Z",
  });
});

test("buildRoadblockSummaryFlag: null when nothing roadblocked (no flag written)", () => {
  assert.equal(buildRoadblockSummaryFlag([]), null);
  assert.equal(buildRoadblockSummaryFlag(null), null);
});

test("buildRoadblockSummaryFlag: ONE row summarising every roadblocked item, never one per item", () => {
  const roadblocked = [
    { id: "a", host: "eur-lex.europa.eu", url: "u1", reason: "cdn_block" },
    { id: "b", host: "eur-lex.europa.eu", url: "u2", reason: "cdn_block" },
    { id: "c", host: "legislation.gov.uk", url: "u3", reason: "http_404" },
  ];
  const flag = buildRoadblockSummaryFlag(roadblocked, "2026-09-13T00:00:00.000Z");
  assert.equal(flag.category, "source_issue");
  assert.equal(flag.subject_type, "system");
  assert.equal(flag.status, "open");
  assert.equal(flag.created_by, "capture-static-primaries");
  assert.ok(flag.description.includes("3 item(s) roadblocked"));
  assert.equal(flag.recommended_actions.length, 3);
});

// ── computeHostWaitMs / paceHost ─────────────────────────────────────────────────────────────────────────

test("computeHostWaitMs: 0 when no prior fetch to this host", () => {
  assert.equal(computeHostWaitMs(new Map(), "eur-lex.europa.eu", 1000), 0);
});

test("computeHostWaitMs: waits the remainder of the 1-second gap", () => {
  const m = new Map([["eur-lex.europa.eu", 1000]]);
  assert.equal(computeHostWaitMs(m, "eur-lex.europa.eu", 1400), 600);
  assert.equal(computeHostWaitMs(m, "eur-lex.europa.eu", 2000), 0);
});

test("paceHost: awaits the computed wait via the injected sleep, never a real timer, then stamps the host", async () => {
  const m = new Map([["eur-lex.europa.eu", 1000]]);
  let sleptMs = null;
  await paceHost(m, "eur-lex.europa.eu", { now: () => 1200, sleep: async (ms) => { sleptMs = ms; }, gapMs: 1000 });
  assert.equal(sleptMs, 800);
  assert.equal(m.get("eur-lex.europa.eu"), 1200);
});

test("paceHost: two different hosts never wait on each other", async () => {
  const m = new Map([["eur-lex.europa.eu", 1000]]);
  let slept = false;
  await paceHost(m, "legislation.gov.uk", { now: () => 1000, sleep: async () => { slept = true; }, gapMs: 1000 });
  assert.equal(slept, false);
});

// ── parseIdsArg ─────────────────────────────────────────────────────────────────────────────────────────

test("parseIdsArg: null for a blank/unscoped arg", () => {
  assert.equal(parseIdsArg(""), null);
  assert.equal(parseIdsArg(undefined), null);
});

test("parseIdsArg: splits and trims an ids: list", () => {
  assert.deepEqual(parseIdsArg("ids: a , b,c "), ["a", "b", "c"]);
});

// ── makeDirectFetch (stubbed global fetch -- no real network) ───────────────────────────────────────────

test("makeDirectFetch: HTML in, text out; status/truncated/fullLength/cap carried", async () => {
  const stub = async () => ({ status: 200, text: async () => "<h1>Real Law</h1><p>" + "x".repeat(300) + "</p>" });
  const directFetch = makeDirectFetch({ fetchImpl: stub, max: 100000 });
  const r = await directFetch("https://eur-lex.europa.eu/x");
  assert.equal(r.status, 200);
  assert.ok(r.text.startsWith("Real Law x"));
  assert.equal(r.truncated, false);
  assert.equal(r.cap, 100000);
});

test("makeDirectFetch: a body over `max` chars is truncated, never silently (truncated:true, fullLength kept)", async () => {
  const big = "y".repeat(500);
  const stub = async () => ({ status: 200, text: async () => big });
  const directFetch = makeDirectFetch({ fetchImpl: stub, max: 100 });
  const r = await directFetch("https://eur-lex.europa.eu/x");
  assert.equal(r.truncated, true);
  assert.equal(r.text.length, 100);
  assert.equal(r.fullLength, 500);
});

test("makeDirectFetch: a network error is reported as a low-status result, never thrown", async () => {
  const stub = async () => { throw new Error("ECONNRESET"); };
  const directFetch = makeDirectFetch({ fetchImpl: stub });
  const r = await directFetch("https://eur-lex.europa.eu/x");
  assert.equal(r.status, 0);
  assert.equal(r.text, "");
});

test("makeDirectFetch: an aborted (timeout) fetch is reported timedOut:true, never thrown", async () => {
  const stub = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const directFetch = makeDirectFetch({ fetchImpl: stub, timeoutMs: 5 });
  const r = await directFetch("https://eur-lex.europa.eu/x");
  assert.equal(r.timedOut, true);
  assert.equal(r.status, 0);
});

test("makeDirectFetch: never reads BROWSERLESS_API_KEY (its own source text names no such env var)", () => {
  const src = readFileSync(fileURLToPath(new URL("./capture-static-primaries.mjs", import.meta.url)), "utf8");
  assert.ok(!src.includes("BROWSERLESS_API_KEY"), "capture-static-primaries.mjs must never read BROWSERLESS_API_KEY");
});

// ── main() orchestration (fake deps -- no DB, no network) ────────────────────────────────────────────────

function baseDeps(overrides = {}) {
  const calls = [];
  const d = {
    holdEngaged: () => false,
    readUnscopedCandidates: async () => { calls.push(["readUnscopedCandidates"]); return []; },
    readByIds: async (ids) => { calls.push(["readByIds", ids]); return []; },
    readPoolRows: async (ids) => { calls.push(["readPoolRows", ids]); return []; },
    fetchViaLadder: async (url) => { calls.push(["fetchViaLadder", url]); return { outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" }; },
    paceHost: async (host) => { calls.push(["paceHost", host]); },
    insertRow: async (row) => { calls.push(["insertRow", row]); return { id: "row-1", result_url: row.result_url }; },
    insertRoadblockFlag: async (row) => { calls.push(["insertRoadblockFlag", row]); return { id: "flag-1" }; },
    ...overrides,
  };
  d.calls = calls;
  return d;
}

test("main: SCRAPE_HOLD engaged -> refuses the whole run, fetches and writes nothing", async () => {
  const d = baseDeps({ holdEngaged: () => true });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 0);
  assert.ok(/SCRAPE_HOLD engaged/.test(r.note));
  assert.equal(d.calls.some((c) => c[0] === "fetchViaLadder"), false);
  assert.equal(d.calls.some((c) => c[0] === "insertRow"), false);
});

test("main: dry lists selected items and writes nothing", async () => {
  const items = [
    { id: "a", source_url: "https://eur-lex.europa.eu/x", instrument_identifier: null },
    { id: "b", source_url: "https://iso.org/y", instrument_identifier: null }, // not a static-text host
  ];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    readPoolRows: async () => [],
  });
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.counts.candidates_scanned, 2);
  assert.equal(r.counts.skipped_host_not_static, 1);
  assert.equal(r.counts.would_capture, 1);
  assert.deepEqual(r.per_item, [{ id: "a", host: "eur-lex.europa.eu", source_url: "https://eur-lex.europa.eu/x", action: "would_fetch" }]);
  assert.equal(d.calls.some((c) => c[0] === "fetchViaLadder"), false);
});

test("main: an item with an existing >200-char pool row is idempotently skipped, even in apply mode", async () => {
  const items = [{ id: "a", source_url: "https://eur-lex.europa.eu/x", instrument_identifier: null }];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    readPoolRows: async () => [{ intelligence_item_id: "a", result_content: "x".repeat(500) }],
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.already_captured_skipped, 1);
  assert.equal(r.counts.would_capture, 0);
  assert.equal(r.applied, 0);
  assert.equal(d.calls.some((c) => c[0] === "fetchViaLadder"), false);
});

test("main: apply captures a successful direct-fetch item and writes ONE row", async () => {
  const items = [{ id: "a", source_url: "https://legislation.gov.uk/x", instrument_identifier: null }];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    readPoolRows: async (ids) => (ids.length && d.calls.filter((c) => c[0] === "insertRow").length ? [{ intelligence_item_id: "a", result_content: "x".repeat(500) }] : []),
    fetchViaLadder: async () => ({ outcome: "content", text: "Real act text. ".repeat(20) }),
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 1);
  assert.equal(r.counts.captured, 1);
  assert.equal(r.counts.roadblocked, 0);
  assert.equal(r.counts.roadblock_flag_written, false);
  const insertCall = d.calls.find((c) => c[0] === "insertRow");
  assert.ok(insertCall);
  assert.equal(insertCall[1].intelligence_item_id, "a");
  assert.equal(insertCall[1].result_url, "https://legislation.gov.uk/x");
  assert.equal(insertCall[1].search_query, "canonical ground");
});

test("main: a non-eur-lex roadblock is reported and NO row is written; ONE summary flag is written", async () => {
  const items = [{ id: "a", source_url: "https://legislation.gov.uk/x", instrument_identifier: null }];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    fetchViaLadder: async () => ({ outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" }),
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.counts.roadblocked, 1);
  assert.equal(r.counts.roadblock_flag_written, true);
  assert.equal(d.calls.some((c) => c[0] === "insertRow"), false);
  const flagCall = d.calls.find((c) => c[0] === "insertRoadblockFlag");
  assert.ok(flagCall);
  assert.equal(flagCall[1].recommended_actions.length, 1);
});

test("main: an eur-lex item whose first attempt fails retries the CELEX TXT/HTML form and captures on success", async () => {
  const items = [{ id: "a", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115", instrument_identifier: null }];
  const attempts = [];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    fetchViaLadder: async (url) => {
      attempts.push(url);
      if (url.includes("/TXT/HTML/")) return { outcome: "content", text: "Article 1 real text. ".repeat(15) };
      return { outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" };
    },
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(attempts.length, 2);
  assert.ok(attempts[1].includes("/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1115"));
  assert.equal(r.applied, 1);
  const insertCall = d.calls.find((c) => c[0] === "insertRow");
  assert.equal(insertCall[1].result_url, attempts[1]);
});

test("main: an eur-lex item that fails BOTH attempts is roadblocked on the second attempt's reason", async () => {
  const items = [{ id: "a", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115", instrument_identifier: null }];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    fetchViaLadder: async () => ({ outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" }),
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.roadblocked, 1);
  assert.equal(r.per_item[0].reason, "NO_REACHABLE_SOURCE");
});

test("main: ids: arg scopes to exactly those ids, still filtered to a static-text host", async () => {
  const d = baseDeps({
    readByIds: async (ids) => {
      assert.deepEqual(ids, ["a", "b"]);
      return [
        { id: "a", source_url: "https://eur-lex.europa.eu/x", instrument_identifier: null },
        { id: "b", source_url: "https://iso.org/y", instrument_identifier: null },
      ];
    },
  });
  const r = await main({ mode: "dry", arg: "ids:a,b" }, d);
  assert.equal(r.counts.candidates_scanned, 2);
  assert.equal(r.counts.skipped_host_not_static, 1);
  assert.equal(r.counts.would_capture, 1);
});

test("main: THREE roadblocked items in one apply run write exactly ONE integrity flag naming all three (review-l16.md I1)", async () => {
  const items = [
    { id: "item-a", source_url: "https://legislation.gov.uk/a", instrument_identifier: null },
    { id: "item-b", source_url: "https://federalregister.gov/b", instrument_identifier: null },
    { id: "item-c", source_url: "https://ecfr.gov/c", instrument_identifier: null },
  ];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    fetchViaLadder: async () => ({ outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" }),
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.roadblocked, 3);
  const flagCalls = d.calls.filter((c) => c[0] === "insertRoadblockFlag");
  assert.equal(flagCalls.length, 1, "exactly one integrity-flag insert for the whole run, never one per item");
  const description = flagCalls[0][1].description;
  for (const it of items) {
    assert.ok(description.includes(it.id), `summary flag description must name ${it.id}`);
  }
});

test("main: paces the host before every fetch attempt (idempotency + the second CELEX retry both pace)", async () => {
  const items = [{ id: "a", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115", instrument_identifier: null }];
  const d = baseDeps({
    readUnscopedCandidates: async () => items,
    fetchViaLadder: async (url) => (url.includes("/TXT/HTML/") ? { outcome: "content", text: "x".repeat(300) } : { outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" }),
  });
  await main({ mode: "apply" }, d);
  const paceCalls = d.calls.filter((c) => c[0] === "paceHost");
  assert.equal(paceCalls.length, 2);
  assert.ok(paceCalls.every((c) => c[1] === "eur-lex.europa.eu"));
});

// ── buildDeps() real wiring (D22 pattern -- resolve-provisional-sources.npmtest.mjs / apply-classifications
//    .test.mjs's buildRealDeps section is the template: swap db.mjs's write-client seam for a fake Supabase
//    client so a missing import inside buildDeps throws the SAME ReferenceError here it would in production;
//    a passing test proves the closures are actually wired, not just that main()'s fake-deps orchestration
//    is correct). No real network: escalateToFetchResult's own directFetch here is never invoked by this
//    test (it only proves the DB-backed deps resolve); the transport itself is proven above via
//    makeDirectFetch's own stubbed-fetch tests and transport-runtime.test.mjs's renderAllowed:false tests. ──

function makeClient(handler, calls) {
  function from(table) {
    const state = { table, verb: "select", ops: [] };
    const settle = () => { calls.push({ table: state.table, verb: state.verb, ops: state.ops.slice() }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { if (state.verb !== "insert" && state.verb !== "update" && state.verb !== "delete") state.verb = "select"; state.ops.push(["select", c]); return b; },
      insert(p) { state.verb = "insert"; state.ops.push(["insert", p]); return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      // NOTE: returns `b` (chainable), NOT settle() -- db.mjs's readAll calls .range(from,to) and THEN
      // applies `match(q)` on the result (order -> range -> match), so a fake .range() that settles
      // immediately would make any post-range .eq()/.in() in `match` throw "not a function", exactly the
      // way real supabase-js's PostgrestFilterBuilder stays chainable after .range() until it is awaited.
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      maybeSingle() { return settle(); },
      single() { return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from };
}

test("buildDeps(): every dep is present and callable (no ReferenceError)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => ({ data: [], error: null }), calls));
  const deps = await buildDeps();
  assert.equal(typeof deps.holdEngaged, "function");
  assert.equal(typeof deps.readUnscopedCandidates, "function");
  assert.equal(typeof deps.readByIds, "function");
  assert.equal(typeof deps.readPoolRows, "function");
  assert.equal(typeof deps.fetchViaLadder, "function");
  assert.equal(typeof deps.paceHost, "function");
  assert.equal(typeof deps.insertRow, "function");
  assert.equal(typeof deps.insertRoadblockFlag, "function");
  __setWriteClientForTest(null);
});

test("buildDeps().readUnscopedCandidates: calls the real readAll against intelligence_items with the reg-family filter", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "intelligence_items" && s.verb === "select") return { data: [{ id: "x1" }], error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));
  const deps = await buildDeps();
  const rows = await deps.readUnscopedCandidates();
  assert.deepEqual(rows, [{ id: "x1" }]);
  const eqIsArchived = calls.find((c) => c.table === "intelligence_items").ops.find((o) => o[0] === "eq" && o[1] === "is_archived");
  assert.ok(eqIsArchived);
  const inItemType = calls.find((c) => c.table === "intelligence_items").ops.find((o) => o[0] === "in" && o[1] === "item_type");
  assert.deepEqual(inItemType[2], REG_FAMILY_ITEM_TYPES);
  __setWriteClientForTest(null);
});

test("buildDeps().readPoolRows: calls the real readAllByIds against agent_run_searches keyed by intelligence_item_id", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "agent_run_searches" && s.verb === "select") return { data: [{ intelligence_item_id: "a", result_content: "x".repeat(300) }], error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));
  const deps = await buildDeps();
  const rows = await deps.readPoolRows(["a"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].intelligence_item_id, "a");
  const inCall = calls.find((c) => c.table === "agent_run_searches").ops.find((o) => o[0] === "in" && o[1] === "intelligence_item_id");
  assert.deepEqual(inCall[2], ["a"]);
  __setWriteClientForTest(null);
});

test("buildDeps().readPoolRows: an empty id list never calls the DB at all", async () => {
  __setWriteClientForTest(() => makeClient(() => { throw new Error("must not be called for an empty id list"); }, []));
  const deps = await buildDeps();
  assert.deepEqual(await deps.readPoolRows([]), []);
  __setWriteClientForTest(null);
});

test("buildDeps().insertRow: calls the real guardedInsert against agent_run_searches (no ReferenceError)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "agent_run_searches" && s.verb === "insert") return { data: { id: "row-9", result_url: "https://eur-lex.europa.eu/x" }, error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));
  const deps = await buildDeps();
  const row = { intelligence_item_id: "a", search_query: "canonical ground", result_url: "https://eur-lex.europa.eu/x", result_title: "source", result_index: 0, result_content: "text", searched_at: new Date().toISOString() };
  const inserted = await deps.insertRow(row);
  assert.equal(inserted.id, "row-9");
  const insertCall = calls.find((c) => c.table === "agent_run_searches" && c.verb === "insert");
  assert.deepEqual(insertCall.ops.find((o) => o[0] === "insert")[1], row);
  __setWriteClientForTest(null);
});

test("buildDeps().insertRoadblockFlag: calls the real guardedInsert against integrity_flags (no ReferenceError)", async () => {
  const calls = [];
  __setWriteClientForTest(() => makeClient((s) => {
    if (s.table === "integrity_flags" && s.verb === "insert") return { data: { id: "flag-9" }, error: null };
    throw new Error(`unexpected call: ${s.table}/${s.verb}`);
  }, calls));
  const deps = await buildDeps();
  const flagRow = buildRoadblockSummaryFlag([{ id: "a", host: "eur-lex.europa.eu", url: "u", reason: "cdn_block" }]);
  const inserted = await deps.insertRoadblockFlag(flagRow);
  assert.equal(inserted.id, "flag-9");
  __setWriteClientForTest(null);
});

test("buildDeps().fetchViaLadder: wired to escalateToFetchResult with renderAllowed:false (real network stubbed via global.fetch)", async () => {
  __setWriteClientForTest(() => makeClient(() => ({ data: [], error: null }), []));
  // NO NETWORK CALLS IN TESTS: makeDirectFetch's own `fetchImpl = fetch` default param binds to
  // globalThis.fetch AT THE MOMENT buildDeps() constructs it -- so the stub MUST be installed BEFORE
  // buildDeps() runs, not merely before the call, or the closure keeps the real fetch reference. Restored
  // immediately after. Proves fetchViaLadder is wired to the real escalateToFetchResult + a real
  // directFetch closure (not a ReferenceError or a missing import) without ever touching the network.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, text: async () => "<h1>Real Law</h1><p>" + "x".repeat(300) + "</p>" });
  let r;
  try {
    const deps = await buildDeps();
    r = await deps.fetchViaLadder("https://eur-lex.europa.eu/x");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "direct");
  __setWriteClientForTest(null);
});

test("buildDeps().fetchViaLadder: a blocked response never escalates to render (renderAllowed:false wired through)", async () => {
  __setWriteClientForTest(() => makeClient(() => ({ data: [], error: null }), []));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 403, text: async () => "Request blocked. Access Denied." });
  let r;
  try {
    const deps = await buildDeps();
    r = await deps.fetchViaLadder("https://eur-lex.europa.eu/x");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(r.outcome, "no_reachable_source");
  assert.equal(r.holdReason, "NO_REACHABLE_SOURCE");
  assert.notEqual(r.transport, "render");
  __setWriteClientForTest(null);
});

// ── no Browserless anywhere in this step's import graph (static assertion) ─────────────────────────────

test("import graph: capture-static-primaries.mjs's own source never imports canonical-fetch.mjs / browserlessFetch", () => {
  const src = readFileSync(fileURLToPath(new URL("./capture-static-primaries.mjs", import.meta.url)), "utf8");
  const importLines = src.split("\n").filter((l) => /^\s*import\s/.test(l));
  assert.ok(importLines.every((l) => !/canonical-fetch\.mjs/.test(l)), "must not import canonical-fetch.mjs directly");
  assert.ok(!/\bbrowserlessFetch\s*\(/.test(src.replace(/\/\/.*$/gm, "")), "must never CALL browserlessFetch");
});

// Review-l16.md I2: the test above is a one-hop, same-file check. This walks the TRANSITIVE import
// closure the session-log describes a manual script walking (16 files: capture-static-primaries.mjs ->
// transport-runtime.mjs -> transport-escalation.mjs -> entity-gate.mjs/holdings-audit.mjs/
// primary-fallback.mjs -> ...; fetch-hold.mjs -> ...; canonical-key.mjs; institution-key.mjs; db.mjs ->
// ...; cli.mjs; is-main.mjs) with a small resolver over relative import specifiers, so a future addition
// three hops down the graph is caught mechanically rather than by a one-off manual pass.
function collectRelativeImportSpecs(src) {
  const specs = [];
  // Matches `import ... from "spec"` and bare `import "spec"`, one statement at a time -- the `[^"'\n]`
  // in the optional "from" segment keeps each match scoped to a single line/statement so it never spans
  // two import statements. Bare package specifiers (no leading ".") and node: builtins are filtered by
  // the caller, which is what "skip bare package specifiers and node_modules" reduces to when only
  // relative specifiers are ever followed.
  const re = /import\s+(?:[^"'\n]*?from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) specs.push(m[1]);
  return specs.filter((s) => s.startsWith("."));
}

test("import graph (transitive closure): no file in the closure imports canonical-fetch.mjs or calls browserlessFetch( (review-l16.md I2)", () => {
  const startFile = fileURLToPath(new URL("./capture-static-primaries.mjs", import.meta.url));
  const visited = new Set();
  const queue = [startFile];
  const importOffenders = [];
  const callOffenders = [];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue; // an unresolvable path is a separate (build-time) problem, not this test's concern
    }
    // Strip both block (/* */, incl. JSDoc) and line (//) comments before the CALL check -- several files
    // in this graph document their own dep-injection shape in a JSDoc block using the SAME parameter name
    // ("browserlessFetch(url) -> ...", primary-fallback.mjs's own fetchPrimaryWithFallback contract) and a
    // raw substring match on uncommented source would false-positive on that documentation, not a real
    // call. The IMPORT check does not need this: collectRelativeImportSpecs only matches quoted specifiers
    // inside an actual `import` statement, which prose/JSDoc never produces.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const spec of collectRelativeImportSpecs(src)) {
      if (/canonical-fetch\.mjs$/.test(spec)) importOffenders.push(`${file} imports "${spec}"`);
      const resolved = resolve(dirname(file), spec);
      if (!visited.has(resolved)) queue.push(resolved);
    }
    if (/\bbrowserlessFetch\s*\(/.test(codeOnly)) callOffenders.push(file);
  }
  const allPaths = [...visited];
  // A real multi-hop walk, not a one-file no-op -- the session-log's own manual walk named 16 files.
  assert.ok(allPaths.length >= 12, `expected a real transitive closure, got ${allPaths.length}: ${allPaths.join(", ")}`);
  assert.deepEqual(importOffenders, [], "no file in the transitive import closure may import canonical-fetch.mjs");
  assert.deepEqual(callOffenders, [], "no file in the transitive import closure may call browserlessFetch(");
});

test("CITE: carries the governing skill + reason (guardedInsert requires it)", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.ok(CITE.reason.length > 0);
});
