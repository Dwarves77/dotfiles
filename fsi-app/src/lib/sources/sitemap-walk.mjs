// @ts-check

import { isFeedDocument, discoveredFeedLinks, feedCandidateUrls } from "./feed-discovery.mjs";
// Content-based bot/access-wall detector (Lane LEDGER-WALLS, 2026-09-04) — this module's own bot-wall
// check above (isBotWallStatus/allProbesBotWalled) is STATUS-code-only (401/403/429) and blind to a 200-OK
// CAPTCHA/challenge/interface-shell page. Reused here, not reimplemented — see access-wall.mjs's own
// header for the "one body" rationale and exactly which patterns it reuses from where.
import { detectAccessWall } from "./access-wall.mjs";
// hostFromUrl — the entity spine's ONE host normalizer (F30's url_host_derivation ratchet,
// docs/specs/08-flywheel-design.md §1.3): lowercased, www-stripped, never throws (unparseable -> "") —
// reused below (only for the access-wall detector's opts.host hint) instead of a second hand-rolled
// `new URL(url).hostname`.
import { hostFromUrl } from "../entities/entity-id.mjs";

/** @typedef {{loc:string, lastmod:string|null, changefreq?:string|null}} SitemapUrlEntry */
/** @typedef {{loc:string, lastmod:string|null}} SitemapIndexEntry */

/** @param {string} url @returns {string|null} */
const safeHost = (url) => hostFromUrl(url) || null;
/** @param {string} url @returns {string|null} */
const safePath = (url) => { try { return new URL(url).pathname; } catch { return null; } };

const strip = (s) =>
  String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// ── bot-wall detection (pure) ─────────────────────────────────────────────────────────────────────────

/** Is the given HTTP status a "blocking" status that suggests a bot wall (Cloudflare, Akamai, etc.)?
 *  PURE. @param {number|null} status @returns {boolean} */
