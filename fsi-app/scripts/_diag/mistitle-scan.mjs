/**
 * mistitle-scan.mjs — READ-ONLY: detect title-vs-regulation mismatches. No mutations.
 *
 * Two mismatch signals, both deterministic:
 *   (1) NAME<->NUMBER: title names a regulation (short name) whose canonical reg number
 *       does NOT include the number written in the same title. e.g. "AI Act (2023/1804)"
 *       — AI Act = 2024/1689, but 2023/1804 = AFIR.
 *   (2) TITLE<->SOURCE NUMBER: the reg number in the title differs from the canonical reg
 *       number in the linked source (EUR-Lex ELI or CELEX). Ground-truth = the source.
 * Also reports NAME<->SOURCE (title short-name vs source number's canonical name).
 *
 * Identity/correspondence only — NO interpretation of what any regulation requires.
 * Where the actual regulation can't be determined, it's an unconfirmed gap (reported).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

// Curated EU-flagship reg map: canonical number -> [short names]. Number -> name.
const NUM2NAME = {
  "2023/956": "CBAM", "2022/2464": "CSRD", "2023/1804": "AFIR", "2023/2405": "ReFuelEU Aviation",
  "2023/1805": "FuelEU Maritime", "2023/1542": "Batteries Regulation", "2023/1115": "EUDR",
  "2024/1689": "AI Act", "2024/1781": "ESPR", "2024/1760": "CSDDD", "2020/852": "EU Taxonomy",
  "2023/959": "EU ETS Directive (amend)", "2003/87": "EU ETS Directive", "2015/757": "MRV Maritime",
  "2018/842": "Effort Sharing", "2023/2772": "ESRS", "2024/1991": "Nature Restoration",
};
// short name -> canonical number(s). Lowercased keys; word-boundary matched in titles.
const NAME2NUM = {
  "ai act": ["2024/1689"], "artificial intelligence act": ["2024/1689"],
  "cbam": ["2023/956"], "carbon border": ["2023/956"],
  "csrd": ["2022/2464"], "afir": ["2023/1804"], "alternative fuels infrastructure": ["2023/1804"],
  "refueleu": ["2023/2405"], "fueleu": ["2023/1805"], "battery regulation": ["2023/1542"], "batteries regulation": ["2023/1542"],
  "eudr": ["2023/1115"], "deforestation regulation": ["2023/1115"], "espr": ["2024/1781"],
  "csddd": ["2024/1760"], "due diligence directive": ["2024/1760"], "eu taxonomy": ["2020/852"],
  "esrs": ["2023/2772"], "effort sharing": ["2018/842"],
};

const numRe = /\b(19|20)\d{2}\s*\/\s*\d{1,4}\b/g;
const norm = (n) => n.replace(/\s+/g, "");
function titleNums(t) { return [...(t || "").matchAll(numRe)].map((m) => norm(m[0])); }
function titleNames(t) { const lc = (t || "").toLowerCase(); return Object.keys(NAME2NUM).filter((n) => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}([^a-z]|$)`).test(lc)); }
function sourceNum(url) {
  if (!url) return null;
  let m = url.match(/\/eli\/(?:reg|dir|dec)\/((?:19|20)\d{2}\/\d{1,4})/i); if (m) return norm(m[1]);
  m = url.match(/CELEX[:%]?3?A?3(\d{4})[RLD](\d{1,4})/i); if (m) return `${m[1]}/${parseInt(m[2],10)}`;
  return null;
}
const bodyNums = (b) => [...new Set([...(b || "").slice(0, 8000).matchAll(numRe)].map((m) => norm(m[0])))];

const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  // ---- Part A: the two known items, detailed ----
  console.log("===== PART A: known items body-check =====\n");
  const { rows: known } = await c.query(`
    SELECT i.id, i.legacy_id, i.title, i.provenance_status, i.item_type, i.source_id, i.source_url,
           s.name AS src_name, s.url AS src_url, left(i.full_brief, 1600) AS brief_head, length(i.full_brief) AS brief_len
    FROM intelligence_items i LEFT JOIN sources s ON s.id=i.source_id
    WHERE substring(i.id::text,1,8) IN ('62ba40b0','6f1e6615')`);
  for (const r of known) {
    const { rows: secs } = await c.query(`SELECT section_key, left(content_md,180) AS head FROM intelligence_item_sections WHERE item_id=$1 ORDER BY section_order`, [r.id]);
    console.log(`[${r.id.slice(0,8)}] ${r.legacy_id||""}  provenance=${r.provenance_status}  type=${r.item_type}`);
    console.log(`  TITLE: ${r.title}`);
    console.log(`  source: "${r.src_name}"  ${r.src_url || r.source_url}`);
    console.log(`  source ELI/CELEX number: ${sourceNum(r.src_url || r.source_url) || "(none parseable)"}`);
    console.log(`  brief(${r.brief_len}ch) head: ${(r.brief_head||"").replace(/\s+/g," ").slice(0,700)}`);
    console.log(`  body reg-numbers: ${bodyNums(r.brief_head).join(", ") || "(none)"}`);
    console.log(`  sections(${secs.length}): ${secs.map(x=>x.section_key).join(",")}`);
    if (secs[0]) console.log(`    s[${secs[0].section_key}] head: ${(secs[0].head||"").replace(/\s+/g," ")}`);
    console.log("");
  }

  // ---- Part B: corpus-wide scan ----
  console.log("===== PART B: corpus-wide title<->regulation scan =====\n");
  const { rows } = await c.query(`
    SELECT i.id, i.legacy_id, i.title, i.provenance_status, i.is_archived, i.source_url,
           s.url AS src_url, left(i.full_brief,8000) AS brief
    FROM intelligence_items i LEFT JOIN sources s ON s.id=i.source_id
    WHERE i.is_archived=false`);
  const flags = [];
  for (const r of rows) {
    // ground truth = per-item canonical pointer (item.source_url), NOT the shared registry row url.
    const tNums = titleNums(r.title), tNames = titleNames(r.title), sNum = sourceNum(r.source_url || r.src_url);
    const regNum = sourceNum(r.src_url); // registry-row number (secondary; generic buckets diverge legitimately)
    const reasons = [];
    // (1) name<->number within title
    for (const nm of tNames) for (const tn of tNums) if (!NAME2NUM[nm].includes(tn)) reasons.push(`NAME!=NUM: title "${nm}"(${NAME2NUM[nm].join("/")}) vs title-number ${tn}=${NUM2NAME[tn]||"?"}`);
    // (2) title number <-> source number
    if (sNum) for (const tn of tNums) if (tn !== sNum) reasons.push(`TITLE!=SOURCE: title ${tn}=${NUM2NAME[tn]||"?"} vs source ${sNum}=${NUM2NAME[sNum]||"?"}`);
    // (3) title name <-> source number
    if (sNum) for (const nm of tNames) if (!NAME2NUM[nm].includes(sNum)) reasons.push(`NAME!=SOURCE: title "${nm}" vs source ${sNum}=${NUM2NAME[sNum]||"?"}`);
    if (reasons.length) flags.push({ id: r.id, legacy_id: r.legacy_id, title: r.title, ps: r.provenance_status, sNum, tNums, tNames, reasons: [...new Set(reasons)] });
  }
  const byPs = (ps) => flags.filter((f) => f.ps === ps);
  console.log(`scanned ${rows.length} active items; flagged ${flags.length}\n`);
  for (const ps of ["verified", "quarantined"]) {
    const set = byPs(ps);
    console.log(`--- provenance_status='${ps}' : ${set.length} flagged ${ps === "verified" ? "<<< LIVE / CUSTOMER-VISIBLE" : ""} ---`);
    for (const f of set) {
      console.log(`  [${f.id.slice(0,8)}] ${f.legacy_id||""}  src#=${f.sNum||"-"}`);
      console.log(`     title: ${f.title}`);
      for (const r of f.reasons) console.log(`     • ${r}`);
    }
    console.log("");
  }
  const verifiedIds = byPs("verified").map((f) => f.id.slice(0,8));
  console.log(`VERIFIED mislabels (live trust defects): ${byPs("verified").length}  ids=[${verifiedIds.join(", ")}]`);
  console.log("READ-ONLY. No mutations.");
} finally { await c.end(); }
