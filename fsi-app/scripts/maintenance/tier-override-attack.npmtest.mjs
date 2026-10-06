// tier-override-attack.npmtest.mjs: lane G7-TIER (2026-10-05), rule 15 (a guard is proven by attack).
//
// Operator ruling: automatic writers respect an admin override. Every automatic writer of sources.base_tier /
// effective_tier is attacked here with the race the decision-level check cannot close: the writer READS a row
// with tier_override null, the admin sets an override, the writer then WRITES. The fake below is a small
// in-memory PostgREST that applies the statement's own filters (eq, is, in, ilike), so a write is stopped only
// when the UPDATE statement itself carries `tier_override IS NULL`. Fixture only: no network, no database.
//
// Writers attacked: source-growth applyReputationRecompute, recompute-tiers (buildDeps writers),
// institution-canonicalize Part B and Part C, resolve-provisional-sources activateSourcesRow.
// Writers that INSERT only (promote-provisional, registerSource, the admin promote/decide/bulk-approve routes,
// verification.ts) cannot overwrite an override: a new row has none. The admin commit-tier-change refusal is
// proven in src/app/api/admin/sources/commit-tier-change/route.npmtest.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { __setWriteClientForTest } from "../lib/db.mjs";
import * as recomputeTiers from "./recompute-tiers.mjs";
import * as canonicalize from "./institution-canonicalize.mjs";
import * as resolveProv from "./resolve-provisional-sources.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { applyReputationRecompute } = await jiti.import("../../src/lib/sources/source-growth.ts");

