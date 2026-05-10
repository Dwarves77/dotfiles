/**
 * wave1-api-discovery.mjs — Wave 1a gate 4 discovery probe (read-only).
 *
 * Purpose: discover structured-access methods (RSS/Atom, REST API, sitemap)
 * for the 691 sources currently on access_method='scrape'. Plus re-probe the
 * 4 already-rss sources to flag stale/incomplete metadata. Output is a
 * recommendation-only JSON for operator review (gate 4); a separate writer
 * script (scripts/wave1-apply-discovery.mjs, gate 5) applies the routing.
 *
 * NO DB WRITES. Read-only against external endpoints AND Supabase.
 *
 * Probe order per source:
 *   1. Tier-1 known-regulator allowlist (skip blind probing)
 *   2. HTML home-page fetch + <link rel="alternate" type="application/rss+xml">
 *   3. Common RSS paths: /rss, /feed, /atom.xml, /rss.xml, /feed.xml, /feed/atom
 *   4. Sitemap: /sitemap.xml, /sitemap_index.xml
 *   5. API paths (only if 1-4 yielded nothing): /api, /api/v1, /api.json
 *
 * Politeness:
 *   - 5 sources in parallel max
 *   - Sequential probes within a source (natural per-host rate limit)
 *   - 250ms inter-probe delay per source
 *   - 15s probe timeout, 60s per-source total budget
 *   - Honor Retry-After on 429; abort source after second 429
 *   - User-Agent: caros-ledge-discovery/1.0 (jasonlosh@gmail.com)
 *
 * Output: docs/wave1-api-discovery-2026-05-08.json
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

// Capture unhandled rejections so a single bad source doesn't kill the run
// silently. Initial run aborted between 675/695 — adding visible logging.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const UA = "caros-ledge-discovery/1.0 (jasonlosh@gmail.com)";
const PROBE_TIMEOUT_MS = 15000;
const SOURCE_BUDGET_MS = 60000;
const INTER_PROBE_DELAY_MS = 250;
const CONCURRENCY = 5;

// ── Tier-1 known-regulator allowlist ────────────────────────────────────
// Domain → recommended routing. Skips blind probing. Confidence high.
const ALLOWLIST = {
  "federalregister.gov": {
    method: "api_rest",
    endpoint: "https://www.federalregister.gov/api/v1",
    rss: "https://www.federalregister.gov/documents/full_text_search.rss",
    auth: "none",
    notes: "Public REST API + RSS feed. No auth required.",
  },
  "regulations.gov": {
    method: "api_rest",
    endpoint: "https://api.regulations.gov/v4/documents",
    auth: "api_key_header",
    notes: "X-Api-Key header. REGULATIONS_GOV_API_KEY env var configured.",
  },
  "eur-lex.europa.eu": {
    method: "api_soap",
    endpoint: "https://eur-lex.europa.eu/EURLexWebService",
    rss: "https://eur-lex.europa.eu/EN/display-feed.rss",
    auth: "registration",
    notes: "SPARQL webservice + L-series OJ RSS feed. Configured.",
  },
  "consilium.europa.eu": {
    method: "rss",
    endpoint: "https://www.consilium.europa.eu/en/press/press-releases/",
    rss: "https://www.consilium.europa.eu/en/press/press-releases/?language=en&Format=rss",
    notes: "Council of EU RSS — verified per CURRENT_SKILL.md.",
  },
  "ec.europa.eu": {
    method: "rss",
    endpoint: "https://ec.europa.eu/commission/presscorner/home/en",
    rss: "https://ec.europa.eu/commission/presscorner/api/notifications/rss",
    notes: "Commission Press Corner RSS. May require alt path.",
  },
  "climate.ec.europa.eu": {
    method: "html_scrape",
    notes: "DG CLIMA pages — no public feed/API. Scrape with sitemap aid.",
  },
  "imo.org": {
    method: "html_scrape",
    notes: "Public IMO pages. No public API (per B.0c deferral). Scrape only.",
  },
  "icao.int": {
    method: "html_scrape",
    notes: "ICAO public pages — no public API. Scrape.",
  },
  "unfccc.int": {
    method: "html_scrape",
    notes: "UNFCCC NDC Registry / news — no canonical public API.",
  },
  "iea.org": {
    method: "html_scrape",
    notes: "IEA Policies and Measures DB — public site, no open API at scale.",
  },
  "carbonpricingdashboard.worldbank.org": {
    method: "html_scrape",
    notes: "World Bank Carbon Pricing Dashboard — interactive site.",
  },
  "climate-laws.org": {
    method: "html_scrape",
    notes: "LSE Sabin tracker — site search, no public API.",
  },
  "epa.gov": {
    method: "html_scrape",
    notes: "EPA regulator pages. Envirofacts has API but rule pages are scrape.",
  },
  "legislation.gov.uk": {
    method: "api_rest",
    endpoint: "https://www.legislation.gov.uk/...?format=xml",
    notes: "?format=xml suffix gives structured response on most paths.",
  },
  "data.cdp.net": {
    method: "api_rest",
    endpoint: "https://data.cdp.net/resource/<resource>.json",
    notes: "Socrata API — already configured.",
  },
  "nrel.gov": {
    method: "api_rest",
    endpoint: "https://developer.nrel.gov",
    auth: "api_key_query",
    notes: "NREL_API_KEY in query string. Already configured.",
  },
  "eia.gov": {
    method: "api_rest",
    endpoint: "https://api.eia.gov/v2",
    auth: "api_key_query",
    notes: "EIA_API_KEY in query string. Already configured.",
  },
  "ilostat.ilo.org": {
    method: "api_rest",
    endpoint: "https://www.ilo.org/sdmx/rest/",
    notes: "SDMX API — already configured.",
  },
};

const RSS_PATHS = [
  "/rss",
  "/feed",
  "/atom.xml",
  "/rss.xml",
  "/feed.xml",
  "/feed/atom",
  "/feed/rss",
  "/news/rss",
  "/news.rss",
];
const API_PATHS = ["/api", "/api/v1", "/api/v2", "/api.json", "/api/openapi.json"];
const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];

const RSS_LIKE_CT = /(application\/rss|application\/atom|application\/xml|text\/xml|application\/rdf)/i;
const JSON_LIKE_CT = /(application\/json|application\/.+\+json)/i;
const HTML_CT = /text\/html/i;

const RSS_LINK_RE =
  /<link[^>]+rel\s*=\s*["']?alternate["']?[^>]+type\s*=\s*["']?application\/(rss|atom)\+xml["']?[^>]*>/gi;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function originOf(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function allowlistMatch(host) {
  if (!host) return null;
  // Exact match first, then suffix match.
  if (ALLOWLIST[host]) return ALLOWLIST[host];
  for (const key of Object.keys(ALLOWLIST)) {
    if (host === key || host.endsWith("." + key)) return ALLOWLIST[key];
  }
  return null;
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { "User-Agent": UA, Accept: opts.accept || "*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const ms = Date.now() - start;
    let body = null;
    if (opts.readBody && res.ok) {
      try {
        body = await res.text();
        if (body.length > (opts.maxBody || 200000)) body = body.slice(0, opts.maxBody || 200000);
      } catch {}
    }
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      retryAfter: res.headers.get("retry-after"),
      ms,
      body,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e.name === "AbortError" ? "timeout" : e.message,
      ms: Date.now() - start,
    };
  } finally {
    clearTimeout(t);
  }
}

function classifyResponse(probe) {
  if (!probe.ok || !probe.contentType) return null;
  if (RSS_LIKE_CT.test(probe.contentType)) return "rss";
  if (JSON_LIKE_CT.test(probe.contentType)) return "json";
  return null;
}

function extractRssLinks(html, originUrl) {
  const matches = [];
  const seen = new Set();
  const tags = html.match(RSS_LINK_RE) || [];
  for (const tag of tags) {
    const hrefMatch = tag.match(HREF_RE);
    if (!hrefMatch) continue;
    let href = hrefMatch[1];
    try {
      href = new URL(href, originUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    matches.push(href);
  }
  return matches;
}

async function discoverSource(source, deadline) {
  const result = {
    source_id: source.id,
    name: source.name,
    url: source.url,
    domain: hostOf(source.url),
    existing_access_method: source.access_method,
    existing_rss_feed_url: source.rss_feed_url || null,
    detected: { rss_url: null, atom_url: null, api_url: null, sitemap_url: null },
    probed: [],
    recommended_access_method: "html_scrape",
    confidence: "low",
    manual_review_required: false,
    notes: "",
    aborted: false,
  };

  const origin = originOf(source.url);
  if (!origin) {
    result.notes = "Could not parse source.url as URL.";
    result.manual_review_required = true;
    return result;
  }

  // ── Step 1: allowlist
  const allow = allowlistMatch(result.domain);
  if (allow) {
    result.recommended_access_method = allow.method;
    result.confidence = "high";
    result.notes = "ALLOWLIST: " + allow.notes;
    if (allow.endpoint) result.detected.api_url = allow.endpoint;
    if (allow.rss) result.detected.rss_url = allow.rss;
    return result;
  }

  let consecutive429 = 0;

  async function probe(path, opts = {}) {
    if (Date.now() > deadline) {
      result.aborted = true;
      return null;
    }
    const url = path.startsWith("http") ? path : origin + path;
    const r = await fetchWithTimeout(url, opts);
    result.probed.push({
      path: url,
      method: opts.method || "GET",
      status: r.status,
      content_type: (r.contentType || "").slice(0, 80),
      ms: r.ms,
      error: r.error || undefined,
    });
    if (r.status === 429) {
      consecutive429++;
      if (consecutive429 >= 2) {
        result.aborted = true;
        result.notes = "Aborted after 2 consecutive 429s.";
      }
      const ra = parseInt(r.retryAfter || "5", 10);
      await sleep(Math.min(Math.max(ra * 1000, 1000), 5000));
    } else {
      consecutive429 = 0;
    }
    await sleep(INTER_PROBE_DELAY_MS);
    return r;
  }

  // ── Step 2: HTML home-page link rel="alternate" scan
  const home = await probe(origin + "/", {
    method: "GET",
    readBody: true,
    accept: "text/html,application/xhtml+xml",
    maxBody: 200000,
  });
  if (result.aborted) return result;

  if (home && home.ok && home.body && HTML_CT.test(home.contentType)) {
    const rssLinks = extractRssLinks(home.body, origin + "/");
    if (rssLinks.length > 0) {
      result.detected.rss_url = rssLinks[0];
      if (rssLinks.length > 1) {
        result.notes += `Multiple RSS link tags found (${rssLinks.length}); first selected. `;
      }
      result.recommended_access_method = "rss";
      result.confidence = "high";
    }
  }

  // ── Step 3: Common RSS paths (only if no RSS detected from link rel)
  if (!result.detected.rss_url) {
    for (const path of RSS_PATHS) {
      if (Date.now() > deadline) break;
      const r = await probe(path, { method: "HEAD" });
      if (result.aborted) break;
      if (r && r.ok && classifyResponse(r) === "rss") {
        result.detected.rss_url = origin + path;
        result.recommended_access_method = path.includes("atom") ? "atom" : "rss";
        result.confidence = "medium";
        break;
      }
    }
  }
  if (result.aborted) return result;

  // ── Step 4: Sitemap (always probe, even if RSS found)
  for (const path of SITEMAP_PATHS) {
    if (Date.now() > deadline) break;
    const r = await probe(path, { method: "HEAD" });
    if (result.aborted) break;
    if (r && r.ok && /xml/i.test(r.contentType)) {
      result.detected.sitemap_url = origin + path;
      if (!result.detected.rss_url) {
        result.recommended_access_method = "sitemap";
        result.confidence = "low";
      }
      break;
    }
  }
  if (result.aborted) return result;

  // ── Step 5: API paths (only if nothing else found)
  if (
    !result.detected.rss_url &&
    !result.detected.sitemap_url &&
    Date.now() < deadline
  ) {
    for (const path of API_PATHS) {
      if (Date.now() > deadline) break;
      const r = await probe(path, { method: "GET", readBody: true, maxBody: 4000 });
      if (result.aborted) break;
      if (r && r.ok && JSON_LIKE_CT.test(r.contentType)) {
        result.detected.api_url = origin + path;
        result.recommended_access_method = "api_rest";
        result.confidence = "medium";
        result.notes += "JSON detected at " + path + ". Manual review for endpoint shape. ";
        result.manual_review_required = true;
        break;
      }
    }
  }

  // ── Existing rss_feed_url divergence flag
  if (source.rss_feed_url && result.detected.rss_url && source.rss_feed_url !== result.detected.rss_url) {
    result.notes += `DIVERGENCE: existing rss_feed_url=${source.rss_feed_url} vs detected=${result.detected.rss_url}. `;
    result.manual_review_required = true;
  }
  if (source.rss_feed_url && !result.detected.rss_url) {
    result.notes += `Existing rss_feed_url not re-detected: ${source.rss_feed_url}. May be unlinked from home page. `;
  }

  return result;
}

// ── Concurrency-limited dispatcher ──────────────────────────────────────
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  const total = items.length;

  async function next() {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      const start = Date.now();
      try {
        results[i] = await worker(items[i], start + SOURCE_BUDGET_MS);
      } catch (e) {
        results[i] = { error: e.message, source_id: items[i].id, url: items[i].url };
      }
      completed++;
      if (completed % 25 === 0 || completed === total) {
        const pct = Math.round((completed / total) * 100);
        console.log(`  [${completed}/${total} ${pct}%] last=${items[i].name?.slice(0, 50)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => next()));
  return results;
}

// ── Main ────────────────────────────────────────────────────────────────
console.log("Wave 1a API/RSS Discovery — read-only probe");
console.log(`UA=${UA}`);
console.log(`Concurrency=${CONCURRENCY}, probe-timeout=${PROBE_TIMEOUT_MS}ms, source-budget=${SOURCE_BUDGET_MS}ms`);

const { data: sources, error: srcErr } = await supabase
  .from("sources")
  .select("id, name, url, access_method, rss_feed_url")
  .eq("status", "active")
  .eq("admin_only", false)
  .or("access_method.eq.scrape,rss_feed_url.not.is.null");

if (srcErr) {
  console.error("Failed to read sources:", srcErr.message);
  process.exit(1);
}

console.log(`Probe scope: ${sources.length} sources (scrape + already-rss for divergence flag)\n`);

const t0 = Date.now();
const results = await runWithConcurrency(sources, CONCURRENCY, discoverSource);
const wallMs = Date.now() - t0;

// ── Aggregate ────────────────────────────────────────────────────────────
const summary = {
  generated_at: new Date().toISOString(),
  scope: { sources_probed: sources.length, wall_clock_seconds: Math.round(wallMs / 1000) },
  recommendations: { rss: 0, atom: 0, api_rest: 0, api_soap: 0, sitemap: 0, html_scrape: 0, discovery_inconclusive: 0 },
  confidence: { high: 0, medium: 0, low: 0 },
  manual_review_required: 0,
  aborted: 0,
  divergences: 0,
  allowlist_hits: 0,
};

for (const r of results) {
  if (!r) continue;
  const m = r.recommended_access_method || "html_scrape";
  summary.recommendations[m] = (summary.recommendations[m] || 0) + 1;
  if (r.confidence) summary.confidence[r.confidence]++;
  if (r.manual_review_required) summary.manual_review_required++;
  if (r.aborted) summary.aborted++;
  if (r.notes && r.notes.includes("DIVERGENCE")) summary.divergences++;
  if (r.notes && r.notes.startsWith("ALLOWLIST")) summary.allowlist_hits++;
}

const out = {
  summary,
  results,
};

const outPath = resolve("..", "docs", "wave1-api-discovery-2026-05-08.json");
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

console.log("\n── Summary ──");
console.log(`  Wall clock: ${Math.round(wallMs / 1000)}s`);
console.log(`  Allowlist hits: ${summary.allowlist_hits}`);
console.log(`  Recommendations:`, summary.recommendations);
console.log(`  Confidence:`, summary.confidence);
console.log(`  Manual review required: ${summary.manual_review_required}`);
console.log(`  Divergences flagged: ${summary.divergences}`);
console.log(`  Aborted (timeout/429): ${summary.aborted}`);
console.log(`\n✓ Output: docs/wave1-api-discovery-2026-05-08.json`);
