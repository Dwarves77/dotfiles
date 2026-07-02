// SOURCE-ROLE (phase-intake-gate piece 1). "Primary" is relative to the CLAIM-TYPE: a primary-artifact
// item (regulation/standard/framework — claims about what an INSTRUMENT says) needs the INSTRUMENT as its
// primary; a news/press page is secondary THERE. A market_signal is correctly primary-sourced on the news
// that carries it. The gate enforces source↔claim-type CONGRUENCE, not "news is weak": a primary-artifact
// TYPE on a NEWS source is retyped to market_signal (where news IS the right primary) — retyped, never dropped.
export const NEWS_RE = /\/(news|news-?releases?|press|press-?releases?|media|newsroom|announcements?|articles?|stories|blog|insights?|updates?)(\/|$|\?|#)|(^|\/\/|\.)(news|prnewswire|businesswire|globenewswire|pr-?web|einpresswire)\./i;
export const PRIMARY_URL_RE = /(eur-lex\.europa\.eu|legislation\.gov\.uk|federalregister\.gov|ecfr\.gov|govinfo\.gov|official.?journal|legal-content|\.pdf($|\?|#)|\/documents?\/|\/eli\/|celex)/i;
export const PRIMARY_ARTIFACT_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
// STUDY-BACKED types: their primary MUST be the study/report itself; a press release ABOUT the study is a
// lead/corroborator, not the primary. On a news/press source these are SOURCE-incongruent (1b) — keep the
// type, surface to seek the study — NOT retyped (that would lose the research nature). Contract v2.1.
export const STUDY_BACKED_TYPES = new Set(["research_finding"]);

export function sourceRole(url) {
  const s = String(url || "");
  if (PRIMARY_URL_RE.test(s)) return "primary";
  if (NEWS_RE.test(s)) return "news";
  return "other";
}

// Congruence: primary-artifact TYPE + news SOURCE → market_signal. Returns the congruent type + whether it
// changed. ('other'-role sources are left as-is — only a NEWS source is a definite mismatch for a primary
// artifact; an unknown host stays the classifier's call.)
export function congruentType(itemType, url) {
  if (PRIMARY_ARTIFACT_TYPES.has(String(itemType)) && sourceRole(url) === "news") {
    return { itemType: "market_signal", changed: true, reason: "primary-artifact type on a news/secondary source → market_signal (news is the signal's correct primary)" };
  }
  return { itemType, changed: false };
}

// UNIFIED congruence verdict covering BOTH incongruence shapes (contract v2.2 — used by the mint chokepoint):
//  - 1a TYPE-incongruence: primary-artifact type on a news source → retype to market_signal (`changed:true`).
//  - 1b SOURCE-incongruence: research_finding (STUDY_BACKED) on a news/press source → type UNCHANGED,
//    `incongruentSource:true` (chokepoint surfaces a seek-study integrity_flag; the press release is a
//    corroborator, never the primary). NOT retyped — that would lose the research nature.
// 'other'/'primary' roles are congruent (no change). Deterministic; no LLM.
export function congruence(itemType, url) {
  const role = sourceRole(url);
  if (PRIMARY_ARTIFACT_TYPES.has(String(itemType)) && role === "news") {
    return { itemType: "market_signal", changed: true, incongruentSource: false, reason: "1a: primary-artifact type on a news source → market_signal (news is the signal's correct primary)" };
  }
  if (STUDY_BACKED_TYPES.has(String(itemType)) && role === "news") {
    return { itemType, changed: false, incongruentSource: true, reason: "1b: research_finding on a press-release/news source — keep type, seek the study as primary (press release is a corroborator)" };
  }
  return { itemType, changed: false, incongruentSource: false };
}
