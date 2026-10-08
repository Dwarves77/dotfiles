// obligation-gate.test.mjs, lane OBL-2 (2026-10-08): the applicability gate at OBLIGATION grain.
// relevance.mjs reads roleScope and sizeThreshold from obligation_objects.duty_holder_class and
// applicability_trigger when rows exist for the item, falls back to the item-grain tags when none exist, and
// the resulting `applicability` and `binding` are what the detail page binding banner renders. Pure, fixtures
// only (src/lib/obligations/fixtures/obligation-objects.fixture.json, marked FIXTURE, never loaded live).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  computeItemRelevance,
  summariseObligationBinding,
  currentObligationObjects,
  fetchObligationObjectsForItem,
} from "./relevance.mjs";
import { DUTY_HOLDER_CLASSES } from "../contracts/vocabularies.mjs";
import { assertEntityId } from "../entities/entity-id-shape.mjs";
import { ORG_ROLES } from "../profile/profile-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, "..", "obligations", "fixtures", "obligation-objects.fixture.json"), "utf8"));
const BY_KEY = Object.fromEntries(FIX.objects.map((o) => [o.capture_fixture_key, o]));
const KEYS = ["countemissions-eu", "cbam-indirect-customs-representative", "empowering-consumers", "ppwr"];

const profileOf = (orgRoles, orgSize = {}) => ({ orgRoles, orgSize, transport_modes: [], verticals: [], jurisdictions: {} });
const gate = (key, orgRoles) =>
  computeItemRelevance({ title: key, compliance_object_tags: [], obligation_objects: [BY_KEY[key]] }, profileOf(orgRoles), []);

test("fixture: marked FIXTURE, four instruments, every verbatim span is verbatim in its own fixture capture", () => {
  assert.match(FIX._fixture, /^FIXTURE/);
  assert.equal(FIX.objects.length, 4);
  assert.deepEqual(FIX.objects.map((o) => o.capture_fixture_key).sort(), [...KEYS].sort());
  for (const o of FIX.objects) {
    const cap = FIX.captures.find((c) => c.fixture_key === o.capture_fixture_key);
    assert.ok(cap, `capture for ${o.capture_fixture_key}`);
    assert.equal(cap.instrument_item_id, o.instrument_item_id);
    assert.ok(cap.result_content.toLowerCase().includes(o.verbatim_text.trim().toLowerCase()), `${o.capture_fixture_key}: span is verbatim in the capture`);
    assert.doesNotThrow(() => assertEntityId(o.obligation_id, "obligation"));
    assert.ok(o.pinpoint_citation.startsWith("FIXTURE"));
    assert.equal(o.status, "not_assessed");
    assert.ok(["direct_duty", "carrier_passthrough", "customer_contract", "monitoring_only"].includes(o.binding_position));
    assert.ok(o.duty_holder_class.length >= 1);
    assert.ok(o.applicability_trigger.attribute && o.applicability_trigger.value);
  }
});

test("fixture: the four dates are four fields, only spec-stated dates are set, none collapsed", () => {
  const ce = BY_KEY["countemissions-eu"];
  assert.equal(ce.entry_into_force, "2026-06-02");
  assert.equal(ce.date_of_application, "2030-12-02");
  assert.equal(ce.first_deadline, null);
  assert.equal(ce.enforcement_start, null);
  assert.equal(BY_KEY["empowering-consumers"].date_of_application, "2026-09-27");
  assert.equal(BY_KEY["ppwr"].date_of_application, "2026-08-12");
});

test("no objects for the item: item-grain path is preserved (fallback) and the binding says not decomposed", () => {
  const item = { title: "Freight forwarder customs liability rule", compliance_object_tags: ["freight-forwarder"], obligation_objects: [] };
  const r = computeItemRelevance(item, profileOf(["forwarder"]), []);
  assert.equal(r.applicability.status, "applies");
  assert.equal(r.binding.decomposed, false);
  assert.deepEqual(r.binding.lines, []);
  // and the same with the field absent entirely
  const r2 = computeItemRelevance({ title: "x", compliance_object_tags: ["carrier-ocean"] }, profileOf(["forwarder"]), []);
  assert.equal(r2.applicability.status, "does_not_apply");
  assert.equal(r2.binding.decomposed, false);
});

