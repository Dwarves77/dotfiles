// live-candidates.test.mjs (lane SMOKE-3, 2026-10-10): the chooser that picks the Live smoke gate's conditional-invariant
// candidates FROM LIVE DATA, proven on a fake PostgREST (no network, no credential). Each class has a corpus with a
// candidate and one without; the inference rules are the customer read's own (current, not superseded, customer-visible
// method, not REFUTED, cited), the bias rule is the chips' own (a usable tag), and the pick is stable and bounded.
import test from "node:test";
import assert from "node:assert/strict";
import {
  restClient,
  summariseRows,
  visibleInferenceViews,
  resolveInferenceCandidates,
  resolveRecordCandidates,
  resolveBiasCandidates,
  resolveCandidates,
  candidateLines,
  runCandidatesCli,
  unresolvedCandidates,
  VISIT_PER_CLASS,
  SAMPLE_SIZE,
} from "./live-candidates.mjs";

const item = (id, over = {}) => ({ id, legacy_id: null, item_type: "regulation", domain: 1, ...over });
const inf = (id, over = {}) => ({
  inference_id: id,
  claim_text: "A claim.",
  status_token: "HYPOTHESIS",
  confidence: 0.6,
  cited_item_ids: ["i1"],
  origin_class: "derived",
  trigger_question_ref: null,
  method_id: "infer-from-question",
  admissibility: "current",
  computed_at: "2026-10-09T00:00:00Z",
  ...over,
});

/**
 * A fake rest(table, query): serves the tables from `db`, applying the two filters the resolvers rely on in the query
 * string (visible items: is_archived=false and provenance_status=verified; in.() lists) so a wrong query is a wrong answer.
 */
function fakeRest(db) {
  const calls = [];
  const rest = async (table, query) => {
    calls.push(table);
    const q = new URLSearchParams(query);
    let rows = db[table] ?? [];
    if (table === "intelligence_items") {
      if (q.get("is_archived") === "eq.false") rows = rows.filter((r) => r.is_archived !== true);
      if (q.get("provenance_status") === "eq.verified") rows = rows.filter((r) => r.provenance_status === "verified");
      if (q.get("item_grade") === "eq.record") rows = rows.filter((r) => r.item_grade === "record");
      const inId = q.get("id")?.match(/^in\.\((.*)\)$/)?.[1];
      if (inId) rows = rows.filter((r) => inId.split(",").includes(r.id));
      const inSrc = q.get("source_id")?.match(/^in\.\((.*)\)$/)?.[1];
      if (inSrc) rows = rows.filter((r) => inSrc.split(",").includes(r.source_id));
    }
    if (table === "inference_records") {
      if (q.get("admissibility") === "eq.current") rows = rows.filter((r) => r.admissibility === "current");
      if (q.get("supersedes") === "not.is.null") rows = rows.filter((r) => r.supersedes);
    }
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? rows.length);
    return rows.slice(offset, offset + limit).map((r) => ({ ...r }));
  };
  rest.calls = calls;
  return rest;
}
const verified = (id, over = {}) => ({ ...item(id), provenance_status: "verified", is_archived: false, ...over });

// ---------------------------------------------------------------- pure pieces
test("summariseRows: de-duplicates by id, orders by id, visits at most VISIT_PER_CLASS, samples at most SAMPLE_SIZE, uses legacy id else uuid", () => {
  const rows = [item("c"), item("a", { legacy_id: "g14" }), item("b", { item_type: "market_signal", domain: 6 }), item("a", { legacy_id: "g14" }), item("d")];
  const s = summariseRows(rows);
  assert.equal(s.count, 4);
  assert.equal(s.visit.length, VISIT_PER_CLASS);
  assert.equal(s.sample.length, SAMPLE_SIZE);
  assert.equal(s.visit[0], "/regulations/g14", "the first by id, shown by its legacy id");
  assert.match(s.visit[1], /^\/(market|regulations|research|operations)\/b$/);
  assert.deepEqual(summariseRows([]), { count: 0, visit: [], sample: [] });
  assert.deepEqual(summariseRows(null), { count: 0, visit: [], sample: [] });
});

