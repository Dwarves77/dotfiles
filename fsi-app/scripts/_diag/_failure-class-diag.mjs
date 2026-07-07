// DIAGNOSE-BEFORE-BATCH (read-only). Separates the two failure classes behind the 78 cross-item-dirty
// items, and probes the flagship-sourcing root cause. No Sonnet/Browserless spend.
//  (1) Classify the 78: reg-family+high-priority (would hit the authority floor on re-ground = honest
//      secondary) vs floor-EXEMPT (non-reg or low-priority — dirt is a registration gap, not authority).
//  (2) Tabulate the unregistered HOSTS their FACT spans sit on, split primary-looking vs secondary/trade.
//  (3) CSRD's declared source_url (was the primary even EUR-Lex?).
//  (4) Label-syntax systematic-or-not proxy: how many VERIFIED items carry >=1 ANALYSIS claim (those
//      passed criterion-4 label-syntax WITH analysis present -> the label path works at scale).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver, hostOf, hostInstitution } = await jiti.import(resolve(ROOT, "src/lib/sources/institution.ts"));
const sb = readClient();

async function pageAll(table, cols, applyMatch) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order("id").range(from, from + 999);
    if (applyMatch) q = applyMatch(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}

const sources = await pageAll("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const items = await pageAll("intelligence_items", "id,legacy_id,item_type,priority,provenance_status,source_url",
  (q) => q.eq("provenance_status", "verified").eq("is_archived", false));
const itemById = new Map(items.map((i) => [i.id, i]));
const claims = await pageAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id");

// search urls
const srIds = [...new Set(claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id).map((c) => c.search_result_id))];
const urlById = new Map();
for (let i = 0; i < srIds.length; i += 200) { const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", srIds.slice(i, i + 200)); for (const r of data || []) urlById.set(r.id, r.result_url); }

const REG_FAMILY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const HIGH = new Set(["CRITICAL", "HIGH"]);
const PRIMARY_HOST_RE = /(\.gov(\.|$)|\.gov\.|europa\.eu|eur-lex|legislation\.|\.gob\.|\.gc\.ca|imo\.org|icao\.int|unece\.org|\.go\.|parliament\.|official|mpa\.gov)/i;

const nullByItem = new Map();        // itemId -> count of unregistered-span FACTs
const hostHist = new Map();          // unregistered host -> count
const analysisItems = new Set();     // verified items with >=1 ANALYSIS claim
for (const c of claims) {
  if (c.claim_kind === "ANALYSIS" && itemById.has(c.intelligence_item_id)) analysisItems.add(c.intelligence_item_id);
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  if (!itemById.has(c.intelligence_item_id)) continue;
  const url = urlById.get(c.search_result_id) || "";
  if (resolver.resolveSpan(url).tier == null) {
    nullByItem.set(c.intelligence_item_id, (nullByItem.get(c.intelligence_item_id) || 0) + 1);
    const h = hostInstitution(hostOf(url)) || "?";
    hostHist.set(h, (hostHist.get(h) || 0) + 1);
  }
}

const dirty = [...nullByItem.keys()].map((id) => itemById.get(id));
let regHigh = 0, regLow = 0, nonReg = 0;
for (const it of dirty) {
  const rf = REG_FAMILY.has(it.item_type), hi = HIGH.has(it.priority);
  if (rf && hi) regHigh++; else if (rf) regLow++; else nonReg++;
}

console.log(`══ THE 78 (cross-item-dirty verified items) ══`);
console.log(`total dirty: ${dirty.length}`);
console.log(`  reg-family + HIGH/CRITICAL  (WOULD hit authority floor on re-ground = honest-secondary class): ${regHigh}`);
console.log(`  reg-family + lower priority  (floor-EXEMPT — dirt is registration gap, not authority):         ${regLow}`);
console.log(`  non-reg item types           (floor-EXEMPT — dirt is registration gap, not authority):         ${nonReg}`);

console.log(`\n══ unregistered HOSTS the dirty FACT spans sit on (top 20) ══`);
const top = [...hostHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
let primarySpans = 0, secondarySpans = 0;
for (const [h, n] of hostHist) { if (PRIMARY_HOST_RE.test(h)) primarySpans += n; else secondarySpans += n; }
for (const [h, n] of top) console.log(`  ${String(n).padStart(4)}  ${PRIMARY_HOST_RE.test(h) ? "[primary?]" : "[secondary]"} ${h}`);
console.log(`\n  unregistered FACT spans on PRIMARY-looking hosts (registration gap — register & re-stamp): ${primarySpans}`);
console.log(`  unregistered FACT spans on SECONDARY/trade hosts (authority — primary-or-relabel):        ${secondarySpans}`);

console.log(`\n══ label-syntax systematic-or-not proxy ══`);
console.log(`  verified items total: ${items.length}`);
console.log(`  verified items carrying >=1 ANALYSIS claim (passed criterion-4 label-syntax WITH analysis present): ${analysisItems.size}`);
console.log(`  => if this is a large share, the label path WORKS at scale; label-syntax is not a corpus-wide bug.`);

console.log(`\n══ CSRD declared source ══`);
for (const id of ["9c5d1d17-4388-43a0-b9df-67de1fc0e582", "f0833999-8c58-4f00-8389-0a3f938641f3"]) {
  const { data } = await sb.from("intelligence_items").select("legacy_id,item_type,priority,source_url,provenance_status").eq("id", id).single();
  console.log(`  ${id.slice(0, 8)} type=${data.item_type} prio=${data.priority} prov=${data.provenance_status}\n      source_url=${data.source_url}`);
}
process.exit(0);
