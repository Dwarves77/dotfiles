/** 1d registration (operator ruling 2026-07-04): ucr.gov @ T2 — Unified Carrier Registration Plan, the
 *  official federal-state motor-carrier registration system (49 U.S.C. 14504a), FMCSA/national-agency class.
 *  Surfaced by the ungrounded_url ruling table as the sole registerable-authority (truckdrivernews -> 4c junk;
 *  cordis stays provisional). FETCH-FREE guarded registerSource + read-back. GOVERNING: source-credibility-model. */
import { registerSource, readClient, readAll } from "./lib/db.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
const APPLY = process.argv.includes("--apply");
const CITE = { skill: "source-credibility-model", reason: "Register ucr.gov T2 (Unified Carrier Registration Plan, official federal-state motor-carrier registration system, FMCSA/agency class). ungrounded_url ruling table 2026-07-04. Fetch-free." };
const SRC = { url: "https://www.ucr.gov", name: "Unified Carrier Registration (UCR) Plan — federal-state motor-carrier registration system", base_tier: 2 };
if (!APPLY) { console.log("DRY-RUN — pass --apply."); process.exit(0); }
const out = await registerSource(SRC, { cite: CITE });
console.log(`✔ ${out.host} -> source ${out.source_id} (created=${out.created}, base_tier=${SRC.base_tier})`);
const sb = readClient();
const rows = await readAll("sources","url,base_tier,status");
const hit = rows.filter(r=>{try{return new URL(r.url).host.replace(/^www\./,"").toLowerCase()==="ucr.gov";}catch{return false;}});
console.log(`READ-BACK ucr.gov: ${JSON.stringify(hit.map(r=>({tier:r.base_tier,status:r.status})))} (expect T2 active)`);
process.exit(0);