test("visibleInferenceViews: keeps a current customer-method cited claim; drops REFUTED, uncited, superseded, a non-customer method and a non-current row", () => {
  const rows = [
    inf("keep"),
    inf("refuted", { status_token: "REFUTED" }),
    inf("uncited", { cited_item_ids: [] }),
    inf("old"),
    inf("internal", { method_id: "pool-position" }),
    inf("stale", { admissibility: "stale" }),
    inf("blank", { claim_text: "   " }),
  ];
  const out = visibleInferenceViews(rows, new Set(["old"]));
  assert.deepEqual(out.map((v) => v.id), ["keep"]);
  assert.deepEqual(visibleInferenceViews(null, new Set()), []);
});

// ---------------------------------------------------------------- the resolvers, on a fake database
test("inference class: an item cited by a visible inference is a candidate; a refuted, superseded, internal or archived-only citation is not", async () => {
  const rest = fakeRest({
    inference_records: [
      inf("v1", { cited_item_ids: ["i1", "i2"] }),
      inf("r1", { status_token: "REFUTED", cited_item_ids: ["i3"] }),
      inf("s1", { cited_item_ids: ["i4"] }),
      inf("s2", { cited_item_ids: ["i4"], supersedes: "s1" }), // s1 superseded; s2 is the head and cites i4
      inf("x1", { method_id: "pool-position", cited_item_ids: ["i5"] }),
      inf("z1", { cited_item_ids: ["i6"] }), // cites an archived item only
    ],
    intelligence_items: [verified("i1", { legacy_id: "g14" }), verified("i2"), verified("i3"), verified("i4"), verified("i5"), verified("i6", { is_archived: true })],
  });
  const r = await resolveInferenceCandidates(rest);
  // i1, i2 (v1) and i4 (the head s2) qualify; i3 (REFUTED), i5 (internal method) and i6 (archived) do not.
  assert.equal(r.count, 3);
  assert.equal(r.visit[0], "/regulations/g14");
  assert.deepEqual(r.diag, { table_rows: 6, current: 6, current_customer_method: 6, visible_views: 3, cited_visible_items: 3 }, "the fake rest does not apply the method filter; the zero-or-not count can be checked against the table");
});

test("inference class: a corpus with NO visible inference resolves to count 0 (the HOLD case), not an error", async () => {
  const none = await resolveInferenceCandidates(fakeRest({ inference_records: [], intelligence_items: [verified("i1")] }));
  assert.deepEqual(none, { count: 0, visit: [], sample: [], diag: { table_rows: 0, current: 0, current_customer_method: 0, visible_views: 0, cited_visible_items: 0 } });
  const onlyRefuted = await resolveInferenceCandidates(fakeRest({ inference_records: [inf("r", { status_token: "REFUTED" })], intelligence_items: [verified("i1")] }));
  assert.equal(onlyRefuted.count, 0);
});

test("record class: only verified, non-archived, record-grade items", async () => {
  const rest = fakeRest({
    intelligence_items: [
      verified("r1", { item_grade: "record" }),
      verified("b1", { item_grade: "brief" }),
      verified("r2", { item_grade: "record", is_archived: true }),
      { ...item("r3"), item_grade: "record", provenance_status: "unverified", is_archived: false },
    ],
  });
  const r = await resolveRecordCandidates(rest);
  assert.equal(r.count, 1);
  assert.deepEqual(await resolveRecordCandidates(fakeRest({ intelligence_items: [verified("b1", { item_grade: "brief" })] })), { count: 0, visit: [], sample: [] });
});

test("bias class: items whose source has a usable bias tag; a source with no tag, or an unusable one, does not count", async () => {
  const rest = fakeRest({
    source_bias_tags: [
      { id: "t1", source_id: "s1", dimension: "funding", tag: "industry-funded", confidence: 0.9 },
      { id: "t2", source_id: "s2", dimension: "nonsense", tag: "x", confidence: 0.9 }, // not a dimension: unusable
      { id: "t3", source_id: "s3", dimension: "methodology", tag: "  ", confidence: 0.9 }, // blank tag: unusable
    ],
    intelligence_items: [verified("a", { source_id: "s1" }), verified("b", { source_id: "s2" }), verified("c", { source_id: "s3" }), verified("d", { source_id: "s9" }), verified("e", { source_id: "s1", is_archived: true })],
  });
  const r = await resolveBiasCandidates(rest);
  assert.equal(r.count, 1, "only item a: s1 has a usable tag and a is visible");
});

