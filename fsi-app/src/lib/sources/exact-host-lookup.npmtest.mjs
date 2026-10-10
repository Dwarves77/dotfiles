// @ts-check
// EXACT-HOST LOOKUP in registerCitedSources (lane DFIX-2, s1a-source-register 21).
//
// The existing-source check used `ilike('%host%')` with limit(1): a SUBSTRING match, so a cited host that is
// contained in an unrelated registered url ("example.org" inside "notexample.org") counted as already registered and
// the citation took that other source's id. The check now narrows in the database to urls that start with the
// scheme and this exact host (exactHostUrlFilter) and re-checks each row with hostOf in code.
//
// The fake below is a small in-memory `sources` table that applies BOTH filters with their real semantics (a SQL
// ilike with % wildcards, and the PostgREST `or` of ilike patterns with * wildcards), so the same fake is red against
// the old substring code and green against the exact code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { registerCitedSources, exactHostUrlFilter } = await jiti.import("./source-growth.ts");

const OTHER_ID = "99999999-9999-9999-9999-999999999999";
const REAL_ID = "11111111-1111-1111-1111-111111111111";

const likeToRe = (pat, wildcard) => new RegExp("^" + pat.split(wildcard).map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");

/** In-memory `sources` plus the provisional_sources upsert the unclassified branch writes. */
function fakeClient(rows) {
  const calls = { ors: [], ilikes: [], provisional: [], inserts: [] };
  return {
    calls,
    from(table) {
      if (table === "provisional_sources") return { upsert(row) { calls.provisional.push(row); return Promise.resolve({ error: null }); } };
      if (table === "source_tier_opinions") return { insert() { return Promise.resolve({ error: null }); } };
      if (table !== "sources") throw new Error(`unexpected table ${table}`);
      let hit = rows;
      const b = {
        select() { return b; },
        // the OLD lookup: SQL ilike, % wildcards
        ilike(col, pat) { calls.ilikes.push(pat); const re = likeToRe(pat, "%"); hit = hit.filter((r) => re.test(String(r[col] ?? ""))); return b; },
        // the NEW lookup: PostgREST or=(col.ilike.pattern,...), * wildcards
        or(filter) {
          calls.ors.push(filter);
          const res = filter.split(",").map((f) => likeToRe(f.replace(/^url\.ilike\./, ""), "*"));
          hit = hit.filter((r) => res.some((re) => re.test(String(r.url ?? ""))));
          return b;
        },
        limit() { return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }); },
        insert(row) { calls.inserts.push(row); return { select: () => ({ single: () => Promise.resolve({ data: { id: "new-id" }, error: null }) }) }; },
      };
      return b;
    },
  };
}

const CITED = [{ name: "Example Regulator", url: "https://example.org/notice" }];

test("exactHostUrlFilter: only urls that start with the scheme and this exact host, with or without www", () => {
  const f = exactHostUrlFilter("example.org").split(",");
  assert.equal(f.length, 8);
  assert.ok(f.every((x) => x.startsWith("url.ilike.")));
  assert.ok(f.includes("url.ilike.https://example.org/*"));
  assert.ok(f.includes("url.ilike.http://www.example.org"));
  assert.ok(!f.some((x) => x.includes("%")), "no substring wildcard anywhere");
});

test("a registered url whose host merely CONTAINS the cited host is not 'existing' (the substring defect)", async () => {
  const sb = fakeClient([{ id: OTHER_ID, url: "https://notexample.org/doc", base_tier: 7, tier_override: null }]);
  const out = await registerCitedSources(sb, CITED, { dry: true });
  assert.notEqual(out[0].source_id, OTHER_ID, "the citation must not take the unrelated source's id");
  assert.notEqual(out[0].registered, "existing");
});

test("a url that merely CONTAINS the cited host in its path or a subdomain label is not 'existing'", async () => {
  const sb = fakeClient([
    { id: OTHER_ID, url: "https://aggregator.net/mirror/example.org/notice", base_tier: 7, tier_override: null },
    { id: "88888888-8888-8888-8888-888888888888", url: "https://example.org.evil.net/x", base_tier: 7, tier_override: null },
  ]);
  const out = await registerCitedSources(sb, CITED, { dry: true });
  assert.notEqual(out[0].registered, "existing");
});

test("the exact host still matches: bare, www, either scheme, any path, any letter case", async () => {
  for (const url of ["https://example.org/a", "http://example.org/", "https://www.example.org/b", "https://EXAMPLE.org", "http://www.Example.org/c/d"]) {
    const sb = fakeClient([{ id: REAL_ID, url, base_tier: 2, tier_override: null }]);
    const out = await registerCitedSources(sb, CITED, { dry: true });
    assert.equal(out[0].registered, "existing", url);
    assert.equal(out[0].source_id, REAL_ID, url);
  }
});

test("the exact row wins when a look-alike row is registered too", async () => {
  const sb = fakeClient([
    { id: OTHER_ID, url: "https://notexample.org/doc", base_tier: 7, tier_override: null },
    { id: REAL_ID, url: "https://www.example.org/", base_tier: 2, tier_override: null },
  ]);
  const out = await registerCitedSources(sb, CITED, { dry: true });
  assert.equal(out[0].source_id, REAL_ID);
});

test("a row the database filter returned that is not on the cited host is dropped by the in-code host re-check", async () => {
  // An underscore in a host is a single-character wildcard in a SQL ilike; whatever the database lets through is
  // re-checked with hostOf, so a look-alike never becomes the registered source.
  const sb = {
    from: () => {
      const b = { select: () => b, or: () => b, limit: () => Promise.resolve({ data: [{ id: OTHER_ID, url: "https://exampleXorg/doc" }], error: null }) };
      return b;
    },
  };
  const out = await registerCitedSources(sb, CITED, { dry: true });
  assert.notEqual(out[0].registered, "existing");
});

test("a citation with no parseable host matches nothing and never queries the registry", async () => {
  const sb = fakeClient([{ id: OTHER_ID, url: "https://example.org/", base_tier: 2, tier_override: null }]);
  const out = await registerCitedSources(sb, [{ name: "Bad", url: "not a url" }], { dry: true });
  assert.notEqual(out[0].registered, "existing");
  assert.equal(sb.calls.ors.length, 0);
});
