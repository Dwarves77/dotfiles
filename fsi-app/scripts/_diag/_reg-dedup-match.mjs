// DEDUP-MATCH (read-only, FREE): split the re-point universe into the three exact sub-ops by matching
// portal items to their ENACTED twins. Conservative: STRONG twin = shared reg-number or a distinctive
// acronym (CSRD/EUDR/CBAM/HDV/AFIR/FUELEU/…); WEAK (generic ETS-family etc.) is flagged for review, never
// auto-archived. Output: SUB-OP 1 (archive portal dup + reground enacted twin), SUB-OP 2 (re-point, no
// twin), SUB-OP 3 (standards/frameworks — no enacted text). No writes, no fetch, no LLM.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const LEGAL_HOST = /(^|\.)(eur-lex\.europa\.eu|europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk|gov\.uk)$/i;
const ENACTED_HOST = /(^|\.)(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)$/i;
const ENACTED_DOC = /celex|\/eli\/|legal-content|\/txt\b|billtextclient|billnavclient|\/ccivil|\/lei\/l?\d|normasoficiales|\/rule\/[a-z0-9-]{6,}|selectdoc|t\d{8}|\.pdf($|\?)|leginfo|legislation\.gov\.uk|wwwcdn\.imo\.org|assets\.publishing\.service\.gov\.uk/i;
// standards / frameworks: no EUR-Lex enacted text — canonical = the body's own published document.
const STANDARDS = /sciencebasedtargets|sbti|ghgprotocol|ifrs\.org|\biso\.org|globalreporting|icao\.int|smartfreightcentre|cdp\.net|energystar|usgbc|lrfoundation|SBTi|GHG Protocol|ISSB|IFRS S2|ISO 1408|\bGRI\b|CORSIA|\bGLEC\b|\bLEED\b|Energy Star|Global Reporting/i;

// Distinctive reg tokens (acronyms + canonical topic phrases). Generic ETS is intentionally WEAK.
const ACR = ["CBAM","CSRD","EUDR","AFIR","HDV","\\bMRV\\b","PPWR","FUELEU","REFUELEU","MEES","EEXI","ICS2","NZIA","\\bUCC\\b","RTFO","WLTP"];
const PHRASE = [
  [/DEFORESTATION/, "EUDR"], [/CARBON BORDER/, "CBAM"], [/SUSTAINABILITY REPORT/, "CSRD"], [/HEAVY.?DUTY/, "HDV"],
  [/ALTERNATIVE FUELS? INFRA/, "AFIR"], [/FUEL\s?EU.*MARITIME|FUELEU/, "FUELEU"], [/REFUEL\s?EU/, "REFUELEU"],
  [/BATTERY REG|BATTERIES REG/, "BATTERY"], [/NET.?ZERO INDUSTRY/, "NZIA"], [/WEIGHTS AND DIMENSIONS/, "WEIGHTS"],
  [/RENEWABLE TRANSPORT FUEL/, "RTFO"], [/PACKAGING AND PACKAGING WASTE|\bPPWR\b/, "PPWR"], [/MIN.* ENERGY EFFIC.* STANDARD|\bMEES\b/, "MEES"],
  [/DEFOREST/, "EUDR"], [/UNION CUSTOMS CODE/, "UCC"], [/LOCAL LAW 97|LL97/, "LL97"],
];
function tokens(it) {
  const t = ((it.title || "") + " " + (it.source_url || "")).toUpperCase().replace(/-/g, "");
  const toks = new Set();
  for (const a of ACR) { const re = new RegExp(a.replace(/\\b/g, "\\b"), "i"); if (re.test(t)) toks.add(a.replace(/\\b/g, "")); }
  for (const m of t.matchAll(/\b(19|20)\d{2}\/\d{1,4}\b/g)) toks.add("REG:" + m[0]);
  for (const [re, tok] of PHRASE) if (re.test(t)) toks.add(tok);
  return toks;
}

const items = [];
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from("intelligence_items").select("id,title,item_type,source_url,provenance_status,is_archived").order("id").range(from, from + 999);
  if (!data?.length) break; items.push(...data); if (data.length < 1000) break;
}
const reg = items.filter((r) => REG_FAMILY.includes(r.item_type) && !r.is_archived);