test("resolveCandidates returns all three classes, resolved:true, and a corpus holding none of them is three zero counts", async () => {
  const empty = await resolveCandidates(fakeRest({ intelligence_items: [verified("a")] }));
  assert.equal(empty.resolved, true);
  assert.deepEqual(Object.fromEntries(Object.entries(empty.classes).map(([k, v]) => [k, v.count])), { inference: 0, record: 0, bias: 0 });
  assert.deepEqual(candidateLines(empty), [
    "candidates inference: 0 item(s) [table_rows=0 current=0 current_customer_method=0 visible_views=0 cited_visible_items=0]",
    "candidates record: 0 item(s)",
    "candidates bias: 0 item(s)",
  ]);
});

test("pagination: more than one page of rows is read to the end", async () => {
  const many = Array.from({ length: 2300 }, (_, i) => verified(`r${String(i).padStart(5, "0")}`, { item_grade: "record" }));
  const r = await resolveRecordCandidates(fakeRest({ intelligence_items: many }));
  assert.equal(r.count, 2300);
});

test("candidateLines: an unresolved result says so and gives the reason; a populated class prints its sample paths", () => {
  assert.deepEqual(candidateLines(unresolvedCandidates("no creds")), ["candidates UNRESOLVED: no creds"]);
  assert.deepEqual(candidateLines(null), ["candidates UNRESOLVED: no candidate file"]);
  const lines = candidateLines({ resolved: true, classes: { inference: { count: 3, visit: ["/regulations/a"], sample: ["/regulations/a", "/market/b"] } } });
  assert.equal(lines[0], "candidates inference: 3 item(s); e.g. /regulations/a /market/b");
});

// ---------------------------------------------------------------- the REST client and the CLI
test("restClient: a GET with the key in the headers only (never the URL); a non-2xx throws without the key", async () => {
  const seen = [];
  const fetchFn = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => [{ a: 1 }] }; };
  const rest = restClient({ url: "https://db.test/", key: "SECRET-KEY", fetchFn });
  assert.deepEqual(await rest("things", "select=a"), [{ a: 1 }]);
  assert.equal(seen[0].url, "https://db.test/rest/v1/things?select=a");
  assert.equal(seen[0].init.method, "GET");
  assert.ok(!seen[0].url.includes("SECRET-KEY"));
  assert.equal(seen[0].init.headers.apikey, "SECRET-KEY");
  const bad = restClient({ url: "https://db.test", key: "SECRET-KEY", fetchFn: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await assert.rejects(() => bad("things", "select=a"), (e) => /HTTP 401/.test(e.message) && !e.message.includes("SECRET-KEY"));
  const notRows = restClient({ url: "https://db.test", key: "k", fetchFn: async () => ({ ok: true, json: async () => ({ message: "no" }) }) });
  await assert.rejects(() => notRows("things", "select=a"), /not a row array/);
});

test("CLI: without database credentials it writes an UNRESOLVED file and exits 0 (a diagnosable skip, never a crash or a pass)", async () => {
  const written = [];
  const code = await runCandidatesCli({ env: { LIVE_SMOKE_CANDIDATES: "out.json" }, write: (p, c) => written.push([p, JSON.parse(c)]), log: () => {}, logError: () => {} });
  assert.equal(code, 0);
  assert.equal(written[0][0], "out.json");
  assert.equal(written[0][1].resolved, false);
});

test("CLI: with credentials it writes the resolved file and prints the counts; a failed read exits 1 and never prints the key", async () => {
  const db = { inference_records: [inf("v1")], intelligence_items: [verified("i1")], source_bias_tags: [] };
  const rest = fakeRest(db);
  // route the CLI's PostgREST GETs into the fake rest
  const fetchFn = async (url) => {
    const u = new URL(url);
    const table = u.pathname.split("/").pop();
    return { ok: true, json: async () => rest(table, u.search.slice(1)) };
  };
  const written = [];
  const logs = [];
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "SECRET-KEY", LIVE_SMOKE_CANDIDATES: "out.json" };
  const ok = await runCandidatesCli({ env, fetchFn, write: (p, c) => written.push(JSON.parse(c)), log: (l) => logs.push(l), logError: (l) => logs.push(l) });
  assert.equal(ok, 0);
  assert.equal(written[0].resolved, true);
  assert.equal(written[0].classes.inference.count, 1);
  assert.ok(logs.some((l) => l.startsWith("candidates inference: 1 item(s)")));

  const errs = [];
  const failed = await runCandidatesCli({ env, fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }), write: () => assert.fail("must not write on a failed read"), log: () => {}, logError: (l) => errs.push(l) });
  assert.equal(failed, 1);
  assert.ok(errs[0].includes("HTTP 500") && !errs[0].includes("SECRET-KEY"));
});
