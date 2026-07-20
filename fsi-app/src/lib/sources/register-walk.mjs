// @ts-check
// register-walk — B2 of the scrape-and-build plan (docs/plans/scrape-and-build-content-plan-2026-07-19.md):
// the date-paged REGISTER index walk. A register (the EUR-Lex Official Journal, the Federal Register)
// publishes a dated index of every instrument; walking the index by date enumerates documents the
// portal-homepage crawl never sees. Both walkers FEED THE SAME LEDGER B1 consumes (persistPortalCandidates
// is injected — the ONE write-site stays one), so downstream (classify → intake chokepoint) is unchanged.
//
// REUSES: extractPortalLinks (the OJ daily view is HTML — the same extractor B1's harvest proved live;
// the ledger's UNIQUE-url dedup makes the repeated site chrome free, only NEW instruments land per day),
// the FR API host routing already codified in transport-escalation's apiEndpointFor (federalregister.gov
// → /api/v1 — no key required), and the hold gate (the live runner threads assertFetchAllowed + the F16
// caller through the injected fetchers; the walkers themselves are PURE + dep-injected, no network here).
//
// BOUNDED BY CONSTRUCTION: an explicit from/to date range, per-page cap, maxPages cap, and a per-walk
// summary that reports what was NOT collected (pages beyond the cap) — no silent truncation of a walk.
import { extractPortalLinks } from "./portal-links.mjs";

// ── pure builders ────────────────────────────────────────────────────────────────────────────────────

/** EUR-Lex OJ daily-view URL for an ISO date (the register page for that day's Official Journal).
 *  @param {string} isoDate YYYY-MM-DD @param {string} [series] L (legislation) | C (information)
 *  @returns {string} */
export function ojDailyViewUrl(isoDate, series = "L") {
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`ojDailyViewUrl: bad ISO date ${isoDate}`);
  const [, y, mo, d] = m;
  return `https://eur-lex.europa.eu/oj/daily-view/${series}-series/default.html?ojDate=${d}${mo}${y}`;
}

/** Federal Register documents.json index URL (public API, no key).
 *  @param {{from:string, to:string, page?:number, perPage?:number, types?:string[], term?:string}} p
 *  @returns {string} */
export function frDocumentsUrl({ from, to, page = 1, perPage = 100, types = ["RULE"], term }) {
  for (const d of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error(`frDocumentsUrl: bad ISO date ${d}`);
  }
  const q = new URLSearchParams();
  q.set("conditions[publication_date][gte]", from);
  q.set("conditions[publication_date][lte]", to);
  for (const t of types) q.append("conditions[type][]", t);
  if (term) q.set("conditions[term]", term);
  q.set("per_page", String(Math.min(perPage, 1000)));
  q.set("page", String(page));
  q.set("order", "oldest");
  for (const f of ["html_url", "title", "type", "publication_date", "document_number"]) q.append("fields[]", f);
  return `https://www.federalregister.gov/api/v1/documents.json?${q.toString()}`;
}

/** FR API results → the ledger's PortalLink shape (html_url + title as the anchor hint).
 *  Rows without an https html_url are dropped (the ledger holds fetchable candidates only).
 *  @param {{results?: Array<{html_url?:string, title?:string, type?:string, publication_date?:string}>}} json
 *  @returns {Array<{url:string, anchorText:string|null}>} */
