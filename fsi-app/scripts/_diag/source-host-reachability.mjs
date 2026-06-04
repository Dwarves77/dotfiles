/** Zero-unit reachability sweep across ALL active sources.
 *
 * NOT content pulling (no Browserless, no body reads) — pure DNS liveness + diagnosis.
 * For every active source: resolve its host. For every DEAD host, diagnose WHY:
 *   - walk the domain hierarchy (drop leftmost label) to find the deepest parent that
 *     DOES resolve  -> distinguishes "subdomain decommissioned" from "whole domain gone"
 *   - test a www. variant  -> distinguishes "apex-only / needs www" cases
 *   - classify the DNS error (ENOTFOUND vs ENODATA vs SERVFAIL/timeout)
 * Read-only. Writes nothing. Output is a durable JSON audit artifact + console summary.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import { createClient } from "@supabase/supabase-js";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// One DNS lookup with a hard timeout so a hanging resolver can't stall the sweep.
async function resolves(host) {
  try {
    await Promise.race([
      dns.lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), 5000)),
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code || "ERR" };
  }
}

// Walk the hierarchy: gikai.metro.tokyo.jp -> metro.tokyo.jp -> tokyo.jp -> jp.
// Return the deepest suffix that resolves (where the chain "comes alive").
async function deepestLiveParent(host) {
  const labels = host.split(".");
  for (let i = 1; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join(".");
    const r = await resolves(suffix);
    if (r.ok) return suffix;
  }
  return null; // not even the TLD-ish parent resolved
}

const { data: sources, error } = await sb
  .from("sources")
  .select("id, name, url, access_method")
  .eq("status", "active");
if (error) { console.error("query error:", error.message); process.exit(1); }

console.log(`Sweeping ${sources.length} active sources for host reachability (DNS only, 0 Browserless units)\n`);

// Dedupe by host so we don't resolve the same host N times; keep one representative source.
const byHost = new Map();
for (const s of sources) {
  let host; try { host = new URL(s.url).hostname.toLowerCase(); } catch { host = null; }
  if (!host) { (byHost.get("__malformed_url__") ?? byHost.set("__malformed_url__", []).get("__malformed_url__")).push(s); continue; }
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(s);
}
console.log(`distinct hosts: ${byHost.size}\n`);

const dead = [];
let live = 0;
const hosts = [...byHost.keys()].filter((h) => h !== "__malformed_url__");

// Resolve in small concurrent batches.
const BATCH = 20;
for (let i = 0; i < hosts.length; i += BATCH) {
  const slice = hosts.slice(i, i + BATCH);
  const results = await Promise.all(slice.map(async (host) => ({ host, r: await resolves(host) })));
  for (const { host, r } of results) {
    if (r.ok) { live++; continue; }
    dead.push({ host, code: r.code, sources: byHost.get(host).map((s) => ({ id: s.id, name: s.name, url: s.url, access_method: s.access_method })) });
  }
}

// Diagnose each dead host.
for (const d of dead) {
  const liveParent = await deepestLiveParent(d.host);
  const wwwVariant = d.host.startsWith("www.") ? null : await resolves("www." + d.host);
  // Classify the failure.
  let why;
  if (d.code === "ETIMEDOUT") why = "DNS_TIMEOUT (resolver did not answer in 5s; possibly transient or filtered)";
  else if (wwwVariant?.ok) why = `WWW_ONLY (apex/host fails but www.${d.host} resolves -> stored URL missing www)`;
  else if (liveParent && liveParent !== d.host) {
    const droppedLabels = d.host.slice(0, d.host.length - liveParent.length - 1);
    why = `SUBDOMAIN_DEAD (parent "${liveParent}" resolves; the "${droppedLabels}" portion does not -> subdomain/host decommissioned, domain still owned)`;
  } else if (liveParent) why = `RESOLVES_AT_PARENT_ONLY (${liveParent})`;
  else why = `DOMAIN_GONE (nothing in the chain up to the registry resolves -> domain expired, never existed, or registry-level NXDOMAIN; code ${d.code})`;
  d.diagnosis = why;
  d.liveParent = liveParent;
  d.wwwResolves = wwwVariant?.ok ?? null;
}

// Report.
console.log(`LIVE hosts:  ${live}`);
console.log(`DEAD hosts:  ${dead.length}`);
const malformed = byHost.get("__malformed_url__");
if (malformed) console.log(`MALFORMED source URLs: ${malformed.length}`);
console.log("");
for (const d of dead) {
  console.log(`✗ ${d.host}   [${d.code}]`);
  console.log(`  WHY: ${d.diagnosis}`);
  for (const s of d.sources) console.log(`  - ${s.name} (${s.access_method ?? "scrape"})  ${s.url}`);
  console.log("");
}

const out = resolve(__d, "source-host-reachability-result.json");
writeFileSync(out, JSON.stringify({ swept: sources.length, distinctHosts: byHost.size, live, dead, malformed: malformed?.map((s) => ({ id: s.id, name: s.name, url: s.url })) ?? [] }, null, 2));
console.log(`durable artifact: ${out}`);
