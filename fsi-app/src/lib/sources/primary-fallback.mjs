// src/lib/sources/primary-fallback.mjs
//
// ROADBLOCK → BOUNDED ALTERNATIVE-SOURCE SEARCH → SAME-FLOOR QUALIFICATION.
// The mechanical form of env-policy's "find replacements when canonical sources break", wired into the
// canonical fetch path so BOTH generate and reground inherit it.
//
// THE CARVED PRINCIPLE (architecture, not a check): this module is DISCOVERY-ONLY. It widens which
// sources are TRIED; it NEVER resolves a tier, stamps a fact, or decides grounding. Qualification stays
// 100% in the existing F1 chain — buildResolver (host→canonical tier) + validate_item_provenance
// criterion-3 per-type floor — UNCHANGED. A found alternative becomes a "primary" ONLY by emergently
// clearing the unchanged floor; there is no code path here that promotes it. So the F1 regression
// (primary times out → search returns a law-firm explainer → secondary grounds a reg fact) is
// structurally foreclosed: the explainer resolves T5/T6 and the floor rejects it, exactly as today.
//
// detectRoadblock + targetLangRatio are PURE (CI-unit-tested — the roadblocked-vs-partial line is the
// gate). fetchPrimaryWithFallback is dep-injected (browserlessFetch + webSearchAlternatives) so it is
// testable without network. GOVERNING: remediation-discipline (Section 4 — roadblock resilience) +
// source-credibility-model (qualification) + env-policy (find replacements).

// Thresholds (DEFAULTS, tunable). One bar, not two: the stub bar == the pool's existing usability bar.
export const STUB_MIN_CHARS = 200;     // < this extracted text = stub/roadblock (matches pool >200ch usability)
export const MIN_LANG_RATIO = 0.6;     // < this target-language (ASCII) ratio = wrong-language-only
export const CHALLENGE_MAX_CHARS = 1500; // a challenge page is short; a real 5000ch article that mentions
                                         // "cloudflare" must NOT trip — so challenge markers only count below this.
const CHALLENGE_RE = /just a moment|performing security verification|enable javascript|access denied|attention required|cloudflare|captcha|ddos protection/i;

/** Cheap target-language (English) proxy: fraction of ASCII chars. RECORDED in the audit, never trusted
 *  silently — ASCII-ratio misfires on table/code-heavy English and Latin-script foreign text. */
export function targetLangRatio(text) {
  const s = String(text || "");
  if (!s.length) return 0;
  const ascii = (s.match(/[\x00-\x7F]/g) || []).length;
  return ascii / s.length;
}

/** PURE roadblock detector. Trips ONLY on unambiguous no-usable-content signals. A fetch that returns
 *  >=200ch of real in-language content is SUCCESS (possibly PARTIAL) — never a roadblock; missing facts
 *  on a real partial go to COUNSEL, not an alternative hunt. Bias: ambiguous → "primary succeeded"
 *  (a false-roadblock is a provenance downgrade, worse than a thin real primary). */
