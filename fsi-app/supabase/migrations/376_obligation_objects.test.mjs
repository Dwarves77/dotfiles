// 376_obligation_objects.test.mjs, lane OBL-2 (2026-10-08): static proof of migration 376 by parsing the SQL file:
// no database, no SQL parser dependency. The ATTACK (a paraphrase refused on INSERT and UPDATE, the CHECKs, the
// outbox row carrying the instrument entity, authenticated refused on INSERT and UPDATE) runs in the migration's own
// self-check at apply time inside a rolled-back sub-transaction. This file proves the migration carries the
// columns the brief names, the constraints, the guard and its hardening, the two-argument outbox trigger, the
// grants and policy, the obligations column, and that every assumption it makes about earlier migrations is true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DUTY_HOLDER_CLASSES } from "../../src/lib/contracts/vocabularies.mjs";
import { buildSchema, parseInserts, parseUpdates, checkFixtures, stripSql } from "./_lib/fixture-inserts.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "376_obligation_objects.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const read = (name) => readFileSync(join(HERE, name), "utf8");

test("header: subject line, NOT APPLIED, schema only", () => {
  assert.match(RAW, /^-- subject: Migration 376 /);
  assert.match(RAW, /NOT APPLIED/);
  assert.match(RAW, /Zero rows by construction/);
});

const TABLE = SQL.slice(SQL.indexOf("CREATE TABLE IF NOT EXISTS public.obligation_objects"), SQL.indexOf("COMMENT ON TABLE public.obligation_objects"));
const columns = TABLE.split("\n")
  .map((l) => l.match(/^  ([a-z_]+)\s+(text\[\]|text|uuid|int|jsonb|date|timestamptz)\b/))
  .filter(Boolean)
  .map((m) => m[1]);

test("table: exactly the columns the brief and the coordinator addendum name (plus the instrument entity the outbox reads)", () => {
  const expected = [
    "obligation_id", "instrument_item_id", "instrument_entity_id", "version", "supersedes", "pinpoint_citation",
    "verbatim_text", "plain_language", "binding_position", "duty_holder_class", "applicability_trigger",
    "jurisdiction", "mode", "vertical", "frequency",
    "entry_into_force", "date_of_application", "first_deadline", "enforcement_start",
    "evidence_required", "retention_period", "sanction_class", "severity_score", "statutory_maximum", "cost_formula",
    "direct_compliance_cost", "effort", "status", "date_reviewed", "next_review_due", "source_id", "capture_id",
    "created_at", "updated_at",
  ];
  assert.deepEqual(columns, expected);
});

test("the four dates are four separate nullable date columns", () => {
  for (const c of ["entry_into_force", "date_of_application", "first_deadline", "enforcement_start"]) {
    assert.match(TABLE, new RegExp(`\\n  ${c}\\s+date,`), `${c} is a nullable date`);
  }
});

test("the three cost slots are three separate things: statutory_maximum/cost_formula, direct_compliance_cost jsonb, effort jsonb", () => {
  assert.match(TABLE, /\n  statutory_maximum\s+text,/);
  assert.match(TABLE, /\n  cost_formula\s+text,/);
  assert.match(TABLE, /\n  direct_compliance_cost jsonb,/);
  assert.match(TABLE, /\n  effort\s+jsonb,/);
  assert.match(SQL, /direct_compliance_cost \?& ARRAY\['amount', 'currency', 'basis', 'source'\]/);
  assert.match(SQL, /effort \?& ARRAY\['person_days', 'recurrence'\]/);
  // effort is never money
  assert.match(SQL, /obligation_objects_effort_not_money_check\s+CHECK \(effort IS NULL OR NOT \(effort \?\| ARRAY\['amount', 'currency', 'price', 'cost'\]\)\)/);
  // nothing in the table computes or sums across slots
  assert.doesNotMatch(TABLE, /GENERATED|total/i);
});

test("keys: obligation_id primary key into entities, instrument item and capture foreign keys, supersedes self-reference", () => {
  assert.match(TABLE, /obligation_id\s+text\s+PRIMARY KEY REFERENCES public\.entities\(entity_id\)/);
  assert.match(TABLE, /instrument_item_id\s+uuid\s+NOT NULL REFERENCES public\.intelligence_items\(id\)/);
  assert.match(TABLE, /supersedes\s+text\s+REFERENCES public\.obligation_objects\(obligation_id\)/);
  assert.match(TABLE, /source_id\s+uuid\s+REFERENCES public\.sources\(id\)/);
  assert.match(TABLE, /capture_id\s+uuid\s+NOT NULL REFERENCES public\.agent_run_searches\(id\)/);
});

