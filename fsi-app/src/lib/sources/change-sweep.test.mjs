// @ts-check
// PROOF (B4 change-sweep). The bridge only — routing stays in decideVerify (verify-item.test.mjs owns it):
//   - VERIFIED items of the source only, bounded with notSwept REPORTED (never silent).
//   - the disposition split flows through verifyItem: intact spans → verified_cheap; changed source →
//     stale_flag; broken spans → needs_acquire — and act:false performs ZERO side effects (the $0 contract).
//   - sweepAllChangedSources bounds sources and reports skippedSources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepChangedSource, sweepAllChangedSources } from "./change-sweep.mjs";

// fake svc: intelligence_items select-chain (thenable) + integrity_flags insert capture (stale-flag writes).
function fakeSvc({ items = [], }) {
  const flagInserts = [];
  return {
    flagInserts,
    from(table) {
      const q = {
        select() { return this; }, eq() { return this; }, limit() { return this; },
        insert(row) {
          if (table === "integrity_flags") { flagInserts.push(row); return Promise.resolve({ error: null }); }
          return Promise.resolve({ error: null });
        },
        then(res) {
          return Promise.resolve({ data: table === "intelligence_items" ? items : [], error: null }).then(res);
        },
      };
      return q;
    },
  };
}

// verify-item dep set driven per item id: snapshot found, freshness status, cheap pass.
const depsFor = (byId) => ({
  loadItem: async (_s, id) => ({ source_id: "src-1", source_url: `https://x.example/${id}` }),
  loadClaims: async () => [{ source_span: "span" }],
  getSnapshot: async () => ({ found: true, content: "body", fetchedAt: "2026-07-01T00:00:00Z" }),
  probeFreshness: async (url) => ({ status: byId[url.split("/").pop()]?.fresh ?? "fresh" }),
  cheapVerifyClaims: (claims, _html) => byId.cheap ?? { pass: true, reason: "spans present in stored text" },
});

test("sweep routes per item through verifyItem; bounded with notSwept reported; act:false writes nothing", async () => {
  const items = [
    { id: "a", title: "A", provenance_status: "verified" },
    { id: "b", title: "B", provenance_status: "verified" },
    { id: "c", title: "C", provenance_status: "verified" },
  ];
  const svc = fakeSvc({ items });
  const deps = depsFor({ a: { fresh: "fresh" }, b: { fresh: "changed" }, c: { fresh: "fresh" } });
  const r = await sweepChangedSource(svc, deps, { sourceId: "src-1", act: false, limit: 2 });
  assert.equal(r.sweptCount, 2, "bounded at limit");
  assert.equal(r.notSwept, 1, "the drop is REPORTED, never silent");
  assert.equal(r.counts.verified_cheap, 1, "intact spans against fresh snapshot → verified_cheap");
  assert.equal(r.counts.stale_flag, 1, "changed source → stale_flag route");
  assert.equal(svc.flagInserts.length, 0, "act:false performs ZERO side effects (the $0 contract)");
});

test("act:true writes the stale-flag QUEUE row for the changed-source route", async () => {
  const svc = fakeSvc({ items: [{ id: "b", title: "B", provenance_status: "verified" }] });
  const deps = depsFor({ b: { fresh: "changed" } });
  const r = await sweepChangedSource(svc, deps, { sourceId: "src-1", act: true, limit: 10 });
  assert.equal(r.counts.stale_flag, 1);
  assert.equal(svc.flagInserts.length, 1, "the integrity_flags queue row is the stale queue");
  assert.match(svc.flagInserts[0].description, /stale/i);
});

test("broken spans → needs_acquire (locked path; no spend, no flag)", async () => {
  const svc = fakeSvc({ items: [{ id: "d", title: "D", provenance_status: "verified" }] });
  const deps = { ...depsFor({ d: { fresh: "fresh" } }), cheapVerifyClaims: () => ({ pass: false, reason: "span missing from stored text" }) };
  const r = await sweepChangedSource(svc, deps, { sourceId: "src-1", act: false, limit: 10 });
  assert.equal(r.counts.needs_acquire, 1);
  assert.equal(svc.flagInserts.length, 0);
});

test("sweepAllChangedSources bounds sources and reports skippedSources", async () => {
  const svc = fakeSvc({ items: [{ id: "a", title: "A", provenance_status: "verified" }] });
  const deps = depsFor({ a: { fresh: "fresh" } });
  const r = await sweepAllChangedSources(
    svc,
    { loadChangedSourceIds: async () => ["s1", "s2", "s3"] },
    deps,
    { maxSources: 2, limitPerSource: 5 }
  );
  assert.equal(r.sources, 2);
  assert.equal(r.skippedSources, 1, "source cap is REPORTED");
  assert.equal(r.totals.verified_cheap, 2);
});
