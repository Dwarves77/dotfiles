// @ts-check
// sitemap-walk — the third source-sweep walker (lane SITEMAP, 2026-09-04): the operator's "RSS where a
// site has it, otherwise snapshot the sitemap.xml and diff it against the previous snapshot" pattern.
// register-walk.mjs walks two FIXED registers (EUR-Lex OJ, Federal Register); feed-walk.mjs walks ONE
// feed a caller names. Neither covers what most of the 959 active `sources` rows actually are: a
// regulator WEBSITE with no feed. This module is that third leg — `walkSource` runs the operator's
// discovery order (feed FIRST, sitemap only when no feed exists) and `walkSitemap` is the bounded
// sitemap.xml/sitemap_index.xml enumerator either path can be pointed at.
//
// PORTED FROM mreflow/control-center lib/sitemap.ts (MIT, (c) 2026 Matt Wolfe) — see
// THIRD-PARTY-NOTICES.md for the license text. Operator ruling, 2026-09-04, verbatim: "if this person
// already did the coding and it's on github I want you to find it and use that code if it's good ... if
// its other code is better than ours use it or adjust ours to match." The comparison, function by
// function (full accounting in the lane's report, not restated per-line here):
//   PORTED (control-center more complete):
//     - response-byte bounding (`checkResponseBytes`, mirrors `readBoundedResponseText`'s cap, values
//       taken from control-center's `SITEMAP_MAX_RESPONSE_BYTES`/`FEED_MAX_RESPONSE_BYTES`) — our prior
//       draft had no cap at all, so an unbounded response would buffer fully before any check.
//     - a SEPARATE entry-count budget (`DEFAULT_MAX_SITEMAP_ENTRIES`, mirrors `DEFAULT_SITEMAP_ENTRY_LIMIT`)
//       distinct from the document-fetch budget — our prior draft only bounded documents fetched, so a
//       single enormous urlset (no index fan-out at all) had no entry-count ceiling.
//     - path scoping (`sourceContentPath`/`isUrlWithinSourcePath`/`filterEntriesForSource`, ported near-
//       verbatim from `sourceContentPath`/`isUrlWithinSourcePath`/`filterSitemapEntriesForSource`) — our
//       prior draft had no scoping at all, so a source registered under one path of a large regulator
//       site would have its census candidates swallowed by the site's WHOLE sitemap.
//     - deferred-baseline-on-partial-coverage (`nextSitemapSnapshotUrls`'s two rules: no snapshot at all
//       on a first, incomplete walk; MERGE into the prior snapshot rather than replace it on a later,
//       incomplete walk) — our prior draft always overwrote the snapshot with whatever the walk saw,
//       which on a partial walk would read every URL missed this time as "removed" next time.
//   KEPT OURS (already as complete, or a better fit for this repo):
//     - transport: the repo's own polite fetch (`assertFetchAllowed`/`makePoliteFetch`, `fetch-hold.mjs`)
//       via dependency injection — control-center's fetcher is a bare `fetch` wrapper with no hold gate.
//     - gzip: `promisify(node:zlib.gunzip)`, this repo's existing house style (`snapshot-store.mjs`'s
//       `gunzipAsync`) — control-center streams through `createGunzip()` piped from a Readable; ours is
//       simpler because the walker already receives a whole Buffer from its injected fetch (see
//       fetch-hold.mjs's own contract) rather than a raw `Response` stream, so there is no streaming
//       decompression to do.
//     - XML parsing: tag-content regex, tolerant of both quote styles and any lastmod granularity, no
//       new dependency — control-center depends on `fast-xml-parser`; this repo's house style (matches
//       feed-walk.mjs's identical approach) avoids the dependency entirely for the same tag shapes.
//     - the census/change-signal write contract (`persist`/`recordChange`/`saveSnapshot` injected,
//       feeding `portal_link_candidates` + `monitoring_queue` through run-source-sweep.mjs's existing
//       mirrored writers) and `snapshot-store.mjs`'s rule-015-reversible-snapshot CONVENTION (sha256 +
//       gzip, house style) — control-center's own snapshot store is a local-disk atomic-rename JSON file
//       (`writeFileAtomically`), meaningless for a stateless GitHub Actions dispatch; the live binding
//       (run-source-sweep.mjs) reuses `snapshot-store.mjs`'s primitives against Supabase Storage instead
//       — see that file's own header for exactly where, and why the shared `raw_fetches` DB TABLE (not
//       just the bucket) is deliberately NOT touched (a real consumer-collision risk, rule B1).
//   NOT PORTED (not superior for this repo's architecture; not a gap):
//     - `parseFeed`/`observeUndatedFeedStories` (control-center's LiveStory-shaped feed parser + its
//       "quietly baseline undated entries once" logic) — this repo's `feed-walk.mjs` already has its own
//       `parseFeedEntries` feeding the SAME idempotent, UNIQUE-url upsert ledger every walker in this
//       family writes to; a re-seen undated entry is already a harmless no-op refresh there, which is
//       exactly the failure `observeUndatedFeedStories` exists to prevent for a live-story LIST (a
//       different consumer shape this repo does not have). See feed-discovery.mjs's own header.
//     - the Next.js/server/file-store parts of control-center's `lib/server/rss.ts` and `writeFileAtomically`
//       (local-disk atomic rename) — server-only, filesystem-only, not applicable to a pure/dep-injected
//       module or a stateless Actions dispatch.
//
// PURE + DEP-INJECTED, same discipline as feed-walk.mjs / register-walk.mjs: no network, no Supabase, no
// `mode` branching in here at all — a caller's injected functions decide what "dry" vs "apply" means
// (mirrors run-source-sweep.mjs's own `persist` closure, which counts in dry mode and writes in apply;
// see that file for the live binding). This module only orchestrates discover -> fetch -> parse -> scope
// -> diff -> report.
//
// DISCOVERY ORDER (operator's brief, `walkSource`): (1) is the source URL ITSELF a feed document? (2) a
// `<link rel=alternate type=rss|atom|...>` tag on its homepage, or one of the operator's named common
// feed paths (`feed-discovery.mjs`'s `FEED_CANDIDATE_PATHS`) — first candidate that actually parses as a
// feed wins. Only when NO feed is found: (3) robots.txt `Sitemap:` directive lines — a site MAY declare
// several; every one is walked. (4) If robots.txt is absent, errors, or declares none: the three
// conventional fallback paths, tried IN ORDER, stopping at the first that both fetches and parses as a
// real sitemap root (`<urlset>` or `<sitemapindex>`) — trying all three unconditionally would risk
// double-counting the same catalogue under two guessed URLs.
//
// BOUNDED FAN-OUT (documented cap, not silent truncation — the register-walk.mjs/walkFederalRegister
// idiom of "bounded by construction, with what was NOT collected reported"). A `<sitemapindex>` can name
// thousands of child sitemaps; nested indexes (an index pointing to further indexes) are rare but legal.
// `walkSitemap` runs ONE flat FIFO queue over every sitemap URL it ever needs to fetch — top-level
// discovered URLs, then any `<sitemapindex>` children as they're dequeued — and spends TWO shared
// budgets: `opts.maxSitemapFetches` (documents; default `DEFAULT_MAX_SITEMAP_FETCHES` = 50) and
// `opts.maxSitemapEntries` (raw URL entries accumulated across every leaf document; default
// `DEFAULT_MAX_SITEMAP_ENTRIES` = 100,000, mirrors control-center's own `DEFAULT_SITEMAP_ENTRY_LIMIT`).
// Either budget running out stops the walk and reports `sitemapsSkippedCap` (documents still queued) and
// `entriesCapped` (which budget stopped it), never silently.
//
// GZIP (.xml.gz). See "KEPT OURS" above — `decodeXmlBody` uses `promisify(node:zlib.gunzip)`, the same
// pattern `snapshot-store.mjs`'s `gunzipAsync` already establishes as house style.
//
// LASTMOD IS KEPT AS A RAW STRING, NEVER PARSED TO A DATE. The sitemap protocol's `<lastmod>` accepts
// several W3C-datetime granularities (`YYYY-MM-DD` through fractional-second-with-offset) and real sites
// mix them. A byte-for-byte string compare of "the value most recently seen for this loc" is exactly what
// a snapshot-diff needs (did the publisher say something different this time?) and sidesteps every
// timezone/precision-normalisation bug a Date parse would invite for zero benefit to that question.
//
// COVERAGE + DEFERRED BASELINE. `coverageComplete` is true only when every sitemap document fetched
// cleanly, neither budget was exhausted, and `limit` did not truncate the scoped entry set. When it is
// false: (a) `removedLocs` is NEVER reported (a document this walk failed to reach cannot honestly be
// told apart from a document whose URLs genuinely disappeared — control-center's own caveat, extended
// here to the fetch-failure case as well as the `limit` case our prior draft already documented); (b) the
// snapshot write is DEFERRED entirely on a source's first walk (no baseline yet — writing a partial set
// as if it were the complete catalogue would make every URL the NEXT, possibly-complete walk sees for the
// first time read as "new" a second time), or MERGED into the prior snapshot on a later walk (a URL this
// walk didn't reach keeps its last-known lastmod rather than vanishing from the record).
//
// WHAT THIS MODULE NEVER DOES: write anywhere. Every effect — the census-candidate ledger write for a
// newly discovered loc, the "this source may have changed" signal for a changed lastmod, the snapshot
// read/write — is an injected function; see `walkSitemap`'s own doc for the exact shapes and what the
// live binding (`run-source-sweep.mjs`) does with each.

