// Pure-logic tests for enumerate-unclassified-hosts.mjs (defect D14 item 2, brief-chain build plan
// Part 7 / docs/plans/defect-fix-plan-2026-09-12.md). No I/O, no DB, no fetch, no jiti. Runs in the
// no-npm discipline glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUnresolved,
  groupUnresolvedHosts,
  indexSearchResultsByHost,
  renderMarkdown,
  main,
} from "./enumerate-unclassified-hosts.mjs";

// ── isUnresolved ─────────────────────────────────────────────────────────────────────────────────

test("isUnresolved: true only when host is real and neither rule (a) nor rule (b) resolved a tier", () => {
  assert.equal(isUnresolved("mystery.example", { existingTier: null, classTier: null }), true);
  assert.equal(isUnresolved("epa.gov", { existingTier: 2, classTier: null }), false);
  assert.equal(isUnresolved("some.edu", { existingTier: null, classTier: 4 }), false);
  assert.equal(isUnresolved(null, { existingTier: null, classTier: null }), false, "no host is a different residue class");
});

// ── indexSearchResultsByHost ─────────────────────────────────────────────────────────────────────

test("indexSearchResultsByHost: groups search-log rows by the result_url's host, drops unparsable URLs", () => {
  const hostOfFn = (url) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return null; } };
  const rows = [
    { result_url: "https://dma.dk/page1", intelligence_item_id: "item-1" },
    { result_url: "https://dma.dk/page2", intelligence_item_id: "item-2" },
    { result_url: "not-a-url", intelligence_item_id: "item-3" },
    { result_url: null, intelligence_item_id: "item-4" },
  ];
  const byHost = indexSearchResultsByHost(rows, hostOfFn);
  assert.equal(byHost.size, 1);
  assert.deepEqual(byHost.get("dma.dk"), [{ intelligence_item_id: "item-1" }, { intelligence_item_id: "item-2" }]);
});

// ── groupUnresolvedHosts ─────────────────────────────────────────────────────────────────────────

test("groupUnresolvedHosts: aggregates row count, tables, names, discovered_via across both tables for one host", () => {
  const rows = [
    { table: "provisional_sources", id: "p1", host: "dma.dk", name: "Danish Maritime Authority", discovered_via: "worker_search" },
    { table: "provisional_sources", id: "p2", host: "dma.dk", name: "DMA", discovered_via: "citation_detection" },
    { table: "sources", id: "s1", host: "dma.dk", name: "Danish Maritime Authority", discovered_via: null },
    { table: "provisional_sources", id: "p3", host: "mindop.sk", name: "Slovak Ministry of Transport", discovered_via: "worker_search" },
  ];
  const searchResultsByHost = new Map([["dma.dk", [{ intelligence_item_id: "item-1" }]]]);
  const itemTitleById = new Map([["item-1", "EU ETS extension to shipping"]]);

  const grouped = groupUnresolvedHosts(rows, searchResultsByHost, itemTitleById);
  assert.equal(grouped.length, 2);

  const dma = grouped.find((g) => g.host === "dma.dk");
  assert.equal(dma.row_count, 3);
  assert.deepEqual(dma.tables, ["provisional_sources", "sources"]);
  assert.deepEqual(dma.names, ["DMA", "Danish Maritime Authority"]);
  assert.deepEqual(dma.discovered_via, ["citation_detection", "worker_search"]);
  assert.deepEqual(dma.citing_item_titles, ["EU ETS extension to shipping"]);

  const mindop = grouped.find((g) => g.host === "mindop.sk");
  assert.equal(mindop.row_count, 1);
  assert.deepEqual(mindop.citing_item_titles, [], "a host with no matching search-log row has no citing title, not a fabricated one");
});

test("groupUnresolvedHosts: sorted by row_count desc, then host asc -- the biggest residue clusters first", () => {
  const rows = [
    { table: "provisional_sources", id: "p1", host: "b.example" },
    { table: "provisional_sources", id: "p2", host: "a.example" },
    { table: "provisional_sources", id: "p3", host: "a.example" },
    { table: "provisional_sources", id: "p4", host: "z.example" },
    { table: "provisional_sources", id: "p5", host: "z.example" },
  ];
  const grouped = groupUnresolvedHosts(rows, new Map(), new Map());
  assert.deepEqual(grouped.map((g) => g.host), ["a.example", "z.example", "b.example"]);
});

test("groupUnresolvedHosts: never fabricates a name/discovered_via/citing title when the row carries none", () => {
  const rows = [{ table: "sources", id: "s1", host: "mystery.example", name: null, discovered_via: null }];
  const [g] = groupUnresolvedHosts(rows, new Map(), new Map());
  assert.deepEqual(g.names, []);
  assert.deepEqual(g.discovered_via, []);
  assert.deepEqual(g.citing_item_titles, []);
});

// ── renderMarkdown ───────────────────────────────────────────────────────────────────────────────

test("renderMarkdown: one table row per host, in the given order, with '-' for an empty column", () => {
  const hosts = [
    { host: "dma.dk", row_count: 3, tables: ["provisional_sources", "sources"], names: ["DMA"], discovered_via: ["worker_search"], citing_item_titles: [] },
  ];
  const md = renderMarkdown(hosts, { generatedAt: "2026-09-12T00:00:00.000Z" });
  assert.match(md, /\| dma\.dk \| 3 \| provisional_sources, sources \| DMA \| worker_search \| - \|/);
  assert.match(md, /Generated: 2026-09-12T00:00:00\.000Z/);
  assert.match(md, /1 host\(s\)/);
});