test("capture naming reuses section_claim_provenance's FK target: agent_run_searches(id) (migration 112), text in result_content (migration 264)", () => {
  assert.match(read("112_provenance_invariant_schema.sql"), /search_result_id\s+UUID REFERENCES agent_run_searches\(id\)/);
  assert.match(read("264_rename_result_content_excerpt.sql"), /result_content_excerpt -> result_content/);
});

test("id shape: cl:obligation:<16 hex> matches migration 282's id_matches_kind and the JS id builder, and the brief's cl:oblig shape cannot register", () => {
  assert.match(SQL, /obligation_id ~ '\^cl:obligation:\[0-9a-f\]\{16\}\$'/);
  assert.match(read("282_entities.sql"), /entity_id LIKE 'cl:' \|\| kind::text \|\| ':%'/);
  assert.match(read("282_entities.sql"), /'instrument','obligation','method'/);
  assert.ok(!"cl:oblig:0123456789abcdef".startsWith("cl:" + "obligation" + ":"), "cl:oblig: is not a valid obligation entity id");
});

test("constraints: the four binding positions, three statuses, four frequencies, mode aliases refused, trigger shape, non-empty duty holders", () => {
  assert.match(SQL, /binding_position IN \('direct_duty', 'carrier_passthrough', 'customer_contract', 'monitoring_only'\)/);
  assert.match(SQL, /status IN \('yes', 'no', 'not_assessed'\)/);
  assert.match(TABLE, /status\s+text\s+NOT NULL DEFAULT 'not_assessed'/);
  assert.match(SQL, /frequency IS NULL OR frequency IN \('annual', 'per_consignment', 'per_voyage', 'event_triggered'\)/);
  assert.match(SQL, /cardinality\(duty_holder_class\) >= 1/);
  assert.match(SQL, /jsonb_typeof\(applicability_trigger -> 'attribute'\) = 'string'/);
  assert.match(SQL, /jsonb_typeof\(applicability_trigger -> 'value'\) = 'string'/);
  for (const alias of ["sea", "maritime", "truck", "barge", "airfreight"]) assert.match(SQL, new RegExp(`'${alias}'`));
});

function fn(name) {
  const i = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(i >= 0, `${name} is created`);
  const start = SQL.indexOf("$fn$", i);
  return SQL.slice(i, SQL.indexOf("$fn$;", start + 4) + 5);
}

test("guard: SECURITY DEFINER with a pinned search_path naming pg_temp, EXECUTE revoked from PUBLIC (F70)", () => {
  const body = fn("obligation_objects_guard");
  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /SET search_path = public, pg_temp/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.obligation_objects_guard\(\) FROM PUBLIC, anon, authenticated;/);
});

