// Fixture-based proof for materials-ppwr-join.ts. No network, no DB credential (lane common contract, R14).
// The PPWR percentages asserted here are the ones read from the text of Regulation (EU) 2025/40
// Article 7(1) (2030) and 7(2) (2040), recorded in docs/ops/session-log.d/2026-10-03-l14.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PPWR_RECYCLED_CONTENT, PPWR_PLASTIC_MATERIAL_KEYS, joinMaterialsToPpwr } from "./materials-ppwr-join.ts";

const fact = (regionKey, materialKey, value, extra = {}) => ({
  regionKey,
  dimension: "materials_sourcing",
  materialKey,
  factLabel: "fixture availability",
  value,
  ...extra,
});

test("thresholds equal Regulation (EU) 2025/40 Art. 7(1)(a)-(d) and 7(2)(a)-(d)", () => {
  const t = PPWR_RECYCLED_CONTENT;
  assert.deepEqual([t.contact_sensitive_pet.pct2030, t.contact_sensitive_pet.pct2040], [30, 50]);
  assert.deepEqual([t.contact_sensitive_non_pet.pct2030, t.contact_sensitive_non_pet.pct2040], [10, 25]);
  assert.deepEqual([t.single_use_beverage_bottle.pct2030, t.single_use_beverage_bottle.pct2040], [30, 65]);
  assert.deepEqual([t.other_plastic.pct2030, t.other_plastic.pct2040], [35, 65]);
  assert.equal(t.contact_sensitive_pet.citation2030, "Art. 7(1)(a)");
  assert.equal(t.other_plastic.citation2040, "Art. 7(2)(d)");
});

test("region with both a supplied-key fact and a threshold yields one joined read", () => {
  const rows = joinMaterialsToPpwr([fact("eu", "contact_sensitive_pet", "thin", { sourceKey: "fixture-src" })]);
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.equal(r.status, "joined");
  assert.equal(r.availability.text, "thin");
  assert.equal(
    r.sentence,
    "recycled contact-sensitive PET packaging (not single-use beverage bottles) available: thin; " +
      "PPWR 2030 threshold: 30% (Regulation (EU) 2025/40 Art. 7(1)(a)); 2040: 50% (Regulation (EU) 2025/40 Art. 7(2)(a))."
  );
  assert.match(r.caveat, /Art\. 7\(4\), 7\(5\).*Art\. 7\(12\), 7\(13\)/);
});

test("a cell with only the threshold side is an explicit gap, never a fabricated availability", () => {
  const rows = joinMaterialsToPpwr([], { regionKeys: ["us"], materials: PPWR_PLASTIC_MATERIAL_KEYS });
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(r.status, "threshold_only");
    assert.equal(r.availability, null);
    assert.match(r.sentence, /no availability fact for this region \(gap\)/);
  }
  assert.deepEqual(rows.map((r) => r.materialKey), [...PPWR_PLASTIC_MATERIAL_KEYS]);
});

test("non_plastic has no PPWR threshold and says so, never a number; with no fact it yields no row", () => {
  const rows = joinMaterialsToPpwr([fact("eu", "non_plastic", "abundant")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "no_ppwr_threshold");
  assert.equal(rows[0].threshold, null);
  assert.doesNotMatch(rows[0].sentence, /\d+%/);
  assert.deepEqual(joinMaterialsToPpwr([], { regionKeys: ["eu"], materials: ["non_plastic"] }), []);
});

test("facts without a caller-supplied materialKey, outside materials_sourcing, or valueless are ignored", () => {
  const rows = joinMaterialsToPpwr([
    fact("eu", undefined, "thin"),
    { ...fact("eu", "other_plastic", "x"), dimension: "labor_markets" },
    fact("eu", "other_plastic", "  "),
  ]);
  assert.deepEqual(rows, []);
});

test("numeric availability falls back to value plus unit; newest fact wins", () => {
  const rows = joinMaterialsToPpwr([
    fact("eu", "contact_sensitive_non_pet", "", { valueNumeric: 120, unit: "kt/year" }),
    fact("eu", "contact_sensitive_non_pet", "stale"),
  ]);
  assert.equal(rows[0].availability.text, "120 kt/year");
});

test("the module contains no label parsing", () => {
  const src = readFileSync(new URL("./materials-ppwr-join.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /classifyMaterial|\.toLowerCase\(\)|\.test\(s\)/);
});
