// live-snapshot.mjs (lane GATES-2, 2026-10-05): the browser-side collector. It turns a rendered page into the
// plain-data SNAPSHOT that live-assertions.mjs checks. Not pure (it reads a DOM), but npm-free: the caller
// passes a Playwright `page`. Read-only: it never clicks, types or navigates.

/**
 * Runs INSIDE the browser (serialised by page.evaluate): self-contained, no closure references.
 * @returns the snapshot fields that need the DOM (see live-assertions.mjs checkSnapshot for the shape).
 */
export function collectSnapshotInPage() {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const textNodesOf = (root, cap) => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && out.length < cap; n = walker.nextNode()) {
      if (n.parentElement && SKIP.has(n.parentElement.tagName)) continue;
      const t = squash(n.nodeValue);
      if (t) out.push(t);
    }
    return out;
  };
  // Leaf elements merge the adjacent text nodes React emits for one sentence ("85 items" + " density 0.18").
  const leafTextsOf = (root, cap) => {
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      if (out.length >= cap) break;
      if (SKIP.has(el.tagName) || el.children.length > 0) continue;
      const t = squash(el.textContent);
      if (t) out.push(t);
    }
    return out;
  };

  const blocks = [];
  const across = document.querySelector("#across-pages");
  if (across) blocks.push({ kind: "cross-page", texts: leafTextsOf(across, 400) });
  for (const card of document.querySelectorAll("[data-section-card]")) {
    if (/cluster synthesis/i.test(card.textContent || "")) blocks.push({ kind: "theme-card", texts: leafTextsOf(card, 100) });
  }
  for (const strip of document.querySelectorAll("[data-guard-strip]")) {
    const section = strip.closest("section") || strip;
    if (/themes across the corpus/i.test(section.textContent || "")) blocks.push({ kind: "theme-strip", texts: leafTextsOf(section, 200) });
  }

  const chips = [];
  for (const el of document.querySelectorAll('[data-part^="chip"]')) {
    const t = squash(el.textContent);
    if (t) chips.push(t);
    if (chips.length >= 400) break;
  }
  const tierChips = [];
  for (const el of document.querySelectorAll('[data-part="chip-tier"]')) {
    const t = squash(el.textContent);
    if (t) tierChips.push(t);
    if (tierChips.length >= 400) break;
  }

  // The deepest elements whose text reads as a tier scale ("T1 ... T7").
  const SCALE = /\bT1\b[\s\S]{0,80}\bT\d\b/;
  const scaleTexts = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (SKIP.has(el.tagName)) continue;
    const text = squash(el.textContent);
    if (text.length === 0 || text.length > 400 || !SCALE.test(text)) continue;
    let deeper = false;
    for (const c of el.children) if (SCALE.test(squash(c.textContent))) { deeper = true; break; }
    if (!deeper) scaleTexts.push(text);
    if (scaleTexts.length >= 40) break;
  }

  const h1 = document.querySelector("h1[data-guard-title]") || document.querySelector("h1");
  return {
    pathname: location.pathname,
    origin: location.origin,
    textNodes: textNodesOf(document.body, 6000),
    chips,
    blocks,
    tierChips,
    scaleTexts,
    rowCount: document.querySelectorAll('[data-part="list-row"]').length,
    mastheadTitle: h1 ? squash(h1.textContent) : null,
  };
}

/** Links worth visiting, read from a list page: the first item and the first theme chip. */
export function collectLinksInPage(surface) {
  const skip = new Set(["register", "series"]);
  const isItem = (a) => {
    try {
      const u = new URL(a.href, location.href);
      const parts = u.pathname.split("/").filter(Boolean);
      return u.origin === location.origin && parts.length === 2 && parts[0] === surface && !skip.has(parts[1]);
    } catch {
      return false;
    }
  };
  let first = null;
  const rowLinks = document.querySelectorAll('[data-part="list-row"] a[href]');
  for (const a of rowLinks) if (isItem(a)) { first = new URL(a.href, location.href).pathname; break; }
  if (!first) for (const a of document.querySelectorAll("a[href]")) if (isItem(a)) { first = new URL(a.href, location.href).pathname; break; }
  let chip = null;
  const chipLink = document.querySelector("[data-guard-strip] a[href]");
  if (chipLink) {
    const u = new URL(chipLink.href, location.href);
    if (u.origin === location.origin) chip = u.pathname;
  }
  return { first, chip };
}

/** @param {import('playwright').Page} page */
export async function collectSnapshot(page) {
  return page.evaluate(collectSnapshotInPage);
}

/** @param {import('playwright').Page} page @param {string} surface */
export async function collectLinks(page, surface) {
  return page.evaluate(collectLinksInPage, surface);
}
