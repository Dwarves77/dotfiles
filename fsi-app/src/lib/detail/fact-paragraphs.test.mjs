// fact-paragraphs.test.mjs — proof for fact-paragraphs.ts (lane uidetails, 2026-09-06).
//
// Fixture paragraphs below are copied verbatim in FORM from src/lib/agent/system-prompt.ts's own
// worked examples (§"Claim-level provenance") and from the seed brief's inline-citation convention
// (§"Markdown storage convention": "*Source: [Title], [Issuing Body], [Date]. [URL if applicable].*"),
// not fabricated wording.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyParagraph,
  parseFactParagraphs,
  parseSourceCitation,
} from "./fact-paragraphs.ts";

test("a FACT paragraph (prose + inline *Source: ...* citation) classifies as 'fact' with the citation stripped and parsed", () => {
  const p = classifyParagraph(
    "Shipping companies surrendered their first allowances by 30 September 2025 for 2024 emissions. *Source: Directive (EU) 2023/959, EUR-Lex, 10 May 2023. https://eur-lex.europa.eu/eli/dir/2023/959.*"
  );
  assert.equal(p.kind, "fact");
  assert.equal(p.text, "Shipping companies surrendered their first allowances by 30 September 2025 for 2024 emissions.");
  assert.equal(p.source.title, "Directive (EU) 2023/959");
  assert.equal(p.source.issuer, "EUR-Lex");
  assert.equal(p.source.date, "10 May 2023");
  assert.equal(p.source.url, "https://eur-lex.europa.eu/eli/dir/2023/959");
});

test("an ANALYSIS paragraph opening with 'Analytical inference:' classifies as 'inference', label token stripped", () => {
  const p = classifyParagraph(
    "*Analytical inference:* For workspaces moving fine art by air, the SAF mandate raises blended fuel cost before it can be passed through, compressing Q1 margin."
  );
  assert.equal(p.kind, "inference");
  assert.equal(p.label, "Analytical inference");
  assert.equal(
    p.text,
    "For workspaces moving fine art by air, the SAF mandate raises blended fuel cost before it can be passed through, compressing Q1 margin."
  );
});

test("the other two ANALYSIS label tokens ('Industry interpretation:', 'Operational implication:') also classify as 'inference'", () => {
  const a = classifyParagraph("*Industry interpretation:* Carriers are expected to pass this through within one quarter.");
  assert.equal(a.kind, "inference");
  assert.equal(a.label, "Industry interpretation");

  const b = classifyParagraph("*Operational implication:* Spend-based estimates may not satisfy regulatory scrutiny under ISO 14083.");
  assert.equal(b.kind, "inference");
  assert.equal(b.label, "Operational implication");
});

test("a LEGAL paragraph opening with 'Legal Confirmation Required:' classifies as 'counsel'", () => {
  const p = classifyParagraph(
    "*Legal Confirmation Required:* whether the workspace, acting as freight forwarder rather than importer of record, is an obligated party under Article 8 requires counsel review."
  );
  assert.equal(p.kind, "counsel");
  assert.equal(
    p.text,
    "whether the workspace, acting as freight forwarder rather than importer of record, is an obligated party under Article 8 requires counsel review."
  );
});

test("a paragraph matching none of the three tokens classifies as plain 'prose', unchanged", () => {
  const p = classifyParagraph("This section introduces the obligations that follow.");
  assert.equal(p.kind, "prose");
  assert.equal(p.text, "This section introduces the obligations that follow.");
});

test("a bare 'Source: <url>' line with no preceding claim prose is NOT forced into an empty-quote FACT — falls through to prose", () => {
  const p = classifyParagraph("Source: https://emsa.europa.eu/some-page");
  assert.equal(p.kind, "prose");
});

test("parseSourceCitation tolerates a citation missing title/issuer (bare 'Source: <url>' convention)", () => {
  const s = parseSourceCitation("https://emsa.europa.eu/some-page");
  assert.equal(s.url, "https://emsa.europa.eu/some-page");
  assert.equal(s.title, null);
});

test("parseFactParagraphs splits a multi-paragraph section on blank lines and classifies each independently", () => {
  const md = [
    "This subsection covers the surrender deadline.",
    "The first surrendering deadline in respect of 40% of emissions for shipping companies falls due 30 September 2025. *Source: EMSA, ETS Extension to Maritime, 2026. https://emsa.europa.eu/ets-extension.*",
    "*Analytical inference:* Workspaces moving cargo on any EEA-touching lane will see progressive cost increases tied to ETS pass-through.",
    "*Legal Confirmation Required:* Whether any workspace entity that itself operates a vessel of 5,000 GT would be a shipping company.",
  ].join("\n\n");

  const blocks = parseFactParagraphs(md);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map((b) => b.kind), ["prose", "fact", "inference", "counsel"]);
  assert.equal(blocks[1].source.url, "https://emsa.europa.eu/ets-extension");
});

test("parseFactParagraphs returns an empty array for null/empty/whitespace-only input", () => {
  assert.deepEqual(parseFactParagraphs(null), []);
  assert.deepEqual(parseFactParagraphs(""), []);
  assert.deepEqual(parseFactParagraphs("   \n\n  "), []);
});
