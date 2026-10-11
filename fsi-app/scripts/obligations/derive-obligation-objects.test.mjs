// derive-obligation-objects.test.mjs, lane HALF-1 (2026-10-11): the writer of obligation_objects (migration 376).
// Fixtures only (src/lib/obligations/fixtures/obligation-objects.fixture.json, marked FIXTURE, never loaded live) and
// injected deps: no database, no network. The half slice is closed end to end on fixtures: candidates -> plan -> insert
// (an in-memory store standing in for the table) -> fetchObligationObjectsForItem -> the applicability gate and the
// binding summary the detail page banner renders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  buildObjectRow,
  planObligationObjects,
  deriveObligationObjects,
  OBJECT_INSERT_COLUMNS,
  OBJECT_DERIVATION_VERSION,
} from "./derive-obligation-objects.mjs";
import { main, classifyItemBindingPosition } from "./derive-obligations.mjs";
import { assertEntityId } from "../../src/lib/entities/entity-id-shape.mjs";
import { computeItemRelevance, fetchObligationObjectsForItem, summariseObligationBinding } from "../../src/lib/workspace/relevance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, "..", "..", "src", "lib", "obligations", "fixtures", "obligation-objects.fixture.json"), "utf8"));
const MIGRATION = readFileSync(join(HERE, "..", "..", "supabase", "migrations", "376_obligation_objects.sql"), "utf8");
const KEYS = ["countemissions-eu", "cbam-indirect-customs-representative", "empowering-consumers", "ppwr"];

// Candidates are the fixture objects as a grounded drain batch would hand them over: no obligation_id (minted here), and
// the capture named by its id.
const candidateOf = (o) => {
  const { obligation_id: _id, capture_fixture_key, ...rest } = o;
  const cap = FIX.captures.find((c) => c.fixture_key === capture_fixture_key);
  return { ...rest, capture_id: cap.capture_id };
};
const CANDIDATES = FIX.objects.map(candidateOf);
const CAND = (key) => CANDIDATES.find((c) => FIX.captures.find((k) => k.capture_id === c.capture_id).fixture_key === key);
const ITEMS = FIX.captures.map((c) => ({ id: c.instrument_item_id, title: `FIXTURE ${c.fixture_key}`, is_archived: false, jurisdiction_iso: ["EU"], instrument_identifier: null, canonical_instrument_key: null }));
const CAPTURES = FIX.captures.map((c) => ({ id: c.capture_id, intelligence_item_id: c.instrument_item_id, result_content: c.result_content }));

// An in-memory stand-in for the three tables the writer touches, with the same call shapes as scripts/lib/db.mjs.
function makeDeps(store = { obligation_objects: [] }) {
  const calls = { reads: [], inserts: [] };
  const tables = { intelligence_items: ITEMS, agent_run_searches: CAPTURES, get obligation_objects() { return store.obligation_objects; } };
  return {
    store,
    calls,
    deps: {
      async readAllByIds(table, _cols, ids, opts = {}) {
        calls.reads.push(table);
        const col = opts.idColumn ?? "id";
        return tables[table].filter((r) => ids.includes(r[col]));
      },
      async guardedInsertMany(table, rows, { cite }) {
        assert.ok(cite?.skill && cite?.reason, "every write carries a cite");
        calls.inserts.push({ table, rows });
        store[table].push(...rows);
        return { inserted: rows.length, snapshot: null, rows: rows.map((r) => ({ obligation_id: r.obligation_id })) };
      },
    },
  };
}

test("the plan: four fixture candidates become four rows, ids are cl:obligation entity ids, status not_assessed, version 1", () => {
  const plan = planObligationObjects(CANDIDATES, {
    itemsById: new Map(ITEMS.map((i) => [i.id, i])),
    capturesById: new Map(CAPTURES.map((c) => [c.id, c])),
    existing: [],
    classify: classifyItemBindingPosition,
  });
  assert.equal(plan.toInsert.length, 4);
  assert.deepEqual(plan.refused, []);
  const ids = new Set();
  for (const { row } of plan.toInsert) {
    assert.doesNotThrow(() => assertEntityId(row.obligation_id, "obligation"));
    ids.add(row.obligation_id);
    assert.equal(row.status, "not_assessed");
    assert.equal(row.version, 1);
    assert.equal(row.supersedes, null);
    assert.deepEqual(Object.keys(row).sort(), [...OBJECT_INSERT_COLUMNS].sort());
    assert.ok(!("instrument_entity_id" in row), "the guard trigger fills the instrument entity, the writer never sets it");
  }
  assert.equal(ids.size, 4);
});

