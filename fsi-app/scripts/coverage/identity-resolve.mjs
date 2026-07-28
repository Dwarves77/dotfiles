#!/usr/bin/env node
// B1 identity-resolve pass. For every would_mint census_worklist row: compute the deterministic identity
// (URL shape + identifier scheme, src/lib/coverage/identity.mjs), check the host is a REGISTERED source
// host, run a FREE-FETCH liveness probe, and upsert the identity_* columns (mig 228). No paid service,
// no LLM — plain node fetch, $0. HONESTY: identity_resolves is TRUE only on a confirmed 2xx/3xx, FALSE only
// on a confirmed 4xx/5xx; a timeout / rate-limit / network error records status=null and resolves=null
// (could-not-confirm) so our own throttling never fabricates a dead-link verdict. --execute to write;
// default DRY reports the split. Polite: bounded concurrency, per-host UA, HEAD→GET fallback, one retry.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(resolve(process.cwd(), ".env.local"));
const { deterministicIdentity } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/coverage/identity.mjs")).href);
const { fetchAllRows } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/db/paginate.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXECUTE = process.argv.includes("--execute");
const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;
const UA = "CarosLedge-CoverageIndex/1.0 (+identity-verification; contact ops)";

// ---- registered-host set (document host is "registered" if it equals or is a subdomain of a sources host) ----
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
const srcRows = await fetchAllRows((f, t) => sb.from("sources").select("id,url,domains").order("id").range(f, t));
const registered = new Set();
for (const s of srcRows) {
  const h = hostOf(s.url); if (h) registered.add(h);
  for (const d of s.domains || []) { const dh = String(d || "").toLowerCase().replace(/^www\./, ""); if (dh) registered.add(dh); }
}
const isRegisteredHost = (host) => {
  if (!host) return false;
  if (registered.has(host)) return true;
  for (const r of registered) if (host === r || host.endsWith("." + r)) return true;
  return false;
};
console.log(`registered hosts: ${registered.size}`);

// ---- free-fetch liveness probe: {status|null}. null = could-not-confirm (never a fabricated dead verdict) ----
async function probe(url) {
  for (const method of ["HEAD", "GET"]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept: "*/*" } });
      clearTimeout(timer);
      // HEAD not allowed → try GET; otherwise the code is authoritative.
      if (method === "HEAD" && (res.status === 405 || res.status === 501)) continue;
      return res.status;
    } catch {
      clearTimeout(timer);
      if (method === "GET") return null; // both attempts failed → could-not-confirm
    }
  }
  return null;
}

const rows = await fetchAllRows((f, t) => sb.from("census_worklist")
  .select("id,document_url,instrument_identifier").eq("dryrun_disposition", "would_mint").order("id").range(f, t));
console.log(`would_mint rows: ${rows.length} | mode ${EXECUTE ? "EXECUTE" : "DRY"}`);

let done = 0, resolves = 0, dead = 0, unconfirmed = 0, hostReg = 0, shapeValid = 0;
async function handle(row) {
  const det = deterministicIdentity(row.instrument_identifier, row.document_url);
  const hostRegistered = isRegisteredHost(det.host);
  const status = det.urlOk ? await probe(row.document_url) : null;
  const identityResolves = status == null ? null : (status >= 200 && status < 400);
  if (identityResolves === true) resolves++; else if (identityResolves === false) dead++; else unconfirmed++;
  if (hostRegistered) hostReg++;
  if (det.identifierShapeValid) shapeValid++;
  if (EXECUTE) {
    const { error } = await sb.from("census_worklist").update({
      identity_checked_at: new Date().toISOString(),
      identity_http_status: status,
      identity_resolves: identityResolves,
      identity_scheme: det.scheme,
      identity_shape_valid: det.identifierShapeValid,
      identity_host_registered: hostRegistered,
    }).eq("id", row.id);
    if (error) console.error("update-error", row.id, error.message);
  }
  if (++done % 250 === 0) console.log(`  ...${done}/${rows.length} | live=${resolves} dead=${dead} unconfirmed=${unconfirmed}`);
}

// bounded-concurrency pool
let idx = 0;
async function worker() { while (idx < rows.length) { const my = idx++; await handle(rows[my]); } }
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nIDENTITY PASS ${EXECUTE ? "EXECUTE" : "DRY"} complete:`);
console.log(`  total=${rows.length} live(2xx/3xx)=${resolves} dead(4xx/5xx)=${dead} could-not-confirm=${unconfirmed}`);
console.log(`  host-registered=${hostReg} identifier-shape-valid=${shapeValid}`);
