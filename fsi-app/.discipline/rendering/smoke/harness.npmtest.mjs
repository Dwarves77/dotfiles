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
import { isDeclaredKindWord } from "./harness.mjs";
import { FACT_CARD_KINDS } from "../../../src/lib/detail/fact-card-model.ts";

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
