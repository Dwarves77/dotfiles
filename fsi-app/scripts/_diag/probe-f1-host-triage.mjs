/** P0-1 PHASE 0a triage worksheet (read-only). GOVERNING: source-credibility-model.
 *  For every unregistered span host (a host that grounds >=1 FACT claim but is NOT in `sources`),
 *  show: total FACT claims, how many are on REGULATORY-type items (flip-relevant under Option B) vs
 *  non-reg, and the reg items it grounds. Flip-relevant hosts drive whether a reg flips, so triage
 *  focuses there. PURE READS, paginated.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);

const items   = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,is_archived");
const sources = await readAll("sources", "id,url");
const claims  = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");

const itemById = new Map(items.map((i) => [i.id, i]));
const searchById = new Map(searches.map((r) => [r.id, r]));
const registeredHosts = new Set(); for (const s of sources) { const h = hostOf(s.url); if (h) registeredHosts.add(h); }

const host = new Map(); // host -> { reg, nonReg, regItems:Set, anyHigh:bool }
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived) continue;
  const sr = searchById.get(c.search_result_id); if (!sr) continue;
  const h = hostOf(sr.result_url);
  if (!h || registeredHosts.has(h)) continue; // only UNREGISTERED hosts
  const e = host.get(h) || { reg: 0, nonReg: 0, regItems: new Set(), high: 0 };
  const isReg = REG_TYPES.has(it.item_type);
  const isHigh = HIGH.has(it.priority);
  if (isReg) { e.reg++; if (isHigh) e.regItems.add(it.legacy_id || it.id.slice(0, 8)); } else e.nonReg++;
  if (isHigh) e.high++;
  host.set(h, e);
}

const arr = [...host.entries()].map(([h, e]) => ({ h, ...e, regItemsN: e.regItems.size }));
// flip-relevant first: hosts grounding CRITICAL/HIGH reg items
const flipRelevant = arr.filter((x) => x.regItems.size > 0).sort((a, b) => b.reg - a.reg);
const nonFlip = arr.filter((x) => x.regItems.size === 0).sort((a, b) => (b.reg + b.nonReg) - (a.reg + a.nonReg));

console.log(`unregistered span hosts: ${arr.length}  | flip-relevant (ground >=1 CRITICAL/HIGH reg item): ${flipRelevant.length}`);
console.log(`\n=== FLIP-RELEVANT unregistered hosts (triage priority) ===`);
console.log(`${"host".padEnd(38)} regCl  #regItems  reg items grounded`);
for (const x of flipRelevant)
  console.log(`${x.h.padEnd(38)} ${String(x.reg).padStart(5)}  ${String(x.regItemsN).padStart(8)}   ${[...x.regItems].slice(0, 6).join(", ")}${x.regItems.size > 6 ? " …" : ""}`);

console.log(`\n=== non-flip hosts (ground only non-reg/exempt items) — claim totals ===`);
console.log(nonFlip.map((x) => `${x.h}(${x.reg + x.nonReg})`).join("  "));
process.exit(0);