test("with objects, the object-grain roleScope WINS over the item tags (item tags would have said does_not_apply)", () => {
  const item = { title: "CBAM", compliance_object_tags: ["carrier-ocean"], obligation_objects: [BY_KEY["cbam-indirect-customs-representative"]] };
  const r = computeItemRelevance(item, profileOf(["forwarder"]), []);
  assert.equal(r.applicability.status, "applies");
  assert.equal(r.applicability.grain, "obligation");
  assert.equal(r.binding.decomposed, true);
});

test("the four instruments produce DIFFERENT gate outputs (OBL-1 item 7: identical across instruments before)", () => {
  const sig = (key, roles) => JSON.stringify({ a: gate(key, roles).applicability, b: gate(key, roles).binding.lines });
  const forwarder = KEYS.map((k) => sig(k, ["forwarder"]));
  assert.equal(new Set(forwarder).size, 4, "four distinct outputs for one profile");
  // an importer-of-record-only profile: PPWR (importer duty) applies, the other three do not
  const status = (k, roles) => gate(k, roles).applicability.status;
  assert.equal(status("ppwr", ["importer_of_record"]), "applies");
  assert.equal(status("countemissions-eu", ["importer_of_record"]), "does_not_apply");
  assert.equal(status("cbam-indirect-customs-representative", ["importer_of_record"]), "does_not_apply");
  assert.equal(status("empowering-consumers", ["importer_of_record"]), "does_not_apply");
  // a carrier-only profile: none applies
  for (const k of KEYS) assert.equal(status(k, ["carrier"]), "does_not_apply", k);
  // a profile with no roles: every instrument names the role as the missing input
  for (const k of KEYS) {
    const a = gate(k, []).applicability;
    assert.equal(a.status, "needs_profile_input", k);
    assert.deepEqual(a.missingDimensions, ["role"]);
  }
});

test("each line names the binding position, the duty-holder classes and the trigger that put the customer in scope", () => {
  const r = gate("ppwr", ["forwarder"]);
  assert.equal(r.binding.lines.length, 1);
  const line = r.binding.lines[0];
  assert.equal(line.position, "direct_duty");
  assert.equal(line.label, "Your duty");
  assert.deepEqual(line.dutyHolders.map((d) => d.id), ["packaging_user", "importer_of_record"]);
  assert.deepEqual(line.dutyHolders.map((d) => d.label), ["User of transport packaging", "Importer of record"]);
  assert.deepEqual(line.triggers, [{ attribute: "org_role", value: "forwarder", label: "Your organisation role is Freight forwarder" }]);
  assert.equal(line.applicability.status, "applies");
});

test("one line per DISTINCT binding_position, in vocabulary order, with the objects grouped", () => {
  const mk = (id, position, extra = {}) => ({
    obligation_id: id, binding_position: position, duty_holder_class: ["carrier"],
    applicability_trigger: { attribute: "org_role", value: "carrier" }, ...extra,
  });
  const objs = [mk("cl:obligation:0000000000000001", "monitoring_only"), mk("cl:obligation:0000000000000002", "direct_duty"),
    mk("cl:obligation:0000000000000003", "direct_duty", { duty_holder_class: ["forwarder"], applicability_trigger: { attribute: "org_role", value: "forwarder" } })];
  const b = summariseObligationBinding(objs, profileOf(["forwarder"]));
  assert.deepEqual(b.lines.map((l) => l.position), ["direct_duty", "monitoring_only"]);
  assert.equal(b.lines[0].objectCount, 2);
  assert.deepEqual(b.lines[0].dutyHolders.map((d) => d.id).sort(), ["carrier", "forwarder"]);
  // any applying object makes the line (and the item) apply
  assert.equal(b.lines[0].applicability.status, "applies");
  assert.equal(b.lines[1].applicability.status, "does_not_apply");
  assert.equal(b.applicability.status, "applies");
});

test("a size trigger is read as a sizeThreshold: needs the band when the profile has none, fails below it", () => {
  const obj = { obligation_id: "cl:obligation:0000000000000009", binding_position: "direct_duty", duty_holder_class: ["forwarder"],
    applicability_trigger: { attribute: "headcount", value: "large", comparison: "at_least" } };
  const none = summariseObligationBinding([obj], profileOf(["forwarder"], {}));
  assert.equal(none.applicability.status, "needs_profile_input");
  assert.deepEqual(none.applicability.missingDimensions, ["headcount"]);
  const small = summariseObligationBinding([obj], profileOf(["forwarder"], { headcount_band: "small" }));
  assert.equal(small.applicability.status, "does_not_apply");
  const large = summariseObligationBinding([obj], profileOf(["forwarder"], { headcount_band: "large" }));
  assert.equal(large.applicability.status, "applies");
  assert.match(large.lines[0].triggers[0].label, /Headcount/);
});