export function frDocsToLinks(json) {
  const out = [];
  for (const r of json?.results ?? []) {
    if (typeof r.html_url !== "string" || !/^https:\/\//i.test(r.html_url)) continue;
    const bits = [r.title, r.type && r.publication_date ? `${r.type} ${r.publication_date}` : null].filter(Boolean);
    out.push({ url: r.html_url, anchorText: bits.length ? String(bits.join(" — ")).slice(0, 300) : null });
  }
  return out;
}

/** Inclusive ISO-date iterator (UTC calendar days). Throws on a reversed range (>366 days refused —
 *  a register walk is a bounded run, not an unbounded backfill).
 *  @param {string} fromIso @param {string} toIso @returns {string[]} */
export function dateRange(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`), to = new Date(`${toIso}T00:00:00Z`);
  if (isNaN(+from) || isNaN(+to)) throw new Error(`dateRange: bad dates ${fromIso}..${toIso}`);
  if (from > to) throw new Error(`dateRange: from ${fromIso} after to ${toIso}`);
  const days = Math.round((+to - +from) / 86_400_000) + 1;
  if (days > 366) throw new Error(`dateRange: ${days} days — refuse unbounded walks (cap 366)`);
  const out = [];
  for (let t = +from; t <= +to; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// ── walkers (dep-injected; no network in this module) ────────────────────────────────────────────────

/**
 * Walk the EUR-Lex OJ daily views for a date range: per day, fetch the daily-view HTML (injected,
 * free direct in the live binding) → extractPortalLinks → persist (injected — B1's ONE write-site).
 * A fetch failure on one day is recorded and the walk continues (a register day can 404 on weekends —
 * absence of an OJ is a normal outcome, not an error).
 *
 * UNCAPPED BY DEFAULT (R2 no-cap rule, 2026-07-20): a free enumeration is never capped. `extractPortalLinks`
 * hardcodes DEFAULT_CAP=40; a daily view routinely lists more than 40 instruments, so passing the default
 * would silently floor a busy OJ day. This walker passes `cap` (default Infinity — no ceiling) so every day
 * walks to the full extent of what its HTML lists. A caller may still pass a finite `cap` for a probe.
 * @param {{fetchHtml:(url:string)=>Promise<string>, persist:(links:Array<{url:string,anchorText?:string|null}>)=>Promise<{upserted:number,failed:number}>}} deps
 * @param {{from:string, to:string, series?:string, cap?:number}} opts
 */
export async function walkEurlexOj(deps, { from, to, series = "L", cap = Infinity }) {
  const days = [];
  let upserted = 0, failed = 0;
  for (const day of dateRange(from, to)) {
    const url = ojDailyViewUrl(day, series);
    try {
      const html = await deps.fetchHtml(url);
      const links = extractPortalLinks(html, url, { cap });
      const p = await deps.persist(links);
      upserted += p.upserted; failed += p.failed;
      days.push({ day, url, extracted: links.length, upserted: p.upserted, error: null });
    } catch (e) {
      days.push({ day, url, extracted: 0, upserted: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { register: "eurlex-oj", series, from, to, days, upserted, failed };
}

/**
 * Walk the Federal Register documents index for a date range: paged JSON (injected fetch) →
 * frDocsToLinks → persist. Bounded by maxPages; when the index has MORE pages than the cap, the
 * summary says so explicitly (droppedPages / totalPages) — a bounded walk is never a silent one.
 * @param {{fetchJson:(url:string)=>Promise<any>, persist:(links:Array<{url:string,anchorText?:string|null}>)=>Promise<{upserted:number,failed:number}>}} deps
 * @param {{from:string, to:string, types?:string[], term?:string, perPage?:number, maxPages?:number}} opts
 */
export async function walkFederalRegister(deps, { from, to, types = ["RULE"], term, perPage = 100, maxPages = 5 }) {
  dateRange(from, to); // validates + bounds the range
  const pages = [];
  let upserted = 0, failed = 0, totalCount = null, totalPages = null;
  for (let page = 1; page <= maxPages; page++) {
    const url = frDocumentsUrl({ from, to, page, perPage, types, term });
    const json = await deps.fetchJson(url);
    totalCount = typeof json?.count === "number" ? json.count : totalCount;
    totalPages = typeof json?.total_pages === "number" ? json.total_pages : totalPages;
    const links = frDocsToLinks(json);
    const p = await deps.persist(links);
    upserted += p.upserted; failed += p.failed;
    pages.push({ page, url, results: links.length, upserted: p.upserted });
    if (!json?.next_page_url || (totalPages != null && page >= totalPages)) break;
  }
  const walked = pages.length;
  const droppedPages = totalPages != null && totalPages > walked ? totalPages - walked : 0;
  return { register: "federal-register", from, to, types, term: term ?? null, pages, upserted, failed, totalCount, totalPages, droppedPages };
}
