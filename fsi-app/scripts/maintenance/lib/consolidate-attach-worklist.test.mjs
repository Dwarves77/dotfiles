import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedKey,
  buildSeedIndex,
  isHttpUrl,
  consolidateSourced,
  consolidateUnsourced,
  collapseWhitespace,
  quoteContainsToken,
  urlHost,
  flagQuality,
  dispositionCountsBySlice,
  LOW_AUTHORITY_HOSTS,
} from "./consolidate-attach-worklist.mjs";

const SEED = [
  { item_id: "item-1", token: "$300", class: "figure", sentence: "The fee is $300.", search_id: "s1" },
  { item_id: "item-1", token: "2023", class: "deadline", sentence: "Due in 2023.", search_id: "s2" },
  { item_id: "item-2", token: "April 2026", class: "deadline", sentence: "Effective April 2026.", search_id: null },
];

test("seedKey / buildSeedIndex: item_id+token, byte-identical membership", () => {
  const idx = buildSeedIndex(SEED);
  assert.equal(idx.has(seedKey({ item_id: "item-1", token: "$300" })), true);
  assert.equal(idx.has(seedKey({ item_id: "item-1", token: "$300 " })), false); // not byte-identical
  assert.equal(idx.has(seedKey({ item_id: "item-9", token: "$300" })), false);
});

test("isHttpUrl: accepts http/https, rejects everything else including malformed", () => {
  assert.equal(isHttpUrl("https://example.com/x"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.equal(isHttpUrl("not a url"), false);
  assert.equal(isHttpUrl(""), false);
  assert.equal(isHttpUrl(undefined), false);
});

test("consolidateSourced: accepts a row whose (item_id, token) is in the seed, with url+quote", () => {
  const idx = buildSeedIndex(SEED);
  const { rows, dropped } = consolidateSourced(
    [[{ item_id: "item-1", token: "$300", url: "https://a.example/p", quote: "The fee is $300." }]],
    idx,
  );
  assert.deepEqual(rows, [{ item_id: "item-1", token: "$300", url: "https://a.example/p", quote: "The fee is $300." }]);
  assert.deepEqual(dropped, []);
});

test("consolidateSourced: drops a row whose (item_id, token) is NOT byte-identical to any seed pair", () => {
  const idx = buildSeedIndex(SEED);
  const { rows, dropped } = consolidateSourced(
    [[{ item_id: "item-1", token: "$300 ", url: "https://a.example/p", quote: "q" }]], // trailing space — retyped
    idx,
  );
  assert.deepEqual(rows, []);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].reason, /not found in the 441-row seed/);
});

test("consolidateSourced: drops empty url, empty quote, non-http(s) url, each reported with a reason", () => {
  const idx = buildSeedIndex(SEED);
  const { rows, dropped } = consolidateSourced(
    [[
      { item_id: "item-1", token: "$300", url: "", quote: "q" },
      { item_id: "item-1", token: "2023", url: "https://a.example", quote: "" },
      { item_id: "item-2", token: "April 2026", url: "ftp://a.example", quote: "q" },
    ]],
    idx,
  );
  assert.deepEqual(rows, []);
  assert.equal(dropped.length, 3);
  assert.match(dropped[0].reason, /empty url/);
  assert.match(dropped[1].reason, /empty quote/);
  assert.match(dropped[2].reason, /not http\(s\)/);
});

test("consolidateSourced: dedups a duplicate (item_id, token, url) triple across two input arrays", () => {
  const idx = buildSeedIndex(SEED);
  const row = { item_id: "item-1", token: "$300", url: "https://a.example/p", quote: "The fee is $300." };
  const { rows, dropped } = consolidateSourced([[row], [row]], idx);
  assert.equal(rows.length, 1);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].reason, /duplicate/);
  assert.equal(dropped[0].source, 1); // dropped from the SECOND array
});

test("consolidateSourced: two different urls for the same (item_id, token) both survive (not a duplicate triple)", () => {
  const idx = buildSeedIndex(SEED);
  const { rows, dropped } = consolidateSourced(
    [[
      { item_id: "item-1", token: "$300", url: "https://a.example/p", quote: "q1" },
      { item_id: "item-1", token: "$300", url: "https://b.example/p", quote: "q2" },
    ]],
    idx,
  );
  assert.equal(rows.length, 2);
  assert.equal(dropped.length, 0);
});

test("consolidateSourced: output sorted by item_id then token then url", () => {
  const idx = buildSeedIndex(SEED);
  const { rows } = consolidateSourced(
    [[
      { item_id: "item-2", token: "April 2026", url: "https://z.example", quote: "Effective April 2026." },
      { item_id: "item-1", token: "2023", url: "https://y.example", quote: "Due in 2023." },
      { item_id: "item-1", token: "$300", url: "https://x.example", quote: "The fee is $300." },
    ]],
    idx,
  );
  assert.deepEqual(
    rows.map((r) => `${r.item_id}/${r.token}`),
    ["item-1/$300", "item-1/2023", "item-2/April 2026"],
  );
});

test("consolidateSourced: carries through a `note` field when present", () => {
  const idx = buildSeedIndex(SEED);
  const { rows } = consolidateSourced(
    [[{ item_id: "item-1", token: "$300", url: "https://a.example/p", quote: "q", note: "best $0 source found" }]],
    idx,
  );
  assert.equal(rows[0].note, "best $0 source found");
});

