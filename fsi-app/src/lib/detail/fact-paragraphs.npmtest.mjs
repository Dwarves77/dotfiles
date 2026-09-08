// The invariant: a FACT card prints the claim, once, with one pair of quotes.
//
// The production defect this would have caught (click-through audit 2026-09-08): every FACT card on
// the regulation, research and operations detail pages rendered as `"FACT: "…""` — the literal word
// FACT inside a card already titled FACT, with a doubled closing quote. The fixtures below are
// verbatim shapes read out of the live `intelligence_item_sections.content_md` that day.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { classifyParagraph, parseFactParagraphs, stripFactLabel } = jiti("./fact-paragraphs.ts");

const SOURCE = "*Source: A Rule, An Agency, 2026. https://example.gov/rule.*";

test("the bare FACT: label and its quotes come off", () => {
  const live =
    'FACT: "ACT requires that 40-75% of new, on-road medium- and heavy-duty vehicles delivered for ' +
    'sale in the state be zero-emission vehicles by 2035."\n' +
    SOURCE;
  const out = classifyParagraph(live);
  assert.equal(out.kind, "fact");
  assert.ok(!out.text.includes("FACT:"), "the label is not printed inside a card titled FACT");
  assert.ok(!out.text.startsWith('"'), "no quote survives for FactCard to double");
  assert.ok(!out.text.endsWith('"'));
  assert.ok(out.text.startsWith("ACT requires that 40-75%"));
  assert.ok(out.text.endsWith("zero-emission vehicles by 2035."));
});

test("the emphasis-wrapped **FACT:** label comes off too", () => {
  const live = '**FACT:** "The ninth STI Forum was convened by the UN Department."\n' + SOURCE;
  const out = classifyParagraph(live);
  assert.equal(out.text, "The ninth STI Forum was convened by the UN Department.");
});

test("a lead-in phrase before the label comes off with it", () => {
  const live =
    '**Effective date and jurisdictional scope — FACT:** "This final rule is effective on July 6, ' +
    '2026." The rule applies to PCWP manufacturing facilities. ' + SOURCE;
  const out = classifyParagraph(live);
  assert.ok(!out.text.includes("FACT:"));
  assert.ok(out.text.startsWith('"This final rule is effective'), "an interior quote is left alone");
});

test("curly quotes are unwrapped as well as straight ones", () => {
  assert.equal(stripFactLabel("FACT: “A quoted claim.”"), "A quoted claim.");
});

test("a quote that is only part of the paragraph is never unwrapped", () => {
  const text = 'The rule uses the term "vessel" throughout, and defines it narrowly.';
  assert.equal(stripFactLabel(text), text);
});

test("a paragraph with no FACT label is returned untouched", () => {
  const text = "Member States must report annually under Article 12.";
  assert.equal(stripFactLabel(text), text);
  assert.equal(classifyParagraph(text + "\n" + SOURCE).text, text);
});

test("ANALYSIS and LEGAL paragraphs are unaffected by the FACT stripper", () => {
  const analysis = classifyParagraph("*Analytical inference:* The cost pass-through is likely partial.");
  assert.equal(analysis.kind, "inference");
  assert.equal(analysis.text, "The cost pass-through is likely partial.");

  const legal = classifyParagraph("*Legal Confirmation Required:* Whether Article 4 binds sub-charterers.");
  assert.equal(legal.kind, "counsel");
  assert.equal(legal.text, "Whether Article 4 binds sub-charterers.");
});

test("a whole section parses with every FACT paragraph cleaned", () => {
  const md = [
    'FACT: "Claim one."\n' + SOURCE,
    '**FACT:** "Claim two."\n' + SOURCE,
    "*Analytical inference:* An inference.",
  ].join("\n\n");
  const blocks = parseFactParagraphs(md);
  const facts = blocks.filter((b) => b.kind === "fact");
  assert.equal(facts.length, 2);
  for (const f of facts) {
    assert.ok(!/FACT:/i.test(f.text), f.text);
    assert.ok(!f.text.startsWith('"'), f.text);
  }
  assert.equal(facts[0].text, "Claim one.");
  assert.equal(facts[1].text, "Claim two.");
});