test("the four dates stay four fields and nothing is invented: only the spec-stated dates are set", () => {
  const row = (k) => buildObjectRow(CAND(k), { item: ITEMS.find((i) => i.id === CAND(k).instrument_item_id), capture: CAPTURES.find((c) => c.id === CAND(k).capture_id) }).row;
  const ce = row("countemissions-eu");
  assert.equal(ce.entry_into_force, "2026-06-02");
  assert.equal(ce.date_of_application, "2030-12-02");
  assert.equal(ce.first_deadline, null);
  assert.equal(ce.enforcement_start, null);
  assert.equal(row("ppwr").entry_into_force, null);
  assert.equal(row("ppwr").statutory_maximum, null);
  assert.equal(row("ppwr").cost_formula, null);
});

test("refusals: every way a candidate can be wrong is named, none is written", () => {
  const key = "cbam-indirect-customs-representative";
  const base = CAND(key);
  const item = ITEMS.find((i) => i.id === base.instrument_item_id);
  const capture = CAPTURES.find((c) => c.id === base.capture_id);
  const reason = (c, ctx = {}) => {
    const r = buildObjectRow(c, { item, capture, ...ctx });
    assert.equal(r.ok, false);
    return r.reason;
  };
  assert.equal(reason({ ...base, verbatim_text: "importers need to register as CBAM declarants" }), "span_not_verbatim");
  assert.equal(reason({ ...base, verbatim_text: "   " }), "span_not_verbatim");
  assert.equal(reason(base, { capture: { ...capture, intelligence_item_id: "00000000-0000-4000-8000-0000000000ff" } }), "capture_not_of_instrument");
  assert.equal(reason(base, { capture: null }), "capture_missing");
  assert.equal(reason(base, { item: null }), "instrument_item_missing");
  assert.equal(reason(base, { item: { ...item, is_archived: true } }), "instrument_item_archived");
  assert.equal(reason({ ...base, pinpoint_citation: "  " }), "pinpoint_blank");
  assert.equal(reason({ ...base, duty_holder_class: [] }), "duty_holder_missing");
  assert.equal(reason({ ...base, duty_holder_class: ["wizard"] }), "duty_holder_unknown:wizard");
  assert.equal(reason({ ...base, applicability_trigger: { attribute: "org_role" } }), "trigger_malformed");
  assert.equal(reason({ ...base, applicability_trigger: null }), "trigger_malformed");
  assert.equal(reason({ ...base, status: "yes" }), "status_not_writer_owned");
  assert.equal(reason({ ...base, status: "no" }), "status_not_writer_owned");
  assert.equal(reason({ ...base, frequency: "weekly" }), "frequency_invalid");
  assert.equal(reason({ ...base, mode: ["sea"] }), "mode_alias");
  assert.equal(reason({ ...base, first_deadline: "30 June 2026" }), "date_malformed:first_deadline");
  assert.equal(reason({ ...base, effort: { person_days: 2, recurrence: "annual", currency: "EUR" } }), "effort_carries_money");
  assert.equal(reason({ ...base, binding_position: "maybe" }), "binding_position_unknown:maybe");
});

test("status is never written yes or no, and an absent status is written not_assessed", () => {
  const base = CAND("ppwr");
  const ctx = { item: ITEMS.find((i) => i.id === base.instrument_item_id), capture: CAPTURES.find((c) => c.id === base.capture_id) };
  const { status: _status, ...noStatus } = base;
  assert.equal(buildObjectRow(noStatus, ctx).row.status, "not_assessed");
  assert.equal(buildObjectRow({ ...base, status: "not_assessed" }, ctx).row.status, "not_assessed");
});

test("binding position: the candidate's own wins; without one the instrument classifier decides, then monitoring_only, else refused", () => {
  const base = CAND("countemissions-eu");
  const { binding_position: _bp, ...bare } = base;
  const ctx = (item) => ({ item, capture: CAPTURES.find((c) => c.id === base.capture_id), classify: classifyItemBindingPosition });
  const plain = { ...ITEMS.find((i) => i.id === base.instrument_item_id), title: "FIXTURE unnamed measure" };
  // unnamed instrument, forwarder duty holder: nothing fires, never guessed
  assert.equal(buildObjectRow(bare, ctx(plain)).reason, "binding_position_unresolved");
  // a named instrument (CBAM) is classified by the one rule table
  const cbam = { ...plain, title: "Regulation (EU) 2023/956 carbon border adjustment mechanism", jurisdiction_iso: ["EU"] };
  const named = buildObjectRow(bare, ctx(cbam));
  assert.equal(named.ok, true);
  assert.ok(["direct_duty", "carrier_passthrough", "customer_contract", "monitoring_only"].includes(named.row.binding_position));
  // duty holders that exclude every forwarder role: monitoring_only
  const mon = buildObjectRow({ ...bare, duty_holder_class: ["member_state"] }, ctx(plain));
  assert.equal(mon.ok, true);
  assert.equal(mon.row.binding_position, "monitoring_only");
  assert.equal(mon.bindingSource, "duty_holder_excludes_forwarder");
  // the candidate's explicit position wins over the classifier
  assert.equal(buildObjectRow({ ...bare, binding_position: "customer_contract" }, ctx(cbam)).row.binding_position, "customer_contract");
});

