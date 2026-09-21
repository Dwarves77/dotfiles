// harness.npmtest.mjs - attack proof for `isDeclaredKindWord` (lane w10-factcard Amendment 2,
// 2026-09-20). NOT portable to the no-npm-ci job: harness.mjs imports esbuild (npm), so this file
// carries the `.npmtest.mjs` suffix per run-test-suite.sh's discovery rule and runs in the
// discipline workflow's "App unit tests requiring npm deps" step (git ls-files
// 'fsi-app/**/*.npmtest.mjs'), same posture as layout-guard.npmtest.mjs.
//
// THE FAILURE THIS PROVES FIXED: the rendering guard's placeholder-literal scanner quarantined
// FactCard's kind band the moment its kind word was the literal "DEADLINE" - one of the operator's
// nine fixed FACT_CARD_KINDS values (parts-brief-2026-09-18.md section 2.1), not an unfilled slot.
// `isDeclaredKindWord` (harness.mjs) is the narrow exemption: text is exempt ONLY when it is the
// exact text of an element carrying `data-part-slot="kind-word"` INSIDE an element carrying
// `data-part="fact-card"`, AND that text is one of the nine fixed kinds.
//
// CLAUDE.md rule 15: "a guard is proven by attack, not by presence." Every case below is an attack a
// looser exemption would let through; `isDeclaredKindWord` must return false for every one of them
// except the single legitimate case.

import test from "node:test";
import assert from "node:assert/strict";
import { isDeclaredKindWord, isDeclaredColumnLabel } from "./harness.mjs";
import { FACT_CARD_KINDS } from "../../../src/lib/detail/fact-card-model.ts";
import { HEADER_LITERALS } from "../../../src/lib/agent/source-entry-filter.mjs";

/** Minimal fake DOM node: enough of `Element` for `isDeclaredKindWord`'s `.closest()` calls
 *  (attribute-equality selectors only, the only shape this predicate ever asks for). */
class FakeEl {
  constructor({ attrs = {}, textContent = "", parent = null } = {}) {
    this.attrs = attrs;
    this.textContent = textContent;
    this.parent = parent;
  }
  matches(selector) {
    const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
    if (!m) throw new Error(`unsupported selector in test fake: ${selector}`);
    const [, key, value] = m;
    return this.attrs[key] === value;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }
}

test("bare word in a plain element (no data-part-slot at all) still FAILS", () => {
  const bare = new FakeEl({ textContent: "DEADLINE" });
  assert.equal(isDeclaredKindWord(bare, FACT_CARD_KINDS), false);
});

test("the kind word in a marked kind band, inside a real fact card, PASSES", () => {
  const card = new FakeEl({ attrs: { "data-part": "fact-card" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "kind-word" }, textContent: "DEADLINE", parent: card });
  assert.equal(isDeclaredKindWord(slot, FACT_CARD_KINDS), true);
  // Every one of the nine fixed kinds passes the same way, not just DEADLINE.
  for (const kind of FACT_CARD_KINDS) {
    const s = new FakeEl({ attrs: { "data-part-slot": "kind-word" }, textContent: kind, parent: card });
    assert.equal(isDeclaredKindWord(s, FACT_CARD_KINDS), true, `expected "${kind}" to be exempt`);
  }
});

test("a marked kind band containing a word NOT in the vocabulary (e.g. TBD) still FAILS", () => {
  const card = new FakeEl({ attrs: { "data-part": "fact-card" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "kind-word" }, textContent: "TBD", parent: card });
  assert.equal(isDeclaredKindWord(slot, FACT_CARD_KINDS), false);
});

test("the kind-band marker outside a fact card still FAILS", () => {
  // A data-part-slot="kind-word" element with NO data-part="fact-card" ancestor anywhere above it.
  const outsideParent = new FakeEl({ attrs: { "data-part": "something-else" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "kind-word" }, textContent: "DEADLINE", parent: outsideParent });
  assert.equal(isDeclaredKindWord(slot, FACT_CARD_KINDS), false);
});

test("a descendant of the kind-word slot (not the slot element itself) still resolves via closest", () => {
  // Mirrors how the real scan runs .closest() from whatever leaf `<p>`/`<span>` cell it visits -
  // isDeclaredKindWord is called with the CELL, which may be the slot itself or nested inside it.
  const card = new FakeEl({ attrs: { "data-part": "fact-card" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "kind-word" }, textContent: "PENALTY", parent: card });
  const inner = new FakeEl({ textContent: "PENALTY", parent: slot });
  assert.equal(isDeclaredKindWord(inner, FACT_CARD_KINDS), true);
});

