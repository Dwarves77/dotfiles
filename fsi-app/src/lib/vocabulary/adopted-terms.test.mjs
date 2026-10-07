// adopted-terms.test.mjs (lane G5-READ): the loader and the union. Fixtures only, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADOPTED_KINDS, emptyAdopted, groupAdoptedTerms, adoptedTermsFromSupabase, memoAdoptedTerms,
  adoptedKeys, unionVocabulary, themeToken, adoptedThemeTokens,
} from "./adopted-terms.mjs";

const ROWS = [
  { kind: "scenario", term_key: "ocean-slow-steaming", label: "ocean-slow-steaming", status: "adopted" },
  { kind: "scenario", term_key: "air-ground-handling", label: "air-ground-handling", status: "proposed" },
  { kind: "theme", term_key: "carbon border adjustment", label: "Carbon Border Adjustment", status: "adopted" },
  { kind: "compliance_object", term_key: "charterer", label: "Charterer", status: "adopted" },
  { kind: "standard", term_key: "iso 14084", label: "ISO 14084", status: "retired" },
  { kind: "material", term_key: "sodium-ion", label: "sodium-ion", status: "adopted" },
  { kind: "bogus", term_key: "x", status: "adopted" },
  { kind: "term", term_key: "  ", status: "adopted" },
];

test("groupAdoptedTerms keeps only ADOPTED rows of a known kind with a key, and a proposed or retired term is not held", () => {
  const a = groupAdoptedTerms(ROWS);
  assert.deepEqual(Object.keys(a), [...ADOPTED_KINDS]);
  assert.deepEqual(adoptedKeys(a, "scenario"), ["ocean-slow-steaming"]);
  assert.deepEqual(adoptedKeys(a, "standard"), []);
  assert.deepEqual(adoptedKeys(a, "compliance_object"), ["charterer"]);
  assert.deepEqual(a.theme, [{ key: "carbon border adjustment", label: "Carbon Border Adjustment" }]);
  assert.deepEqual(adoptedKeys(a, "term"), []);
});

test("groupAdoptedTerms is deterministic: sorted by key and deduplicated whatever the row order", () => {
  const rows = [
    { kind: "scenario", term_key: "b-tag", status: "adopted" },
    { kind: "scenario", term_key: "a-tag", status: "adopted" },
    { kind: "scenario", term_key: "A-Tag", status: "adopted" },
  ];
  assert.deepEqual(adoptedKeys(groupAdoptedTerms(rows), "scenario"), ["a-tag", "b-tag"]);
  assert.deepEqual(groupAdoptedTerms(rows), groupAdoptedTerms([...rows].reverse()));
});

test("unionVocabulary never drops a code value, puts code first, and adds only adopted keys not already present", () => {
  const code = ["alpha", "Beta-Gamma", "delta"];
  const a = groupAdoptedTerms([
    { kind: "scenario", term_key: "beta-gamma", status: "adopted" },
    { kind: "scenario", term_key: "epsilon", status: "adopted" },
  ]);
  const out = unionVocabulary(code, a, "scenario");
  assert.deepEqual(out, ["alpha", "Beta-Gamma", "delta", "epsilon"]);
  for (const v of code) assert.ok(out.includes(v), `code value ${v} dropped`);
  assert.deepEqual(unionVocabulary(code, undefined, "scenario"), code);
  assert.deepEqual(unionVocabulary(code, emptyAdopted(), "scenario"), code);
  assert.deepEqual(code, ["alpha", "Beta-Gamma", "delta"], "the input array is not mutated");
});

test("themeToken turns whitespace runs into one underscore; adoptedThemeTokens maps the adopted themes", () => {
  assert.equal(themeToken("carbon border  adjustment"), "carbon_border_adjustment");
  assert.equal(themeToken("already_token"), "already_token");
  assert.deepEqual(adoptedThemeTokens(groupAdoptedTerms(ROWS)), ["carbon_border_adjustment"]);
  assert.deepEqual(adoptedThemeTokens(undefined), []);
});

function fakeSb(rows, { fail = false } = {}) {
  const calls = [];
  const chain = (table) => {
    const q = {
      select() { return q; },
      eq(col, val) { calls.push([table, col, val]); return q; },
      order() { return q; },
      range(from, to) {
        return Promise.resolve(fail ? { data: null, error: { message: "relation does not exist" } } : { data: rows.slice(from, to + 1), error: null });
      },
    };
    return q;
  };
  return { calls, from: (t) => chain(t) };
}

test("adoptedTermsFromSupabase reads only status=adopted rows of vocabulary_terms and groups them", async () => {
  const sb = fakeSb(ROWS.filter((r) => r.status === "adopted"));
  const a = await adoptedTermsFromSupabase(sb);
  assert.deepEqual(sb.calls[0], ["vocabulary_terms", "status", "adopted"]);
  assert.deepEqual(adoptedKeys(a, "material"), ["sodium-ion"]);
});

test("adoptedTermsFromSupabase fails CLOSED: a read error returns the empty set, never throws", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const a = await adoptedTermsFromSupabase(fakeSb([], { fail: true }));
    assert.deepEqual(a, emptyAdopted());
    const boom = { from() { throw new Error("no such table"); } };
    assert.deepEqual(await adoptedTermsFromSupabase(boom), emptyAdopted());
  } finally {
    console.warn = warn;
  }
});

test("memoAdoptedTerms reads once per run however many times it is called", async () => {
  const sb = fakeSb(ROWS.filter((r) => r.status === "adopted"));
  const load = memoAdoptedTerms(sb);
  const a = await load();
  const b = await load();
  assert.equal(a, b);
  assert.equal(sb.calls.filter((c) => c[0] === "vocabulary_terms").length, 1);
});
