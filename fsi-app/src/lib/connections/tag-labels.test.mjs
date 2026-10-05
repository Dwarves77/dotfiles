// Tests for tag-labels.mjs (lane S3-B). Pure, runs in the no-npm suite through test discovery.
//
// The module is the ONE human-label source for operational scenario tags and compliance object tags:
// the customer surfaces show "ocean carrier", never the raw slug "carrier-ocean". The vocabulary
// drift tests read the closed compliance list and the scenario glossary straight from the files that
// own them (parse-output.ts and system-prompt.ts, as TEXT, the same posture derive-tags.mjs takes), so
// a value added there without a label here fails this suite instead of reaching a customer as a slug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { labelForTag, labelForScenario, labelForComplianceObject, joinLabels, COMPLIANCE_OBJECT_LABELS, SCENARIO_LABELS } from "./tag-labels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, rel), "utf8");

function closedComplianceValues() {
  const src = read("../agent/parse-output.ts");
  const block = /const COMPLIANCE_OBJECT_VALUES = \[([\s\S]*?)\] as const;/.exec(src)?.[1] ?? "";
  return [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function scenarioGlossary() {
  const src = read("../agent/system-prompt.ts");
  const start = src.indexOf("Core glossary (~32 values");
  const end = src.indexOf("Empty array allowed when the item has no clear operational scenario");
  assert.ok(start > 0 && end > start, "the scenario glossary block must still be findable in system-prompt.ts");
  const block = src.slice(start, end);
  const out = [];
  for (const line of block.split("\n")) {
    const m = /^[A-Za-z/-]+:\s*(.+)$/.exec(line.trim());
    if (m) out.push(...m[1].split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
  }
  return out;
}

test("every closed compliance object value has an explicit label, and no label is a raw slug", () => {
  const values = closedComplianceValues();
  assert.ok(values.length >= 19, `expected the 19 closed values, read ${values.length}`);
  for (const v of values) {
    assert.ok(COMPLIANCE_OBJECT_LABELS[v], `no explicit label for compliance object "${v}"`);
    assert.equal(labelForComplianceObject(v), COMPLIANCE_OBJECT_LABELS[v]);
    assert.ok(!labelForComplianceObject(v).includes("-"), `label for "${v}" still reads as a slug`);
  }
});

test("every core scenario glossary value has an explicit label, and no label is a raw slug", () => {
  const values = scenarioGlossary();
  assert.ok(values.length >= 30, `expected about 32 glossary values, read ${values.length}`);
  for (const v of values) {
    assert.ok(SCENARIO_LABELS[v], `no explicit label for scenario "${v}"`);
    assert.equal(labelForScenario(v), SCENARIO_LABELS[v]);
    assert.ok(!/[a-z]-[a-z]/i.test(labelForScenario(v)), `label for "${v}" still reads as a slug: ${labelForScenario(v)}`);
  }
});

test("labelling is case-insensitive on the slug (intersection entries are stored lower-cased)", () => {
  assert.equal(labelForScenario("SAF-blending"), labelForScenario("saf-blending"));
  assert.equal(labelForComplianceObject("Carrier-Ocean"), labelForComplianceObject("carrier-ocean"));
});

test("an open-vocabulary scenario not in the glossary is humanised, never shown as a slug", () => {
  assert.equal(labelForScenario("reefer-container-monitoring"), "reefer container monitoring");
  // known acronyms keep their capitals in the fallback
  assert.equal(labelForScenario("ets-free-allocation"), "ETS free allocation");
  assert.equal(labelForScenario("lng-bunkering-rules"), "LNG bunkering rules");
});

test("labelForTag picks the scenario or compliance map by kind and tolerates empty input", () => {
  assert.equal(labelForTag("scenario", "drayage"), labelForScenario("drayage"));
  assert.equal(labelForTag("object", "shipper"), labelForComplianceObject("shipper"));
  assert.equal(labelForTag("scenario", ""), "");
  assert.equal(labelForTag("object", null), "");
  assert.equal(labelForTag("scenario", 42), "");
});

test("joinLabels reads as plain English: one, two and many", () => {
  assert.equal(joinLabels([]), "");
  assert.equal(joinLabels(["a"]), "a");
  assert.equal(joinLabels(["a", "b"]), "a and b");
  assert.equal(joinLabels(["a", "b", "c"]), "a, b and c");
});
