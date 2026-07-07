// READ-ONLY: where do discovered ENACTED-TEXT URLs already live? Before any re-discovery, check if the
// enacted URLs are already stored (retrieval gap) — in the item's agent_run_searches pool (corroborators
// the DEEP-DIVE generate found via web_search), provisional_sources, the sources registry, or another
// column. If they're there, Stage 1 is "promote the stored enacted URL", near-free — no re-discovery.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();

const ENACTED = /eur-lex\.europa\.eu|federalregister\.gov\/documents|\/eli\/|celex|legal-content|legislation\.gov\.uk\/[a-z]+\/\d|wwwcdn\.imo\.org|planalto\.gov\.br\/ccivil|leginfo\.legislature\.ca\.gov\/faces\/billtext/i;

// EU + key flagship portal items (from dedup-match): no-twin re-points + twinned + review
const FLAGSHIPS = {
  "CBAM (no-twin)": "51b2c91e", "EUDR (no-twin)": "1e80067a", "MRV (no-twin)": "3af75490",
  "EU Taxonomy (no-twin)": "4547e8c5", "Euro 7 (no-twin)": "e0c0151c",
  "CSRD (twin)": "87493612", "HDV CO2 (twin)": "3ae89ce6", "Fit-for-55 (twin)": "d5ee6ab8",
  "Aviation ETS (review)": "56031fd3", "ETS Shipping (review)": "91534b5a", "ICS2 (review)": "1883001c",
  "IMO MARPOL (review)": "a8cdaa93", "IMO GHG (review)": "daecac87",
};

// 1. URL-bearing columns on intelligence_items — sample a flagship full row.
const { data: sample } = await sb.from("intelligence_items").select("*").ilike("legacy_id", "g2").limit(1);
if (sample?.[0]) {
  const urlCols = Object.entries(sample[0]).filter(([k, v]) => typeof v === "string" && /https?:\/\//.test(v)).map(([k]) => k);
  const otherUrlCols = Object.keys(sample[0]).filter((k) => /url|link|source|href|discover|candidate|primary/i.test(k));
  console.log(`intelligence_items columns holding a URL (sample row): ${urlCols.join(", ") || "(only via source_url)"}`);
  console.log(`intelligence_items columns NAMED url/source/etc: ${otherUrlCols.join(", ")}`);
}

// 2. Per-flagship: does its agent_run_searches pool already contain an ENACTED-text URL?
console.log(`\n=== PER-FLAGSHIP: enacted URL already in the item's stored pool? ===`);
const ids = {};
for (const [label, prefix] of Object.entries(FLAGSHIPS)) {
  const { data: it } = await sb.from("intelligence_items").select("id,source_url").ilike("legacy_id", "zzz").limit(0); // noop to keep client warm
  // resolve full id by prefix
  const { data: cand } = await sb.from("intelligence_items").select("id,source_url,sources_used").or(`title.ilike.%${label.split(" (")[0]}%`).limit(50);
  const row = (cand || []).find((r) => r.id.startsWith(prefix));
  if (!row) { console.log(`  ${label}: item ${prefix} not found by title`); continue; }
  ids[label] = row.id;
  const { data: pool } = await sb.from("agent_run_searches").select("result_url").eq("intelligence_item_id", row.id);
  const enactedHits = (pool || []).map((p) => p.result_url).filter((u) => u && ENACTED.test(u));
  console.log(`  ${label} ${row.id.slice(0,8)}  pool=${pool?.length||0}  ENACTED-in-pool=${enactedHits.length}${enactedHits.length ? "  → " + enactedHits.slice(0,2).join(" | ") : ""}`);
}

// 3. Corpus-wide: of all reg portal items, how many already have an enacted URL in their pool?
const REG = ["regulation","directive","standard","guidance","framework"];
const items = [];
for (let from=0;;from+=1000){ const {data}=await sb.from("intelligence_items").select("id,item_type,source_url,is_archived").order("id").range(from,from+999); if(!data?.length)break; items.push(...data); if(data.length<1000)break; }
const reg = items.filter((r)=>REG.includes(r.item_type)&&!r.is_archived);
const portalReg = reg.filter((r)=>!ENACTED.test(r.source_url||"")); // not already enacted-sourced
const regIds = new Set(portalReg.map(r=>r.id));
const poolEnacted = new Map();
for (let from=0;;from+=1000){ const {data}=await sb.from("agent_run_searches").select("intelligence_item_id,result_url").order("id").range(from,from+999); if(!data?.length)break;
  for (const p of data){ if(!regIds.has(p.intelligence_item_id))continue; if(p.result_url&&ENACTED.test(p.result_url)) { if(!poolEnacted.has(p.intelligence_item_id)) poolEnacted.set(p.intelligence_item_id, p.result_url); } }
  if(data.length<1000)break; }
console.log(`\n=== CORPUS: portal-sourced reg items whose POOL already holds an enacted URL ===`);
console.log(`  ${poolEnacted.size} / ${portalReg.length} portal-reg items have an enacted-text URL already discovered in their agent_run_searches pool (promote, not re-discover).`);

// 4. provisional_sources + sources registry with enacted URLs
const { data: prov } = await sb.from("provisional_sources").select("url").or("url.ilike.%eur-lex%,url.ilike.%federalregister.gov/documents%,url.ilike.%/eli/%");
console.log(`\nprovisional_sources with enacted-text URLs: ${prov?.length||0}`);
const { count: srcEnacted } = await sb.from("sources").select("id",{count:"exact",head:true}).or("url.ilike.%eur-lex%,url.ilike.%federalregister.gov%,url.ilike.%legislation.gov.uk%");
console.log(`sources registry rows on enacted-text hosts: ${srcEnacted ?? "?"}`);
process.exit(0);