export function isBotWallStatus(status) {
  return status === 401 || status === 403 || status === 429;
}

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
      // Content-based wall check (Lane LEDGER-WALLS, 2026-09-04) — ONLY when the body failed to parse as a
      // sitemap (kind:'unknown'): a 200 OK CAPTCHA/challenge/interface shell served in place of sitemap.xml
      // parses to exactly this shape (no <urlset>/<sitemapindex> tag), and status-based isBotWallStatus
      // cannot see it at all (the response was 200). Additive `wall` field — parsed.kind/queue control flow
      // below is unchanged; only the final "no sitemap discovered" error (below) reads this to say WHY.
      const wall = parsed.kind === "unknown" ? detectAccessWall(xml, { host: safeHost(url), path: safePath(url) }) : null;
      sitemapsFetched.push({
        url, kind: parsed.kind, urlCount: parsed.urlEntries.length, childCount: parsed.sitemapEntries.length, error: null, wall,
      });
      result = parsed;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sitemapsFetched.push({ url, kind: "error", urlCount: 0, childCount: 0, error: message, wall: null });
      result = null;
    }
    fetchCache.set(url, result);
    return result;
  }

  // ── 1. discovery ──
  let robotsLines = [];
  let robotsError = null;
  let robotsStatus = null;
  try {
    const robotsBuf = await deps.fetchBytes(new URL("/robots.txt", baseUrl).toString());
    robotsStatus = 200;
    checkResponseBytes(robotsBuf, maxSitemapResponseBytes, "robots.txt");
    robotsLines = parseRobotsSitemapLines(await decodeXmlBody(robotsBuf, "robots.txt"), baseUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    robotsError = msg;
    robotsStatus = extractHttpStatus(msg);
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

  // Bot-wall detection: homepage (robots.txt) and every fallback candidate are 401/403/429
  //
  // BUG FOUND WHILE READING THIS FILE IN FULL (lane SITEMAP-3, 2026-09-04, doctrine "no small follow-up
  // fix, fix it now"): this line called `sitemapsFallbackCandidates` — undefined; the exported function
  // (line ~160) is `sitemapFallbackCandidates` (no "s" after "sitemap"). `&&` short-circuits, so the
  // ReferenceError only threw when `isBotWallStatus(robotsStatus)` was already true — i.e. exactly the
  // case this branch exists to detect (a site that bot-walls its OWN robots.txt, e.g. a Cloudflare/Akamai
  // challenge in front of everything, not just the sitemap paths) — the one path meant to name a bot wall
  // instead crashed the whole walk with an unrelated-looking exception. No existing test exercised a
  // robots.txt fetch itself returning 401/403/429 (every prior bot-wall test 404s/403s the FALLBACK
  // candidates only, with robots.txt answering 200); regression test added below.
  const fallbackProbes = sitemapsFetched.filter((s) => s.url !== "robots.txt" && s.kind === "error");
  if (
    isBotWallStatus(robotsStatus) &&
    sitemapFallbackCandidates(baseUrl).every((c) => fallbackProbes.some((p) => p.url === c && isBotWallStatus(extractHttpStatus(p.error))))
  ) {
    return {
      ok: false, baseUrl,
      error: `bot_wall detected: homepage returned HTTP ${robotsStatus} and all fallback candidates answered 401/403/429`,
      sitemapsFetched, robotsSitemapCount: 0, discoverySource: "bot_wall", sitemapsSkippedCap: 0, entriesCapped: false,
    };
  }

  if (!queue.length) {
    // A 200-OK content wall on one of the fallback candidates (kind:'unknown' + wall set, attached above)
    // is a MORE SPECIFIC diagnosis than the generic "none parsed as a sitemap" — name it when present,
    // rather than reporting it as indistinguishable from "this site genuinely has no sitemap.xml".
    const contentWalled = sitemapsFetched.find((s) => s.wall);
    if (contentWalled) {
      return {
        ok: false, baseUrl,
        error: `bot_wall detected: ${contentWalled.url} returned a 200 OK ${contentWalled.wall.kind} shell in place of a sitemap`,
        sitemapsFetched, robotsSitemapCount: 0, discoverySource: "bot_wall", sitemapsSkippedCap: 0, entriesCapped: false,
      };
    }
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

/** Extract HTTP status from an error message, e.g., "HTTP 404 for https://..." -> 404, or null if not extractable.
 *  PURE. @param {string} msg @returns {number|null} */
function extractHttpStatus(msg) {
  const m = String(msg ?? "").match(/HTTP (\d+)/);
  return m ? Number(m[1]) : null;
}

/** Probe one candidate URL: fetch (bounded), decode, and report whether it parses as a feed document.
 *  Never throws — a fetch/decode failure (404, timeout, oversize) is treated as "not a feed" so the
 *  caller's candidate loop keeps going.
 *  @param {{fetchBytes:(url:string)=>Promise<Buffer>}} deps
 *  @param {string} url @param {number} maxBytes
 *  @returns {Promise<{text:string|null, status:number|null, isFeed:boolean, reason:string}>}
 *           the decoded text (if it is a feed), HTTP status (if extractable), feed flag, and probe reason */
export async function probeIsFeed(deps, url, maxBytes) {
  try {
    const buf = await deps.fetchBytes(url);
    checkResponseBytes(buf, maxBytes, url);
    const text = await decodeXmlBody(buf, url);
    const isFeed = isFeedDocument(text);
    return { text: isFeed ? text : null, status: 200, isFeed, reason: isFeed ? "is_feed_document" : "not_feed_document" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = extractHttpStatus(msg);
    const reason = status ? `HTTP ${status}` : (msg.includes("bytes") ? "oversize_response" : "fetch_error");
    return { text: null, status, isFeed: false, reason };
  }
}

/**
 * Locate a feed for `sourceUrl`, per the operator's discovery order: (1) is the source URL itself a feed
 * document? (2) a `<link rel=alternate>` tag on its homepage, or one of the operator's named common feed
 * paths (`feed-discovery.mjs`) — first candidate that actually parses as a feed wins. Returns `null` when
 * none is found (the caller then proceeds to sitemap discovery — see `walkSource`). One fetch of
 * `sourceUrl` serves BOTH the "is it a feed itself" check and (when it isn't) the homepage HTML that
 * `discoveredFeedLinks` reads — never fetched twice.
 *
 * Returns detailed feed-probe trail: homepage {status, bytes, alternateLinksFound} and each candidate
 * {url, status, isFeedDocument, reason} so no evidence of what discovery tried is lost (see EVIDENCE,
 * lane SITEMAP 2026-09-04).
 * @param {{fetchBytes:(url:string)=>Promise<Buffer>}} deps
 * @param {{ sourceUrl:string, maxFeedResponseBytes?:number }} opts
 * @returns {Promise<{
 *   feedUrl:string,
 *   discoverySource:'source-is-feed'|'link-alternate'|'candidate-path',
 *   homepageProbe:{status:number|null, bytes:number, contentType:string, alternateLinksFound:number, error:string|null, wall:{kind:string,evidence:string}|null},
 *   candidateProbes:Array<{url:string, status:number|null, isFeedDocument:boolean, reason:string}>
 * }|null>}
 */
export async function discoverFeed(deps, { sourceUrl, maxFeedResponseBytes = DEFAULT_MAX_FEED_RESPONSE_BYTES }) {
  let homepageHtml = "";
  let homepageError = null;
  let homepageStatus = null;
  let homepageBytes = 0;
  let homepageContentType = "";
  try {
    const buf = await deps.fetchBytes(sourceUrl);
    homepageBytes = Buffer.isBuffer(buf) ? buf.length : Buffer.byteLength(String(buf ?? ""), "utf8");
    // fetchBytes throws on non-200; capture the success code since we got the buffer
    homepageStatus = 200;
    checkResponseBytes(buf, maxFeedResponseBytes, sourceUrl);
    homepageHtml = await decodeXmlBody(buf, sourceUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    homepageError = msg;
    homepageStatus = extractHttpStatus(msg);
  }

  const alternateLinksFound = homepageHtml ? discoveredFeedLinks(homepageHtml, sourceUrl).length : 0;
  // Content-based wall check (additive — a 401/403/429 homepage never reaches here at all, since
  // deps.fetchBytes already threw and homepageHtml is ""; this only ever fires on a 200 OK that IS a
  // CAPTCHA/challenge/interface shell, the blind spot isBotWallStatus cannot see).
  const homepageWall = homepageHtml ? detectAccessWall(homepageHtml, { host: safeHost(sourceUrl), path: safePath(sourceUrl) }) : null;
  const homepageProbe = { status: homepageStatus, bytes: homepageBytes, contentType: homepageContentType, alternateLinksFound, error: homepageError, wall: homepageWall };

  if (homepageHtml && isFeedDocument(homepageHtml)) {
    return {
      feedUrl: sourceUrl,
      discoverySource: "source-is-feed",
      homepageProbe,
      candidateProbes: [],
    };
  }

  const linkCandidates = homepageHtml ? discoveredFeedLinks(homepageHtml, sourceUrl) : [];
  const pathCandidates = feedCandidateUrls(sourceUrl, sourceContentPath(sourceUrl));
  const candidates = [...new Set([...linkCandidates, ...pathCandidates])];
  const linkSet = new Set(linkCandidates);
  const candidateProbes = [];

  for (const candidate of candidates) {
    const probeResult = await probeIsFeed(deps, candidate, maxFeedResponseBytes);
    candidateProbes.push({
      url: candidate,
      status: probeResult.status,
      isFeedDocument: probeResult.isFeed,
      reason: probeResult.reason,
    });
    if (probeResult.isFeed) {
      return {
        feedUrl: candidate,
        discoverySource: linkSet.has(candidate) ? "link-alternate" : "candidate-path",
        homepageProbe,
        candidateProbes,
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