import { isFeedDocument, discoveredFeedLinks, feedCandidateUrls } from "./feed-discovery.mjs";

/** @typedef {{loc:string, lastmod:string|null, changefreq?:string|null}} SitemapUrlEntry */
/** @typedef {{loc:string, lastmod:string|null}} SitemapIndexEntry */

const strip = (s) =>
  String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// ── discovery: robots.txt + fallback candidates (pure) ──────────────────────────────────────────────────

/** Parse `Sitemap:` directive lines out of a robots.txt body (case-insensitive directive name, per the
 *  robots.txt convention every major crawler follows — it is not part of the original robots.txt spec but
 *  is universal practice). Relative values (rare, but seen in the wild) are resolved against `baseUrl`;
 *  a value that does not resolve to an absolute HTTPS URL is dropped, never thrown — https-only, matching
 *  feed-walk.mjs's/register-walk.mjs's own policy (the ledger holds fetchable, non-downgradeable candidates).
 *  @param {string} robotsTxt @param {string} baseUrl @returns {string[]} */
export function parseRobotsSitemapLines(robotsTxt, baseUrl) {
  const out = [];
  for (const line of String(robotsTxt ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S.*?)\s*$/i);
    if (!m) continue;
    try {
      const u = new URL(m[1], baseUrl);
      if (u.protocol === "https:") out.push(u.toString());
    } catch { /* malformed directive value — skip, never throw */ }
  }
  return out;
}

