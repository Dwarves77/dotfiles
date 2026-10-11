// @ts-check
/** Does `text` look like an RSS/Atom/RDF feed document? Checks only the first 1500 chars (the root
 *  element always appears early; a large trailing body is not a signal either way and would only slow
 *  a hot discovery-probe loop). PURE. @param {string} text @returns {boolean} */

export function isFeedDocument(text) {
  return /<(?:rss|feed|(?:[\w-]+:)?RDF)[\s>]/i.test(String(text ?? "").slice(0, 1500));
}

/** Read one HTML attribute's value off a single already-extracted `<tag ...>` string, tolerating both
 *  quote styles and an unquoted value. @param {string} tag @param {string} name @returns {string} */
function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] || match?.[2] || match?.[3] || "";
}

/** @param {string} href @param {string} base @returns {string} */
function absoluteLink(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

/** The feed MIME types a `<link rel="alternate" type="...">` tag may declare, per control-center's own
 *  set (RSS, Atom, RDF, and the generic `text/xml`/`application/xml` some publishers use instead). */
const FEED_LINK_TYPE_RE = /^(?:application\/(?:rss\+xml|atom\+xml|rdf\+xml|xml)|text\/xml)$/;

/** Every `<link>` tag in `html` declaring a feed MIME type, resolved to absolute URLs against `base`.
 *  Does not require `rel="alternate"` (control-center's own regex does not gate on it either — some
 *  publishers omit `rel` on an otherwise-unambiguous feed `<link type="application/rss+xml">`). PURE.
 *  @param {string} html @param {string} base @returns {string[]} */
export function discoveredFeedLinks(html, base) {
  const out = [];
  for (const [tag] of String(html ?? "").matchAll(/<link\b[^>]*>/gi)) {
    const type = htmlAttribute(tag, "type").toLowerCase();
    if (!FEED_LINK_TYPE_RE.test(type)) continue;
    const href = htmlAttribute(tag, "href");
    const abs = href ? absoluteLink(href, base) : "";
    if (abs) out.push(abs);
  }
  return out;
}

/** The operator's named fallback list (verbatim, in the order given): common feed paths a site may
 *  serve without ever declaring a `<link rel="alternate">` tag. */
export const FEED_CANDIDATE_PATHS = Object.freeze(["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml"]);

/** Build the ordered feed-candidate URL list for a source: path-scoped candidates FIRST (when the source
 *  is registered under a specific path, not the bare origin — `scopePath` is `sourceContentPath(sourceUrl)`,
 *  injected by the caller so this module stays free of any import cycle with sitemap-walk.mjs), then the
 *  bare-origin candidates. Deduped, order-preserving. PURE.
 *  @param {string} sourceUrl @param {string} [scopePath] '' when the source has no deep scope
 *  @returns {string[]} */
export function feedCandidateUrls(sourceUrl, scopePath = "") {
  const origin = new URL(sourceUrl).origin;
  const scoped = scopePath ? FEED_CANDIDATE_PATHS.map((suffix) => `${origin}${scopePath}${suffix}`) : [];
  const bare = FEED_CANDIDATE_PATHS.map((suffix) => `${origin}${suffix}`);
  return [...new Set([...scoped, ...bare])];
}
