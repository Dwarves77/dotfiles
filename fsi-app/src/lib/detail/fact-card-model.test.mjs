// fact-card-model.test.mjs - proof for fact-card-model.ts (lane w10-factcard, 2026-09-20).
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveFactCardModels,
  parseFactCardModels,
  deriveRecordFactCardModel,
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

// Amendment 1 ruling B.3: the deterministic slot-key -> kind table for record-grade rows.
test("deriveRecordFactCardModel maps the three deadline-shaped slot keys to DEADLINE", () => {
  for (const slotKey of ["effective_date", "primary_deadline", "due_date"]) {
    const model = deriveRecordFactCardModel({ slotKey, label: "Effective date", span: "1 July 2026" });
    assert.equal(model.kind, "DEADLINE", `${slotKey} -> DEADLINE`);
    assert.equal(model.qualifier, "Effective date");
  }
});

test("deriveRecordFactCardModel maps penalty_summary to PENALTY", () => {
  const model = deriveRecordFactCardModel({ slotKey: "penalty_summary", label: "Penalty", span: "up to EUR 50000" });
  assert.equal(model.kind, "PENALTY");
});

test("deriveRecordFactCardModel maps jurisdictional_scope to SCOPE explicitly", () => {
  const model = deriveRecordFactCardModel({ slotKey: "jurisdictional_scope", label: "Jurisdictional scope", span: "European Union" });
  assert.equal(model.kind, "SCOPE");
});

test("deriveRecordFactCardModel falls back to SCOPE for every slot key not in the unambiguous table", () => {
  const ambiguous = [
    "title",
    "operative_provision",
    "addressee",
    "binding_position",
    "corridor_identity",
    "in_force_status",
    "evidence_agreement_signal",
    "source_authority_signal",
    "some_future_slot_key_never_seen",
  ];
  for (const slotKey of ambiguous) {
    const model = deriveRecordFactCardModel({ slotKey, label: "A field", span: "some verbatim span" });
    assert.equal(model.kind, "SCOPE", `${slotKey} -> SCOPE (unknown/ambiguous)`);
  }
});

test("deriveRecordFactCardModel returns null for a row with no verbatim span (a GAP row)", () => {
  assert.equal(deriveRecordFactCardModel({ slotKey: "effective_date", label: "Effective date", span: null }), null);
});