/** The three conventional fallback sitemap paths, in the order they are tried. PURE.
 *  @param {string} baseUrl @returns {string[]} */
export function sitemapFallbackCandidates(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
}

// ── path scoping (PORTED from control-center's sourceContentPath/isUrlWithinSourcePath/
//    filterSitemapEntriesForSource — "keep entries near-verbatim, adapt naming to this file's own
//    generic-entry shape rather than its LiveStory-specific one). ─────────────────────────────────────────

/** The path a source is scoped to, or `''` when the source is registered at its bare origin (or looks
 *  like a syndication endpoint itself, e.g. a source URL that is already a `.xml`/`.json`/`/feed` path —
 *  scoping THAT would scope nothing meaningfully, so it is treated the same as "no scope"). PURE.
 *  @param {string} sourceUrl @returns {string} */
export function sourceContentPath(sourceUrl) {
  const url = new URL(sourceUrl);
  const pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (pathname === "/" || /\.(?:xml|rss|atom|json|gz)$/i.test(pathname) || /\/(?:feed|rss|atom)\/?$/i.test(pathname)) return "";
  return pathname;
}

/** Is `candidateUrl` within the source's scoped path (same host, path equal to or nested under the
 *  scope)? A source with no scope (bare origin) admits everything on the same host. PURE.
 *  @param {string} candidateUrl @param {string} sourceUrl @returns {boolean} */
export function isUrlWithinSourcePath(candidateUrl, sourceUrl) {
  const scope = sourceContentPath(sourceUrl);
  if (!scope) return true;
  try {
    const candidate = new URL(candidateUrl);
    const source = new URL(sourceUrl);
    const normHost = (h) => h.toLowerCase().replace(/^www\./, "");
    if (normHost(candidate.hostname) !== normHost(source.hostname)) return false;
    const pathname = candidate.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    return pathname === scope || pathname.startsWith(`${scope}/`);
  } catch {
    return false;
  }
}

/** Scope a batch of `{loc, ...}` entries to `sourceUrl`'s own path — a regulator's whole domain is not
 *  swallowed by one source row scoped to a subsection of it. A no-scope source is unfiltered (identity).
 *  Generic over any entry carrying a `loc` field (works for both `SitemapUrlEntry` and `SitemapIndexEntry`).
 *  PURE. @template {{loc:string}} T @param {T[]} entries @param {string} sourceUrl @returns {T[]} */
export function filterEntriesForSource(entries, sourceUrl) {
  return sourceContentPath(sourceUrl) ? entries.filter((e) => isUrlWithinSourcePath(e.loc, sourceUrl)) : entries;
}

// ── gzip tolerance (pure given bytes) ────────────────────────────────────────────────────────────────────

