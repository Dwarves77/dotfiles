// GOLDEN — holdings-audit pure classifier (operator dispatch 2026-07-14). Proves the known-defect
// classes fire on strong evidence only, and that NO-KNOWN-DEFECT is "no detected defect", never a
// completeness proof. Run: node --test src/lib/sources/holdings-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectPublisherShape, extractCleanText, structuralTruncation,
  classifyCompleteness, classifySufficiency, STUB_MAX_BYTES,
} from "./holdings-audit.mjs";

test("detectPublisherShape: the four named shapes + other", () => {
  assert.equal(detectPublisherShape("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115"), "eur-lex");
  assert.equal(detectPublisherShape("https://www.legislation.gov.uk/uksi/2024/1234/made"), "legislation.gov.uk");
  assert.equal(detectPublisherShape("https://www.federalregister.gov/documents/2024/01/02/x"), "federal-register");
  assert.equal(detectPublisherShape("https://www.ecfr.gov/current/title-40"), "federal-register");
  assert.equal(detectPublisherShape("https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-1"), "gazette");
  assert.equal(detectPublisherShape("https://www.imo.org/en/some-page"), "other");
  assert.equal(detectPublisherShape(""), "other");
});

test("extractCleanText strips script/style/markup and collapses whitespace", () => {
  const html = `<html><head><style>.a{color:red}</style><script>var x=1</script></head><body><h1>Article 1</h1><p>Hello&nbsp;world</p></body></html>`;
  const clean = extractCleanText(html);
  assert.match(clean, /Article 1 Hello world/);
  assert.doesNotMatch(clean, /var x|color:red/);
});

test("structuralTruncation: eur-lex opening without closing → truncated; with closing → whole", () => {
  const cut = "Article 1 Subject matter This Regulation lays down rules. Article 2 Definitions.";
  assert.equal(structuralTruncation(cut, "eur-lex").truncated, true);
  const whole = cut + " This Regulation shall be binding in its entirety. Done at Brussels. For the European Parliament.";
  assert.equal(structuralTruncation(whole, "eur-lex").truncated, false);
});

test("structuralTruncation: gazette/other never asserts (checked:false)", () => {
  const r = structuralTruncation("anything", "other");
  assert.equal(r.checked, false);
  assert.equal(r.truncated, false);
});

test("classifyCompleteness STUB: snapshot <= 1000 bytes", () => {
  const r = classifyCompleteness({ bytes: 175, body: "<html><body>loading…</body></html>", shape: "other" });
  assert.equal(r.completeness, "STUB");
  assert.ok(r.checksFired.includes("byte-size"));
});

test("classifyCompleteness FURNITURE: big markup, negligible text", () => {
  const body = "<div>" + "<span></span>".repeat(2000) + "<script>" + "x".repeat(6000) + "</script>" + "</div>";
  const r = classifyCompleteness({ bytes: body.length, body, shape: "other" });
  assert.equal(r.completeness, "FURNITURE");
  assert.ok(r.checksFired.includes("furniture-ratio"));
});

test("classifyCompleteness TRUNCATED: eur-lex body cut before closing", () => {
  const body = "<html><body><h1>Article 1</h1><p>" + "Subject matter. ".repeat(400) + "</p><h2>Article 2</h2></body></html>";
  const r = classifyCompleteness({ bytes: body.length, body, shape: "eur-lex" });
  assert.equal(r.completeness, "TRUNCATED");
  assert.ok(r.checksFired.includes("structural-shape"));
});

test("classifyCompleteness NO-KNOWN-DEFECT: whole eur-lex doc", () => {
  const body = "<html><body><h1>Article 1</h1><p>" + "Subject matter. ".repeat(400) +
    "</p><p>This Regulation shall be binding in its entirety. Done at Brussels. For the European Parliament.</p></body></html>";
  const r = classifyCompleteness({ bytes: body.length, body, shape: "eur-lex" });
  assert.equal(r.completeness, "NO-KNOWN-DEFECT");
});

test("classifyCompleteness metadata-only: body omitted → only byte-size ran, no false defect", () => {
  const r = classifyCompleteness({ bytes: 76000, body: null });
  assert.equal(r.completeness, "NO-KNOWN-DEFECT");
  assert.deepEqual(r.checksFired, ["byte-size"]);
  assert.match(r.evidence.note, /body not read/);
});

test("classifyCompleteness pool: 0 usable rows → STUB; >=1 → no known defect", () => {
  assert.equal(classifyCompleteness({ capture_kind: "pool", usablePoolRows: 0 }).completeness, "STUB");
  assert.equal(classifyCompleteness({ capture_kind: "pool", usablePoolRows: 4 }).completeness, "NO-KNOWN-DEFECT");
});

test("classifySufficiency: floor-eligible source covers; below-floor corroborates; thin is insufficient", () => {
  // regulation floor = 2. A T1 snapshot with real content covers grounding.
  assert.equal(classifySufficiency({ itemType: "regulation", sourceTier: 1, completeness: "NO-KNOWN-DEFECT", snapshotBytes: 76000 }), "covers_grounding");
  // A T6 source for a regulation can only corroborate.
  assert.equal(classifySufficiency({ itemType: "regulation", sourceTier: 6, completeness: "NO-KNOWN-DEFECT", snapshotBytes: 76000 }), "corroborators_only");
  // Unregistered tier can't ground a floored fact.
  assert.equal(classifySufficiency({ itemType: "regulation", sourceTier: null, completeness: "NO-KNOWN-DEFECT", snapshotBytes: 76000 }), "corroborators_only");
  // Exempt type (market_signal): any real content covers.
  assert.equal(classifySufficiency({ itemType: "market_signal", sourceTier: 6, completeness: "NO-KNOWN-DEFECT", snapshotBytes: 76000 }), "covers_grounding");
  // STUB is insufficient regardless of tier.
  assert.equal(classifySufficiency({ itemType: "regulation", sourceTier: 1, completeness: "STUB", snapshotBytes: 200 }), "insufficient");
});