test("versioning and idempotency: a re-run plans nothing; a changed provision is a new version that supersedes, never an update", async () => {
  const { deps, store, calls } = makeDeps();
  const first = await deriveObligationObjects({ candidates: CANDIDATES, apply: true, classify: classifyItemBindingPosition }, deps);
  assert.equal(first.inserted, 4);
  assert.equal(store.obligation_objects.length, 4);

  const again = await deriveObligationObjects({ candidates: CANDIDATES, apply: true, classify: classifyItemBindingPosition }, deps);
  assert.equal(again.to_insert, 0);
  assert.equal(again.already_registered, 4);
  assert.equal(store.obligation_objects.length, 4, "re-run wrote nothing");

  // the instrument text changes: a new capture holds the amended wording at the same pinpoint
  const base = CAND("empowering-consumers");
  const amendedText = "a trader must not make a generic environmental claim about its own services unless it can demonstrate recognised excellent environmental performance";
  CAPTURES.push({ id: "00000000-0000-4000-8000-0000000000b9", intelligence_item_id: base.instrument_item_id, result_content: `FIXTURE amended capture. ${amendedText}. End.` });
  const amended = { ...base, capture_id: "00000000-0000-4000-8000-0000000000b9", verbatim_text: amendedText };
  const v2 = await deriveObligationObjects({ candidates: [amended], apply: true, classify: classifyItemBindingPosition }, deps);
  assert.equal(v2.inserted, 1);
  const old = store.obligation_objects.find((o) => o.pinpoint_citation === base.pinpoint_citation && o.version === 1);
  const next = store.obligation_objects.find((o) => o.version === 2);
  assert.equal(next.supersedes, old.obligation_id);
  assert.notEqual(next.obligation_id, old.obligation_id);
  assert.equal(old.verbatim_text, base.verbatim_text, "the v1 row is untouched");
  assert.ok(calls.inserts.every((c) => c.table === "obligation_objects"), "the only table written is obligation_objects");
  CAPTURES.pop();
});

test("dry by default: the plan is reported, nothing is inserted; no candidates means no reads at all", async () => {
  const dry = makeDeps();
  const r = await deriveObligationObjects({ candidates: CANDIDATES, classify: classifyItemBindingPosition }, dry.deps);
  assert.equal(r.mode, "dry-run");
  assert.equal(r.to_insert, 4);
  assert.equal(r.inserted, 0);
  assert.equal(dry.calls.inserts.length, 0);
  assert.deepEqual(r.binding_position_breakdown, { direct_duty: 4 });

  const none = makeDeps();
  const n = await deriveObligationObjects({ candidates: [], apply: true }, none.deps);
  assert.equal(n.candidates, 0);
  assert.deepEqual(none.calls.reads, []);
  assert.deepEqual(none.calls.inserts, []);
});

test("refused candidates are reported with their reason and never inserted; one bad candidate does not stop the good ones", async () => {
  const { deps, store } = makeDeps();
  const bad = { ...CAND("ppwr"), verbatim_text: "paraphrase that is not in the capture" };
  const good = CAND("countemissions-eu");
  const r = await deriveObligationObjects({ candidates: [bad, good, { ...good }], apply: true, classify: classifyItemBindingPosition }, deps);
  assert.equal(r.inserted, 1);
  assert.deepEqual(r.refused.map((x) => x.reason).sort(), ["duplicate_in_batch", "span_not_verbatim"]);
  assert.equal(store.obligation_objects.length, 1);
});