test("guard: the verbatim rule is validate_item_provenance criterion 3's position() containment, against the capture of THIS instrument item", () => {
  const body = fn("obligation_objects_guard");
  assert.match(body, /position\(lower\(btrim\(NEW\.verbatim_text\)\) IN lower\(v_capture_text\)\) = 0/);
  assert.match(body, /v_capture_item IS DISTINCT FROM NEW\.instrument_item_id/);
  assert.match(body, /obligation_object_span_not_verbatim/);
  // the same expression form as the gate it reuses (119) and the sibling correction guard (356)
  assert.match(read("119_validate_item_provenance_failclose.sql"), /position\(lower\(btrim\(r\.source_span\)\) IN lower\(r\.result_content_excerpt\)\) = 0/);
  assert.match(read("356_item_corrections.sql"), /position\(lower\(btrim\(p_span\)\) IN lower\(ars\.result_content\)\) > 0/);
  // it never truncates the proof: the whole capture text is the pool (ADR-016)
  assert.doesNotMatch(body, /substring\(|left\(v_capture_text|right\(v_capture_text/);
});

test("guard: runs BEFORE INSERT OR UPDATE (both paths), registers the obligation entity on insert, fills the instrument entity", () => {
  assert.match(SQL, /CREATE TRIGGER obligation_objects_guard_trg\s+BEFORE INSERT OR UPDATE ON public\.obligation_objects\s+FOR EACH ROW EXECUTE FUNCTION public\.obligation_objects_guard\(\);/);
  const body = fn("obligation_objects_guard");
  assert.match(body, /INSERT INTO public\.entities \(entity_id, kind, canonical_name\)\s+VALUES \(NEW\.obligation_id, 'obligation'/);
  assert.match(body, /ON CONFLICT \(entity_id\) DO NOTHING/);
  assert.match(body, /NEW\.instrument_entity_id := v_item_entity/);
  assert.match(body, /obligation_object_version_not_increasing/);
});

test("outbox: migration 352's two-argument form, keyed on the pk and on instrument_entity_id; 352 is what makes the second argument work", () => {
  assert.match(SQL, /CREATE TRIGGER propagation_outbox_trg\s+AFTER INSERT OR UPDATE OR DELETE ON public\.obligation_objects\s+FOR EACH ROW EXECUTE FUNCTION public\.emit_propagation_event\('obligation_id', 'instrument_entity_id'\);/);
  assert.match(read("352_outbox_entity_for_emission_factors.sql"), /TG_NARGS >= 2/);
  assert.match(SQL, /position\('TG_NARGS' IN pg_get_functiondef\('public\.emit_propagation_event\(\)'::regprocedure\)\) = 0/);
});

test("RLS and grants: read for authenticated on a non-archived parent item; no write policy; no write grant except service_role", () => {
  assert.match(SQL, /ALTER TABLE public\.obligation_objects ENABLE ROW LEVEL SECURITY;/);
  assert.match(SQL, /REVOKE ALL ON public\.obligation_objects FROM PUBLIC, anon, authenticated;/);
  assert.match(SQL, /GRANT SELECT ON public\.obligation_objects TO authenticated;/);
  assert.match(SQL, /GRANT ALL ON public\.obligation_objects TO service_role;/);
  assert.match(SQL, /CREATE POLICY obligation_objects_read ON public\.obligation_objects\s+FOR SELECT\s+TO authenticated\s+USING \(\s+EXISTS \(\s+SELECT 1 FROM public\.intelligence_items i\s+WHERE i\.id = obligation_objects\.instrument_item_id\s+AND i\.is_archived = false/);
  assert.doesNotMatch(SQL, /CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  // the predicate is the shape migration 290's obligations policy has
  assert.match(read("290_obligations.sql"), /i\.id = obligations\.intelligence_item_id\s+AND i\.is_archived = false/);
});

test("obligations gains a nullable obligation_id FK, no backfill, and nothing in the migration touches existing obligations rows or drops anything", () => {
  assert.match(SQL, /ALTER TABLE public\.obligations\s+ADD COLUMN IF NOT EXISTS obligation_id text REFERENCES public\.obligation_objects\(obligation_id\);/);
  assert.doesNotMatch(SQL, /UPDATE public\.obligations|DELETE FROM public\.obligations|DROP TABLE public\.obligations|INSERT INTO public\.obligations/);
  assert.doesNotMatch(SQL, /DROP TABLE(?! public\.obligation_objects)/);
});

test("preconditions name every earlier migration this one depends on, and each exists", () => {
  for (const [n, file] of [["282", "282_entities.sql"], ["283", "283_entity_refs.sql"], ["284", "284_propagation_outbox.sql"], ["352", "352_outbox_entity_for_emission_factors.sql"], ["264", "264_rename_result_content_excerpt.sql"], ["290", "290_obligations.sql"]]) {
    assert.ok(read(file).length > 0, `${file} exists`);
    assert.match(SQL, new RegExp(`migration ${n} must be applied first`), `precondition for ${n}`);
  }
  assert.match(read("283_entity_refs.sql"), /ADD COLUMN IF NOT EXISTS instrument_entity_id text REFERENCES public\.entities\(entity_id\)/);
});

test("self-check: attacks, not presence. Paraphrase refused on INSERT and UPDATE, each CHECK fired, authenticated refused, outbox entity asserted, all rolled back", () => {
  assert.match(SQL, /c376_selfcheck_rollback/);
  for (const needle of [
    "a paraphrase was accepted on INSERT",
    "a paraphrase was accepted on UPDATE",
    "status maybe was accepted",
    "an empty duty_holder_class was accepted",
    "effort carrying a money key was accepted",
    "a trigger with no value was accepted",
    "authenticated could INSERT into obligation_objects",
    "authenticated could UPDATE obligation_objects",
    "the outbox row does not carry the instrument entity",
    "status default is",
  ]) assert.ok(SQL.includes(needle), needle);
  assert.match(SQL, /SET LOCAL ROLE authenticated;/);
  assert.match(SQL, /v_n_after <> v_n_before/);
  assert.match(SQL, /a fixture entity survived/);
});

test("no dash glyphs or section-sign glyphs (rule 022)", () => {
  assert.doesNotMatch(RAW, new RegExp("[" + String.fromCharCode(0x2013, 0x2014, 0xa7) + "]"));
});

// ---- fixture rows of the self-check, checked statically against the tables as the migration tree defines them (lane
// SEC-3b-F's shared helper): nothing in CI executes Postgres, and a fixture that violates a real definition aborts the
// apply after the migration's logic ran (372 apply 2, 370 apply 3).
const FIXTURE_SQL = stripSql(RAW);
const SCHEMA = buildSchema(HERE, { before: 377 });
const INSERTS = parseInserts(FIXTURE_SQL);
const UPDATES = parseUpdates(FIXTURE_SQL);

test("fixtures: every INSERT and UPDATE literal in the self-check satisfies the table definitions (NOT NULL, defaults, IN-list CHECKs, columns)", () => {
  // Two findings are expected and asserted, not ignored: (1) agent_run_searches.result_content is created by migration
  // 264's rename INSIDE a DO block, which the rebuilt schema does not see; the creating text is asserted instead.
  // (2) the self-check's UPDATE ... SET status = 'maybe' is the ATTACK on the status CHECK and is meant to be refused.
  assert.match(read("264_rename_result_content_excerpt.sql"), /RENAME COLUMN result_content_excerpt TO result_content/);
  assert.match(read("112_provenance_invariant_schema.sql"), /CREATE TABLE IF NOT EXISTS agent_run_searches \(/);
  assert.deepEqual(checkFixtures({ inserts: INSERTS, updates: UPDATES, schema: SCHEMA }), [
    "public.agent_run_searches.result_content: no such column in the migration tree",
    "update public.obligation_objects.status: 'maybe' violates obligation_objects_status_check (allowed: yes, no, not_assessed) (23514)",
  ]);
  assert.match(SQL, /status maybe was accepted/, "the 'maybe' update is the attack, and the self-check fails the apply if it is accepted");
});

test("fixtures: the parser sees the four tables the self-check writes, so a table dropped from the scan is a failure", () => {
  const tables = [...new Set(INSERTS.map((i) => i.schemaName + "." + i.table))].sort();
  assert.deepEqual(tables, ["public.agent_run_searches", "public.entities", "public.obligation_objects"]);
  for (const t of tables) assert.ok(SCHEMA.tables.has(t.slice(7)), t + " is defined in the migration tree");
  assert.ok(INSERTS.filter((i) => i.table === "obligation_objects").length >= 3, "the valid row, the paraphrase and the authenticated attack");
});

test("fixtures: the checker catches a defect in this migration's own table (red): a status outside the list, a NOT NULL column omitted", () => {
  const badStatus = parseInserts("INSERT INTO public.obligation_objects (obligation_id, status) VALUES ('x', 'maybe');");
  assert.match(checkFixtures({ inserts: badStatus, schema: SCHEMA }).join("|"), /instrument_item_id: NOT NULL with no default and not written/);
  const upd = parseUpdates("UPDATE public.obligation_objects SET status = 'maybe' WHERE obligation_id = 'x';");
  assert.match(checkFixtures({ inserts: [], updates: upd, schema: SCHEMA }).join("|"), /status: 'maybe' violates/);
});

// ---- duty_holder_class vocabulary (coordinator ruling 2026-10-08): the authoritative list lives in
// src/lib/contracts/vocabularies.mjs; the migration carries NO CHECK on the values (spec 01 section 10: volatile
// taxonomies are data, the vocabulary module is the one site).
const FIXTURE = JSON.parse(readFileSync(join(HERE, "..", "..", "src", "lib", "obligations", "fixtures", "obligation-objects.fixture.json"), "utf8"));

test("duty_holder_class: every fixture row's classes are in the vocabulary module", () => {
  assert.equal(FIXTURE.objects.length, 4);
  for (const o of FIXTURE.objects) {
    for (const c of o.duty_holder_class) assert.ok(Object.hasOwn(DUTY_HOLDER_CLASSES, c), o.capture_fixture_key + ": " + c + " is not in DUTY_HOLDER_CLASSES");
  }
});

test("duty_holder_class: the migration states no value CHECK (only non-empty), so the vocabulary has one site", () => {
  assert.ok(SQL.includes("CHECK (cardinality(duty_holder_class) >= 1)"));
  assert.doesNotMatch(SQL, /duty_holder_class\s*(<@|=\s*ANY|IN)/i);
  assert.doesNotMatch(SQL, /unnest\(duty_holder_class\)/i);
  assert.ok(RAW.includes("DUTY_HOLDER_CLASSES in src/lib/contracts/vocabularies.mjs"), "the migration header points at the vocabulary module");
});
