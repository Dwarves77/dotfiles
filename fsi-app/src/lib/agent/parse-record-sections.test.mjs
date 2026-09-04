// parse-record-sections.test.mjs — proof for parse-record-sections.ts (RECORD-SURFACE lane, 2026-09-04).
//
// Fixtures below are copied VERBATIM (2026-09-04, read-only SELECT via the Supabase MCP) from two live
// `intelligence_item_sections` rows:
//   - item 8670d8bf-9847-4da6-8724-0d52308b008e ("1999/823/EC: Commission Decision...", item_type
//     "initiative", item_grade "record") — the operator's own screenshot case. identity + record_facts +
//     sources_and_citations rows, ALL FIVE record_facts slots GAP (no FACTs at all).
//   - item 62ab491a-da2c-4456-b74b-6d704e38d3d1 (item_type in the regulation family) — record_facts row
//     carrying six FACT lines (five generic slots + binding_position's two-guillemet template), zero GAPs.
// A third, synthetic fixture exercises the "facts absent" (null-return) and "no sections at all" cases,
// and a fourth exercises "identity present, record_facts absent".
import test from "node:test";
import assert from "node:assert/strict";
import {
  humanizeSlotLabel,
  lastQuotedSpan,
  parseRecordClaimLine,
  parseSourceUrl,
  parseRecordSections,
  splitKeyDateFacts,
  KEY_DATE_SLOTS,
} from "./parse-record-sections.ts";

// ── live fixture: all-GAP item (8670d8bf...) ──────────────────────────────────────────────────────
const ALL_GAP_ROWS = [
  {
    section_key: "identity",
    content_md:
      "[title] The captured source's own text carries this item's title verbatim: «1999/823/EC: Commission Decision of 22 November 1999»",
  },
  {
    section_key: "record_facts",
    content_md: [
      "[action_now] No verbatim action now statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.",
      "[conversion_trigger] No verbatim conversion trigger statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.",
      "[driving_parties] No verbatim driving parties statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.",
      "[signal_event] No verbatim signal event statement was located in the captured source text for this record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.",
      "[corridor_identity] No verbatim UN/LOCODE port-pair and mode were located together in the captured source text for this record-grade item — corridor identity is only stated when both ends are named together. A full-brief regrounding will re-examine this gap when this item upgrades from record to brief.",
    ].join("\n"),
  },
  {
    section_key: "sources_and_citations",
    content_md: "Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823",
  },
];

// ── live fixture: FACT-bearing item (62ab491a...), record_facts only (no identity row selected) ────
const FACT_BEARING_RECORD_FACTS_MD = [
  "[effective_date] The captured source states, verbatim: «shall enter into force only if no objection has been expressed either by the European Parliament or by the Counc»",
  "[jurisdictional_scope] The captured source states, verbatim: «Member States and other stakeholders, has developed an information system for the submission of due dil»",
  "[penalty_summary] The captured source states, verbatim: «penalties applicable to infringements of this Regulation by operators, downstream operators and traders and shall take»",
  "[primary_deadline] The captured source states, verbatim: «by 30 June 2030, in the interest of simplification for operators and traders, the Com»",
  "[binding_position] The captured source's own applicability language places this item at «direct_duty» (Your duty), from the passage: «the operator shall assume responsibility for the compliance of the relevant product with Article 3»",
  "[due_date] The captured source states a due date (date_precision: day), verbatim: «by 30 June 2030, in the interest of simplification for operators and traders, the Com»",
].join("\n");

test("humanizeSlotLabel: underscores to spaces, first letter capitalized", () => {
  assert.equal(humanizeSlotLabel("effective_date"), "Effective date");
  assert.equal(humanizeSlotLabel("title"), "Title");
  assert.equal(humanizeSlotLabel("binding_position"), "Binding position");
  assert.equal(humanizeSlotLabel(""), "");
});

test("lastQuotedSpan: takes the LAST guillemet pair, not the first (binding_position's code-then-passage shape)", () => {
  const line =
    "places this item at «direct_duty» (Your duty), from the passage: «the operator shall assume responsibility»";
  assert.equal(lastQuotedSpan(line), "the operator shall assume responsibility");
  assert.equal(lastQuotedSpan("no guillemets here"), null);
});

test("parseRecordClaimLine: FACT line — slotKey, label, kind, span", () => {
  const row = parseRecordClaimLine(
    "[effective_date] The captured source states, verbatim: «entered into force on 1 December 2009»"
  );
  assert.ok(row);
  assert.equal(row.slotKey, "effective_date");
  assert.equal(row.label, "Effective date");
  assert.equal(row.kind, "FACT");
  assert.equal(row.span, "entered into force on 1 December 2009");
});

