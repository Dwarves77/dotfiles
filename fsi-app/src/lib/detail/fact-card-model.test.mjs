// fact-card-model.test.mjs - proof for fact-card-model.ts (lane w10-factcard, 2026-09-20).
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveFactCardModels,
  parseFactCardModels,
  toClaimNodes,
  countNoLeadCards,
} from "./fact-card-model.ts";
import { classifyParagraph } from "./fact-paragraphs.ts";

function assertNoMarkdown(nodes) {
  for (const n of nodes) {
    assert.ok(!n.text.includes("*"), `no "*" survives: ${JSON.stringify(n)}`);
    assert.ok(!n.text.includes("#"), `no "#" survives: ${JSON.stringify(n)}`);
    assert.ok(!n.text.includes("`"), `no backtick survives: ${JSON.stringify(n)}`);
    assert.ok(!/\[.+\]\(.+\)/.test(n.text), `no [text](url) survives: ${JSON.stringify(n)}`);
    assert.ok(!/https?:\/\//.test(n.text), `no raw URL in running text: ${JSON.stringify(n)}`);
  }
}

test("a bolded ACTION REQUIRED lead-in becomes the kind word and is stripped from the claim", () => {
  const p = classifyParagraph(
    "FACT: \"**ACTION REQUIRED.** Confirm each Belgium-bound client's registration route before the next shipment.\" *Source: Decision 1999/652/EC, European Commission, 1999. https://eur-lex.europa.eu/dec1999652.*"
  );
  assert.equal(p.kind, "fact");
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 1);
  assert.equal(models[0].kind, "ACTION REQUIRED");
  assertNoMarkdown(models[0].claim);
  const joined = models[0].claim.map((n) => n.text).join(" ");
  assert.ok(!joined.startsWith("ACTION REQUIRED"), "lead-in word does not survive into the claim");
});