// isDeclaredColumnLabel - attack proof (lane w10-commandbar Amendment 2, 2026-09-21). THE FAILURE
// THIS PROVES FIXED: the placeholder-literal scanner quarantined ListRowColumnHeader's own real
// column-header labels ("Title", "Tier") the moment they exact-matched HEADER_LITERALS (the F-1
// scanner's table-header vocabulary), which is the SAME false-positive class isDeclaredKindWord
// above closes for FactCard's kind band - a genuine column-header word drawn by the ONE shared part
// is indistinguishable, to the detector, from a leaked table-header literal, unless the part marks
// its own labels and the detector reads that mark. CLAUDE.md rule 15: "a guard is proven by attack,
// not by presence" - every case below is an attack a looser exemption would let through;
// `isDeclaredColumnLabel` must return false for every one of them except the single legitimate case.

test("a HEADER_LITERALS word in a plain element (no data-part-slot at all) still FAILS", () => {
  const bare = new FakeEl({ textContent: "Tier" });
  assert.equal(isDeclaredColumnLabel(bare, HEADER_LITERALS), false);
});

test("the column-label word in a marked slot, inside a real list-row header, PASSES", () => {
  const header = new FakeEl({ attrs: { "data-part": "list-row-header" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "column-label" }, textContent: "Tier", parent: header });
  assert.equal(isDeclaredColumnLabel(slot, HEADER_LITERALS), true);
  // "Title" (ListRowColumnHeader's other real HEADER_LITERALS collision) passes the same way.
  const titleSlot = new FakeEl({ attrs: { "data-part-slot": "column-label" }, textContent: "Title", parent: header });
  assert.equal(isDeclaredColumnLabel(titleSlot, HEADER_LITERALS), true);
});

test("a marked column-label slot whose text is NOT a HEADER_LITERALS word still FAILS", () => {
  // "Juris." (the abbreviated jurisdiction label) is not in HEADER_LITERALS - it is a real column
  // label, but this predicate's job is narrower: exempt only an exact HEADER_LITERALS collision, so
  // a marked slot carrying a non-colliding word still reads as whatever a plain scan would read it
  // as (never flagged as a placeholder in the first place, since it was never in HEADER_LITERALS).
  const header = new FakeEl({ attrs: { "data-part": "list-row-header" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "column-label" }, textContent: "TBD", parent: header });
  assert.equal(isDeclaredColumnLabel(slot, HEADER_LITERALS), false);
});

test("the column-label marker outside a list-row header still FAILS", () => {
  const outsideParent = new FakeEl({ attrs: { "data-part": "something-else" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "column-label" }, textContent: "Tier", parent: outsideParent });
  assert.equal(isDeclaredColumnLabel(slot, HEADER_LITERALS), false);
});

test("a plain <p> carrying the word (not inside the slot at all) still FAILS", () => {
  const header = new FakeEl({ attrs: { "data-part": "list-row-header" } });
  const plain = new FakeEl({ attrs: {}, textContent: "Tier", parent: header });
  assert.equal(isDeclaredColumnLabel(plain, HEADER_LITERALS), false);
});

test("a longer leaked string merely CONTAINING a HEADER_LITERALS word inside the slot still FAILS", () => {
  const header = new FakeEl({ attrs: { "data-part": "list-row-header" } });
  const slot = new FakeEl({
    attrs: { "data-part-slot": "column-label" },
    textContent: "Tier | Juris. | Timeline",
    parent: header,
  });
  assert.equal(isDeclaredColumnLabel(slot, HEADER_LITERALS), false);
});

test("a descendant of the column-label slot (not the slot element itself) still resolves via closest", () => {
  const header = new FakeEl({ attrs: { "data-part": "list-row-header" } });
  const slot = new FakeEl({ attrs: { "data-part-slot": "column-label" }, textContent: "Tier", parent: header });
  const inner = new FakeEl({ textContent: "Tier", parent: slot });
  assert.equal(isDeclaredColumnLabel(inner, HEADER_LITERALS), true);
});