test("main(): the object phase runs inside derive-obligations main, so the chain step reaches it; the register phase is unchanged", async () => {
  const { deps, store } = makeDeps();
  const full = {
    ...deps,
    async readAll(table) { return table === "item_forward_events" || table === "obligations" ? [] : []; },
  };
  const dry = await main({ apply: false, objectCandidates: CANDIDATES }, full);
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.objects.candidates, 4);
  assert.equal(dry.objects.to_insert, 4);
  assert.equal(store.obligation_objects.length, 0);
  const applied = await main({ apply: true, objectCandidates: CANDIDATES }, full);
  assert.equal(applied.objects.inserted, 4);
  assert.equal(store.obligation_objects.length, 4);
  // no candidates: the object phase is a no-op and reports it
  const noop = await main({ apply: true }, full);
  assert.equal(noop.objects.candidates, 0);
  assert.equal(noop.objects.inserted, 0);
});

// ── the half slice closed end to end ────────────────────────────────────────────────────────────────────────────
// A request-scoped client stand-in for fetchObligationObjectsForItem: .from(t).select().eq(col, v).limit(n).
function fakeSupabase(rows) {
  return {
    from(table) {
      assert.equal(table, "obligation_objects");
      let filtered = rows;
      const q = {
        select: () => q,
        eq: (col, v) => { filtered = filtered.filter((r) => r[col] === v); return q; },
        limit: () => q,
        then: (res) => res({ data: filtered, error: null }),
      };
      return q;
    },
  };
}

test("end to end on fixtures: writer -> store -> relevance.mjs reads the rows it wrote, per instrument, and the outputs differ", async () => {
  const { deps, store } = makeDeps();
  const r = await deriveObligationObjects({ candidates: CANDIDATES, apply: true, classify: classifyItemBindingPosition }, deps);
  assert.equal(r.inserted, 4);
  const sb = fakeSupabase(store.obligation_objects);

  const profile = (orgRoles) => ({ orgRoles, orgSize: {}, transport_modes: [], verticals: [], jurisdictions: {} });
  const out = {};
  for (const k of KEYS) {
    const cap = FIX.captures.find((c) => c.fixture_key === k);
    const objects = await fetchObligationObjectsForItem(sb, cap.instrument_item_id);
    assert.equal(objects.length, 1, `${k}: the reader finds the one row the writer wrote`);
    assert.equal(objects[0].binding_position, "direct_duty");
    const relevance = computeItemRelevance({ title: k, compliance_object_tags: [], obligation_objects: objects }, profile(["forwarder"]), []);
    assert.equal(relevance.binding.decomposed, true, `${k}: banner is decomposed`);
    assert.equal(relevance.applicability.grain, "obligation");
    out[k] = { applicability: relevance.applicability.status, holders: relevance.binding.lines[0].dutyHolders.map((h) => h.id).join(",") };
    // the trigger the writer stored is the one the banner shows
    assert.equal(relevance.binding.lines[0].triggers[0].attribute, "org_role");
  }
  // the outputs now differ per instrument: the duty-holder classes the writer stored reach the banner line
  assert.equal(new Set(Object.values(out).map((o) => o.holders)).size, 4);

  // an item the writer has not decomposed still falls back to the item-grain path
  const none = await fetchObligationObjectsForItem(sb, "00000000-0000-4000-8000-0000000000ee");
  assert.deepEqual(none, []);
  assert.equal(summariseObligationBinding(none, { orgRoles: ["forwarder"] }).decomposed, false);
});

// ── static: the writer matches migration 376 and relies on its outbox, it does not reimplement it ──────────────
test("static: every column the writer sets exists in migration 376's table; the writer sets no column the database owns", () => {
  const create = MIGRATION.slice(MIGRATION.indexOf("CREATE TABLE IF NOT EXISTS public.obligation_objects"));
  const body = create.slice(0, create.indexOf("CONSTRAINT"));
  const cols = [...body.matchAll(/^\s{2}([a-z_]+)\s+(?:text|uuid|int|date|jsonb|timestamptz|text\[\])/gm)].map((m) => m[1]);
  for (const c of OBJECT_INSERT_COLUMNS) assert.ok(cols.includes(c), `column ${c} exists in 376`);
  for (const owned of ["instrument_entity_id", "created_at", "updated_at"]) {
    assert.ok(cols.includes(owned));
    assert.ok(!OBJECT_INSERT_COLUMNS.includes(owned), `${owned} is the database's`);
  }
});

test("static: the outbox trigger the writer relies on is on the table in 352's two-argument form (every row the writer inserts reaches the flywheel)", () => {
  assert.match(MIGRATION, /CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.obligation_objects\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\('obligation_id', 'instrument_entity_id'\)/);
  assert.match(MIGRATION, /CREATE TRIGGER obligation_objects_guard_trg\s+BEFORE INSERT OR UPDATE ON public\.obligation_objects/);
  assert.match(OBJECT_DERIVATION_VERSION, /^oblig-objects-/);
});