// ── in-memory PostgREST with real filter semantics ──────────────────────────────────────────────────
function makeStore(tables, { beforeUpdate } = {}) {
  const calls = [];
  const rowsOf = (t) => (tables[t] ??= []);
  const likeRe = (pat) => new RegExp("^" + String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
  function from(table) {
    const st = { table, verb: "select", filters: [], payload: null, one: false, maybe: false, range: null };
    const match = (r) => st.filters.every((f) => f(r));
    const run = () => {
      calls.push({ table, verb: st.verb, payload: st.payload });
      if (st.verb === "insert") {
        const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ id: p.id ?? `new-${rowsOf(table).length + 1}`, ...p }));
        rowsOf(table).push(...rows);
        return { data: st.one ? rows[0] : rows, error: null };
      }
      if (st.verb === "update") {
        beforeUpdate?.(table, rowsOf(table), st.payload);
        const hit = rowsOf(table).filter(match);
        for (const r of hit) Object.assign(r, st.payload);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      let hit = rowsOf(table).filter(match).map((r) => ({ ...r }));
      if (st.range) hit = hit.slice(st.range[0], st.range[1] + 1);
      if (st.one || st.maybe) {
        if (!hit.length) return st.maybe ? { data: null, error: null } : { data: null, error: { message: "no rows" } };
        return { data: hit[0], error: null };
      }
      return { data: hit, error: null };
    };
    const b = {
      select() { return b; },
      update(p) { st.verb = "update"; st.payload = p; return b; },
      insert(p) { st.verb = "insert"; st.payload = p; return b; },
      eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
      is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
      in(c, v) { st.filters.push((r) => v.includes(r[c])); return b; },
      gte(c, v) { st.filters.push((r) => r[c] >= v); return b; },
      ilike(c, pat) { st.filters.push((r) => typeof r[c] === "string" && likeRe(pat).test(r[c])); return b; },
      order() { return b; },
      limit() { return b; },
      range(a, z) { st.range = [a, z]; return b; },
      single() { st.one = true; return Promise.resolve(run()); },
      maybeSingle() { st.maybe = true; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls, tables };
}

// The admin sets an override on the row AFTER the writer read it and BEFORE the writer's UPDATE runs.
const adminOverridesBeforeWrite = (id, tier = 2) => (table, rows) => {
  if (table !== "sources") return;
  const r = rows.find((x) => x.id === id);
  if (r && r.tier_override == null) r.tier_override = tier;
};

const NOW = new Date("2026-10-04T12:00:00Z");
const day = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const sourceRow = (over = {}) => ({
  id: "s1", name: "Source One", url: "https://one.example.org/", base_tier: 4, effective_tier: null, tier_override: null, status: "active",
  processing_paused: false, confirmation_count: 0, conflict_count: 3, accuracy_rate: 1, accessibility_rate: 1,
  total_checks: 3, lead_time_samples: 0, avg_lead_time_days: 0, independent_citers: 0, highest_citing_tier: null,
  total_citations: 0, self_citation_count: 0, conflict_total: 5, last_checked: day(1), last_accessible: day(1),
  created_at: "2020-01-01T00:00:00Z", last_substantive_change: day(1), update_frequency: "ad-hoc", ...over,
});
const tiersOf = (row) => ({ base_tier: row.base_tier, effective_tier: row.effective_tier, tier_override: row.tier_override });

test.afterEach(() => { __setWriteClientForTest(null); });

// ── 1. source-growth applyReputationRecompute ───────────────────────────────────────────────────────
function growthStore(hooks) {
  return makeStore({ sources: [sourceRow()], source_citations: [], source_tier_opinions: [], source_trust_events: [], system_state: [{ id: true, scrape_cadence: "weekly" }], source_reliability_ledger: [] }, hooks);
}

test("source-growth control: with no override the recompute moves effective_tier and records one event", async () => {
  const db = growthStore();
  const r = await applyReputationRecompute(db, "s1");
  assert.equal(r.changed, true);
  assert.equal(db.tables.sources[0].effective_tier, 5, "the fixture decision really moves the tier (4 -> 5)");
  assert.equal(db.tables.source_trust_events.length, 1);
});

test("source-growth ATTACK: an override set between the read and the write is never written over; the skip is counted", async () => {
  const db = growthStore({ beforeUpdate: adminOverridesBeforeWrite("s1", 2) });
  const r = await applyReputationRecompute(db, "s1");
  assert.deepEqual(tiersOf(db.tables.sources[0]), { base_tier: 4, effective_tier: null, tier_override: 2 }, "stored tiers unchanged");
  assert.equal(db.tables.source_trust_events.length, 0, "no audit row for a move that did not happen");
  assert.equal(r.override_skipped, true, "the skip is counted on the result");
});

// ── 2. recompute-tiers (the maintenance step, real buildDeps wiring) ────────────────────────────────
function tiersStore(hooks) {
  return makeStore({ sources: [sourceRow()], source_citations: [], source_tier_opinions: [], source_trust_events: [], system_state: [{ id: true, scrape_cadence: "weekly" }], source_reliability_ledger: [] }, hooks);
}

test("recompute-tiers control: no override, the step applies the movement and records its event", async () => {
  const db = tiersStore();
  __setWriteClientForTest(() => db);
  const summary = await recomputeTiers.main({ mode: "apply" }, { ...(await recomputeTiers.buildDeps()), now: () => NOW });
  assert.equal(summary.applied, 1);
  assert.equal(db.tables.sources[0].effective_tier, 5);
  assert.equal(db.tables.source_trust_events.length, 1);
});

test("recompute-tiers ATTACK: an override set between read and write leaves stored tiers alone, counts the skip, records no event", async () => {
  const db = tiersStore({ beforeUpdate: adminOverridesBeforeWrite("s1", 2) });
  __setWriteClientForTest(() => db);
  const summary = await recomputeTiers.main({ mode: "apply" }, { ...(await recomputeTiers.buildDeps()), now: () => NOW });
  assert.deepEqual(tiersOf(db.tables.sources[0]), { base_tier: 4, effective_tier: null, tier_override: 2 });
  assert.equal(summary.applied, 0, "a skipped write is not counted as applied");
  assert.equal(summary.read_back.override_skipped, 1, "the skip is counted");
  assert.equal(db.tables.source_trust_events.length, 0, "no tier_demotion event for a move that never happened");
  assert.equal(summary.exitCode, 0, "an override skip is expected behaviour, not a failure");
});

// ── 3. institution-canonicalize Part B (institution tier) and Part C (standards-body class tier) ────
const inst = { id: "i1", name: "Example Body", registrable_domain: "example.org" };
function canonStore(sources, hooks) {
  return makeStore({ institutions: [inst], sources }, hooks);
}
const partB = () => [
  { id: "own", url: "https://www.example.org/a", base_tier: 2, effective_tier: 2, tier_override: null, institution_id: "i1", status: "active", source_role: "regulator" },
  { id: "off", url: "https://cdn.other.net/b", base_tier: 5, effective_tier: 5, tier_override: null, institution_id: "i1", status: "active", source_role: "regulator" },
];

test("institution-canonicalize Part B control: an inconsistent institution row is canonicalized", async () => {
  const db = canonStore(partB());
  __setWriteClientForTest(() => db);
  const summary = await canonicalize.main({ mode: "apply" }, await canonicalize.buildDeps());
  const off = db.tables.sources.find((r) => r.id === "off");
  assert.deepEqual([off.base_tier, off.effective_tier], [2, 2]);
  assert.equal(summary.applied, 1);
});

test("institution-canonicalize Part B ATTACK: an override set between read and write is never written over; the skip is counted", async () => {
  const db = canonStore(partB(), { beforeUpdate: adminOverridesBeforeWrite("off", 6) });
  __setWriteClientForTest(() => db);
  const summary = await canonicalize.main({ mode: "apply" }, await canonicalize.buildDeps());
  const off = db.tables.sources.find((r) => r.id === "off");
  assert.deepEqual(tiersOf(off), { base_tier: 5, effective_tier: 5, tier_override: 6 }, "stored tiers unchanged");
  assert.equal(summary.applied, 0);
  assert.equal(summary.counts.part_b_tier.applied[0].updated, 0);
  assert.equal(summary.counts.override_skipped, 1, "the skip is counted");
});

const partC = () => [
  { id: "iso1", url: "https://www.iso.org/standard/1.html", base_tier: 6, effective_tier: 6, tier_override: null, institution_id: null, status: "active", source_role: "standards_body" },
];

test("institution-canonicalize Part C control: a standards-body row above the class tier moves to T4", async () => {
  const db = canonStore(partC());
  __setWriteClientForTest(() => db);
  await canonicalize.main({ mode: "apply" }, await canonicalize.buildDeps());
  assert.equal(db.tables.sources[0].base_tier, 4);
});

test("institution-canonicalize Part C ATTACK: an override set between read and write is never written over; the skip is counted", async () => {
  const db = canonStore(partC(), { beforeUpdate: adminOverridesBeforeWrite("iso1", 3) });
  __setWriteClientForTest(() => db);
  const summary = await canonicalize.main({ mode: "apply" }, await canonicalize.buildDeps());
  assert.deepEqual(tiersOf(db.tables.sources[0]), { base_tier: 6, effective_tier: 6, tier_override: 3 });
  assert.equal(summary.counts.part_c_class_override.applied[0].updated, 0);
  assert.equal(summary.counts.override_skipped, 1);
});

// ── 4. resolve-provisional-sources activateSourcesRow (a promote under a stale read) ────────────────
const provRow = () => ({ id: "p1", name: null, url: "https://some.edu/page", notes: null, fetch_status: "ok", status: "provisional", base_tier: 7, effective_tier: 7, tier_override: null });
function provStore(hooks) {
  return makeStore({ sources: [provRow()], provisional_sources: [], integrity_flags: [], source_bias_tags: [] }, hooks);
}

test("resolve-provisional control: a provisional sources row is promoted with its class tier", async () => {
  const db = provStore();
  __setWriteClientForTest(() => db);
  await resolveProv.main({ mode: "apply" }, await resolveProv.buildDeps());
  assert.deepEqual([db.tables.sources[0].status, db.tables.sources[0].base_tier, db.tables.sources[0].effective_tier], ["active", 4, 4]);
});

test("resolve-provisional ATTACK: an override set between read and write keeps its tiers; status still changes; the skip is counted", async () => {
  const db = provStore({ beforeUpdate: adminOverridesBeforeWrite("p1", 2) });
  __setWriteClientForTest(() => db);
  const summary = await resolveProv.main({ mode: "apply" }, await resolveProv.buildDeps());
  const row = db.tables.sources[0];
  assert.deepEqual(tiersOf(row), { base_tier: 7, effective_tier: 7, tier_override: 2 }, "tiers unchanged");
  assert.equal(row.status, "active", "the promote still activates the row");
  assert.equal(summary.counts.tier_override_kept, 1, "the skip is counted");
});