test("parseRecordClaimLine: GAP line — identified by the marker sentence, span null", () => {
  const row = parseRecordClaimLine(
    "[due_date] No verbatim due-date statement was located in the captured source text for this " +
      "record-grade item. A full-brief regrounding will re-examine this gap when this item upgrades " +
      "from record to brief."
  );
  assert.ok(row);
  assert.equal(row.kind, "GAP");
  assert.equal(row.span, null);
});

test("parseRecordClaimLine: blank/unrecognised lines return null", () => {
  assert.equal(parseRecordClaimLine(""), null);
  assert.equal(parseRecordClaimLine("   "), null);
  assert.equal(parseRecordClaimLine("no bracket prefix at all"), null);
});

test("parseSourceUrl: extracts the URL from a 'Source: <url>' line", () => {
  assert.equal(
    parseSourceUrl("Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823"),
    "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823"
  );
  assert.equal(parseSourceUrl(""), null);
  assert.equal(parseSourceUrl("no source line here"), null);
});

// ── parseRecordSections: facts present (edges/dates/labels round-trip) ──────────────────────────────
test("parseRecordSections: FACT-bearing record_facts section — six FACTs, zero GAPs, key dates split out", () => {
  const parsed = parseRecordSections([
    { section_key: "record_facts", content_md: FACT_BEARING_RECORD_FACTS_MD },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.gaps.length, 0);
  assert.equal(parsed.facts.length, 6);
  assert.equal(parsed.slotFieldCount, 6);
  assert.equal(parsed.sourceUrl, null); // no sources_and_citations row supplied

  const bySlot = Object.fromEntries(parsed.facts.map((f) => [f.slotKey, f]));
  assert.equal(bySlot.binding_position.span, "the operator shall assume responsibility for the compliance of the relevant product with Article 3");
  assert.equal(bySlot.due_date.text.includes("date_precision: day"), true);

  const { dateFacts, otherFacts } = splitKeyDateFacts(parsed.facts);
  assert.deepEqual(
    dateFacts.map((f) => f.slotKey).sort(),
    ["due_date", "effective_date", "primary_deadline"]
  );
  assert.equal(otherFacts.length, 3); // jurisdictional_scope, penalty_summary, binding_position
  for (const slot of dateFacts.map((f) => f.slotKey)) assert.ok(KEY_DATE_SLOTS.has(slot));
});

// ── parseRecordSections: facts absent (all-GAP live item) ──────────────────────────────────────────
test("parseRecordSections: all-GAP record_facts + identity title FACT + source URL", () => {
  const parsed = parseRecordSections(ALL_GAP_ROWS);
  assert.ok(parsed);
  assert.equal(parsed.facts.length, 1); // the identity "title" claim only
  assert.equal(parsed.facts[0].slotKey, "title");
  assert.equal(parsed.gaps.length, 5);
  assert.equal(parsed.slotFieldCount, 5); // record_facts denominator excludes the identity claim
  assert.equal(
    parsed.sourceUrl,
    "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31999D0823"
  );
  // Honest "N of M" line inputs: 5 of 5 record fields not stated.
  assert.equal(parsed.gaps.length, parsed.slotFieldCount);
});

// ── parseRecordSections: identity present, record_facts absent (still returns a parse, zero-slot) ──
test("parseRecordSections: identity-only rows still parse (non-null), zero record_facts slots", () => {
  const parsed = parseRecordSections([
    {
      section_key: "identity",
      content_md: "[title] The captured source's own text carries this item's title verbatim: «Example Title»",
    },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.facts.length, 1);
  assert.equal(parsed.gaps.length, 0);
  assert.equal(parsed.slotFieldCount, 0);
});

// ── parseRecordSections: honest null when neither identity nor record_facts exists ─────────────────
test("parseRecordSections: no identity/record_facts rows at all -> null (honest fallback signal)", () => {
  assert.equal(parseRecordSections([]), null);
  assert.equal(parseRecordSections(null), null);
  assert.equal(
    parseRecordSections([{ section_key: "sources_and_citations", content_md: "Source: https://example.org" }]),
    null
  );
  // A brief-grade item's numbered sections never satisfy this parser either — correct, since it is
  // the record-grade parser, not a generic one.
  assert.equal(
    parseRecordSections([{ section_key: "3", content_md: "Issues requiring immediate action prose." }]),
    null
  );
});
