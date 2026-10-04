// S1-A (lane s1a-source-register, 2026-10-04): the free brief path registers every cited source.
//
// Fixtures only, injected in-memory client, no network, no model call. jiti imports the TS module
// (same portability class as tier-opinion-dedup.npmtest.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const sg = await jiti.import("./source-growth.ts");
const trust = await jiti.import("../trust.ts");

const OWN = "00000000-0000-4000-8000-000000000001";
const EURLEX = "00000000-0000-4000-8000-000000000002";
const EPA = "00000000-0000-4000-8000-000000000003";

// Minimal in-memory PostgREST-shaped client: select/ilike/eq/in/limit/single/insert/update/upsert.
function fakeDb(seed = {}) {
  const tables = {
    sources: [],
    source_citations: [],
    source_tier_opinions: [],
    provisional_sources: [],
    source_trust_events: [],
    ...seed,
  };
  const writes = { insert: [], update: [], upsert: [] };
  let nextId = 100;
  function builder(name) {
    const st = { filters: [], limitN: null, op: "select", payload: null };
    const run = () => {
      const rows = tables[name] ?? (tables[name] = []);
      const match = (r) =>
        st.filters.every((f) => {
          if (f.k === "eq") return r[f.c] === f.v;
          if (f.k === "in") return f.v.includes(r[f.c]);
          if (f.k === "ilike") return String(r[f.c] ?? "").toLowerCase().includes(String(f.v).replace(/%/g, "").toLowerCase());
          return true;
        });
      if (st.op === "insert") {
        const row = { id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`, detected_at: new Date().toISOString(), ...st.payload };
        rows.push(row);
        writes.insert.push({ table: name, row });
        return { data: [row], error: null };
      }
      if (st.op === "upsert") {
        writes.upsert.push({ table: name, row: st.payload });
        rows.push(st.payload);
        return { data: null, error: null };
      }
      if (st.op === "update") {
        const hit = rows.filter(match);
        writes.update.push({ table: name, patch: st.payload, ids: hit.map((r) => r.id) });
        hit.forEach((r) => Object.assign(r, st.payload));
        return { data: null, error: null };
      }
      let out = rows.filter(match);
      if (st.limitN != null) out = out.slice(0, st.limitN);
      return { data: out, error: null };
    };
    const b = {
      select() { return b; },
      insert(p) { st.op = "insert"; st.payload = p; return b; },
      update(p) { st.op = "update"; st.payload = p; return b; },
      upsert(p) { st.op = "upsert"; st.payload = p; return b; },
      eq(c, v) { st.filters.push({ k: "eq", c, v }); return b; },
      in(c, v) { st.filters.push({ k: "in", c, v }); return b; },
      ilike(c, v) { st.filters.push({ k: "ilike", c, v }); return b; },
      limit(n) { st.limitN = n; return b; },
      single() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.data?.[0] ? null : { message: "no row" } }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { tables, writes, from: (n) => builder(n) };
}

function seeded(over = {}) {
  return fakeDb({
    sources: [
      { id: OWN, url: "https://publisher.example.org/item", base_tier: 4, effective_tier: 4, tier_override: null },
      { id: EURLEX, url: "https://eur-lex.europa.eu/legal-content/x", base_tier: 3, effective_tier: 3, tier_override: over.eurlexOverride ?? null },
      { id: EPA, url: "https://www.epa.gov/rule", base_tier: 2, effective_tier: 2, tier_override: null },
    ],
  });
}

// An entry with 3 claims citing 2 distinct external hosts (plus one claim on the item's own host) and no
// "New Sources Identified" table anywhere.
const CITED = [
  "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115",
  "https://eur-lex.europa.eu/eli/reg/2023/1115/oj",
  "https://www.epa.gov/rule/final",
  "https://publisher.example.org/item/page2",
];

test("ACCEPTANCE: 3 claims over 2 external hosts -> 2 decisions, 2 edges, 1 class-table opinion (host that disagrees)", async () => {
  const db = seeded();
  const res = await sg.registerEntryCitations(db, OWN, CITED.map((url) => ({ name: url, url })));
  assert.equal(res.decisions.length, 2, "one decision per distinct external host, own host excluded");
  assert.deepEqual(res.decisions.map((d) => d.registered), ["existing", "existing"]);
  assert.equal(res.edges, 2);
  const edges = db.tables.source_citations;
  assert.equal(edges.length, 2);
  assert.ok(edges.every((e) => e.citing_source_id === OWN), "edge runs item source -> cited source");
  assert.deepEqual(edges.map((e) => e.cited_source_id).sort(), [EURLEX, EPA].sort());
  const ops = db.tables.source_tier_opinions;
  assert.equal(ops.length, 1, "only eur-lex disagrees (class 1 vs base 3); epa agrees (2 vs 2)");
  assert.equal(ops[0].target_source_id, EURLEX);
  assert.equal(ops[0].opined_tier, 1);
  assert.equal(ops[0].opinion_source, "host_class_table");
  assert.equal(ops[0].opining_source_id, OWN);
});

test("an agreeing host records no opinion, and an unknown classifiable host is registered provisional at class tier", async () => {
  const db = seeded();
  const res = await sg.registerEntryCitations(db, OWN, [{ name: "EPA", url: "https://www.epa.gov/x" }, { name: "Widget", url: "https://unknown-widget-co.com/a" }]);
  assert.equal(db.tables.source_tier_opinions.length, 0);
  const minted = db.writes.insert.find((w) => w.table === "sources");
  assert.ok(minted, "new source minted");
  assert.equal(minted.row.status, "provisional");
  assert.equal(minted.row.base_tier, 7, "class-table tier, never a guessed default");
  assert.equal(res.edges, 2);
});

test("ADMIN OVERRIDE: a cited host with tier_override set gets no opinion and no tier write", async () => {
  const db = seeded({ eurlexOverride: 2 });
  await sg.registerEntryCitations(db, OWN, [{ name: "EUR-Lex", url: "https://eur-lex.europa.eu/a" }]);
  assert.equal(db.tables.source_tier_opinions.length, 0);
  const tierWrites = db.writes.update.filter((w) => w.table === "sources" && ids(w).includes(EURLEX) && ("effective_tier" in w.patch || "base_tier" in w.patch));
  assert.equal(tierWrites.length, 0, "no automatic writer changes a tier on an overridden row");
  assert.equal(db.tables.sources.find((s) => s.id === EURLEX).base_tier, 3);
});
function ids(w) { return w.ids; }

test("recomputeEffectiveTier returns the override as the effective tier (what the guard relies on)", async () => {
  const db = seeded({ eurlexOverride: 2 });
  const r = await trust.recomputeEffectiveTier(db, EURLEX);
  assert.equal(r.after_tier, 2);
  assert.equal(r.tier_override, 2);
});

test("applyReputationRecompute never writes effective_tier or an event when tier_override is set, even if stored effective_tier is stale", async () => {
  const db = seeded({ eurlexOverride: 2 }); // stored effective_tier 3 differs from override 2: changed=true
  await sg.applyReputationRecompute(db, EURLEX);
  assert.equal(db.writes.update.length, 0);
  assert.equal(db.tables.source_trust_events.length, 0);
});

test("trust event row built on a tier change has created_by worker and the actor in details", async () => {
  const row = sg.buildReputationEventRow(EURLEX, { before_tier: 3, after_tier: 2, weighted_sum: 3, citation_count: 4, reasoning: "x" });
  assert.equal(row.created_by, "worker");
  assert.equal(row.details.actor, "reputation-cycle");
  assert.equal(row.event_type, "tier_promotion");
  assert.ok(["system", "worker", "human"].includes(row.created_by), "satisfies the migration 004 CHECK");
  // and the writer inserts exactly that row on a real promotion
  const db = seeded();
  // four T1 citers push weighted_sum over the threshold so EPA (base 2) promotes to 1
  for (let i = 0; i < 4; i++) {
    const cid = `00000000-0000-4000-8000-00000000009${i}`;
    db.tables.sources.push({ id: cid, url: `https://c${i}.example/`, base_tier: 1, effective_tier: 1, tier_override: null });
    db.tables.source_citations.push({ id: `c${i}`, citing_source_id: cid, cited_source_id: EPA, detected_at: new Date().toISOString() });
  }
  const rep = await sg.applyReputationRecompute(db, EPA);
  assert.equal(rep.changed, true);
  const ev = db.tables.source_trust_events;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].created_by, "worker");
  assert.equal(ev[0].details.actor, "reputation-cycle");
});