test("an unknown bolded lead-in maps to SCOPE, per the fixed-vocabulary rule", () => {
  const p = classifyParagraph(
    'FACT: "**SOMETHING ELSE.** Packaging placed on the market must be recyclable by 2030." *Source: PPWR, EUR-Lex, 2024. https://eur-lex.europa.eu/ppwr.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 1);
  assert.equal(models[0].kind, "SCOPE");
});

test("a fact with no bolded lead-in at all also maps to SCOPE", () => {
  const p = classifyParagraph(
    'FACT: "Packaging placed on the market must be recyclable by 2030." *Source: PPWR, EUR-Lex, 2024. https://eur-lex.europa.eu/ppwr.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 1);
  assert.equal(models[0].kind, "SCOPE");
});

test("a Legal Confirmation Required sentence embedded inside a fact body splits into its own card", () => {
  const p = classifyParagraph(
    "FACT: \"**BASELINE TARGET.** The EU baseline recovers 50-65% by 30 June 2001. Legal Confirmation Required: whether 'importer' includes a forwarder acting as importer of record.\" *Source: Directive 94/62/EC, EUR-Lex, 1994. https://eur-lex.europa.eu/dir9462.*"
  );
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 2);
  assert.equal(models[0].kind, "BASELINE TARGET");
  assert.equal(models[1].kind, "LEGAL CONFIRMATION REQUIRED");
  assert.match(models[1].claim.map((n) => n.text).join(" "), /whether .importer. includes/);
});

test("an Analytical inference sentence embedded inside a fact body splits into its own card, no figure lead", () => {
  const p = classifyParagraph(
    'FACT: "**NATIONAL TARGET.** Belgium confirmed 80%/50% for 1999. Analytical inference: a bare exceeds-target statement omits the trajectory." *Source: Cooperation Agreement, Belgium, 1999. https://example.gov/coop-agreement.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 2);
  assert.equal(models[1].kind, "ANALYTICAL INFERENCE");
  assert.equal(models[1].figureLead, null);
});

test("a trailing *Source: ...* citation leaves the claim and becomes provenance; the href never appears in running text", () => {
  const p = classifyParagraph(
    "Shipping companies surrendered their first allowances by 30 September 2025 for 2024 emissions. *Source: Directive (EU) 2023/959, EUR-Lex, 10 May 2023. https://eur-lex.europa.eu/eli/dir/2023/959.*"
  );
  const models = deriveFactCardModels(p);
  assert.equal(models.length, 1);
  assert.equal(models[0].provenance.org, "EUR-Lex");
  assert.equal(models[0].provenance.href, "https://eur-lex.europa.eu/eli/dir/2023/959");
  assertNoMarkdown(models[0].claim);
});

test("a bold figure in the claim becomes the figure lead without being removed from the claim", () => {
  const p = classifyParagraph(
    'FACT: "**BASELINE TARGET.** Between **50-65%** by weight of packaging waste recovered; within that, **25-45%** recycled." *Source: Directive 94/62/EC, EUR-Lex, 1994. https://eur-lex.europa.eu/dir9462.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models[0].figureLead, "50-65%");
  assert.ok(models[0].claim.some((n) => n.bold && n.text === "50-65%"));
});

test("ACTION REQUIRED with no figure and an imperative opening verb gets a <=3-word instruction lead", () => {
  const p = classifyParagraph(
    'FACT: "**ACTION REQUIRED.** Register with the Interregional Commission before the next shipment." *Source: Decision 1999/652/EC, European Commission, 1999. https://eur-lex.europa.eu/dec1999652.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models[0].figureLead, "Register");
});

test("ACTION REQUIRED with no figure and no recognised imperative verb gets no invented lead", () => {
  const p = classifyParagraph(
    'FACT: "**ACTION REQUIRED.** The compliance team should review this before quarter end." *Source: Decision 1999/652/EC, European Commission, 1999. https://eur-lex.europa.eu/dec1999652.*'
  );
  const models = deriveFactCardModels(p);
  assert.equal(models[0].figureLead, null);
});

test("ANALYTICAL INFERENCE never carries a figure lead even when the claim contains a bold figure", () => {
  const p = classifyParagraph(
    "*Analytical inference:* Recovery rose from **70%** to **80%** within one year, well above the EU's 2001 ceiling."
  );
  const models = deriveFactCardModels(p);
  assert.equal(models[0].kind, "ANALYTICAL INFERENCE");
  assert.equal(models[0].figureLead, null);
});

test("countNoLeadCards groups non-inference no-lead cards by kind with examples, and excludes inference", () => {
  const models = [
    { kind: "DEADLINE", claim: [{ text: "Reporting closes at year end." }], figureLead: null },
    { kind: "DEADLINE", claim: [{ text: "A second deadline with no bold figure." }], figureLead: null },
    { kind: "ANALYTICAL INFERENCE", claim: [{ text: "No lead by rule." }], figureLead: null },
    { kind: "SCOPE", claim: [{ text: "Has a lead." }], figureLead: "Register" },
  ];
  const counted = countNoLeadCards(models);
  const deadline = counted.find((c) => c.kind === "DEADLINE");
  assert.equal(deadline.count, 2);
  assert.equal(deadline.examples.length, 2);
  assert.ok(!counted.some((c) => c.kind === "ANALYTICAL INFERENCE"));
  assert.ok(!counted.some((c) => c.kind === "SCOPE"));
});

// ── Attack fixture: the two production-page patterns named in the coordinator dispatch
// (2026-09-20) - literal "**Cause:**" / "*Operational implication:*" bold-lead-in markers
// and a raw URL inside running prose, the exact shapes the live-DOM audit found. This
// proves the model strips every one of them regardless of entry path.
test("attack fixture: production patterns (**Cause:**, *Operational implication:*, raw URL in prose) never survive as literal markdown", () => {
  const md = [
    '**Cause:** ReFuelEU mandates a 2% SAF blend at EU airports from January 2025. *Source: ReFuelEU Aviation Regulation Article 4, European Commission, 2023. https://transport.ec.europa.eu/refueleu.*',
    "*Operational implication:* Tour equipment shipments departing EU airports carry this surcharge, escalating annually.",
    "See https://eur-lex.europa.eu/eli/reg/2023/2405 for the full instrument text and the phase-in schedule through 2030.",
  ].join("\n\n");

  const models = parseFactCardModels(md);
  assert.ok(models.length >= 2, "at least the Cause fact and the inference produce cards");
  for (const model of models) {
    assertNoMarkdown(model.claim);
    if (model.provenance?.href) {
      assert.match(model.provenance.href, /^https?:\/\//);
    }
  }
  // "Cause:" is not in the fixed kind vocabulary (it is a cause-and-effect chain label, not
  // a FactCard kind word) so it is not stripped as a lead-in; it survives as visible claim
  // text rather than silently vanishing. Recorded here as the observed behaviour, not
  // asserted as correct or incorrect - see the lane report's "unresolved" note.
  const causeCard = models.find((m) => m.claim.some((n) => n.text.includes("SAF blend")));
  assert.ok(causeCard, "the Cause claim survives as a card");
});

test("toClaimNodes strips every forbidden markdown character", () => {
  const nodes = toClaimNodes("# Heading **bold** `code` [link](https://example.com) *stray*");
  assertNoMarkdown(nodes);
});
