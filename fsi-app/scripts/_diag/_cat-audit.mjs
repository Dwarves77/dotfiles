// READ-ONLY ($0) CATEGORIZATION-INTEGRITY AUDIT. The GLEC case revealed a class: a news page became a
// FRAMEWORK item, and one subject got two differently-typed items. Audit the corpus for the class:
//   A. SOURCE-ROLE != ITEM-TYPE — a primary-artifact item (regulation/directive/standard/guidance/
//      framework) whose own source_url is a NEWS/secondary page (A1), and/or whose FACT claims are
//      grounded predominantly on NEWS/ANALYSIS tier sources T5-T6 (A2). The moat's primary-vs-secondary
//      distinction failing at intake.
//   B. SAME-SUBJECT, INCONSISTENT TYPES — entity groups (same regulation/framework) spanning >1 item_type.
//   C. (surfaced for spot-check) the A1 set are the prime "grounded on a secondary's characterization
//      rather than the document's substance" candidates.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

const PRIMARY = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const NEWS_RE = /\/(news|press|press-?releases?|media|newsroom|announcements?|articles?|stories|blog|insights?|updates?)(\/|$|\?|#)|news\./i;
const PRIMARY_URL_RE = /(eur-lex\.europa\.eu|legislation\.gov\.uk|federalregister\.gov|ecfr\.gov|govinfo\.gov|official.?journal|legal-content|\.pdf($|\?|#)|\/documents?\/|\/eli\/|celex)/i;
const role = (u) => { const s = String(u || ""); if (PRIMARY_URL_RE.test(s)) return "primary"; if (NEWS_RE.test(s)) return "news/secondary"; return "other"; };

const STOP = new Set("the a an of for and to in on at by with from version update updated new releases release plan program programme requirements standard standards regulation rule act directive".split(" "));
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const ENTITY = ["CBAM", "GLEC", "CORSIA", "AFIR", "REFUELEU", "EUDR", "CSRD", "EEXI", "MEES", "ISSB", "JOLT", "FUELEU", "TOP RUNNER", "ROADCHECK", "FIT FOR 55", "ADVANCED CLEAN TRUCKS", "ADVANCED CLEAN FLEETS", "GHG PROTOCOL", "ISO 14083", "LOCAL LAW 97", "LL97", "SECR", "MARPOL", "GRI", "SBTI", "EURO 7", "SMARTWAY", "TOP RUNNER"];
const regNums = (s) => [...new Set((String(s || "").match(/\b(?:19|20)\d{2}\/\d{1,4}\b/g) || []))];
const entKey = (it) => {
  const U = ` ${norm(it.title).toUpperCase()} `;
  const e = ENTITY.find((x) => U.includes(` ${x} `));
  if (e) return `ent:${e}`;
  const r = regNums(`${it.title} ${it.instrument_identifier || ""}`)[0];
  if (r) return `reg:${r}`;
  return null; // ungrouped
};

const items = await readAll("intelligence_items", "id,title,source_url,item_type,provenance_status,source_id,instrument_identifier,jurisdiction_iso,is_archived", { match: (q) => q.eq("is_archived", false) });
const srcs = await readAll("sources", "id,base_tier,tier_override,url,name");
const tierOf = new Map(srcs.map((s) => [s.id, s.tier_override ?? s.base_tier]));
const scp = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,source_id");
const factSrcByItem = new Map();
for (const c of scp) {
  if ((c.claim_kind || "").toUpperCase() !== "FACT") continue;
  if (!factSrcByItem.has(c.intelligence_item_id)) factSrcByItem.set(c.intelligence_item_id, []);
  factSrcByItem.get(c.intelligence_item_id).push(tierOf.get(c.source_id) ?? null);
}
console.log(`items=${items.length} (PRIMARY-type=${items.filter((i) => PRIMARY.has(i.item_type)).length}) sources=${srcs.length} FACT-claim rows=${scp.filter((c)=>(c.claim_kind||"").toUpperCase()==="FACT").length}\n`);

// ── AUDIT A ──
const A1 = [], A2 = [];
for (const it of items) {
  if (!PRIMARY.has(it.item_type)) continue;
  const r = role(it.source_url);
  if (r === "news/secondary") A1.push(it);
  const tiers = (factSrcByItem.get(it.id) || []).filter((t) => t != null);
  if (tiers.length >= 3) {
    const secondary = tiers.filter((t) => t >= 5).length;
    if (secondary / tiers.length > 0.5) A2.push({ it, secondary, total: tiers.length });
  }
}
console.log(`════ AUDIT A — source-role != item-type (primary-artifact items grounded on secondary) ════`);
console.log(`A1: primary-type item whose OWN source_url is a NEWS/secondary page: ${A1.length}`);
for (const it of A1.slice(0, 40)) console.log(`   [${it.provenance_status}] ${it.id.slice(0, 8)} ${it.item_type} <- ${role(it.source_url)} :: ${String(it.source_url).slice(0, 70)} | ${it.title.slice(0, 40)}`);
console.log(`\nA2: primary-type item whose FACT claims are >50% grounded on T5-T6 (news/analysis): ${A2.length}`);
for (const { it, secondary, total } of A2.slice(0, 40)) console.log(`   [${it.provenance_status}] ${it.id.slice(0, 8)} ${it.item_type} ${secondary}/${total} FACTs on T5-6 | ${it.title.slice(0, 42)}`);

// ── AUDIT B ──
const groups = new Map();
for (const it of items) { const k = entKey(it); if (!k) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
const mixed = [...groups.entries()].filter(([, g]) => new Set(g.map((x) => x.item_type)).size > 1);
console.log(`\n════ AUDIT B — same subject, INCONSISTENT item_types ════`);
console.log(`entity groups with >1 distinct item_type: ${mixed.length}`);
for (const [k, g] of mixed) {
  console.log(`   ${k}: ${g.map((x) => `${x.id.slice(0, 8)}[${x.item_type}/${x.provenance_status}]`).join("  ")}`);
  for (const x of g) console.log(`        - "${x.title.slice(0, 60)}"  (src ${role(x.source_url)})`);
}

console.log(`\n════ SUMMARY ════`);
console.log(`  A1 (primary item on a news/secondary URL): ${A1.length}  | A2 (FACTs mostly T5-6): ${A2.length}`);
console.log(`  B (same-subject mixed types): ${mixed.length} groups`);
console.log(`  A1 by status: ${JSON.stringify(A1.reduce((m, i) => ((m[i.provenance_status] = (m[i.provenance_status] || 0) + 1), m), {}))}`);
process.exit(0);