test("a failed trust-event insert is logged, never thrown", async () => {
  const db = seeded();
  for (let i = 0; i < 4; i++) {
    const cid = `00000000-0000-4000-8000-00000000009${i}`;
    db.tables.sources.push({ id: cid, url: `https://c${i}.example/`, base_tier: 1, effective_tier: 1, tier_override: null });
    db.tables.source_citations.push({ id: `c${i}`, citing_source_id: cid, cited_source_id: EPA, detected_at: new Date().toISOString() });
  }
  const realFrom = db.from.bind(db);
  db.from = (t) => (t === "source_trust_events" ? { insert: () => Promise.resolve({ error: { message: "check violation" } }) } : realFrom(t));
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  try {
    await sg.applyReputationRecompute(db, EPA);
  } finally {
    console.warn = orig;
  }
  assert.ok(warns.some((w) => /source_trust_events insert failed/.test(w) && /check violation/.test(w)));
});

test("DRY: registerEntryCitations decides everything and writes nothing", async () => {
  const db = seeded();
  const res = await sg.registerEntryCitations(db, OWN, CITED.map((url) => ({ name: url, url })), { dry: true });
  assert.equal(res.dry, true);
  assert.equal(res.decisions.length, 2);
  assert.equal(res.edges, 2);
  assert.equal(res.decisions.find((d) => d.host === "eur-lex.europa.eu").opinion_tier, 1);
  assert.equal(db.writes.insert.length, 0);
  assert.equal(db.writes.update.length, 0);
  assert.equal(db.writes.upsert.length, 0);
});

