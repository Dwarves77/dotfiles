// src/lib/agent/timeline-backfill-derive.test.mjs
//
// Task 6.1c (ADR-030): fixtures for every derivation step (EU title forms, the FR path, a UK SI "Made"
// line, an Act's Royal Assent line, an IMO resolution title, a research page dateline) and the three
// named negatives (a year inside a CELEX number, a citation date, "twentieth day following"). Node
// builtins + relative .mjs imports only, portable under the no-npm-ci discipline glob (transitive
// imports checked too: timeline-harvest.mjs and forward-event-format.mjs are both zero-dependency).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatPrecisionLabel,
  containsToken,
  finalizeTimelineRow,
  pickBestCaptureText,
  extractTitleDate,
  extractFederalRegisterDate,
  extractLegislationGovUkDate,
  extractForwardEventDate,
  extractDatelineDate,
  deriveTimelineFromMetadata,
  TITLE_DATE_BASE_LABEL,
  FEDERAL_REGISTER_BASE_LABEL,
  DATELINE_BASE_LABEL,
} from "./timeline-backfill-derive.mjs";

// ── formatPrecisionLabel / containsToken / finalizeTimelineRow / pickBestCaptureText ────────────────────

test("formatPrecisionLabel: day precision renders the base label clean", () => {
  assert.equal(formatPrecisionLabel("12 August 2026", "day", "Published"), "Published");
});

test("formatPrecisionLabel: non-day precision keeps the original token in the label (never a fabricated day)", () => {
  assert.equal(formatPrecisionLabel("2026", "year", "Enacted"), "2026 - Enacted");
});

test("containsToken: case-insensitive presence check; empty inputs are an honest miss", () => {
  assert.equal(containsToken("Regulation of 20 June 2019 on emissions", "20 June 2019"), true);
  assert.equal(containsToken("Regulation of 20 june 2019", "20 June 2019"), true, "case-insensitive");
  assert.equal(containsToken("no date here", "20 June 2019"), false);
  assert.equal(containsToken(null, "20 June 2019"), false);
  assert.equal(containsToken("some text", null), false);
});

test("finalizeTimelineRow: builds the item_timelines row shape, is_completed from todayIso", () => {
  const row = finalizeTimelineRow({ token: "20 June 2019", iso: "2019-06-20", precision: "day", baseLabel: TITLE_DATE_BASE_LABEL }, "2026-09-12", 0);
  assert.deepEqual(row, { milestone_date: "2019-06-20", label: TITLE_DATE_BASE_LABEL, is_completed: true, sort_order: 0 });
});

test("finalizeTimelineRow: future date is_completed false; null derivation returns null", () => {
  const row = finalizeTimelineRow({ token: "2030", iso: "2030-01-01", precision: "year", baseLabel: "Enacted" }, "2026-09-12", 2);
  assert.equal(row.is_completed, false);
  assert.equal(row.sort_order, 2);
  assert.equal(row.label, "2030 - Enacted");
  assert.equal(finalizeTimelineRow(null, "2026-09-12"), null);
});

test("pickBestCaptureText: ADR-016's 200-char floor, longest usable capture wins", () => {
  assert.equal(pickBestCaptureText([{ result_content: "short" }]), null, "under the 200-char floor");
  const long1 = "a".repeat(250);
  const long2 = "b".repeat(400);
  assert.equal(pickBestCaptureText([{ result_content: long1 }, { result_content: long2 }]), long2);
  assert.equal(pickBestCaptureText([]), null);
  assert.equal(pickBestCaptureText(null), null);
});

// ── Step 2: title date ──────────────────────────────────────────────────────────────────────────────

test("title: EU 'of DD Month YYYY' form", () => {
  const r = extractTitleDate("Regulation (EU) 2019/1242 of 20 June 2019 setting CO2 emission performance standards");
  assert.deepEqual(r, { token: "20 June 2019", iso: "2019-06-20", precision: "day" });
});

test("title: EU 'of DD.MM.YYYY' numeric form", () => {
  const r = extractTitleDate("Commission Delegated Regulation (EU) 2023/1183 of 15.02.2023 amending Annex I");
  assert.deepEqual(r, { token: "15.02.2023", iso: "2023-02-15", precision: "day" });
});

test("title: bare 'DD Month YYYY' (IMO resolution title, no leading 'of')", () => {
  const r = extractTitleDate("Resolution MEPC.328(76), adopted 17 June 2021, amendments to MARPOL Annex VI");
  assert.deepEqual(r, { token: "17 June 2021", iso: "2021-06-17", precision: "day" });
});