export function detectRoadblock(text, { httpStatus = 200, timedOut = false } = {}) {
  const s = String(text || "");
  const len = s.trim().length;
  const langRatio = targetLangRatio(s);
  if (timedOut) return { roadblocked: true, reason: "timeout", len, langRatio };
  if (httpStatus >= 400) return { roadblocked: true, reason: `http_${httpStatus}`, len, langRatio };
  // empty / JS-shell stub — below the pool usability bar.
  if (len < STUB_MIN_CHARS) {
    return { roadblocked: true, reason: CHALLENGE_RE.test(s) ? "challenge_stub" : "empty_stub", len, langRatio };
  }
  // challenge page that rendered a short body ABOVE the stub bar (e.g. iso.org 376ch "Just a moment…",
  // dpiit 245ch "Access Denied"): challenge marker + short body. Long real articles are exempt.
  if (len < CHALLENGE_MAX_CHARS && CHALLENGE_RE.test(s.slice(0, 600))) {
    return { roadblocked: true, reason: "challenge_stub", len, langRatio };
  }
  // substantial but wrong-language-only — can't carry in-language (English) verbatim fact spans.
  if (langRatio < MIN_LANG_RATIO) return { roadblocked: true, reason: "wrong_language_only", len, langRatio };
  // >= 200ch real in-language content = SUCCESS (possibly partial). NOT a roadblock.
  return { roadblocked: false, reason: "ok", len, langRatio };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Bounded single fetch: race the injected fetcher against a hard per-fetch timeout. NEVER retries a
 *  roadblocked URL (a roadblock is persistent; re-polling a dead URL is the 120s×5 waste). */
async function boundedFetch(fetchFn, url, ms) {
  const TIMEOUT = Symbol("timeout");
  try {
    const r = await Promise.race([
      Promise.resolve().then(() => fetchFn(url)),
      new Promise((res) => setTimeout(() => res(TIMEOUT), ms)),
    ]);
    if (r === TIMEOUT) return { text: "", status: 200, timedOut: true };
    return { text: (r && r.text) || "", status: (r && r.status) || 200, timedOut: false };
  } catch (e) {
    return { text: "", status: (e && e.status) || 0, timedOut: false, err: String((e && e.message) || e) };
  }
}

/**
 * Try the declared primary; on a genuine ROADBLOCK, run a bounded search for OFFICIAL alternative
 * sources and try them. Returns usable content + a full audit trail. DOES NOT resolve tiers / decide
 * counsel — the caller adds the returned content to the pool (where resolver+floor qualify it) and,
 * on no-ground, writes the counsel record using `alternatives` + the post-ground tier.
 *
 * deps: {
 *   browserlessFetch(url) -> { text, status? },
 *   webSearchAlternatives(title, itemType, reason) -> string[]  // aims at OFFICIAL English primary pages,
 *                                                                // NOT summaries/commentary,
 *   perFetchMs = 20000, maxAlts = 3
 * }
 * returns {
 *   ok, url, text, roadblocked, primaryReason, fellBack, langRatio,
 *   alternatives: [{ url, len, langRatio, reason, role: 'declared_primary'|'alternative' }]
 * }
 */
export async function fetchPrimaryWithFallback({ title, primaryUrl, itemType }, deps) {
  const { browserlessFetch, webSearchAlternatives, perFetchMs = 20000, maxAlts = 3 } = deps;
  const alternatives = [];

  // 1. declared primary (bounded, no retry).
  const p = await boundedFetch(browserlessFetch, primaryUrl, perFetchMs);
  const pd = detectRoadblock(p.text, { httpStatus: p.status, timedOut: p.timedOut });
  alternatives.push({ url: primaryUrl, len: pd.len, langRatio: round2(pd.langRatio), reason: pd.reason, role: "declared_primary" });
  if (!pd.roadblocked) {
    return { ok: true, url: primaryUrl, text: p.text, roadblocked: false, primaryReason: pd.reason, fellBack: false, langRatio: round2(pd.langRatio), alternatives };
  }

  // 2. ROADBLOCK → bounded official-alternative search. The query aims at the regulator's OWN English
  //    page / authoritative text, never an English summary (a summary resolves sub-floor anyway).
  let altUrls = [];
  try { altUrls = (await webSearchAlternatives(title, itemType, pd.reason)) || []; } catch { altUrls = []; }
  altUrls = [...new Set(altUrls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u) && u !== primaryUrl))];

  for (const u of altUrls.slice(0, maxAlts)) {
    const r = await boundedFetch(browserlessFetch, u, perFetchMs);
    const d = detectRoadblock(r.text, { httpStatus: r.status, timedOut: r.timedOut });
    alternatives.push({ url: u, len: d.len, langRatio: round2(d.langRatio), reason: d.reason, role: "alternative" });
    if (!d.roadblocked) {
      return { ok: true, url: u, text: r.text, roadblocked: true, primaryReason: pd.reason, fellBack: true, langRatio: round2(d.langRatio), alternatives };
    }
  }

  // 3. no fetchable alternative — caller honest-exits. result split (NO_SOURCE_FOUND vs _QUALIFIED) is
  //    decided by the caller AFTER grounding, from `alternatives` + the post-ground resolved tier.
  return { ok: false, url: primaryUrl, text: "", roadblocked: true, primaryReason: pd.reason, fellBack: true, langRatio: round2(pd.langRatio), alternatives };
}