function bucketOf(r) {
  const blob = (r.title || "") + " " + (r.source_url || "");
  if (STANDARDS.test(blob)) return "standards";
  const host = hostOf(r.source_url); let path = ""; try { const u = new URL(r.source_url); path = u.pathname + (u.search || ""); } catch {}
  if (ENACTED_HOST.test(host) || ENACTED_DOC.test(r.source_url)) return "enacted";
  return "portal"; // everything else (portal/announce/borderline/program) = re-point candidate universe
}
for (const r of reg) { r._b = bucketOf(r); r._tok = tokens(r); }
const enacted = reg.filter((r) => r._b === "enacted");
const portal = reg.filter((r) => r._b === "portal");
const standards = reg.filter((r) => r._b === "standards");

function findTwin(p) {
  let strong = null, weak = null;
  for (const e of enacted) {
    const shared = [...p._tok].filter((t) => e._tok.has(t));
    if (!shared.length) continue;
    const distinctive = shared.some((t) => t.startsWith("REG:") || !["ETS", "SAF"].includes(t));
    if (distinctive) { strong = { e, shared }; break; }
    weak = weak || { e, shared };
  }
  return strong || (weak ? { ...weak, weak: true } : null);
}

const subop1 = [], subop2 = [], review = [];
for (const p of portal) {
  const tw = findTwin(p);
  if (tw && !tw.weak) subop1.push({ p, e: tw.e, shared: tw.shared });
  else if (tw && tw.weak) review.push({ p, e: tw.e, shared: tw.shared });
  else subop2.push(p);
}

console.log(`REG-FAMILY active: ${reg.length}  |  enacted ${enacted.length}  portal ${portal.length}  standards ${standards.length}`);
console.log(`\n=== SUB-OP 1 — ARCHIVE portal dup + RE-GROUND enacted twin (${subop1.length}) ===`);
for (const m of subop1) console.log(`  ARCHIVE ${m.p.id.slice(0,8)} "${(m.p.title||"").slice(0,34)}" [${m.p.provenance_status}]\n     twin→ ${m.e.id.slice(0,8)} "${(m.e.title||"").slice(0,40)}" (${[...m.shared].join(",")})`);
console.log(`\n=== REVIEW — weak/ambiguous match, confirm before archiving (${review.length}) ===`);
for (const m of review) console.log(`  ? ${m.p.id.slice(0,8)} "${(m.p.title||"").slice(0,34)}"  ~  ${m.e.id.slice(0,8)} "${(m.e.title||"").slice(0,34)}" (${[...m.shared].join(",")})`);
console.log(`\n=== SUB-OP 2 — RE-POINT (no enacted twin) + re-ground (${subop2.length}) ===`);
for (const p of subop2) console.log(`  ${p.id.slice(0,8)} [${p.provenance_status}] ${hostOf(p.source_url)} | ${(p.title||"").slice(0,40)}`);
console.log(`\n=== SUB-OP 3 — STANDARDS/FRAMEWORKS (separate track, NOT enacted-text re-point) (${standards.length}) ===`);
for (const s of standards) console.log(`  ${s.id.slice(0,8)} [${s.provenance_status}] ${hostOf(s.source_url)} | ${(s.title||"").slice(0,40)}`);

// CBAM / EUDR prove-on-one candidate check (should be in SUB-OP 2 = clean re-point, no twin)
const cb = reg.find((r) => /CBAM|CARBON BORDER/i.test(r.title||""));
const eu = reg.find((r) => /EUDR|DEFORESTATION/i.test(r.title||""));
const where = (x) => !x ? "—" : subop1.find(m=>m.p.id===x.id) ? "SUB-OP1(twin!)" : subop2.includes(x) ? "SUB-OP2(clean re-point ✓)" : review.find(m=>m.p.id===x.id) ? "REVIEW" : x._b;
console.log(`\n=== PROVE-ON-ONE candidates ===`);
console.log(`  CBAM: ${cb?cb.id.slice(0,8):"—"} → ${where(cb)}`);
console.log(`  EUDR: ${eu?eu.id.slice(0,8):"—"} → ${where(eu)}`);

// re-fetch population + non-legal host count (S1 enacted twins to reground + S2 repointed→enacted(legal) + S3 enacted-truncated)
const enactedNonLegal = enacted.filter((r) => !LEGAL_HOST.test(hostOf(r.source_url)));
console.log(`\n=== FETCH COST (non-legal = Browserless units) ===`);
console.log(`  enacted items on NON-legal host (re-ground re-fetch cost): ${enactedNonLegal.length}/${enacted.length}`);
console.log(`  hosts: ${[...new Set(enactedNonLegal.map(r=>hostOf(r.source_url)))].join(", ")}`);
console.log(`  (re-pointed SUB-OP2 items become EUR-Lex/legal = FREE fetch once re-pointed)`);
process.exit(0);
