// fact-card-panel21c-fixture.npmtest.mjs, lane w10-factcard-d (2026-09-21), build item 5:
// "the fixture ... two groups, five cards, two strips, the same content as the artboard."
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { PANEL_21C_GROUPS } = jiti("./fact-card-panel21c-fixture.ts");
const { KIND_FIXTURES } = jiti("./fact-card-fixtures.ts");

test("PANEL_21C_GROUPS is 2 groups, 5 cards total, each group carries a band and an actionStrip, reusing the same KIND_FIXTURES content (not re-invented)", () => {
  assert.equal(PANEL_21C_GROUPS.length, 2);
  const totalCards = PANEL_21C_GROUPS.reduce((n, g) => n + g.cards.length, 0);
  assert.equal(totalCards, 5);
  for (const g of PANEL_21C_GROUPS) {
    assert.ok(g.band && g.band.label, "every group carries a band");
    assert.ok(g.actionStrip && g.actionStrip.text, "every group carries an actionStrip");
    for (const c of g.cards) {
      // Deep-equal rather than reference-identical: the panel21c fixture module resolves
      // "@/lib/detail/fact-card-fixtures" via the alias path, this test resolves the same file
      // via a relative jiti() call, so they load as two distinct (but content-identical) module
      // instances - the guarantee this test proves is "no re-invented content", not object
      // identity across two independent module loads.
      assert.ok(
        KIND_FIXTURES.some((k) => JSON.stringify(k) === JSON.stringify(c)),
        "every card is one of the already hand-authored KIND_FIXTURES, not a new duplicate"
      );
    }
  }
});

test("no two cards in the same group share a kind (panel 21c never renders two cards of the same kind back to back)", () => {
  for (const g of PANEL_21C_GROUPS) {
    const kinds = g.cards.map((c) => c.model.kind);
    assert.equal(new Set(kinds).size, kinds.length, `group "${g.title}" has a duplicate kind`);
  }
});