test("a trigger the profile cannot answer names the attribute it needs, never a silent apply", () => {
  const obj = { obligation_id: "cl:obligation:000000000000000a", binding_position: "direct_duty", duty_holder_class: ["forwarder"],
    applicability_trigger: { attribute: "acts_as_indirect_customs_representative", value: "yes" } };
  const b = summariseObligationBinding([obj], profileOf(["forwarder"]));
  assert.equal(b.applicability.status, "needs_profile_input");
  assert.deepEqual(b.applicability.missingDimensions, ["acts_as_indirect_customs_representative"]);
  // a role mismatch still wins as does_not_apply
  assert.equal(summariseObligationBinding([obj], profileOf(["carrier"])).applicability.status, "does_not_apply");
});

test("no profile at all (viewer without an organisation): needs_profile_input, banner data still produced", () => {
  const b = summariseObligationBinding([BY_KEY["ppwr"]], { orgRoles: [], orgSize: {} });
  assert.equal(b.decomposed, true);
  assert.equal(b.applicability.status, "needs_profile_input");
  assert.equal(b.lines[0].dutyHolders.length, 2);
});

test("cost slots are carried separately, labelled by name, and effort is never rendered as money", () => {
  const obj = { obligation_id: "cl:obligation:000000000000000b", binding_position: "direct_duty", duty_holder_class: ["forwarder"],
    applicability_trigger: { attribute: "org_role", value: "forwarder" },
    statutory_maximum: "FIXTURE maximum", cost_formula: "FIXTURE formula",
    direct_compliance_cost: { amount: 120, currency: "EUR", basis: "per registration", source: "FIXTURE source" },
    effort: { person_days: 3, recurrence: "annual" } };
  const b = summariseObligationBinding([obj], profileOf(["forwarder"]));
  const slots = Object.fromEntries(b.lines[0].costSlots.map((s) => [s.slot, s]));
  assert.deepEqual(Object.keys(slots), ["penalty_exposure", "direct_compliance_cost", "effort"]);
  assert.equal(slots.penalty_exposure.label, "Penalty exposure");
  assert.equal(slots.direct_compliance_cost.label, "Direct compliance cost");
  assert.equal(slots.effort.label, "Effort (person-days, not money)");
  assert.deepEqual(slots.penalty_exposure.entries, ["FIXTURE maximum", "Formula: FIXTURE formula"]);
  assert.deepEqual(slots.direct_compliance_cost.entries, ["120 EUR, per registration (source: FIXTURE source)"]);
  assert.deepEqual(slots.effort.entries, ["3 person-days, annual"]);
  for (const e of slots.effort.entries) assert.doesNotMatch(e, /EUR|USD|\$|currency/i);
  // no merged total anywhere
  assert.equal(JSON.stringify(b).match(/total/i), null);
});

test("a slot with nothing to show is omitted, not rendered as a dash or a zero", () => {
  const b = summariseObligationBinding([BY_KEY["ppwr"]], profileOf(["forwarder"]));
  assert.deepEqual(b.lines[0].costSlots, []);
});

test("unknown duty-holder class is shown by its raw id and maps to no role (never fabricated)", () => {
  const obj = { obligation_id: "cl:obligation:000000000000000c", binding_position: "direct_duty", duty_holder_class: ["some_new_class"],
    applicability_trigger: { attribute: "org_role", value: "forwarder" } };
  const b = summariseObligationBinding([obj], profileOf(["forwarder"]));
  assert.deepEqual(b.lines[0].dutyHolders, [{ id: "some_new_class", label: "some_new_class" }]);
  assert.equal(b.applicability.status, "applies");
});

test("monitoring_only classes: a duty holder vocabulary entry that excludes every forwarder role is marked", () => {
  assert.equal(DUTY_HOLDER_CLASSES.member_state.orgRoles.includes("forwarder"), false);
  for (const id of ["forwarder", "nvocc", "customs_representative_direct", "customs_representative_indirect"]) {
    assert.ok(DUTY_HOLDER_CLASSES[id].orgRoles.includes("forwarder"), id);
  }
});