// Amendment 1 section A: the two measured production insertion points
// (RegulationDetailSurface.tsx and MarketSignalDetailSurface.tsx, both of which route their
// non-prose section content through FactBlocks -> parseFactParagraphs -> deriveFactCardModels,
// the same one path both surfaces share). CONFIRMED cause (this lane, by reading git history):
// at production sha 6d9d139c the OLD FactCard v1 (deleted by commit f8fb9d86) rendered its
// `text` prop as a raw React string with no markdown stripping - so an embedded bolded label
// ("**Cause:**") or a mid-sentence raw URL that fact-paragraphs.ts's own SOURCE_RE trailing-only
// match did not capture survived into the DOM exactly as measured. This model-based render (v2)
// replaced that raw-string render with toClaimNodes' markdown-stripping tokenizer before this
// test file existed; this test fixes the regression by asserting the pipeline both surfaces
// call produces zero "*" characters in the concatenated claim text for the exact measured
// shapes ("**Cause:** FACT: ...", "*Source: FAQ ... 02/04/2025.").
test("both detail surfaces' shared FactBlocks pipeline emits zero literal asterisks for the measured production patterns", () => {
  const regulationPattern =
    'FACT: "**Cause:** The instrument requires 40% recyclability by 2030." *Source: FAQ on packaging rules, European Commission, 02/04/2025. https://ec.europa.eu/faq-ppwr.*';
  const marketPattern =
    '*Operational implication:* Forwarders quoting EU-origin lanes should budget for the surcharge before Q1 2026. https://ec.europa.eu/climate-action.';

  for (const pattern of [regulationPattern, marketPattern]) {
    const paragraph = classifyParagraph(pattern);
    const models = deriveFactCardModels(paragraph);
    assert.ok(models.length >= 1, `at least one card model for: ${pattern}`);
    for (const model of models) {
      const rendered = model.claim.map((n) => n.text).join(" ");
      assert.ok(!rendered.includes("*"), `no "*" in rendered claim text: ${JSON.stringify(rendered)}`);
      if (model.qualifier) assert.ok(!model.qualifier.includes("*"), "no \"*\" in qualifier");
      if (model.provenance?.href) {
        assert.doesNotMatch(rendered, /https?:\/\//, "a URL never appears in the claim text, only in provenance.href");
      }
    }
  }
});

// Lane W10-FactCard-c (2026-09-21). Two live leftovers measured on production market detail
// `/market/9d18608f-269e-405a-9ad8-afa638dda928` by a read-only text-node walk, both inside
// `[data-part="fact-card"] <p>`/claim text: (1) a literal-markdown match, claim text beginning
// "May 6, 2026. \n- **" followed by a name and a title; (2) five bare `http` URLs in text nodes
// outside any `<a>`.

test("defect 1: an embedded list marker inside a claim (\"sentence. \\n- **Name**, title\") folds into inline prose - no '*', no leading '- ', the name stays a distinct bold node", () => {
  // The measured shape, with a placeholder name per the integrity rule (never a real person).
  const nodes = toClaimNodes("Effective May 6, 2026.\n- **Jane Doe**, Commercial Director, Example Corp.");
  const rendered = nodes.map((n) => n.text).join("");
  assert.ok(!rendered.includes("*"), `no literal asterisk survives: ${JSON.stringify(rendered)}`);
  assert.ok(!rendered.includes("\n"), `no raw newline survives: ${JSON.stringify(rendered)}`);
  assert.ok(!/(^|\s)-\s/.test(rendered), `no leading list-marker dash survives: ${JSON.stringify(rendered)}`);
  const bold = nodes.find((n) => n.bold && n.text === "Jane Doe");
  assert.ok(bold, "the bolded name stays its own bold node, not merged into plain text");
});

test("defect 1: a bare '- ' at the very start of a claim (no preceding newline) also folds away", () => {
  const nodes = toClaimNodes("- **Jane Doe**, Commercial Director, Example Corp.");
  const rendered = nodes.map((n) => n.text).join("");
  assert.ok(!rendered.startsWith("- "), `no leading list marker: ${JSON.stringify(rendered)}`);
  assert.ok(!rendered.includes("*"), `no literal asterisk survives: ${JSON.stringify(rendered)}`);
});

test("defect 2: a claim carrying two embedded urls - the first is claimed as this card's provenance, the second becomes a real link node, never bare text in a <span> (measured: 'citation line, publisher and date, then a bare URL')", () => {
  const paragraph = classifyParagraph(
    "*Operational implication:* Forwarders should confirm the notice at https://example.org/first-notice and cross-check the follow-up published at https://example.org/second-notice before quoting the lane."
  );
  assert.equal(paragraph.kind, "inference");
  const models = deriveFactCardModels(paragraph);
  assert.equal(models.length, 1);
  const model = models[0];

  // extractProvenance's own rule (first url anywhere -> provenance) claims the first url.
  assert.equal(model.provenance?.href, "https://example.org/first-notice");

  // The second url is NOT dropped and NOT left as bare text: it becomes its own link node, whose
  // visible text is the host via hostFromUrl - the same "host as visible text" anchor treatment
  // the provenance column already uses (F30), never a second url formatter (F45).
  const linkNode = model.claim.find((n) => n.href === "https://example.org/second-notice");
  assert.ok(linkNode, "the leftover embedded url survives as a link node, not silently dropped");
  assert.equal(linkNode.text, "example.org", "the link node's text is hostFromUrl(href), never the raw url");

  // No claim node without an href carries a bare url - the defect's exact shape: a url-looking
  // string rendered as plain text (FactCard's non-link branch wraps plain text in a <span>).
  for (const n of model.claim) {
    if (!n.href) assert.doesNotMatch(n.text, /https?:\/\//, `no bare url outside a link node: ${JSON.stringify(n)}`);
  }
});
