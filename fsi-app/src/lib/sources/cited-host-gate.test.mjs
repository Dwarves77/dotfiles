// Red-then-green for the cited-host gate pure half (P3c / S1-07).
import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionCitedByHost } from "./cited-host-gate.mjs";

const c = (url, host, institution) => ({ url, host, institution });

test("exact-host match allows", () => {
  const { allowed, novel } = partitionCitedByHost(
    [c("https://eur-lex.europa.eu/eli/reg/2025/40/oj", "eur-lex.europa.eu", "europa.eu")],
    new Set(["eur-lex.europa.eu"]),
    new Set([]),
  );
  assert.equal(allowed.length, 1);
  assert.equal(novel.length, 0);
});

test("institution match allows a subdomain the exact-host set lacks", () => {
  // clearinghouse.fmcsa.dot.gov cited; registry knows fmcsa.dot.gov (same institution key).
  const { allowed, novel } = partitionCitedByHost(
    [c("https://clearinghouse.fmcsa.dot.gov", "clearinghouse.fmcsa.dot.gov", "dot.gov")],
    new Set(["fmcsa.dot.gov"]),
    new Set(["dot.gov"]),
  );
  assert.equal(allowed.length, 1);
  assert.equal(novel.length, 0);
});

test("wholly unknown institution is novel", () => {
  const { allowed, novel } = partitionCitedByHost(
    [c("https://h2council.com.au/media-releases/x", "h2council.com.au", "h2council.com.au")],
    new Set(["eur-lex.europa.eu"]),
    new Set(["europa.eu"]),
  );
  assert.equal(allowed.length, 0);
  assert.equal(novel.length, 1);
  assert.equal(novel[0].url, "https://h2council.com.au/media-releases/x");
});

test("unparseable URL (empty host) fails closed as novel", () => {
  const { novel } = partitionCitedByHost(
    [c("not-a-url", "", "")],
    new Set(["eur-lex.europa.eu"]),
    new Set(["europa.eu"]),
  );
  assert.equal(novel.length, 1);
});

test("mixed batch partitions stably and drops nothing", () => {
  const input = [
    c("https://eur-lex.europa.eu/a", "eur-lex.europa.eu", "europa.eu"),
    c("https://unknown.example/b", "unknown.example", "unknown.example"),
    c("https://sub.known.org/c", "sub.known.org", "known.org"),
  ];
  const { allowed, novel } = partitionCitedByHost(input, new Set(["eur-lex.europa.eu"]), new Set(["europa.eu", "known.org"]));
  assert.equal(allowed.length + novel.length, input.length);
  assert.deepEqual(allowed.map((x) => x.url), ["https://eur-lex.europa.eu/a", "https://sub.known.org/c"]);
  assert.deepEqual(novel.map((x) => x.url), ["https://unknown.example/b"]);
});

test("empty/nullish cited input yields empty partitions", () => {
  const a = partitionCitedByHost([], new Set(), new Set());
  assert.deepEqual(a, { allowed: [], novel: [] });
  const b = partitionCitedByHost(null, new Set(), new Set());
  assert.deepEqual(b, { allowed: [], novel: [] });
});
