// STALE-VERIFIED AUDIT (operator ruling 2026-07-13, Part A.3). GOVERNING SKILL: remediation-discipline
// (status-is-a-cache: stored provenance_status must agree with the live gate in BOTH directions).
//
// SCOPE = is_archived=false (customer-visible). The customer read gate is `is_archived=false AND
// provenance_status='verified'` — so the integrity question is only "does any CUSTOMER-VISIBLE verified item
// disagree with the live validate_item_provenance?" Archived rows are terminal and out of the gate; their
// stale 'verified' cache is cosmetic (and its backfill is blocked on the bound reconciler credential — a
// standing DDL-window item), so they are DELIBERATELY out of scope here (this is the scoping the ruling asks
// for — an unscoped count would perpetually red on invisible archived rows). Read-only; exit 1 on any
// customer-visible stale-verified item, 0 clean, 2 read/rpc error. Env: NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("stale-verified-audit: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// Customer-visible verified items (paginate past the 1000 cap).
const items = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("intelligence_items").select("id,legacy_id,title")
    .eq("is_archived", false).eq("provenance_status", "verified").order("id").range(from, from + 999);
  if (error) { console.error(`stale-verified-audit: read failed — ${error.message}`); process.exit(2); }
  if (!data?.length) break;
  items.push(...data);
  if (data.length < 1000) break;
}

let invalid = 0;
const offenders = [];
for (const it of items) {
  const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  if (error) { console.error(`stale-verified-audit: validate rpc failed for ${it.id} — ${error.message}`); process.exit(2); }
  const vr = Array.isArray(data) ? data[0] : data;
  if (vr && vr.valid === false) { invalid++; if (offenders.length < 40) offenders.push({ id: it.legacy_id || it.id, title: (it.title || "").slice(0, 60) }); }
}

console.log(`stale-verified-audit: ${items.length} customer-visible verified item(s) (is_archived=false).`);
console.log(`  live-invalid (stored 'verified' disagrees with validate_item_provenance): ${invalid}`);
for (const o of offenders) console.error(`  [STALE-VERIFIED] ${o.id} — ${o.title}`);
if (invalid === 0) { console.log("stale-verified-audit: OK — every customer-visible verified item passes the live gate."); process.exit(0); }
console.error(`\nstale-verified-audit: ${invalid} customer-visible verified item(s) FAIL the live gate — re-validate (status-is-a-cache).`);
process.exit(1);
