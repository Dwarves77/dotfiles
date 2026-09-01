// tag-presence-check.test.mjs — proves checkTagPresence() is pure, never throws on malformed input, and
// correctly reports empty/present signature-tag fields — including against the REAL example-payload.json
// (a live mint-kit fixture), which trips the all-empty warning today, proving the gap this module exists
// to surface is real, not hypothetical.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { checkTagPresence, SIGNATURE_TAG_FIELDS } from "./tag-presence-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_PAYLOAD_PATH = resolve(HERE, "..", "example-payload.json");

test("SIGNATURE_TAG_FIELDS is exactly the three fields discover.mjs scores from", () => {
  assert.deepEqual([...SIGNATURE_TAG_FIELDS], ["operational_scenario_tags", "compliance_object_tags", "topic_tags"]);
});

test("checkTagPresence: all three fields empty -> allEmpty=true, one warning per field plus a summary warning", () => {
  const r = checkTagPresence({ item: { operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] } });
  assert.equal(r.allEmpty, true);
  assert.deepEqual(r.emptyFields.sort(), [...SIGNATURE_TAG_FIELDS].sort());
  assert.deepEqual(r.presentFields, []);
  assert.equal(r.warnings.length, 4); // 3 per-field + 1 summary
  assert.ok(r.warnings.some((w) => w.field === "*" && /ALL THREE/.test(w.reason)));
});

test("checkTagPresence: absent item / absent fields degrade to all-empty, never throws", () => {
  assert.equal(checkTagPresence({}).allEmpty, true);
  assert.equal(checkTagPresence({ item: {} }).allEmpty, true);
  assert.equal(checkTagPresence(null).allEmpty, true);
  assert.equal(checkTagPresence(undefined).allEmpty, true);
  assert.equal(checkTagPresence({ item: null }).allEmpty, true);
});

test("checkTagPresence: at least one field present -> allEmpty=false, no summary warning, only the still-empty fields warn", () => {
  const r = checkTagPresence({
    item: { operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [] },
  });
  assert.equal(r.allEmpty, false);
  assert.deepEqual(r.presentFields, ["operational_scenario_tags"]);
  assert.deepEqual(r.emptyFields.sort(), ["compliance_object_tags", "topic_tags"]);
  assert.equal(r.warnings.length, 2); // per-field only, no "*" summary warning when not allEmpty
  assert.ok(!r.warnings.some((w) => w.field === "*"));
});

test("checkTagPresence: all three fields present and non-empty -> zero warnings", () => {
  const r = checkTagPresence({
    item: {
      operational_scenario_tags: ["ocean-bunkering"],
      compliance_object_tags: ["shipper"],
      topic_tags: ["emissions"],
    },
  });
  assert.equal(r.allEmpty, false);
  assert.deepEqual(r.emptyFields, []);
  assert.deepEqual(r.presentFields.sort(), [...SIGNATURE_TAG_FIELDS].sort());
  assert.deepEqual(r.warnings, []);
});

test("checkTagPresence: a non-array value (string/object) at a tag field counts as empty, not a crash", () => {
  const r = checkTagPresence({ item: { operational_scenario_tags: "ocean-bunkering", compliance_object_tags: {}, topic_tags: [] } });
  assert.deepEqual(r.emptyFields.sort(), [...SIGNATURE_TAG_FIELDS].sort());
});

test("checkTagPresence is pure: identical input produces byte-identical output", () => {
  const payload = Object.freeze({ item: Object.freeze({ operational_scenario_tags: [], compliance_object_tags: ["shipper"], topic_tags: [] }) });
  assert.deepEqual(checkTagPresence(payload), checkTagPresence(payload));
});

// ── REAL FIXTURE: the mint kit's own example-payload.json ──────────────────────────────────────────

test("REAL FIXTURE: scripts/mint/example-payload.json carries no signature tags today -- proves the gap is real", () => {
  const payload = JSON.parse(readFileSync(EXAMPLE_PAYLOAD_PATH, "utf8"));
  const r = checkTagPresence(payload);
  assert.equal(r.allEmpty, true, "example-payload.json's item object declares none of operational_scenario_tags/compliance_object_tags/topic_tags");
  assert.ok(r.warnings.some((w) => w.field === "*"), "checkTagPresence must surface the all-empty summary warning for this real payload");
});