test("title: ordinal-suffixed day parses correctly", () => {
  const r = extractTitleDate("UK Statutory Instrument made on 15th March 2023");
  assert.deepEqual(r, { token: "15th March 2023", iso: "2023-03-15", precision: "day" });
});

test("negative: a year inside a CELEX-shaped number is not a date", () => {
  assert.equal(extractTitleDate("Regulation (EU) 2019/1242 establishing CO2 standards"), null);
});

test("negative: an amending title's FIRST 'of DATE' is its own date, not the cited instrument's date", () => {
  const r = extractTitleDate(
    "Commission Implementing Regulation (EU) 2023/1184 of 20 March 2023 amending Regulation (EU) 2019/1242 of 20 June 2019"
  );
  assert.deepEqual(r, { token: "20 March 2023", iso: "2023-03-20", precision: "day" }, "own date, not the cited instrument's");
});

test("negative: 'twentieth day following publication' yields nothing (no numeric date token)", () => {
  assert.equal(extractTitleDate("This Regulation shall enter into force on the twentieth day following publication"), null);
});

test("title: null/empty input", () => {
  assert.equal(extractTitleDate(null), null);
  assert.equal(extractTitleDate(""), null);
});

// ── Step 3: Federal Register URL date path ─────────────────────────────────────────────────────────

test("federal register: /documents/YYYY/MM/DD/ path", () => {
  const r = extractFederalRegisterDate("https://www.federalregister.gov/documents/2023/06/15/2023-12345/rule-name");
  assert.deepEqual(r, { token: "2023-06-15", iso: "2023-06-15", precision: "day" });
});

test("federal register: no match on a non-FR host or a path with no date segment", () => {
  assert.equal(extractFederalRegisterDate("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242"), null);
  assert.equal(extractFederalRegisterDate("https://www.federalregister.gov/agencies/environmental-protection-agency"), null);
  assert.equal(extractFederalRegisterDate(null), null);
});

// ── Step 4: legislation.gov.uk ──────────────────────────────────────────────────────────────────────

test("legislation.gov.uk: statutory instrument 'Made' line", () => {
  const capturedText = "STATUTORY INSTRUMENTS\n2023 No. 456\nMade - - - - 15th March 2023\nLaid before Parliament\nComing into force 1st April 2023";
  const r = extractLegislationGovUkDate({ capturedText });
  assert.deepEqual(r, { token: "15th March 2023", iso: "2023-03-15", precision: "day", baseLabel: "Made (legislation.gov.uk)", form: "made" });
});

test("legislation.gov.uk: Act's bracketed Royal Assent line", () => {
  const capturedText = "An Act to make provision about environmental targets and other matters. [15th March 2023]\nBE IT ENACTED...";
  const r = extractLegislationGovUkDate({ capturedText });
  assert.deepEqual(r, { token: "15th March 2023", iso: "2023-03-15", precision: "day", baseLabel: "Royal Assent (legislation.gov.uk)", form: "royal_assent" });
});

test("legislation.gov.uk: year-only fallback from a UK-shaped identifier when the capture has neither line", () => {
  const r = extractLegislationGovUkDate({ capturedText: "no dated lines here", identifier: "UK ukpga 2023/52" });
  assert.deepEqual(r, { token: "2023", iso: "2023-01-01", precision: "year", baseLabel: "Enacted (legislation.gov.uk identifier year)", form: "identifier_year" });
});

test("negative: a CELEX-shaped identifier never fires the UK year-only fallback", () => {
  assert.equal(extractLegislationGovUkDate({ capturedText: "no dated lines here", identifier: "32019R1242" }), null);
});

test("legislation.gov.uk: no match on empty/absent inputs", () => {
  assert.equal(extractLegislationGovUkDate({}), null);
  assert.equal(extractLegislationGovUkDate(), null);
});

// ── Step 5: earliest forward event ──────────────────────────────────────────────────────────────────

test("forward event: picks the earliest by event_date, labels kind + obligation_text", () => {
  const events = [
    { event_date: "2027-06-01", date_precision: "day", event_kind: "compliance_deadline", obligation_text: "submit annual report" },
    { event_date: "2026-01-01", date_precision: "day", event_kind: "entry_into_force", obligation_text: "Regulation enters into force" },
  ];
  const r = extractForwardEventDate(events);
  assert.deepEqual(r, {
    token: "Jan 1 2026",
    iso: "2026-01-01",
    precision: "day",
    baseLabel: "entry into force: Regulation enters into force",
  });
});

test("forward event: month/year precision is honored (never fabricates a day)", () => {
  const r = extractForwardEventDate([{ event_date: "2026-09-01", date_precision: "month", event_kind: "review_or_report", obligation_text: "review published" }]);
  assert.deepEqual(r, { token: "Sep 2026", iso: "2026-09-01", precision: "month", baseLabel: "review or report: review published" });
});

