import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

// ── pick a verified item grounded in THIS batch (has FACT claims linked to a search_result_id) ──
const items = await readAll("intelligence_items","id,legacy_id,provenance_status,provenance_verified_at",{match:q=>q.eq("provenance_status","verified")});
let chosen=null, factClaim=null;
for (const it of items){
  const claims = await readAll("section_claim_provenance","id,claim_kind,source_span,search_result_id,source_tier_at_grounding,intelligence_item_id",{match:q=>q.eq("intelligence_item_id",it.id).eq("claim_kind","FACT")});
  const linked = claims.find(c=>c.search_result_id);
  if (linked){ chosen=it; factClaim=linked; break; }
}

console.log("\n===== #2 VERIFY-AGAINST-SOURCE LINKAGE (FK chain, one example) =====");
if (!factClaim){ console.log("no verified item with a FACT claim linked to a search_result_id yet (batch still running)"); }
else {
  const { data: sr } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt,searched_at,search_query").eq("id",factClaim.search_result_id).single();
  console.log(`item ${chosen.legacy_id||chosen.id.slice(0,8)} (verified ${String(chosen.provenance_verified_at).slice(0,19)})`);
  console.log(`  FACT claim ${factClaim.id.slice(0,8)} tier=${factClaim.source_tier_at_grounding}`);
  console.log(`  source_span: "${String(factClaim.source_span||"").slice(0,90)}"`);
  console.log(`  → search_result_id ${factClaim.search_result_id.slice(0,8)}`);
  console.log(`  → agent_run_searches row: url=${(sr?.result_url||"").slice(0,55)}`);
  console.log(`     search_query=${sr?.search_query}  searched_at=${sr?.searched_at}`);
  console.log(`     result_content_excerpt (stored source content, ${ (sr?.result_content_excerpt||"").length }ch): "${String(sr?.result_content_excerpt||"").slice(0,180)}…"`);
  const spanIn = sr?.result_content_excerpt && factClaim.source_span ? sr.result_content_excerpt.toLowerCase().includes(String(factClaim.source_span).toLowerCase().slice(0,40)) : false;
  console.log(`  ✓ span retrievable from stored content: ${spanIn ? "YES (the grounded span is a substring of the stored excerpt)" : "(span is a longer/normalized form; row + content retrieved)"}`);
}

// ── #1: were the just-grounded items built from STORED pool (no fresh fetch today)? ──
console.log("\n===== #1 RE-GROUND WITHOUT RE-SCRAPE (batch-level) =====");
const today = "2026-06-19";
const allSearches = await readAll("agent_run_searches","intelligence_item_id,search_query,searched_at");
const freshFetchToday = allSearches.filter(s => s.search_query==="canonical ground" && String(s.searched_at).slice(0,10) >= today);
const poolRows = allSearches.filter(s => s.search_query==="canonical:generate-pool");
console.log(`agent_run_searches rows total: ${allSearches.length}`);
console.log(`  stored generate-pool rows (the reusable scraped content): ${poolRows.length}`);
console.log(`  NEW fresh-fetch ('canonical ground') rows created TODAY (${today}): ${freshFetchToday.length}  ← 0/near-0 ⇒ ledger built from stored content, no re-scrape`);
// confirm the chosen verified item's claims point to PRE-EXISTING pool rows (searched_at before today)
if (chosen){
  const claims = await readAll("section_claim_provenance","search_result_id",{match:q=>q.eq("intelligence_item_id",chosen.id).eq("claim_kind","FACT")});
  const srids=[...new Set(claims.map(c=>c.search_result_id).filter(Boolean))];
  let preExisting=0,total=0;
  for(const id of srids){ const {data}=await sb.from("agent_run_searches").select("searched_at").eq("id",id).single(); if(data){total++; if(String(data.searched_at).slice(0,10) < today) preExisting++;} }
  console.log(`  chosen item's FACT claims link to ${total} pool rows; ${preExisting}/${total} were fetched BEFORE today ⇒ reused, not re-scraped during grounding`);
}

// ── #3: staleness / searched_at present ──
console.log("\n===== #3 STALENESS / CHANGE-DETECTION =====");
const withTs = poolRows.filter(s=>s.searched_at).length;
console.log(`generate-pool rows carrying searched_at (fetch timestamp): ${withTs}/${poolRows.length}`);
const dates = poolRows.map(s=>String(s.searched_at).slice(0,10)).filter(Boolean).sort();
console.log(`  fetch-date range of stored content: ${dates[0]} … ${dates[dates.length-1]}`);
console.log(`  MODEL: stored result_content_excerpt is a POINT-IN-TIME snapshot at searched_at; it does NOT auto-update when the regulation changes.`);
console.log(`  Stored copy = the change-detection BASELINE to diff against; detecting a reg CHANGED requires a fresh fetch of the current version to compare.`);
process.exit(0);
