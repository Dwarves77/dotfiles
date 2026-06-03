/**
 * source-health.mjs — Browserless liveness audit of the source registry.
 *
 * "Zero dead sources." For each source, pull its URL via Browserless (the canonical
 * fetch — never plain fetch) and classify:
 *   LIVE     — Browserless returned usable text (>300 chars)
 *   THIN     — returned <300 chars (likely a JS-only shell or wrong page)
 *   DEAD     — Browserless threw (HTTP 4xx/5xx, navigation/timeout, missing key)
 * DEAD/THIN sources are reported with their exact failure mode + status so each can
 * be RESEARCHED (wrong URL / moved / redirect / blocked) and fixed. READ-ONLY.
 *
 *   node scripts/_diag/source-health.mjs                 # referenced active sources
 *   node scripts/_diag/source-health.mjs --all           # all active sources
 *   node scripts/_diag/source-health.mjs --limit=50
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { checkReachability, REACH } from "../../src/lib/sources/reachability.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const LIMIT = (() => { const a = argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.split("=")[1], 10) : Infinity; })();
const CONC = 2; // gentle — run ALONE (no concurrent Browserless job) to avoid false 429s

// Canonical source-health: checkReachability (Browserless default) retries
// INCONCLUSIVE (429/5xx/timeout/403) up to 3x; only 404/410 -> DEAD. We map:
//   REACHABLE     -> LIVE
//   DEAD          -> DEAD   (definitive 404/410 — wrong/removed URL; research+fix)
//   INCONCLUSIVE  -> BLOCKED (403/429/5xx/timeout after retries — research: blocked or transient)
async function probe(src) {
  const t0 = Date.now();
  const r = await checkReachability(src.url);
  const klass = r.outcome === REACH.REACHABLE ? "LIVE" : (r.outcome === REACH.DEAD ? "DEAD" : "BLOCKED");
  return { ...src, klass, status: r.finalStatus, attempts: r.attempts, ms: Date.now() - t0, err: r.error || null };
}

// source set
let q = s.from("sources").select("id, name, url, base_tier, category, status, created_at").eq("status", "active").not("url", "is", null);
const { data: srcs } = await q;
let set = srcs || [];
if (!ALL) {
  const { data: items } = await s.from("intelligence_items").select("source_id").eq("is_archived", false).not("source_id", "is", null);
  const used = new Set((items || []).map((x) => x.source_id));
  set = set.filter((x) => used.has(x.id));
}
set = set.slice(0, LIMIT);
console.log(`auditing ${set.length} active sources via Browserless (concurrency ${CONC})...\n`);

const results = [];
for (let i = 0; i < set.length; i += CONC) {
  const batch = set.slice(i, i + CONC);
  results.push(...await Promise.all(batch.map(probe)));
  if ((i + CONC) % 40 === 0) console.error(`  ...${Math.min(i + CONC, set.length)}/${set.length}`);
}

const by = { LIVE: [], DEAD: [], BLOCKED: [] };
for (const r of results) by[r.klass].push(r);
console.log(`\n${"=".repeat(60)}`);
console.log(`LIVE: ${by.LIVE.length}   DEAD(404/410): ${by.DEAD.length}   BLOCKED/inconclusive: ${by.BLOCKED.length}   (of ${results.length})`);

const recency = (src) => (src.created_at || "").slice(0, 10);
for (const k of ["DEAD", "BLOCKED"]) {
  if (!by[k].length) continue;
  console.log(`\n── ${k} (${by[k].length}) — research each ──`);
  for (const r of by[k].sort((a, b) => (a.status || 0) - (b.status || 0))) {
    console.log(`  [T${(r.base_tier ?? "?")}] status=${r.status ?? "—"} attempts=${r.attempts} created=${recency(r)}  "${(r.name || "").slice(0, 42)}"`);
    console.log(`      ${r.url}`);
    if (r.err) console.log(`      err: ${(r.err || "").slice(0, 80)}`);
  }
}
console.log(`\nDONE (read-only). DEAD = definitive 404/410 (wrong/removed URL). BLOCKED = 403/429/5xx after 3 retries (bot-block or transient). Both need research.`);