test("currentObligationObjects drops any version another row supersedes", () => {
  const rows = [
    { obligation_id: "cl:obligation:0000000000000001", version: 1, supersedes: null },
    { obligation_id: "cl:obligation:0000000000000002", version: 2, supersedes: "cl:obligation:0000000000000001" },
    { obligation_id: "cl:obligation:0000000000000003", version: 1, supersedes: null },
  ];
  assert.deepEqual(currentObligationObjects(rows).map((r) => r.obligation_id), ["cl:obligation:0000000000000002", "cl:obligation:0000000000000003"]);
  assert.deepEqual(currentObligationObjects(null), []);
});

// the loader, with an injected client (no database)
function fakeClient({ legacy = {}, objects = [], objectsError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, filters: [] };
      const chain = {
        select() { return chain; },
        eq(col, val) { q.filters.push([col, val]); return chain; },
        limit() { return chain; },
        order() { return chain; },
        maybeSingle() {
          calls.push(q);
          const v = legacy[q.filters.find(([c]) => c === "legacy_id")?.[1]];
          return Promise.resolve({ data: v ? { id: v } : null, error: null });
        },
        then(res, rej) {
          calls.push(q);
          return Promise.resolve({ data: objectsError ? null : objects, error: objectsError }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return client;
}

test("fetchObligationObjectsForItem: a uuid is used directly, a legacy id is resolved first, superseded versions are dropped", async () => {
  const uuid = "11111111-2222-4333-8444-555555555555";
  const rows = [
    { obligation_id: "cl:obligation:0000000000000001", version: 1, supersedes: null },
    { obligation_id: "cl:obligation:0000000000000002", version: 2, supersedes: "cl:obligation:0000000000000001" },
  ];
  const direct = fakeClient({ objects: rows });
  const out = await fetchObligationObjectsForItem(direct, uuid);
  assert.equal(out.length, 1);
  assert.equal(direct.calls.some((c) => c.table === "intelligence_items"), false);
  assert.deepEqual(direct.calls.find((c) => c.table === "obligation_objects").filters, [["instrument_item_id", uuid]]);

  const viaLegacy = fakeClient({ legacy: { g2: uuid }, objects: rows });
  await fetchObligationObjectsForItem(viaLegacy, "g2");
  assert.deepEqual(viaLegacy.calls.find((c) => c.table === "obligation_objects").filters, [["instrument_item_id", uuid]]);

  const unknown = fakeClient({ legacy: {}, objects: rows });
  assert.deepEqual(await fetchObligationObjectsForItem(unknown, "nope"), []);
});

test("fetchObligationObjectsForItem: a read error throws (the route marks the banner load as failed, never an empty claim)", async () => {
  const c = fakeClient({ objectsError: { message: "boom" } });
  await assert.rejects(() => fetchObligationObjectsForItem(c, "11111111-2222-4333-8444-555555555555"), /boom/);
});

test("DUTY_HOLDER_CLASSES: the spec 01 section 3.2 list is present, each class carries a definition line, a unique order, and orgRoles drawn from ORG_ROLES", () => {
  for (const id of ["carrier", "shipper", "forwarder", "nvocc", "customs_representative_direct", "customs_representative_indirect", "ism_company", "fuel_supplier", "aircraft_operator", "producer"]) {
    assert.ok(DUTY_HOLDER_CLASSES[id], id);
    assert.equal(DUTY_HOLDER_CLASSES[id].origin, "spec 01 section 3.2", id);
  }
  const roleIds = new Set(ORG_ROLES.map((r) => r.id));
  const orders = new Set();
  for (const [key, c] of Object.entries(DUTY_HOLDER_CLASSES)) {
    assert.equal(c.code, key);
    assert.ok(c.label && c.definition && c.definition.length > 20, key + " has a label and a definition line");
    assert.ok(!orders.has(c.order), key + " has a unique order");
    orders.add(c.order);
    for (const r of c.orgRoles) assert.ok(roleIds.has(r), key + ": " + r + " is an ORG_ROLES id");
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.orgRoles), key + " is frozen");
  }
});

test("DUTY_HOLDER_CLASSES: relevance.mjs reads the vocabulary module and holds no copy of the table", () => {
  const src = readFileSync(join(HERE, "relevance.mjs"), "utf8");
  assert.ok(src.includes('import { BINDING_POSITION, DUTY_HOLDER_CLASSES } from "../contracts/vocabularies.mjs";'));
  assert.ok(!src.includes("export const DUTY_HOLDER_CLASSES"));
  assert.ok(!src.includes("customs_representative_indirect:"));
});
