// @ts-check
// ════════════════════════════════════════════════════════════════════════════
// 4d — THE OFFICIALNESS GATE  (clean past-nav body read -> path a vs path b)
// Design: docs/design/4d-officialness-gate-design.md. Pure (no I/O, no LLM, no
// fetch), so the property is unit-testable red-then-green under `node --test`.
// ════════════════════════════════════════════════════════════════════════════
//
// NAMING CAVEAT (design §caveat): this REMEDIATION-PIPELINE "4d" (the officialness gate) is DISTINCT from
// floor-attribution.mjs:17's SYSTEM-PROMPT "4d" (the wrong-language original-span rule). Two different
// numberings that happen to collide; keep them apart. This module is the officialness gate ONLY.
//
// WHAT IT SOLVES (§1). 4b (reattributeToFloor) re-homes a FACT to a floor source that verbatim-CONTAINS its
// span, matched by `.includes()` against canonical-fetch's stripText output — which drops <script>/<style>/
// <tags> but KEEPS every visible string: nav menus, breadcrumbs, cookie banners, footer link-lists. So a
// span can "match" a floor source's NAVIGATION CHROME (fabricated provenance), and a slot span can be
// extracted from nav-menu-only text (a topical-looking FACT with no instrument body). 4d inserts a
// CLEAN-BODY read so the span-match (4b) and the primary-FACT decision run against the INSTRUMENT BODY, not
// the chrome — then routes:
//   • path 'a' — official primary instrument past the nav  -> may serve as a primary FACT at its floor tier.
//   • path 'b' — portal / explainer / chrome body          -> NON-PRIMARY (corroborate or 4c-label), NEVER a
//                                                              primary FACT, NEVER a floor re-home target.
//
// THE MOAT (§5), enforced in code below + at the wire:
//   • Never PROMOTE a non-official page to primary because grounding wants a FACT or topical fit is high.
//     Officialness = HOST authority + INSTRUMENT identity, never subject relevance. (path b on missing markers.)
//   • Never DOWNGRADE a real instrument for having chrome. EUR-Lex pages are nav-heavy — we find the body
//     PAST the nav (structural strip + block-density), not "absence of chrome". The test is PRESENCE of an
//     instrument body, not the absence of navigation.
//   • Never fabricate a floor stamp. A span absent from the CLEAN body keeps its honest attribution (the
//     caller walls / relabels) — this module removes the chrome the span could have falsely matched.
//
// PURITY / DEPENDENCY-INJECTION. Host authority-origin tier is INJECTED (opts.hostTier), not derived here:
// deriving it would need host-authority.ts, and a pure .mjs cannot import a relative .ts (glob-portability
// bans it — it breaks the no-npm-ci discipline CI job). The CALLER owns the canonical resolver / host-
// authority and passes the already-resolved tier + the item's authority floor. This mirrors primary-
// fallback.mjs's dep-injection and keeps 4d a pure function of its inputs.
//
// GRACEFUL DEGRADATION. §2 wants RAW html (stripText already lost the structure that identifies chrome).
// When 4d is given raw html it runs the full structural strip + per-block link/text-density drop. When it is
// given ALREADY-FLATTENED text (the stored-excerpt reality at the wire, where the pool carries stripText
// output, not html), there is no structure to strip, so cleanBody ~= the text — and the PATH decision still
// runs on host tier + cleanLen + instrument markers, which survive flattening (a portal / nav-only body
// carries no Article/shall markers either way). The chrome-strip is the bonus that engages when html is in
// hand; the marker+host+length gate is the primary defense and is representation-independent.

import { STUB_MIN_CHARS } from "./primary-fallback.mjs"; // reuse the ONE real-content floor (=200), on the CLEAN body

/** ~0.4 link-density = a link-list / menu block, not prose. One threshold, tunable. */
export const LINK_DENSITY_MAX = 0.4;

/** Flatten html fragment to visible text: drop tags + entities, collapse whitespace.
 *  @param {string} s @returns {string} */