test("renderMarkdown: zero hosts still renders a valid, honest table (header only)", () => {
  const md = renderMarkdown([], { generatedAt: "2026-09-12T00:00:00.000Z" });
  assert.match(md, /0 host\(s\)/);
  assert.match(md, /\| Host \| Row count \|/);
});

// ── main(): orchestration driven entirely by a fake deps object (no DB, no jiti, no fetch, no fs) ──

function fakeDeps({ pending = [], sourcesProv = [], active = [], searchRows = [], items = [] } = {}) {
  return {
    readPendingProvisional: async () => pending,
    readProvisionalSourcesRows: async () => sourcesProv,
    readActiveSources: async () => active,
    readSearchLog: async () => searchRows,
    readItemTitles: async () => items,
    now: () => "2026-09-12T00:00:00.000Z",
  };
}

test("main(): a resolvable host (rule a/b) is excluded from the residue entirely", async () => {
  const pending = [
    { id: "p1", url: "https://epa.gov/page", name: "EPA" }, // rule a
    { id: "p2", url: "https://some.edu/page", name: "Some University" }, // rule b
  ];
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, active });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.counts.unresolved_rows, 0);
  assert.equal(summary.counts.unresolved_hosts, 0);
});

// Grouping is by EXACT host string, the same convention hostForRow/the null-tier-host worklist already
// use elsewhere in this family -- a subdomain (sub.example.test) is a DIFFERENT host from its parent
// (example.test), never collapsed to a registrable eTLD+1. Two rows citing the identical host merge
// into one group.
//
// D14 residue ruling correction (2026-09-13, defect-fix-plan-2026-09-12.md D14, "Residue ruling"):
// this fixture previously used dma.dk / "Danish Maritime Authority" as an example of a host NEITHER
// rule (a) nor rule (b) could resolve -- that was true before the residue ruling landed rule (b)'s
// name-keyword extension, and is FALSE now (a name containing "Authority" resolves T2 government, and
// rule 7's company catch-all resolves ANY other named host to T7). Corrected in place per standing rule
// 13's corollary, never left silently drifted: the fixture now uses a genuinely nameless row, which is
// the TRUE post-ruling residue shape (rule 8 worklists only a host with no stored name at all).
test("main(): an unresolvable host across both tables is counted once, its row_count sums both tables", async () => {
  const pending = [{ id: "p1", url: "https://mystery-agency.example/page", name: null, discovered_via: "worker_search" }];
  const sourcesProv = [{ id: "s1", url: "https://mystery-agency.example/other", name: null }];
  const deps = fakeDeps({ pending, sourcesProv });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.counts.unresolved_hosts, 1);
  assert.equal(summary.counts.unresolved_rows, 2);
});

test("main(): a row with no parsable host is excluded -- it is resolve-provisional-sources's own worklist residue, not this list's", async () => {
  const pending = [{ id: "p1", url: "not-a-url", name: "Unknown" }];
  const deps = fakeDeps({ pending });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.counts.unresolved_hosts, 0);
});

test("main(): counts pending/provisional row totals regardless of resolution, for the summary", async () => {
  const pending = [
    { id: "p1", url: "https://epa.gov/page" }, // resolves
    { id: "p2", url: "https://dma.dk/page" }, // residue
  ];
  const sourcesProv = [{ id: "s1", url: "https://mindop.sk/page" }]; // residue
  const active = [{ id: "s0", url: "https://epa.gov", status: "active", base_tier: 2 }];
  const deps = fakeDeps({ pending, sourcesProv, active });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.counts.pending_provisional_sources, 2);
  assert.equal(summary.counts.sources_provisional, 1);
  assert.equal(summary.counts.unresolved_rows, 2);
  assert.equal(summary.counts.unresolved_hosts, 2);
});

test("main(): read-only always -- mode is accepted but never branches behaviour, and the summary reports mode 'dry'", async () => {
  const deps = fakeDeps({ pending: [{ id: "p1", url: "https://dma.dk/page" }] });
  const dryLike = await main({ mode: "dry", out: null }, deps);
  const applyLike = await main({ mode: "apply", out: null }, deps);
  assert.equal(dryLike.mode, "dry");
  assert.equal(applyLike.mode, "dry", "this step has no apply branch -- it is read-only regardless of the mode flag");
  assert.deepEqual(dryLike.counts, applyLike.counts);
});

test("main(): no --out given writes no artifact and says so in the note", async () => {
  const deps = fakeDeps({ pending: [{ id: "p1", url: "https://dma.dk/page" }] });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.artifacts, undefined);
  assert.match(summary.note, /No --out given/);
});

// D14 residue ruling correction (2026-09-13): "DMA" is a non-empty stored name, and rule 7's company
// catch-all now resolves ANY non-empty name -- corrected in place (standing rule 13's corollary) to a
// nameless row, the true post-ruling residue shape, same as the fixture above.
test("main(): joins a citing item title through the search log when one exists", async () => {
  const pending = [{ id: "p1", url: "https://mystery-agency.example/page", name: null }];
  const searchRows = [{ result_url: "https://mystery-agency.example/some/deep/page", intelligence_item_id: "item-9" }];
  const items = [{ id: "item-9", title: "EU MRV extension" }];
  const deps = fakeDeps({ pending, searchRows, items });
  const summary = await main({ out: null }, deps);
  assert.equal(summary.counts.unresolved_hosts, 1);
});