/** @param {string} url @returns {boolean} */
export function looksGzippedUrl(url) {
  return /\.gz(?:[?#].*)?$/i.test(String(url ?? ""));
}

/** GZIP magic bytes (`1f 8b`) — catches a `.xml.gz` resource served without the extension surviving in
 *  the URL (a redirect, a rewritten path) as well as the common case. @param {Buffer} buf @returns {boolean} */
export function looksGzippedBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Decode a fetched sitemap body to text, gunzipping first when the URL or the magic bytes say it is
 *  gzipped. The one CPU-only (no I/O) async step in this module — see the file header for why the
 *  decompression itself is inlined rather than imported. @param {Buffer} buf @param {string} url */
export async function decodeXmlBody(buf, url) {
  if (looksGzippedUrl(url) || looksGzippedBuffer(buf)) {
    const { gunzip } = await import("node:zlib");
    const { promisify } = await import("node:util");
    const out = await promisify(gunzip)(buf);
    return out.toString("utf8");
  }
  return Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf ?? "");
}

// ── response-byte bounding (PORTED from control-center's readBoundedResponseText — adapted to a whole-
//    Buffer check rather than a streaming reader, since this module's injected fetch already returns a
//    complete Buffer; see the file header's "KEPT OURS" note on why streaming truncation is not needed
//    here). ─────────────────────────────────────────────────────────────────────────────────────────────

/** Mirrors control-center's SITEMAP_MAX_RESPONSE_BYTES (50 MB). */
export const DEFAULT_MAX_SITEMAP_RESPONSE_BYTES = 50 * 1024 * 1024;
/** Mirrors control-center's FEED_MAX_RESPONSE_BYTES (10 MB) — used while PROBING a feed candidate. */
export const DEFAULT_MAX_FEED_RESPONSE_BYTES = 10_000_000;

/** Throw if `buf` is over `maxBytes`. A bound checked AFTER a whole-Buffer fetch (not a streaming cancel
 *  mid-read, unlike control-center's own `readBoundedResponseText`) — see the file header. PURE given the
 *  buffer. @param {Buffer|string} buf @param {number} maxBytes @param {string} url */
export function checkResponseBytes(buf, maxBytes, url) {
  const len = Buffer.isBuffer(buf) ? buf.length : Buffer.byteLength(String(buf ?? ""), "utf8");
  if (len > maxBytes) {
    throw new Error(`response for ${url} is ${len.toLocaleString()} bytes, over the ${maxBytes.toLocaleString()}-byte bound`);
  }
}

// ── sitemap XML parsing (pure, tag-content regex — house style, no XML dep; see feed-walk.mjs's identical
//    approach) — tolerant of both quote styles on any attribute (xmlns='...' vs xmlns="...") because the
//    extractors below never read attributes at all, only element TEXT content. ─────────────────────────────

/** Which sitemap protocol root this document declares, or 'unknown' when neither tag is present (an
 *  error page served with a 200, a non-sitemap XML document, ...). @param {string} xml @returns {'urlset'|'sitemapindex'|'unknown'} */
export function sitemapRootKind(xml) {
  const s = String(xml ?? "");
  if (/<sitemapindex[\s>]/i.test(s)) return "sitemapindex";
  if (/<urlset[\s>]/i.test(s)) return "urlset";
  return "unknown";
}

/** First inner text of `tag` within `block`, or null. @param {string} block @param {string} tag */
function inner(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? strip(m[1]) : null;
}

/** Parse `<urlset><url>...</url>...</urlset>` entries. Entries without an https `<loc>` are dropped
 *  (mirrors feed-walk.mjs's `parseFeedEntries` / register-walk.mjs's `frDocsToLinks`, both https-only:
 *  the walk holds fetchable candidates only).
 *  @param {string} xml @returns {SitemapUrlEntry[]} */
export function parseUrlsetEntries(xml) {
  const out = [];
  const blocks = String(xml ?? "").match(/<url[\s>][\s\S]*?<\/url>/gi) ?? [];
  for (const b of blocks) {
    const loc = inner(b, "loc");
    if (!loc || !/^https:\/\//i.test(loc)) continue;
    out.push({ loc, lastmod: inner(b, "lastmod"), changefreq: inner(b, "changefreq") });
  }
  return out;
}

/** Parse `<sitemapindex><sitemap>...</sitemap>...</sitemapindex>` entries (child sitemap references).
 *  @param {string} xml @returns {SitemapIndexEntry[]} */
export function parseSitemapIndexEntries(xml) {
  const out = [];
  const blocks = String(xml ?? "").match(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi) ?? [];
  for (const b of blocks) {
    const loc = inner(b, "loc");
    if (!loc || !/^https:\/\//i.test(loc)) continue;
    out.push({ loc, lastmod: inner(b, "lastmod") });
  }
  return out;
}

/** Parse one sitemap document, dispatching on its declared root. Never throws on a malformed/foreign
 *  document — returns `kind:'unknown'` with both entry arrays empty, exactly like an empty-but-honest read.
 *  @param {string} xml @returns {{kind:'urlset'|'sitemapindex'|'unknown', urlEntries:SitemapUrlEntry[], sitemapEntries:SitemapIndexEntry[]}} */
export function parseSitemapXml(xml) {
  const kind = sitemapRootKind(xml);
  if (kind === "urlset") return { kind, urlEntries: parseUrlsetEntries(xml), sitemapEntries: [] };
  if (kind === "sitemapindex") return { kind, urlEntries: [], sitemapEntries: parseSitemapIndexEntries(xml) };
  return { kind, urlEntries: [], sitemapEntries: [] };
}

// ── dedupe + diff (pure) ──────────────────────────────────────────────────────────────────────────────────

/** First-loc-wins dedupe (a URL can legally appear in more than one child sitemap under one index; the
 *  first sighting is kept so fan-out order, not sitemap-file order, decides which lastmod is reported).
 *  @param {SitemapUrlEntry[]} entries @returns {SitemapUrlEntry[]} */
export function dedupeByLoc(entries) {
  const seen = new Map();
  for (const e of entries) if (!seen.has(e.loc)) seen.set(e.loc, e);
  return [...seen.values()];
}

/**
 * Diff the current walked URL set against the previous snapshot: new locs, locs whose lastmod string
 * changed, locs that dropped out entirely. `previous` is `null` on a source's first-ever walk — every
 * current loc is then reported `added`, never `changed` (there is nothing to compare a first sighting
 * against) and `removed` is empty. Callers decide whether `removed` is safe to REPORT (see `walkSitemap`'s
 * `coverageComplete` gate) — this function always computes it truthfully against what it was given.
 * @param {SitemapUrlEntry[]|null} previous @param {SitemapUrlEntry[]} current
 * @returns {{ added:SitemapUrlEntry[], changed:Array<{loc:string, previousLastmod:string|null, currentLastmod:string|null}>, removed:SitemapUrlEntry[] }}
 */
export function diffUrlSet(previous, current) {
  const prevByLoc = new Map((previous ?? []).map((e) => [e.loc, e]));
  const curByLoc = new Map(current.map((e) => [e.loc, e]));
  const added = [];
  const changed = [];
  for (const e of current) {
    const p = prevByLoc.get(e.loc);
    if (!p) { added.push(e); continue; }
    if ((p.lastmod ?? null) !== (e.lastmod ?? null)) {
      changed.push({ loc: e.loc, previousLastmod: p.lastmod ?? null, currentLastmod: e.lastmod ?? null });
    }
  }
  const removed = previous == null ? [] : previous.filter((e) => !curByLoc.has(e.loc));
  return { added, changed, removed };
}

/** Merge a partial-coverage walk's current entries into the prior snapshot: a loc this walk didn't reach
 *  keeps its last-known lastmod (never silently dropped from the record); a loc this walk DID see is
 *  overwritten with its fresh value. PORTED from control-center's `nextSitemapSnapshotUrls`'s merge branch
 *  (`{...previousUrls, ...currentUrls}`), adapted from a Record<url,lastmod> to this file's entry-array
 *  shape. PURE. @param {SitemapUrlEntry[]|null} previous @param {SitemapUrlEntry[]} current @returns {SitemapUrlEntry[]} */
export function mergeSnapshotEntries(previous, current) {
  const merged = new Map((previous ?? []).map((e) => [e.loc, e]));
  for (const e of current) merged.set(e.loc, e);
  return [...merged.values()];
}

// ── the sitemap walker ────────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_SITEMAP_FETCHES = 50;
/** Mirrors control-center's DEFAULT_SITEMAP_ENTRY_LIMIT — bounds raw URL entries accumulated across every
 *  leaf document fetched this walk, independent of `DEFAULT_MAX_SITEMAP_FETCHES` (a document-count budget). */
export const DEFAULT_MAX_SITEMAP_ENTRIES = 100_000;

/**
 * Walk one source's sitemap: discover (robots.txt, else fallback candidates) -> fan out through any
 * sitemap index, bounded by both a document budget and an entry budget -> collect+dedupe url entries ->
 * scope to the source's own path -> diff against the previous snapshot (injected read) -> report
 * new/changed/removed and hand new locs to the injected ledger write. Never throws on a per-sitemap
 * fetch/parse failure (recorded per entry, the walk continues); returns `ok:false` only when NO sitemap
 * could be discovered or fetched at all.
 *
 * @param {{
 *   fetchBytes: (url:string) => Promise<Buffer>,
 *   getPreviousSnapshot: () => Promise<SitemapUrlEntry[]|null>,
 *   saveSnapshot: (entries:SitemapUrlEntry[]) => Promise<void>,
 *   persist: (links:Array<{url:string, anchorText?:string|null}>) => Promise<{upserted:number, failed:number}>,
 *   recordChange: (changed:Array<{loc:string, previousLastmod:string|null, currentLastmod:string|null}>) => Promise<void>,
 * }} deps  every effect is injected; see the file header for what the live binding does with each
 * @param {{ baseUrl:string, maxSitemapFetches?:number, maxSitemapEntries?:number, maxSitemapResponseBytes?:number, limit?:number }} opts
 *   `baseUrl` doubles as the SCOPING url (`sourceContentPath(baseUrl)`) — the source's own registered URL,
 *   not necessarily the sitemap root. `limit` bounds how many SCOPED, CURRENT url entries are
 *   diffed/persisted this run (protects a single dispatch against a source whose sitemap lists far more
 *   URLs than one run should write) — distinct from `maxSitemapFetches`/`maxSitemapEntries`, which bound
 *   the WALK itself. A `limit` that truncates also marks `coverageComplete: false` (see the file header).
 */
export async function walkSitemap(deps, {
  baseUrl,
  maxSitemapFetches = DEFAULT_MAX_SITEMAP_FETCHES,
  maxSitemapEntries = DEFAULT_MAX_SITEMAP_ENTRIES,
  maxSitemapResponseBytes = DEFAULT_MAX_SITEMAP_RESPONSE_BYTES,
  limit = Infinity,
}) {
  /** @type {Array<{url:string, kind:string, urlCount:number, childCount:number, error:string|null}>} */
  const sitemapsFetched = [];

  // Memoized so a sitemap URL that turns up twice (discovery's own winning fallback probe, then handed
  // straight into the fan-out queue; or two different index files naming the same child) is fetched once.
  const fetchCache = new Map();
  async function fetchAndParse(url) {
    if (fetchCache.has(url)) return fetchCache.get(url);
    let result;
    try {
      const buf = await deps.fetchBytes(url);
      checkResponseBytes(buf, maxSitemapResponseBytes, url);
      const xml = await decodeXmlBody(buf, url);
      const parsed = parseSitemapXml(xml);
      sitemapsFetched.push({
        url, kind: parsed.kind, urlCount: parsed.urlEntries.length, childCount: parsed.sitemapEntries.length, error: null,
      });
      result = parsed;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sitemapsFetched.push({ url, kind: "error", urlCount: 0, childCount: 0, error: message });
      result = null;
    }
    fetchCache.set(url, result);
    return result;
  }

  // ── 1. discovery ──
  let robotsLines = [];
  let robotsError = null;
  try {
    const robotsBuf = await deps.fetchBytes(new URL("/robots.txt", baseUrl).toString());
    checkResponseBytes(robotsBuf, maxSitemapResponseBytes, "robots.txt");
    robotsLines = parseRobotsSitemapLines(await decodeXmlBody(robotsBuf, "robots.txt"), baseUrl);
  } catch (e) {
    robotsError = e instanceof Error ? e.message : String(e); // absent/blocked robots.txt is not fatal
  }

  /** @type {string[]} */
  let queue = [];
  let discoverySource = "none";
  if (robotsLines.length) {
    queue = [...new Set(robotsLines)]; // robots.txt itself can repeat a Sitemap: line — dedupe up front
    discoverySource = "robots";
  } else {
    for (const candidate of sitemapFallbackCandidates(baseUrl)) {
      const parsed = await fetchAndParse(candidate);
      if (parsed && parsed.kind !== "unknown") {
        queue = [candidate];
        discoverySource = "fallback";
        break; // first successful, parseable candidate wins — never try all three unconditionally
      }
    }
  }

  if (!queue.length) {
    return {
      ok: false, baseUrl,
      error: `no sitemap discovered: robots.txt yielded 0 Sitemap: lines (${robotsError ?? "fetched, none declared"}) and none of the fallback candidates parsed as a sitemap`,
      sitemapsFetched, robotsSitemapCount: 0, discoverySource, sitemapsSkippedCap: 0, entriesCapped: false,
    };
  }

  // ── 2. bounded fan-out over the flat queue (indexes enqueue their children; leaves accumulate urls).
  //        TWO budgets: maxSitemapFetches (documents) and maxSitemapEntries (raw url entries, across every
  //        leaf document) — either exhausting stops the walk; both are reported, never silent. ──
  /** @type {SitemapUrlEntry[]} */
  const rawUrlEntries = [];
  let budget = maxSitemapFetches;
  let skippedCap = 0;
  let entriesCapped = false;
  const queued = new Set(queue);
  while (queue.length) {
    if (rawUrlEntries.length >= maxSitemapEntries) {
      entriesCapped = true;
      skippedCap += queue.length;
      break;
    }
    const url = queue.shift();
    if (budget <= 0) { skippedCap++; continue; }
    budget--;
    const parsed = await fetchAndParse(url);
    if (!parsed) continue;
    if (parsed.kind === "urlset") {
      rawUrlEntries.push(...parsed.urlEntries);
    } else if (parsed.kind === "sitemapindex") {
      for (const child of parsed.sitemapEntries) {
        if (!queued.has(child.loc)) { queued.add(child.loc); queue.push(child.loc); }
      }
    }
  }

  // ── 3. dedupe -> scope to the source's own path (filterEntriesForSource) -> cap the SCOPED entry count
  //        (opts.limit — distinct from the two walk-time budgets above). ──
  const deduped = dedupeByLoc(rawUrlEntries);
  const scopedAll = filterEntriesForSource(deduped, baseUrl);
  const scopedOutCount = deduped.length - scopedAll.length;
  const current = scopedAll.slice(0, limit);
  const urlsOverLimit = scopedAll.length - current.length;

  // Coverage is COMPLETE only when nothing was skipped for either budget, no document errored, and
  // `limit` did not truncate the scoped set — every downstream honesty gate (removed-reporting, baseline
  // deferral) reads this one flag. See the file header's "COVERAGE + DEFERRED BASELINE" section.
  const coverageComplete =
    skippedCap === 0 && !entriesCapped && urlsOverLimit === 0 && sitemapsFetched.every((s) => s.kind !== "error");

  // ── 4. diff against the previous snapshot (injected read — see snapshot-store.mjs's convention in the
  //        live binding for what "previous" means there) ──
  const previous = await deps.getPreviousSnapshot();
  const diff = diffUrlSet(previous, current);
  // removed is only ever REPORTED when coverage was complete — a document this walk failed to reach (or a
  // `limit` truncation) cannot be told apart from a loc that genuinely disappeared (see file header).
  const removedLocs = coverageComplete ? diff.removed.map((e) => e.loc) : [];
  const removedSuppressed = !coverageComplete && diff.removed.length > 0;

  // ── 5. effects: new locs -> the census-candidate ledger; a changed lastmod -> the change signal —
  //        BOTH unconditional (a partial walk still discovered real URLs/real lastmod differences; only
  //        the SNAPSHOT WRITE below is gated on coverage). the walked set -> the next snapshot, deferred
  //        or merged on partial coverage (never a silent overwrite that would manufacture false "removed"
  //        or false "new" reports on a later, more complete walk). ──
  const persistResult = await deps.persist(
    diff.added.map((e) => ({ url: e.loc, anchorText: e.lastmod ? `lastmod ${e.lastmod}` : null }))
  );
  if (diff.changed.length) await deps.recordChange(diff.changed);

  let baselineDeferred = false;
  /** @type {SitemapUrlEntry[]|null} */
  let nextSnapshot = null;
  if (previous == null) {
    if (coverageComplete) nextSnapshot = current;
    else baselineDeferred = true; // first walk, partial coverage — no baseline written yet (see header)
  } else {
    nextSnapshot = coverageComplete ? current : mergeSnapshotEntries(previous, current);
  }
  if (nextSnapshot) await deps.saveSnapshot(nextSnapshot);

  return {
    ok: true, baseUrl,
    sitemapsFetched, robotsSitemapCount: robotsLines.length, discoverySource,
    sitemapsSkippedCap: skippedCap, entriesCapped, maxSitemapEntries,
    scopedOutCount,
    urlCount: current.length, urlsOverLimit,
    coverageComplete, baselineDeferred,
    diff: { addedCount: diff.added.length, changedCount: diff.changed.length, removedCount: removedLocs.length },
    changedLocs: diff.changed,
    removedLocs, removedSuppressed,
    upserted: persistResult.upserted, failed: persistResult.failed,
    changeRecorded: diff.changed.length > 0,
  };
}

// ── feed-first discovery, then sitemap (the operator's own ordering) ────────────────────────────────────

/** Probe one candidate URL: fetch (bounded), decode, and report whether it parses as a feed document.
 *  Never throws — a fetch/decode failure (404, timeout, oversize) is treated as "not a feed" so the
 *  caller's candidate loop keeps going. @param {{fetchBytes:(url:string)=>Promise<Buffer>}} deps
 *  @param {string} url @param {number} maxBytes @returns {Promise<string|null>} the decoded text if it is
 *  a feed, else null */
export async function probeIsFeed(deps, url, maxBytes) {
  try {
    const buf = await deps.fetchBytes(url);
    checkResponseBytes(buf, maxBytes, url);
    const text = await decodeXmlBody(buf, url);
    return isFeedDocument(text) ? text : null;
  } catch {
    return null;
  }
}

/**
 * Locate a feed for `sourceUrl`, per the operator's discovery order: (1) is the source URL itself a feed
 * document? (2) a `<link rel=alternate>` tag on its homepage, or one of the operator's named common feed
 * paths (`feed-discovery.mjs`) — first candidate that actually parses as a feed wins. Returns `null` when
 * none is found (the caller then proceeds to sitemap discovery — see `walkSource`). One fetch of
 * `sourceUrl` serves BOTH the "is it a feed itself" check and (when it isn't) the homepage HTML that
 * `discoveredFeedLinks` reads — never fetched twice.
 * @param {{fetchBytes:(url:string)=>Promise<Buffer>}} deps
 * @param {{ sourceUrl:string, maxFeedResponseBytes?:number }} opts
 * @returns {Promise<{feedUrl:string, discoverySource:'source-is-feed'|'link-alternate'|'candidate-path', homepageError:string|null}|null>}
 */
export async function discoverFeed(deps, { sourceUrl, maxFeedResponseBytes = DEFAULT_MAX_FEED_RESPONSE_BYTES }) {
  let homepageHtml = "";
  let homepageError = null;
  try {
    const buf = await deps.fetchBytes(sourceUrl);
    checkResponseBytes(buf, maxFeedResponseBytes, sourceUrl);
    homepageHtml = await decodeXmlBody(buf, sourceUrl);
  } catch (e) {
    homepageError = e instanceof Error ? e.message : String(e); // non-fatal — candidate probing still runs
  }

  if (homepageHtml && isFeedDocument(homepageHtml)) {
    return { feedUrl: sourceUrl, discoverySource: "source-is-feed", homepageError: null };
  }

  const linkCandidates = homepageHtml ? discoveredFeedLinks(homepageHtml, sourceUrl) : [];
  const pathCandidates = feedCandidateUrls(sourceUrl, sourceContentPath(sourceUrl));
  const candidates = [...new Set([...linkCandidates, ...pathCandidates])];
  const linkSet = new Set(linkCandidates);

  for (const candidate of candidates) {
    const text = await probeIsFeed(deps, candidate, maxFeedResponseBytes);
    if (text) {
      return {
        feedUrl: candidate,
        discoverySource: linkSet.has(candidate) ? "link-alternate" : "candidate-path",
        homepageError,
      };
    }
  }
  return null;
}

/**
 * The top-level orchestrator: feed discovery FIRST, sitemap walk only when no feed is found. Returns
 * `{kind:'feed', feedUrl, discoverySource}` — the CALLER (run-source-sweep.mjs) dispatches this to
 * feed-walk.mjs's own `walkFeed`, records `feedUrl` on the artifact, and writes it through the source
 * registry's existing writer (see run-source-sweep.mjs's header) — this module never walks a feed itself,
 * matching feed-walk.mjs's own single-write-site discipline. Otherwise returns
 * `{kind:'sitemap', ...walkSitemap's own result}` — the sitemap walk (discover, fetch, scope, diff,
 * persist) already happened by the time this returns.
 * @param {Parameters<typeof walkSitemap>[0] & Parameters<typeof discoverFeed>[0]} deps
 * @param {{ sourceUrl:string, maxSitemapFetches?:number, maxSitemapEntries?:number, maxSitemapResponseBytes?:number, maxFeedResponseBytes?:number, limit?:number }} opts
 */
export async function walkSource(deps, opts) {
  const feed = await discoverFeed(deps, { sourceUrl: opts.sourceUrl, maxFeedResponseBytes: opts.maxFeedResponseBytes });
  if (feed) return { kind: "feed", ...feed };
  const sitemap = await walkSitemap(deps, {
    baseUrl: opts.sourceUrl,
    maxSitemapFetches: opts.maxSitemapFetches,
    maxSitemapEntries: opts.maxSitemapEntries,
    maxSitemapResponseBytes: opts.maxSitemapResponseBytes,
    limit: opts.limit,
  });
  return { kind: "sitemap", ...sitemap };
}