function stripTags(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Non-space char count — density is judged on ink, not whitespace.
 *  @param {string} s @returns {number} */
const inkLen = (s) => String(s ?? "").replace(/\s+/g, "").length;

/**
 * STEP 1 (§2.1) — structural strip on the RAW html: remove script/style/etc AND the chrome containers
 * (<nav>/<header>/<footer>/<aside>, role="navigation", and id|class ~= menu|breadcrumb|cookie|banner|
 * sidebar|footer|skip-link) WITH their contents, BEFORE flattening. No-op on already-flattened text.
 * @param {string|null|undefined} html @returns {string}
 */
function structuralStrip(html) {
  let h = String(html ?? "");
  h = h.replace(/<(script|style|template|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<(\w+)\b[^>]*\brole\s*=\s*["']?navigation["']?[^>]*>[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(
    /<(\w+)\b[^>]*\b(?:id|class)\s*=\s*["'][^"']*(?:menu|breadcrumb|cookie|banner|sidebar|footer|skip-?link)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  return h;
}

/** Break html into candidate blocks at block-level close tags + <br>. Flattened text -> a single block.
 *  @param {string} html @returns {string[]} */
function splitBlocks(html) {
  return String(html ?? "")
    .replace(/<\/(p|li|ul|ol|div|section|article|main|tr|table|h[1-6]|blockquote|dd|dt|figcaption)\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .split("");
}

/**
 * STEP 2 (§2.2) — per-block link/text-density. Compute cleanBody by dropping high-link-density (link-list /
 * menu) blocks; keep prose. Returns { cleanBody, cleanLen, linkDensity } where linkDensity is the WHOLE-page
 * anchor-ink / body-ink ratio (pre-drop) for the audit.
 * @param {string|null|undefined} html
 * @returns {{ cleanBody: string, cleanLen: number, linkDensity: number }}
 */
function cleanBodyOf(html) {
  const stripped = structuralStrip(html);
  let totalInk = 0;
  let totalAnchorInk = 0;
  const kept = [];
  for (const block of splitBlocks(stripped)) {
    const text = stripTags(block);
    const ink = inkLen(text);
    if (ink === 0) continue;
    const anchorText = [...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => stripTags(m[1])).join(" ");
    const anchorInk = inkLen(anchorText);
    totalInk += ink;
    totalAnchorInk += anchorInk;
    const tagCount = (block.match(/<[^>]+>/g) || []).length;
    const linkDensity = ink > 0 ? anchorInk / ink : 0;
    // drop a link-list / menu block: mostly-anchor ink, OR a short high-tag anchored fragment (menu item).
    if (linkDensity >= LINK_DENSITY_MAX) continue;
    if (ink < 30 && anchorInk > 0 && tagCount >= 2) continue;
    kept.push(text);
  }
  const cleanBody = kept.join(" ").replace(/\s+/g, " ").trim();
  const linkDensity = totalInk > 0 ? Math.round((totalAnchorInk / totalInk) * 100) / 100 : 0;
  return { cleanBody, cleanLen: cleanBody.length, linkDensity };
}

// PRIMARY-INSTRUMENT markers (§3, instrument-body axis) — the enacted text's own scaffolding, NOT subject
// words. A strong marker alone qualifies; a Section/paragraph marker qualifies only WITH an obligation verb
// (so a mere "see section" navigation label does not read as an instrument body).
const STRONG_MARKER = /\bArticle\s+\d+\b|\bAnnex\s+[IVXLC]+\b|\bCELEX[:\s]|\bOJ\s+L\s*\d+|\b\d{4}\/\d+\/(?:EU|EC|EEC)\b|\bRecital\s+\d+\b/i;
const SECTION_MARKER = /\bSection\s+\d+\b|\bparagraph\s+\d+\b|\bsub-?paragraph\b|\bpoint\s+\([a-z0-9]+\)/i;
const OBLIGATION_MARKER = /\b(?:shall|must|is required to|are required to|obligation|obligations)\b/i;

/** True when the clean body carries primary-instrument markers (not merely subject relevance).
 *  @param {string|null|undefined} cleanBody @returns {boolean} */
export function hasInstrumentMarkers(cleanBody) {
  const b = String(cleanBody ?? "");
  return STRONG_MARKER.test(b) || (SECTION_MARKER.test(b) && OBLIGATION_MARKER.test(b));
}

/**
 * THE 4d GATE. Read the clean, past-the-nav body of `html` and decide path a (official primary instrument)
 * vs path b (portal / explainer / chrome). PURE.
 *
 * @param {string|null|undefined} html   raw html (full gate) OR already-flattened text (marker+host gate only)
 * @param {string|null|undefined} host   source host (reason context; e.g. eur-lex.europa.eu)
 * @param {{ hostTier?: number|null, floorTier?: number|null }} [opts]
 *        hostTier  — the source's INJECTED authority-origin tier (caller's resolver / defaultTierForHost).
 *        floorTier — the item's authority floor (authorityFloorFor(item_type); null = floor-exempt type).
 * @returns {{ cleanBody: string, cleanLen: number, linkDensity: number, path: 'a'|'b', reason: string }}
 */
export function officialnessOf(html, host, opts = {}) {
  const { hostTier = null, floorTier = null } = opts;
  const { cleanBody, cleanLen, linkDensity } = cleanBodyOf(html);
  const h = String(host ?? "").replace(/^www\./, "").toLowerCase();

  // Host authority-origin axis (§3): the source must clear the item's floor. floorTier null = floor-exempt
  // item type — no authority floor to clear, so this half is vacuously satisfied (the body gate still decides).
  const hostQualifies = floorTier == null || (hostTier != null && hostTier <= floorTier);
  // Instrument-body axis (§3): real content past the nav (>= STUB_MIN_CHARS on the CLEAN body) carrying
  // primary-instrument markers. A page clearing 200ch of RAW text but < 200ch past the nav is chrome.
  const hasBody = cleanLen >= STUB_MIN_CHARS;
  const markers = hasInstrumentMarkers(cleanBody);

  // Path a requires BOTH axes (§3). Any miss -> path b (conservative bias: honest-quarantine > hollow-pass).
  if (hostQualifies && hasBody && markers) {
    return { cleanBody, cleanLen, linkDensity, path: "a", reason: `official_instrument host=${h || "?"}` };
  }
  const reason = !hostQualifies
    ? `sub_floor_host host=${h || "?"} tier=${hostTier == null ? "null" : hostTier} floor=${floorTier}`
    : !hasBody
      ? `chrome_or_stub_body cleanLen=${cleanLen}`
      : `no_instrument_markers cleanLen=${cleanLen}`;
  return { cleanBody, cleanLen, linkDensity, path: "b", reason };
}