test("cited source ids (metadata.sources_used / claim source_id) get an edge without registration", async () => {
  const db = seeded();
  const res = await sg.registerEntryCitations(db, OWN, [], { citedSourceIds: [EPA, OWN, "00000000-0000-4000-8000-0000000000ff"] });
  assert.equal(res.edges, 1, "own id and unknown id are not edged");
  assert.equal(db.tables.source_citations[0].cited_source_id, EPA);
});

test("re-running is idempotent for edges (recordCitations skips an existing pair)", async () => {
  const db = seeded();
  await sg.registerEntryCitations(db, OWN, CITED.map((url) => ({ name: url, url })));
  const second = await sg.registerEntryCitations(db, OWN, CITED.map((url) => ({ name: url, url })));
  assert.equal(second.edges, 0);
  assert.equal(db.tables.source_citations.length, 2);
});

test("growSourcesFromBrief: omitting `extra` leaves the table-only path unchanged (entryCitations null)", async () => {
  const db = seeded();
  const out = await sg.growSourcesFromBrief(db, OWN, "no table here");
  assert.equal(out.entryCitations, null);
  assert.equal(db.tables.source_citations.length, 0);
});

test("growSourcesFromBrief with `extra` registers entry citations in the same grow step", async () => {
  const db = seeded();
  const out = await sg.growSourcesFromBrief(db, OWN, "no table here", { cited: CITED.map((url) => ({ name: url, url })) });
  assert.equal(out.entryCitations.decisions.length, 2);
  assert.equal(db.tables.source_citations.length, 2);
});

test("collectCitedSources: distinct by host, drops bad urls and excluded hosts, name falls back to host", () => {
  const out = sg.collectCitedSources(["https://www.a.com/x", "https://a.com/y", "not a url", { url: "https://b.org/z", name: "B" }, "https://own.io/q"], new Set(["own.io"]));
  assert.deepEqual(out, [{ name: "a.com", url: "https://www.a.com/x" }, { name: "B", url: "https://b.org/z" }]);
});
