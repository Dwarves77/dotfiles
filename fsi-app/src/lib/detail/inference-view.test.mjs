// inference-view.test.mjs: proof for inference-view.mjs (lane P2, 2026-10-05).
import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_INFERENCE_METHOD_IDS,
  INFERENCE_READ_CAP,
  MAX_VISIBLE_INFERENCES,
  PRODUCT_QUESTION_WORDS,
  isCustomerInferenceMethod,
  pickVisibleInferences,
  questionInWords,
  readCustomerInferences,
  restrictToVisibleCitations,
  selectCurrentInferences,
} from "./inference-view.mjs";
import { PRODUCT_QUESTIONS } from "../learning/constants.mjs";
import { buildSubjectRef } from "../connections/flag-namespaces.mjs";

const ITEM = "11111111-1111-4111-8111-111111111111";

function row(over = {}) {
  return {
    inference_id: "aaaaaaaa-0000-4000-8000-000000000001",
    claim_text: "The amendment reaches carriers that file in the first quarter.",
    status_token: "HYPOTHESIS",
    confidence: 0.6,
    cited_item_ids: [ITEM],
    origin_class: "derived",
    trigger_question_ref: buildSubjectRef(ITEM, "regulations", "affects_me"),
    method_id: "infer-from-question",
    admissibility: "current",
    computed_at: "2026-10-05T10:00:00Z",
    ...over,
  };
}

test("questionInWords: every product question has words and the ref the generator builds resolves to them", () => {
  for (const pq of PRODUCT_QUESTIONS) {
    assert.ok(PRODUCT_QUESTION_WORDS[pq], `words for ${pq}`);
    assert.equal(questionInWords(buildSubjectRef(ITEM, "market_intel", pq)), PRODUCT_QUESTION_WORDS[pq]);
  }
  assert.deepEqual(Object.keys(PRODUCT_QUESTION_WORDS).sort(), [...PRODUCT_QUESTIONS].sort(), "no word entry without a question");
});

test("questionInWords: an absent or unrecognised reference gives null, never the raw reference", () => {
  assert.equal(questionInWords(null), null);
  assert.equal(questionInWords(undefined), null);
  assert.equal(questionInWords(""), null);
  assert.equal(questionInWords(`${ITEM}:regulations:something_else`), null);
  assert.equal(questionInWords(ITEM), null);
});

test("method filter (ADR-039 a): an allowlist, so the pool-position inference and any unknown method are hidden", () => {
  assert.deepEqual([...CUSTOMER_INFERENCE_METHOD_IDS], ["infer-from-question"]);
  assert.equal(isCustomerInferenceMethod("infer-from-question"), true);
  assert.equal(isCustomerInferenceMethod("pool-adjusted-position"), false);
  assert.equal(isCustomerInferenceMethod("pool_adjusted_eur"), false);
  assert.equal(isCustomerInferenceMethod(null), false);
  const out = selectCurrentInferences([
    row({ inference_id: "k1" }),
    row({ inference_id: "h1", method_id: "pool-adjusted-position" }),
    row({ inference_id: "h2", method_id: "some-future-method" }),
  ]);
  assert.deepEqual(out.map((v) => v.id), ["k1"]);
});

test("current means not stale and not superseded: the row nothing points at, not the row whose own supersedes is null", () => {
  const out = selectCurrentInferences(
    [
      row({ inference_id: "old", computed_at: "2026-10-01T00:00:00Z" }),
      row({ inference_id: "new", computed_at: "2026-10-04T00:00:00Z", supersedes: "old" }),
      row({ inference_id: "stale", admissibility: "stale" }),
    ],
    new Set(["old"])
  );
  assert.deepEqual(out.map((v) => v.id), ["new"]);
});

