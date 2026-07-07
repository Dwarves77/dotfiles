// PROMOTE-FROM-POOL (default: READ-ONLY DRY-RUN). The enacted URLs were ALREADY discovered by the prior
// deep-dive generate and stored as corroborators in each item's agent_run_searches pool — the prior pass
// just kept the portal page as the primary source_url and never promoted the enacted corroborator. This
// tool selects the SPECIFIC reg-number-bearing enacted doc (CELEX/ELI/FedReg/UK/IMO) from the item's own
// pool and (on --apply) promotes it to source_url. It NEVER promotes a bare homepage or a COM proposal —
// those are flagged for individual review. No re-discovery, no web_search, no LLM.
//
//   node scripts/_diag/_reg-promote-from-pool.mjs            # dry-run, flagships + corpus summary
//   node scripts/_diag/_reg-promote-from-pool.mjs --apply efdb3390   # guarded promote ONE confirmed item
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, guardedUpdate } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();

const applyPrefix = process.argv.includes("--apply") ? process.argv[process.argv.indexOf("--apply") + 1] : null;
const REG = ["regulation", "directive", "standard", "guidance", "framework"];

// Classify a pool URL → an enacted-doc kind + a human reg-number display + a priority score.
// PROPOSAL (COM) and HOMEPAGE are explicitly rejected (score 0) so they can never be auto-promoted.
function classifyUrl(raw) {
  let u = raw; try { u = decodeURIComponent(raw); } catch {}
  let m;
  if (/com[_:]\d{4}[_/]\d+|comnat[:_]com|\/com_\d/i.test(u)) return { kind: "PROPOSAL(COM)", display: "COM proposal — NOT enacted", score: 0, url: raw };
  if ((m = u.match(/celex[:\s]*?(\d)(\d{4})([A-Z])(\d{3,4})/i))) return { kind: "celex", display: `${m[3] === "L" ? "Directive" : "Reg"} ${m[2]}/${String(+m[4])}`, score: 6, url: raw };
  if ((m = u.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)/i))) return { kind: "eli", display: `${m[1] === "dir" ? "Directive" : "Reg"} ${m[2]}/${m[3]}`, score: 6, url: raw };
  if ((m = u.match(/federalregister\.gov\/documents\/(\d{4})\/(\d{2})\/(\d{2})/i))) return { kind: "fedreg", display: `FedReg ${m[1]}-${m[2]}-${m[3]}`, score: 5, url: raw };
  if ((m = u.match(/legislation\.gov\.uk\/([a-z]+)\/(\d{4})\/(\d+)/i))) return { kind: "uklaw", display: `UK ${m[1]} ${m[2]}/${m[3]}`, score: 5, url: raw };
  if ((m = u.match(/wwwcdn\.imo\.org\/.+(MEPC|MSC)[._]?\s*(\d+\(\d+\))/i))) return { kind: "imo", display: `IMO ${m[1]}.${m[2]}`, score: 4, url: raw };
  if (/planalto\.gov\.br\/ccivil.*\/lei\/l\d+/i.test(u)) return { kind: "brlaw", display: "BR Lei (enacted)", score: 4, url: raw };
  if (/leginfo\.legislature\.ca\.gov\/faces\/billtext.*bill_id=\d+/i.test(u)) return { kind: "calaw", display: "CA bill text", score: 4, url: raw };
  let path = ""; try { path = new URL(raw).pathname; } catch {}
  if (/eur-lex\.europa\.eu/i.test(u) && (path === "" || path === "/" || /^\/(homepage|oj)?\/?$/i.test(path))) return { kind: "HOMEPAGE", display: "eur-lex homepage — NOT a doc", score: 0, url: raw };
  if (/eur-lex\.europa\.eu\/legal-content/i.test(u) && /uri=/i.test(u)) return { kind: "eurlex-uri?", display: "eur-lex doc (uri unparsed — inspect)", score: 2, url: raw };
  return { kind: "other", display: "other (not clearly enacted)", score: 1, url: raw };
}

// best enacted candidate from a pool (highest score; ties → first). PROMOTE iff score>=4 (a real enacted doc).
function pickBest(poolUrls) {
  const cands = poolUrls.map(classifyUrl).sort((a, b) => b.score - a.score);
  const best = cands[0];
  const promotable = best && best.score >= 4;
  return { best, promotable, cands };
}

