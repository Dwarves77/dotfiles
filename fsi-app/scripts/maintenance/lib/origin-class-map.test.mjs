// Pins originClassFor against every cell of docs/plans/wo19-origin-class-backfill-mapping.md §2's
// rule table (transcribed exhaustively — this is the one piece of logic origin-class-backfill.mjs
// depends on, so it is pinned cell-by-cell, not sampled).
import { test } from "node:test";
import assert from "node:assert/strict";
import { originClassFor, ORIGIN_CLASS_OUTPUTS } from "./origin-class-map.mjs";

test("regulation/directive/standard: T1/T2 -> official, T3-T7 -> null", () => {
  for (const t of ["regulation", "directive", "standard"]) {
    assert.equal(originClassFor(t, 1), "official");
    assert.equal(originClassFor(t, 2), "official");
    for (const tier of [3, 4, 5, 6, 7]) assert.equal(originClassFor(t, tier), null, `${t} T${tier}`);
  }
});

test("guidance/framework: T1-T3 -> official, T5 -> partner, T4/T6/T7 -> null", () => {
  for (const t of ["guidance", "framework"]) {
    assert.equal(originClassFor(t, 1), "official");
    assert.equal(originClassFor(t, 2), "official");
    assert.equal(originClassFor(t, 3), "official");
    assert.equal(originClassFor(t, 5), "partner");
    for (const tier of [4, 6, 7]) assert.equal(originClassFor(t, tier), null, `${t} T${tier}`);
  }
});

test("research_finding: T1-T4 -> verified, T5 -> community-corroborated, T6/T7 -> null", () => {
  for (const tier of [1, 2, 3, 4]) assert.equal(originClassFor("research_finding", tier), "verified");
  assert.equal(originClassFor("research_finding", 5), "community-corroborated");
  for (const tier of [6, 7]) assert.equal(originClassFor("research_finding", tier), null);
});

test("market_signal: T1-T6 -> community-corroborated unconditionally, T7 -> null", () => {
  for (const tier of [1, 2, 3, 4, 5, 6]) assert.equal(originClassFor("market_signal", tier), "community-corroborated");
  assert.equal(originClassFor("market_signal", 7), null);
});

test("regional_data: T1-T3 -> official, T4/T5 -> derived, T6/T7 -> null", () => {
  for (const tier of [1, 2, 3]) assert.equal(originClassFor("regional_data", tier), "official");
  for (const tier of [4, 5]) assert.equal(originClassFor("regional_data", tier), "derived");
  for (const tier of [6, 7]) assert.equal(originClassFor("regional_data", tier), null);
});

test("technology/innovation: T1-T3 -> verified, T4/T5 -> community-corroborated, T6/T7 -> null", () => {
  for (const t of ["technology", "innovation"]) {
    for (const tier of [1, 2, 3]) assert.equal(originClassFor(t, tier), "verified");
    for (const tier of [4, 5]) assert.equal(originClassFor(t, tier), "community-corroborated");
    for (const tier of [6, 7]) assert.equal(originClassFor(t, tier), null);
  }
});

test("initiative: T1-T3 -> official, T4/T5 -> partner, T6/T7 -> null", () => {
  for (const tier of [1, 2, 3]) assert.equal(originClassFor("initiative", tier), "official");
  for (const tier of [4, 5]) assert.equal(originClassFor("initiative", tier), "partner");
  for (const tier of [6, 7]) assert.equal(originClassFor("initiative", tier), null);
});

test("tool: not ruled on -> always null, every tier", () => {
  for (let tier = 1; tier <= 7; tier++) assert.equal(originClassFor("tool", tier), null);
});

test("an unrecognized item_type stays null rather than guessed", () => {
  assert.equal(originClassFor("not_a_real_item_type", 1), null);
});

test("tier null/undefined always -> null, regardless of item_type (caller's source_id-null case)", () => {
  assert.equal(originClassFor("regulation", null), null);
  assert.equal(originClassFor("regulation", undefined), null);
});

test("every non-null output is one of the live 7-value vocabulary (never widened)", () => {
  const itemTypes = ["regulation", "directive", "standard", "guidance", "framework", "research_finding", "market_signal", "regional_data", "technology", "innovation", "initiative", "tool"];
  for (const t of itemTypes) {
    for (let tier = 1; tier <= 7; tier++) {
      const v = originClassFor(t, tier);
      if (v !== null) assert.ok(ORIGIN_CLASS_OUTPUTS.includes(v), `${t} T${tier} -> unexpected value ${v}`);
    }
  }
});
