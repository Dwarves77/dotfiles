// Entity gate — decides whether a source's first-fetch should MINT an intelligence_item.
// THE PRINCIPLE (source != item): a portal / navigational homepage (the source's own ROOT URL)
// is a SOURCE, not an item. Its actual regulations become items via scan/monitoring of its
// CONTENTS (deep document URLs) — never by minting the homepage as an item. The leak:
// migration-065 + drain-first-fetch mint ONE item per source UNCONDITIONALLY, so every portal
// homepage became a garbage item.
//
// Deterministic pre-gate FIRST (no AI): a root / trivial-landing URL is almost certainly the
// portal homepage — caught without the classifier (and without the classifier's defaulting bug).
// The Haiku entity_verdict is the backstop for genuinely-ambiguous DEEP urls.
//
// HONEST-INCONCLUSIVE (the bug-class, inverted): the classifier's uncertainty must map to
// 'uncertain' -> DO NOT MINT (flag for review), NOT to a confident document type. first-fetch
// line 191 (Haiku unsure -> default item_type "regulation") is a non-answer mapped to a
// substantive POSITIVE — the same shape as fetch-failure -> negative, here failure -> positive.

export const ENTITY = Object.freeze({ DOCUMENT: "document", PORTAL: "portal", UNCERTAIN: "uncertain" });

// Deterministic: is the URL the source's own root / a trivial landing page (portal homepage)?
// Root ("https://host", "/") or a single shallow landing segment (/en, /home, /index.html).
export function urlIsRoot(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return true; // "https://host" or "https://host/"
  if (segs.length === 1 && !u.search &&
      /^(en|en-us|en-gb|fr|de|es|pt|it|home|index(\.[a-z0-9]+)?|default(\.[a-z0-9]+)?|main|portal|start|welcome)$/i.test(segs[0])) {
    return true;
  }
  return false; // a deep path -> a specific document (Haiku refines)
}

// Combine the deterministic pre-gate with the Haiku entity verdict.
// haikuVerdict in {'specific_document','portal','uncertain'} or undefined (absent/failed).
export function entityVerdict({ url, haikuVerdict } = {}) {
  if (urlIsRoot(url)) return ENTITY.PORTAL;            // deterministic: root URL = portal homepage
  if (haikuVerdict === "portal") return ENTITY.PORTAL;
  if (haikuVerdict === "specific_document") return ENTITY.DOCUMENT;
  return ENTITY.UNCERTAIN;                              // unsure/absent -> HONEST-INCONCLUSIVE, do NOT mint
}

// Should first-fetch MINT an item? Only for a confident specific document.
export function shouldMintItem(input) {
  return entityVerdict(input) === ENTITY.DOCUMENT;
}