test("selectCurrentInferences: newest first, bounded, malformed rows skipped, bad input never throws", () => {
  const many = Array.from({ length: INFERENCE_READ_CAP + 7 }, (_, i) =>
    row({ inference_id: `id-${String(i).padStart(3, "0")}`, computed_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z` })
  );
  const out = selectCurrentInferences(many);
  assert.equal(out.length, INFERENCE_READ_CAP);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].computedAt >= out[i].computedAt, "newest first");
  assert.deepEqual(selectCurrentInferences([null, {}, row({ claim_text: "  " }), row({ cited_item_ids: null })]), []);
  assert.deepEqual(selectCurrentInferences(null), []);
  assert.deepEqual(selectCurrentInferences(undefined, null), []);
});

test("selectCurrentInferences: the view carries the status, confidence, citations and the question in words", () => {
  const [v] = selectCurrentInferences([row({ status_token: "CONFIRMED", confidence: "0.9" })]);
  assert.equal(v.statusToken, "CONFIRMED");
  assert.equal(v.confidence, 0.9);
  assert.deepEqual(v.citedItemIds, [ITEM]);
  assert.equal(v.originClass, "derived");
  assert.equal(v.questionText, PRODUCT_QUESTION_WORDS.affects_me);
});

test("restrictToVisibleCitations: only citations the customer read gate admitted survive, and an inference left with none is dropped", () => {
  const views = selectCurrentInferences([
    row({ inference_id: "a", cited_item_ids: [ITEM, "hidden-1"] }),
    row({ inference_id: "b", cited_item_ids: ["hidden-2"] }),
  ]);
  const out = restrictToVisibleCitations(views, { [ITEM]: "A regulation" });
  assert.deepEqual(out.map((v) => v.id), ["a"]);
  assert.deepEqual(out[0].citedItemIds, [ITEM]);
  assert.deepEqual(restrictToVisibleCitations(views, null), []);
});

test("pickVisibleInferences: the injected gate decides, newest first, bounded", () => {
  const views = selectCurrentInferences(
    Array.from({ length: MAX_VISIBLE_INFERENCES + 3 }, (_, i) => row({ inference_id: `v${i}`, computed_at: `2026-10-0${i + 1}T00:00:00Z` }))
  );
  assert.equal(pickVisibleInferences(views, () => true).length, MAX_VISIBLE_INFERENCES);
  assert.deepEqual(pickVisibleInferences(views, (v) => v.id === "v1").map((v) => v.id), ["v1"]);
  assert.deepEqual(pickVisibleInferences(views, () => false), []);
  assert.deepEqual(pickVisibleInferences(null, () => true), []);
});

// ── the customer read (fake service-role client, no network) ─────────────────────────────────────────
function fakeClient({ rows = [], successors = [], error = null } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const chain = {
        select(cols) { call.select = cols; return chain; },
        contains(col, val) { call.filters.push(["contains", col, val]); return chain; },
        eq(col, val) { call.filters.push(["eq", col, val]); return chain; },
        in(col, val) { call.filters.push(["in", col, val]); return chain; },
        order(col, o) { call.order = [col, o]; return chain; },
        limit(n) { call.limit = n; return chain; },
        then(resolve) {
          // The first read is the rows citing the item (has a limit); the second is the supersedes lookup.
          resolve(call.limit != null ? { data: error ? null : rows, error } : { data: successors, error: null });
        },
      };
      return chain;
    },
  };
  return client;
}
const titlesOf = (map) => async (ids) => ids.filter((id) => map[id]).map((id) => ({ id, title: map[id] }));

test("readCustomerInferences: queries only current rows of a customer method that cite the item, bounded, and a supersedes lookup", async () => {
  const sb = fakeClient({ rows: [row()] });
  const out = await readCustomerInferences(sb, ITEM, titlesOf({ [ITEM]: "A regulation" }));
  assert.equal(out.claims.length, 1);
  assert.deepEqual(out.titles, { [ITEM]: "A regulation" });
  const [first, second] = sb.calls;
  assert.equal(first.table, "inference_records");
  assert.deepEqual(first.filters, [
    ["contains", "cited_item_ids", [ITEM]],
    ["eq", "admissibility", "current"],
    ["in", "method_id", ["infer-from-question"]],
  ]);
  assert.equal(first.limit, INFERENCE_READ_CAP);
  assert.deepEqual(first.order, ["computed_at", { ascending: false }]);
  assert.equal(second.table, "inference_records");
  assert.deepEqual(second.filters, [["in", "supersedes", ["aaaaaaaa-0000-4000-8000-000000000001"]]]);
});

test("readCustomerInferences: a superseded row is dropped even though the query returned it", async () => {
  const sb = fakeClient({
    rows: [row({ inference_id: "old" }), row({ inference_id: "new", supersedes: "old", computed_at: "2026-10-06T00:00:00Z" })],
    successors: [{ supersedes: "old" }],
  });
  const out = await readCustomerInferences(sb, ITEM, titlesOf({ [ITEM]: "A regulation" }));
  assert.deepEqual(out.claims.map((c) => c.id), ["new"]);
});

test("readCustomerInferences: nothing, an error, or only citations the customer cannot open all give null", async () => {
  assert.equal(await readCustomerInferences(fakeClient({ rows: [] }), ITEM, titlesOf({})), null);
  assert.equal(await readCustomerInferences(fakeClient({ error: { message: "boom" } }), ITEM, titlesOf({})), null);
  assert.equal(await readCustomerInferences(fakeClient({ rows: [row()] }), ITEM, titlesOf({})), null, "no cited item is visible");
  assert.equal(await readCustomerInferences(fakeClient({ rows: [row({ method_id: "pool-adjusted-position" })] }), ITEM, titlesOf({ [ITEM]: "x" })), null, "a hidden method never shows even if the query returned it");
});

// ── the one current-row rule, shared with /admin/inferences ──────────────────────────────────────────
import { currentInferenceRows, isCurrentInferenceRow } from "./inference-view.mjs";

test("currentInferenceRows: an original nobody replaced, a recomputed head and a refuted row stay; the replaced original goes", () => {
  const rows = [
    { inference_id: "orig-alone", supersedes: null },
    { inference_id: "orig-replaced", supersedes: null },
    { inference_id: "head", supersedes: "orig-replaced" },
    { inference_id: "refuted", supersedes: null, status_token: "REFUTED" },
  ];
  assert.deepEqual(currentInferenceRows(rows).map((r) => r.inference_id), ["orig-alone", "head", "refuted"]);
  assert.deepEqual(currentInferenceRows(null), []);
});

test("currentInferenceRows: a chain of three keeps only its newest row", () => {
  const chain = [{ inference_id: "a", supersedes: null }, { inference_id: "b", supersedes: "a" }, { inference_id: "c", supersedes: "b" }];
  assert.deepEqual(currentInferenceRows(chain).map((r) => r.inference_id), ["c"]);
  assert.equal(isCurrentInferenceRow({ inference_id: "a" }, new Set(["a"])), false);
  assert.equal(isCurrentInferenceRow({ inference_id: "c" }, new Set(["a", "b"])), true);
});

test("the admin page reads through the shared rule, not a supersedes IS NULL filter", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../../app/admin/inferences/page.tsx", import.meta.url), "utf8");
  assert.match(code, /currentInferenceRows\(/);
  assert.doesNotMatch(code, /\.is\("supersedes", null\)/);
});
