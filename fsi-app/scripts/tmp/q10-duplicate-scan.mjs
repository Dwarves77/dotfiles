// Q10: scan sources + provisional_sources for URLs that would canonicalize
// to the same value. Reports distinct canonical URLs that have multiple
// underlying rows (silent-duplicate sets). Read-only; emits JSON to stdout.

import { readFileSync } from "node:fs";
import pg from "pg";

const DB_PASSWORD = readFileSync(".env.local", "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync("supabase/.temp/pooler-url", "utf8").trim();
const PROJECT_REF = readFileSync("supabase/.temp/project-ref", "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

// Inline JS canonicalization (must match src/lib/sources/url-canonicalize.ts).
// Kept inline so the script can run without a TS transpiler.
function canonicalizeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return rawUrl;
  let u;
  try { u = new URL(rawUrl); } catch { return rawUrl; }
  const scheme = u.protocol.toLowerCase();
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  let port = u.port;
  if ((scheme === "http:" && port === "80") || (scheme === "https:" && port === "443")) port = "";
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "") || "/";
  let query = "";
  if (u.search.length > 0) {
    const params = Array.from(u.searchParams.entries());
    params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const usp = new URLSearchParams();
    for (const [k, v] of params) usp.append(k, v);
    const qs = usp.toString();
    if (qs.length > 0) query = "?" + qs;
  }
  const authority = port.length > 0 ? `${host}:${port}` : host;
  return `${scheme}//${authority}${path}${query}`;
}

function findDuplicateSets(rows) {
  const groups = new Map(); // canonical → [{id, url, ...}]
  for (const r of rows) {
    const canon = canonicalizeUrl(r.url);
    if (!groups.has(canon)) groups.set(canon, []);
    groups.get(canon).push(r);
  }
  const dups = [];
  for (const [canon, members] of groups) {
    if (members.length > 1) dups.push({ canonical_url: canon, members });
  }
  return dups;
}

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

try {
  const srcRows = (await client.query(`
    SELECT id, url, name, status, created_at FROM public.sources
    WHERE url IS NOT NULL AND url <> ''
  `)).rows;
  out.sources_row_count = srcRows.length;
  const srcDups = findDuplicateSets(srcRows);
  out.sources_duplicate_set_count = srcDups.length;
  out.sources_duplicate_rows_total = srcDups.reduce((sum, d) => sum + d.members.length, 0);
  out.sources_duplicate_sets = srcDups;

  // provisional_sources may not have created_at; query defensively.
  const provColInfo = (await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provisional_sources'
  `)).rows.map((r) => r.column_name);
  const provHasCreated = provColInfo.includes("created_at");
  const provHasStatus = provColInfo.includes("status");
  const provSelect = ["id", "url", "name"];
  if (provHasStatus) provSelect.push("status");
  if (provHasCreated) provSelect.push("created_at");
  const provRows = (await client.query(`
    SELECT ${provSelect.join(", ")} FROM public.provisional_sources
    WHERE url IS NOT NULL AND url <> ''
  `)).rows;
  out.provisional_sources_row_count = provRows.length;
  const provDups = findDuplicateSets(provRows);
  out.provisional_sources_duplicate_set_count = provDups.length;
  out.provisional_sources_duplicate_rows_total = provDups.reduce((sum, d) => sum + d.members.length, 0);
  out.provisional_sources_duplicate_sets = provDups;

  // Also detect cross-table collisions where a sources canonical equals a
  // provisional canonical. These won't break a unique index (different
  // tables) but indicate that promote/canonicalize flow should detect and
  // skip them.
  const srcCanon = new Set(srcRows.map((r) => canonicalizeUrl(r.url)));
  const cross = [];
  for (const p of provRows) {
    const c = canonicalizeUrl(p.url);
    if (srcCanon.has(c)) cross.push({ canonical_url: c, provisional_id: p.id, provisional_url: p.url });
  }
  out.cross_table_collisions_count = cross.length;
  out.cross_table_collisions = cross;
} catch (err) {
  out.error = err.message;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
