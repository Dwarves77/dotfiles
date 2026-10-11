const INSTRUMENT_RE = /\b(regulation|regulations|directive|legislation|law|laws|act|acts|statute|decree|ordinance|rulemaking|rule|rules|standard|standards|guidance|circular|notice|consultation|docket|bill|amendment|oj|eli|celex|federal[-_ ]?register|official[-_ ]?journal|compliance|enforcement)\b/i;

/** Path segments that are never instruments (nav / chrome / assets / socials). */
const EXCLUDE_RE = /\.(css|js|png|jpe?g|gif|svg|ico|woff2?|mp4|zip)(\?|$)|\/(about|contact|careers|jobs|privacy|cookies|accessibility|sitemap|search|login|signin|account|newsletter|subscribe|rss|feed)\b|^(mailto|tel|javascript):/i;

const DEFAULT_CAP = 40;

/**
 * Extract candidate instrument deep links from portal HTML.
 * @param {string} html      rendered page HTML
 * @param {string} portalUrl the portal's own URL (host filter + relative resolution)
 * @param {{cap?: number}} [opts]
 * @returns {Array<{url: string, anchorText: string}>} deduped, same-host, capped
 */
export function extractPortalLinks(html, portalUrl, opts = {}) {
  const cap = opts.cap ?? DEFAULT_CAP;
  let base;
  try { base = new URL(String(portalUrl)); } catch { return []; }
  const portalHost = base.host.replace(/^www\./, "").toLowerCase();
  const seen = new Set();
  const out = [];
  const anchorRe = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(String(html ?? ""))) !== null && out.length < cap) {
    const rawHref = (m[2] ?? m[3] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#")) continue;
    if (EXCLUDE_RE.test(rawHref)) continue;
    let resolved;
    try { resolved = new URL(rawHref, base); } catch { continue; }
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
    // Same-host only: cross-host links are new-SOURCE leads, not this portal's instruments.
    if (resolved.host.replace(/^www\./, "").toLowerCase() !== portalHost) continue;
    resolved.hash = "";
    const url = resolved.toString().replace(/\/$/, "");
    // The portal root itself (or a bare re-link to it) is not a deep link.
    if (url === base.toString().replace(/\/$/, "")) continue;
    if (resolved.pathname === "/" || resolved.pathname === "") continue;
    const anchorText = m[4].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    // Instrument signal must appear in the PATH or the ANCHOR TEXT.
    if (!INSTRUMENT_RE.test(resolved.pathname) && !INSTRUMENT_RE.test(anchorText)) continue;
    if (EXCLUDE_RE.test(resolved.pathname)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, anchorText });
  }
  return out;
}
