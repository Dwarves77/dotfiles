// Congruence gate proof (phase-intake-gate piece 1): a primary-artifact TYPE on a NEWS source is retyped
// to market_signal (news IS the correct primary for a signal) — retyped, never dropped. Pure, depless-CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceRole, congruentType, congruence, PRIMARY_ARTIFACT_TYPES, STUDY_BACKED_TYPES } from "./source-role.mjs";

test("sourceRole: news vs primary vs other", () => {
  assert.equal(sourceRole("https://smartfreightcentre.org/en/about-sfc/news/glec-v3"), "news");
  assert.equal(sourceRole("https://sdir.no/en/news/zero-emission"), "news");
  assert.equal(sourceRole("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1805"), "primary");
  assert.equal(sourceRole("https://x.s3.amazonaws.com/documents/GLEC_v3.pdf"), "primary");
  assert.equal(sourceRole("https://example.org/some/page"), "other");
});

test("congruence: primary-artifact type on a NEWS source → market_signal (retyped, not dropped)", () => {
  for (const t of PRIMARY_ARTIFACT_TYPES) {
    const c = congruentType(t, "https://sfc.org/en/news/release");
    assert.equal(c.itemType, "market_signal", `${t} on news → market_signal`);
    assert.equal(c.changed, true);
  }
});

test("congruence: primary-artifact on a PRIMARY source is unchanged; market_signal on news is unchanged", () => {
  assert.equal(congruentType("framework", "https://x/documents/glec.pdf").changed, false);
  assert.equal(congruentType("standard", "https://eur-lex.europa.eu/legal-content/x").changed, false);
  assert.equal(congruentType("market_signal", "https://sfc.org/news/x").changed, false); // news IS its correct primary
  assert.equal(congruentType("regulation", "https://unknown.host/page").changed, false); // 'other' host stays classifier's call
});

test("NEWS_RE catches wire-service press releases (so 1b is real on the MIT PR Newswire case, not synthetic)", () => {
  assert.equal(sourceRole("https://www.prnewswire.com/news-releases/mit-study-eases-x-301.html"), "news");
  assert.equal(sourceRole("https://www.businesswire.com/news/home/2026/x"), "news");
});

test("congruence 1b: research_finding on a news/press source → type UNCHANGED, incongruentSource=true (seek study)", () => {
  assert.ok(STUDY_BACKED_TYPES.has("research_finding"));
  const c = congruence("research_finding", "https://www.prnewswire.com/news-releases/mit-study-eases-x-301.html");
  assert.equal(c.itemType, "research_finding", "1b keeps the type — it IS research");
  assert.equal(c.changed, false, "1b never retypes");
  assert.equal(c.incongruentSource, true, "1b flags the source, to seek the study");
  // a research_finding on the actual study/report (primary) is CONGRUENT — no flag
  assert.equal(congruence("research_finding", "https://x.org/documents/study.pdf").incongruentSource, false);
  // congruence() also carries 1a (retype) so the chokepoint needs only one call
  assert.equal(congruence("framework", "https://sfc.org/news/x").itemType, "market_signal");
  assert.equal(congruence("framework", "https://sfc.org/news/x").changed, true);
});
