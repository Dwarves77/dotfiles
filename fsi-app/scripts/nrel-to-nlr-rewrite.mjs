/**
 * nrel-to-nlr-rewrite.mjs — guarded host rewrite nrel.gov -> nlr.gov on source rows.
 *
 * NREL was renamed National Laboratory of the Rockies effective 2025-12-01; nrel.gov is
 * RETIRED (dead since 2026-05-29), nlr.gov is the live successor (confirmed via DOE + the
 * NLR developer-network transition notice). Clean host substitution, PATH PRESERVED:
 *   nrel.gov -> nlr.gov ; www.nrel.gov/x -> www.nlr.gov/x ; developer.nrel.gov -> developer.nlr.gov
 *
 * Guarded data-op: dry-run default; per-row UPDATE ... WHERE url = expectedOld; read-back
 * assert; halt on mismatch. Reversible (swap back nlr.gov -> nrel.gov on the same id set).
 *
 *   node scripts/nrel-to-nlr-rewrite.mjs                       # dry run (report only)
 *   node scripts/nrel-to-nlr-rewrite.mjs --execute --confirm   # write
 *
 * NOTE: host only. The lab also restructured PATHS, so a deep URL may 404 on nlr.gov even
 * with the right host. Does NOT reachability-check (Browserless is down). All rewritten URLs
 * are flagged in the log for reachability re-validation when Browserless is restored.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const EXECUTE = argv.includes("--execute"), CONFIRM = argv.includes("--confirm");
if (EXECUTE && !CONFIRM) { console.error("--execute requires --confirm"); process.exit(2); }

// Host-only swap: replace the hostname token in the original string (path/query/hash untouched).
function swapHost(orig) {
  let u; try { u = new URL(orig); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (h !== "nrel.gov" && !h.endsWith(".nrel.gov")) return null;
  const newHost = h.slice(0, -"nrel.gov".length) + "nlr.gov";
  return orig.replace(u.hostname, newHost); // first occurrence = the authority host
}

const { data: rows, error } = await s.from("sources").select("id, name, url, status, base_tier").ilike("url", "%nrel.gov%");
if (error) { console.error(error.message); process.exit(1); }

const plan = [];
for (const r of rows) {
  const next = swapHost(r.url);
  plan.push({ ...r, next, willChange: !!next && next !== r.url });
}
const changes = plan.filter((p) => p.willChange);
const hostNoMatch = plan.filter((p) => !p.next); // url contains 'nrel.gov' but not as host (e.g. path) — report, do NOT touch

console.log(`MODE: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
console.log(`rows whose url contains 'nrel.gov': ${rows.length}  |  host-rewrites planned: ${changes.length}  |  nrel.gov-in-path-only (untouched): ${hostNoMatch.length}\n`);
for (const p of changes) {
  console.log(`  ${p.id} [T${p.base_tier} ${p.status}] "${(p.name||"").slice(0,44)}"`);
  console.log(`     - ${p.url}`);
  console.log(`     + ${p.next}`);
}
for (const p of hostNoMatch) console.log(`  [PATH-ONLY, untouched] ${p.id} ${p.url}`);

if (!EXECUTE) { console.log(`\nDRY RUN — no write. Re-run with --execute --confirm.`); process.exit(0); }

const log = [];
let updated = 0;
for (const p of changes) {
  const { error: uErr } = await s.from("sources").update({ url: p.next }).eq("id", p.id).eq("url", p.url); // WHERE url=expectedOld
  if (uErr) { console.log(`  [FAIL] ${p.id}: ${uErr.message}`); log.push({ id: p.id, ok: false, err: uErr.message }); continue; }
  const { data: v } = await s.from("sources").select("url").eq("id", p.id).maybeSingle();
  const ok = v?.url === p.next;
  console.log(`  [${ok ? "OK" : "MISMATCH"}] ${p.id} -> ${v?.url}`);
  log.push({ id: p.id, name: p.name, before: p.url, after: p.next, ok, needs_reachability_revalidation: true });
  if (!ok) { console.error("HALT: read-back mismatch."); writeFileSync(resolve(ROOT, "docs", "nrel-to-nlr-rewrite-log.json"), JSON.stringify({ aborted: p.id, log }, null, 2)); process.exit(1); }
  updated++;
}
// Confirm zero nrel.gov hosts remain.
const { data: after } = await s.from("sources").select("id, url").ilike("url", "%nrel.gov%");
const remainingHosts = (after || []).filter((r) => { try { const h = new URL(r.url).hostname.toLowerCase(); return h === "nrel.gov" || h.endsWith(".nrel.gov"); } catch { return false; } });
console.log(`\nupdated ${updated}/${changes.length}.  nrel.gov HOSTS remaining: ${remainingHosts.length} ${remainingHosts.length === 0 ? "✓" : "✗"}`);
writeFileSync(resolve(ROOT, "docs", "nrel-to-nlr-rewrite-log.json"), JSON.stringify({ completed: true, updated, remaining_nrel_hosts: remainingHosts.length, log }, null, 2));
console.log(`Log: docs/nrel-to-nlr-rewrite-log.json. All ${updated} flagged needs_reachability_revalidation=true (run when Browserless restored).`);
console.log(`Reversal: swap nlr.gov -> nrel.gov on the logged id set.`);