test("consolidateUnsourced: every seed row not sourced gets exactly one row, carrying its slice's disposition", () => {
  const sourcedKeySet = new Set([seedKey({ item_id: "item-1", token: "$300" })]);
  const unsourcedArrays = [
    [{ item_id: "item-1", token: "2023", disposition: "not_found", queries_tried: ["2023"] }],
    [{ item_id: "item-2", token: "April 2026", disposition: "analytical_inference", queries_tried: [] }],
  ];
  const { rows, missing, duplicated } = consolidateUnsourced(SEED, sourcedKeySet, unsourcedArrays);
  assert.equal(rows.length, 2);
  assert.deepEqual(missing, []);
  assert.deepEqual(duplicated, []);
  const byToken = Object.fromEntries(rows.map((r) => [r.token, r]));
  assert.equal(byToken["2023"].disposition, "not_found");
  assert.equal(byToken["April 2026"].disposition, "analytical_inference");
  // seed's own class/sentence/search_id carried through
  assert.equal(byToken["2023"].class, "deadline");
  assert.equal(byToken["2023"].sentence, "Due in 2023.");
});

test("consolidateUnsourced: reports a seed row present in NEITHER sourced nor any unsourced file as missing", () => {
  const sourcedKeySet = new Set();
  const unsourcedArrays = [[{ item_id: "item-1", token: "$300", disposition: "not_found", queries_tried: [] }]];
  const { rows, missing } = consolidateUnsourced(SEED, sourcedKeySet, unsourcedArrays);
  assert.equal(rows.length, 1);
  assert.equal(missing.length, 2); // item-1/2023 and item-2/April 2026 both absent
});

test("consolidateUnsourced: reports the SAME seed pair appearing in two different unsourced slices as duplicated, first wins", () => {
  const sourcedKeySet = new Set();
  const unsourcedArrays = [
    [{ item_id: "item-1", token: "$300", disposition: "not_found", queries_tried: [] }],
    [{ item_id: "item-1", token: "$300", disposition: "item_specific", queries_tried: [] }],
  ];
  const { rows, duplicated } = consolidateUnsourced(
    [SEED[0]],
    sourcedKeySet,
    unsourcedArrays,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].disposition, "not_found"); // first occurrence wins
  assert.equal(duplicated.length, 1);
});

test("consolidateUnsourced: a seed pair that IS sourced is excluded even if an unsourced file also names it", () => {
  const sourcedKeySet = new Set([seedKey({ item_id: "item-1", token: "$300" })]);
  const unsourcedArrays = [[{ item_id: "item-1", token: "$300", disposition: "not_found", queries_tried: [] }]];
  const { rows } = consolidateUnsourced([SEED[0]], sourcedKeySet, unsourcedArrays);
  assert.deepEqual(rows, []);
});

test("collapseWhitespace / quoteContainsToken: verbatim substring after whitespace collapse, case-sensitive", () => {
  assert.equal(collapseWhitespace("  a   b\n  c "), "a b c");
  assert.equal(quoteContainsToken("The fee is $300 per unit.", "$300"), true);
  assert.equal(quoteContainsToken("The fee\nis $300  per unit.", "is $300"), true);
  assert.equal(quoteContainsToken("The fee is $300 per unit.", "$301"), false);
  assert.equal(quoteContainsToken("the fee is $300", "$300"), true);
  assert.equal(quoteContainsToken("The Fee Is $300", "$300"), true);
});

test("quoteContainsToken: case sensitivity applies to non-numeric tokens", () => {
  assert.equal(quoteContainsToken("Effective april 2026.", "April 2026"), false);
  assert.equal(quoteContainsToken("Effective April 2026.", "April 2026"), true);
});

test("urlHost: lowercased hostname, null on malformed", () => {
  assert.equal(urlHost("https://EN.Wikipedia.org/wiki/X"), "en.wikipedia.org");
  assert.equal(urlHost("not a url"), null);
});

test("flagQuality: flags a low-authority host with no note, does not flag one WITH a note", () => {
  const rows = [
    { item_id: "i1", token: "t1", url: "https://en.wikipedia.org/wiki/X", quote: "t1 appears here" },
    { item_id: "i2", token: "t2", url: "https://en.wikipedia.org/wiki/Y", quote: "t2 appears here", note: "no primary source found" },
    { item_id: "i3", token: "t3", url: "https://gov.example/report", quote: "t3 appears here" },
  ];
  const { lowAuthorityNoNote } = flagQuality(rows);
  assert.deepEqual(
    lowAuthorityNoNote.map((f) => f.item_id),
    ["i1"],
  );
});

test("flagQuality: every LOW_AUTHORITY_HOSTS entry is actually matched (host list stays live)", () => {
  const rows = [...LOW_AUTHORITY_HOSTS].map((host, i) => ({
    item_id: `i${i}`,
    token: "t",
    url: `https://${host}/page`,
    quote: "t appears here",
  }));
  const { lowAuthorityNoNote } = flagQuality(rows);
  assert.equal(lowAuthorityNoNote.length, LOW_AUTHORITY_HOSTS.size);
});

test("flagQuality: flags a quote that does not contain the token verbatim", () => {
  const rows = [{ item_id: "i1", token: "$300", url: "https://gov.example/report", quote: "The fee is three hundred dollars." }];
  const { quoteMismatch } = flagQuality(rows);
  assert.equal(quoteMismatch.length, 1);
});

test("dispositionCountsBySlice: counts per slice label", () => {
  const counts = dispositionCountsBySlice([
    { label: "slice-1", rows: [{ disposition: "not_found" }, { disposition: "not_found" }, { disposition: "item_specific" }] },
    { label: "slice-2", rows: [{ disposition: "analytical_inference" }] },
  ]);
  assert.deepEqual(counts, {
    "slice-1": { not_found: 2, item_specific: 1 },
    "slice-2": { analytical_inference: 1 },
  });
});
