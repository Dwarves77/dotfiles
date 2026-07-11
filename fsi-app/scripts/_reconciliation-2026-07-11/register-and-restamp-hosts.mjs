/** Unregistered-span-host fix (lane hard check): register the 4 hosts today's re-grounds
 *  NULL-stamped (register-pool-hosts-before-grounding class fix), then deterministically
 *  re-stamp today's NULL FACT claims via their own search_result_id -> host -> new source.
 *  Tiers by registry precedent: research/expert-analysis T4; trade press / corporate T6.
 *  DRY-RUN default; --apply writes (guarded registerSource + scp update + read-back).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, registerSource } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const cite = { skill: "source-credibility-model", reason: "register grounding-pool hosts NULL-stamped by the 2026-07-11 reconciliation re-grounds (register-before-grounding class fix); tiers by type precedent (FreightWaves T5 / Loadstar T6 / think-tank T4)" };

const HOSTS = [
  { url: "https://www.nationalacademies.org/", name: "The National Academies of Sciences, Engineering, and Medicine", base_tier: 4 },
  { url: "https://library.ctr.utexas.edu/", name: "UT Austin Center for Transportation Research (library)", base_tier: 4 },
  { url: "https://www.transportandlogisticsme.com/", name: "Transport & Logistics Middle East (trade press)", base_tier: 6 },
  { url: "https://www.aflogistics.com/", name: "AF Logistics (corporate site)", base_tier: 6 },
];

const sb = readClient();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

// today's NULL-stamp FACT claims with a pool row
const { data: claims } = await sb.from("section_claim_provenance")
  .select("id, search_result_id, intelligence_item_id")
  .eq("claim_kind", "FACT").is("source_id", null)
  .gt("extracted_at", new Date(Date.now() - 8 * 3600e3).toISOString());
const poolIds = [...new Set((claims || []).map((c) => c.search_result_id).filter(Boolean))];
const { data: pools } = await sb.from("agent_run_searches").select("id, result_url").in("id", poolIds.length ? poolIds : ["00000000-0000-0000-0000-000000000000"]);
const poolHost = new Map((pools || []).map((p) => [p.id, hostOf(p.result_url)]));
console.log(`today's NULL-stamp FACT claims: ${(claims || []).length}`);

if (!APPLY) {
  const byHost = {};
  for (const c of claims || []) { const h = poolHost.get(c.search_result_id) || "(none)"; byHost[h] = (byHost[h] || 0) + 1; }
  console.log("by host:", byHost);
  console.log("DRY-RUN — pass --apply");
  process.exit(0);
}

const idByHost = new Map();
for (const h of HOSTS) {
  const r = await registerSource(h, { cite });
  idByHost.set(hostOf(h.url), { id: r.source_id, tier: h.base_tier, created: r.created });
  console.log(`registered ${hostOf(h.url)} -> ${r.source_id} (created=${r.created})`);
}

let restamped = 0, skipped = 0;
for (const c of claims || []) {
  const h = poolHost.get(c.search_result_id);
  const reg = h ? idByHost.get(h) : null;
  if (!reg) { skipped++; continue; }
  const { error } = await sb.from("section_claim_provenance")
    .update({ source_id: reg.id, source_tier_at_grounding: reg.tier }).eq("id", c.id);
  if (error) console.error(`restamp FAIL ${c.id}: ${error.message}`); else restamped++;
}
console.log(`restamped=${restamped} skipped(no-registered-host)=${skipped}`);
const { count } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true })
  .eq("claim_kind", "FACT").is("source_id", null);
console.log(`corpus NULL-stamp FACT total now: ${count}`);