test("forward event: empty/absent list returns null", () => {
  assert.equal(extractForwardEventDate([]), null);
  assert.equal(extractForwardEventDate(null), null);
});

// ── Step 6: dateline in capture text ────────────────────────────────────────────────────────────────

test("dateline: leading 'Published DD Month YYYY'", () => {
  const capturedText = "Published 3 March 2024\nThis report examines port sustainability initiatives across the region...";
  assert.deepEqual(extractDatelineDate(capturedText), { token: "3 March 2024", iso: "2024-03-03", precision: "day" });
});

test("dateline: bare 'DD Month YYYY' within the first 400 characters (research page, no 'Published' marker)", () => {
  const capturedText = "IEA Policy Brief, 12 January 2025. Global energy transition tracking shows accelerating investment" + "x".repeat(300);
  const r = extractDatelineDate(capturedText);
  assert.deepEqual(r, { token: "12 January 2025", iso: "2025-01-12", precision: "day" });
});

test("dateline: a bare date past the 400-char window is not matched (no false hit from deep in the body)", () => {
  const capturedText = "x".repeat(450) + " 12 January 2025 some unrelated citation";
  assert.equal(extractDatelineDate(capturedText), null);
});

test("dateline: <time datetime=...> ISO date when no prose dateline is present", () => {
  const capturedText = "x".repeat(450) + '<time datetime="2024-07-09T00:00:00Z">July 9</time>';
  const r = extractDatelineDate(capturedText);
  assert.deepEqual(r, { token: "2024-07-09", iso: "2024-07-09", precision: "day" });
});

test("dateline: no match on empty/absent input", () => {
  assert.equal(extractDatelineDate(""), null);
  assert.equal(extractDatelineDate(null), null);
});

// ── Orchestrator: first hit wins, every attempt named ──────────────────────────────────────────────

test("orchestrator: title date verified against capture wins (step 2, first hit)", () => {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: "Regulation (EU) 2019/1242 of 20 June 2019 setting CO2 emission performance standards",
    capturedText: "...REGULATION (EU) 2019/1242 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 20 June 2019 setting CO2 emission performance standards...",
    sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242",
  });
  assert.equal(result.source, "title");
  assert.equal(result.baseLabel, TITLE_DATE_BASE_LABEL);
  assert.equal(result.iso, "2019-06-20");
  assert.equal(attempts[0].step, "title");
  assert.equal(attempts[0].outcome, "hit-verified");
});

test("orchestrator: title date NOT in capture -> falls through to Federal Register path (step 3)", () => {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: "Some other 20 June 2019 title text not present in the capture",
    capturedText: "this capture never mentions that date at all",
    sourceUrl: "https://www.federalregister.gov/documents/2023/06/15/2023-12345/rule-name",
  });
  assert.equal(result.source, "federal_register");
  assert.equal(result.baseLabel, FEDERAL_REGISTER_BASE_LABEL);
  assert.ok(attempts.find((a) => a.step === "title" && a.outcome === "miss-not-in-capture"));
});

test("orchestrator: no title token, no FR path, no UK lines, no forward events -> falls to dateline (step 6)", () => {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: "IEA Policy Brief on port electrification",
    sourceUrl: "https://iea.org/reports/port-electrification",
    capturedText: "Published 9 July 2024\nThis brief examines global port electrification trends.",
  });
  assert.equal(result.source, "dateline");
  assert.equal(result.baseLabel, DATELINE_BASE_LABEL);
  assert.equal(attempts.map((a) => a.step).join(","), "title,federal_register,legislation_gov_uk,forward_event,dateline");
});

test("orchestrator: nothing matches anywhere -> result null, every step reported (never invents a date)", () => {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: "Regulation (EU) 2019/1242",
    sourceUrl: "https://ec.europa.eu/some-portal",
    capturedText: "This Regulation shall enter into force on the twentieth day following its publication.",
  });
  assert.equal(result, null);
  assert.equal(attempts.length, 5);
  assert.ok(attempts.every((a) => a.outcome !== "hit" && a.outcome !== "hit-verified"));
});

test("orchestrator: forward event fires when title/FR/UK all miss (step 5)", () => {
  const { result } = deriveTimelineFromMetadata({
    title: "Some initiative with no dated title",
    sourceUrl: "https://example.org/initiative",
    capturedText: null,
    forwardEvents: [{ event_date: "2027-01-01", date_precision: "day", event_kind: "entry_into_force", obligation_text: "enters into force" }],
  });
  assert.equal(result.source, "forward_event");
  assert.equal(result.iso, "2027-01-01");
});