// load reg items + pools
const items = [];
for (let f = 0; ; f += 1000) { const { data } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,source_url,is_archived").order("id").range(f, f + 999); if (!data?.length) break; items.push(...data); if (data.length < 1000) break; }
const reg = items.filter((r) => REG.includes(r.item_type) && !r.is_archived);
const byId = new Map(reg.map((r) => [r.id, r]));
const pools = new Map();
for (let f = 0; ; f += 1000) { const { data } = await sb.from("agent_run_searches").select("intelligence_item_id,result_url").order("id").range(f, f + 999); if (!data?.length) break; for (const p of data) { if (!byId.has(p.intelligence_item_id) || !p.result_url) continue; (pools.get(p.intelligence_item_id) || pools.set(p.intelligence_item_id, []).get(p.intelligence_item_id)).push(p.result_url); } if (data.length < 1000) break; }

// ── APPLY (guarded, single item) ──
if (applyPrefix) {
  const it = reg.find((r) => r.id.startsWith(applyPrefix));
  if (!it) { console.error(`item ${applyPrefix}* not found`); process.exit(1); }
  const { best, promotable } = pickBest(pools.get(it.id) || []);
  if (!promotable) { console.error(`REFUSE: best pool candidate for ${it.id.slice(0,8)} is "${best?.display}" (score ${best?.score}) — not a reg-number-bearing enacted doc. Review manually.`); process.exit(1); }
  if (it.source_url === best.url) { console.log("already points there — no write"); process.exit(0); }
  console.log(`PROMOTE ${it.id.slice(0,8)} "${(it.title||"").slice(0,40)}"\n  from: ${it.source_url}\n  to  : ${best.url}  (${best.display})`);
  const res = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { source_url: best.url },
    { cite: { skill: "environmental-policy-and-innovation", reason: `promote enacted ${best.display} from item's own discovered pool to source_url (retrieval gap, not re-discovery); enables grounding against the actual law` } });
  console.log(`  updated=${res.updated}  snapshot=${res.snapshot}`);
  process.exit(0);
}

// ── DRY-RUN ──
const FLAG = [
  ["CBAM (no-twin)", "51b2c91e"], ["EUDR (no-twin)", "1e80067a"], ["MRV (no-twin)", "3af75490"],
  ["EU Taxonomy (no-twin)", "4547e8c5"], ["Euro 7 (no-twin)", "e0c0151c"], ["CSRD", "87493612"],
  ["HDV CO2", "3ae89ce6"], ["Fit-for-55", "d5ee6ab8"], ["Aviation ETS", "56031fd3"],
  ["ETS Shipping", "91534b5a"], ["ICS2", "1883001c"], ["IMO MARPOL", "a8cdaa93"], ["IMO GHG", "daecac87"],
];
console.log(`=== FLAGSHIP DRY-RUN (chosen enacted URL per item; PROMOTE iff reg-number-bearing doc) ===`);
for (const [label, prefix] of FLAG) {
  const it = reg.find((r) => r.id.startsWith(prefix));
  if (!it) { console.log(`  ${label}: ${prefix} not found`); continue; }
  const { best, promotable, cands } = pickBest(pools.get(it.id) || []);
  const status = promotable ? "PROMOTE ✓" : (best && best.score > 0 ? "REVIEW (homepage/proposal/weak)" : "NO ENACTED IN POOL");
  console.log(`\n  ${label}  ${it.id.slice(0,8)}  [${status}]`);
  console.log(`    chosen: ${best ? `${best.display}  (${best.kind})  ${best.url}` : "—"}`);
  const others = cands.filter((c) => c !== best && c.score > 0).slice(0, 3);
  if (others.length) console.log(`    other pool hits: ${others.map((c) => `${c.kind}:${c.display}`).join(" | ")}`);
}

// corpus summary
let promoteN = 0, reviewN = 0, noneN = 0;
const portalReg = reg.filter((r) => !/eur-lex|federalregister\.gov\/documents|\/eli\/|legislation\.gov\.uk\/[a-z]+\/\d/i.test(r.source_url || ""));
for (const r of portalReg) {
  const { best, promotable } = pickBest(pools.get(r.id) || []);
  if (promotable) promoteN++; else if (best && best.score > 0) reviewN++; else noneN++;
}
console.log(`\n=== CORPUS SUMMARY (${portalReg.length} portal-sourced reg items) ===`);
console.log(`  ${promoteN}  PROMOTE-able NOW (reg-number-bearing enacted doc already in pool — $0 discovery)`);
console.log(`  ${reviewN}  REVIEW (pool has only homepage/proposal/weak hits — individual eyeball)`);
console.log(`  ${noneN}  NO enacted in pool (standards/frameworks OR genuine discovery gap — quoted separately)`);
process.exit(0);
