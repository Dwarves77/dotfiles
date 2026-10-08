// census-ecfr-stock-enumerate.mjs — US eCFR STOCK enumeration (operator ruling 2026-07-21, phase 1). glyph:verbatim
// Enumerates PARTS (the eCFR document granularity, matching EUR-Lex's per-instrument granularity) within
// a SCOPED set of (title, chapter, subchapter) targets chosen by agency-of-record + subject-matter fit
// for freight-sustainability, via the free eCFR versioner structure API (no LLM). Classification is a
// SEPARATE later phase.
//
// SCOPE (flagged explicitly — this is a judgment call, not a mechanical derivation; report to operator): glyph:verbatim
//   INCLUDED:
//     40/I/C   EPA — Air Programs (50 parts) glyph:verbatim
//     40/I/U   EPA — Air Pollution Controls / mobile+nonroad sources (22 parts) glyph:verbatim
//     49/I/A   PHMSA — Hazardous Materials and Oil Transportation (6 parts) glyph:verbatim
//     49/I/B   PHMSA — Oil Transportation (1 part) glyph:verbatim
//     49/I/C   PHMSA — Hazardous Materials Regulations (11 parts) glyph:verbatim
//     49/III/B FMCSA — Federal Motor Carrier Safety Regulations (38 parts) glyph:verbatim
//     49/V     NHTSA — all (66 parts; CAFE/fuel-economy standards scattered throughout) glyph:verbatim
//     33/I/O   Coast Guard — Pollution (8 parts; MARPOL Annex VI / APPS implementation) glyph:verbatim
//     14/I/C   FAA — Aircraft (20 parts; includes Part 34 emissions/fuel-venting) glyph:verbatim
//   EXCLUDED (not enumerated; the sustainability angle is either absent or lives elsewhere):
//     49/I/D   PHMSA Pipeline Safety — fixed infrastructure, not freight-forwarding glyph:verbatim
//     46/I, 46/II  Coast Guard vessel construction/manning + MarAd subsidy/policy — MARPOL lives in 33/I/O instead glyph:verbatim
//     14/I (all other subchapters) — non-emissions aviation administration glyph:verbatim
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ECFR_SOURCE_NAME_HINTS = ["ecfr", "electronic code of federal regulations", "u.s. environmental protection agency", "epa", "federal register"];
const CREATED_BY = "session-classify-stock-full";
const AS_OF = "2026-07-20";

const TARGETS = [
  { title: 40, chapter: "I", subchapter: "C", agency: "EPA" },
  { title: 40, chapter: "I", subchapter: "U", agency: "EPA" },
  { title: 49, chapter: "I", subchapter: "A", agency: "PHMSA" },
  { title: 49, chapter: "I", subchapter: "B", agency: "PHMSA" },
  { title: 49, chapter: "I", subchapter: "C", agency: "PHMSA" },
  { title: 49, chapter: "III", subchapter: "B", agency: "FMCSA" },
  { title: 49, chapter: "V", subchapter: null, agency: "NHTSA" },
  { title: 33, chapter: "I", subchapter: "O", agency: "Coast Guard" },
  { title: 14, chapter: "I", subchapter: "C", agency: "FAA" },
];

function findNode(node, type, identifier) {
  if (node.type === type && node.identifier === identifier) return node;
  for (const c of node.children || []) {
    const r = findNode(c, type, identifier);
    if (r) return r;
  }
  return null;
}

function partUrl({ title, chapter, subchapter, part }) {
  const seg = subchapter ? `chapter-${chapter}/subchapter-${subchapter}/part-${part}` : `chapter-${chapter}/part-${part}`;
  return `https://www.ecfr.gov/current/title-${title}/${seg}`;
}

async function findOrRegisterSource() {
  // Reuse an existing source row that already represents eCFR/Federal Register if one exists (retrieval
  // before generation, RD-8); do NOT invent a duplicate source row.
  const { data, error } = await sb.from("sources").select("id, name, url").ilike("name", "%federal register%");
  if (error) throw error;
  const hit = (data ?? []).find((s) => /federal register|ecfr/i.test(s.name));
  if (hit) return hit.id;
  throw new Error("No existing 'Federal Register' / eCFR source row found — register the source first (per platform doctrine, no silent auto-registration)."); // glyph:verbatim
}

async function main() {
  const started = Date.now();
  const sourceId = await findOrRegisterSource();
  console.log(`eCFR STOCK enumeration — using source_id ${sourceId} (existing Federal Register/eCFR row)\n`); // glyph:verbatim

  const existing = new Set();
  {
    let from = 0; const page = 1000;
    while (true) {
      const { data, error } = await sb.from("census_worklist").select("document_url").eq("source_id", sourceId).range(from, from + page - 1);
      if (error) throw error;
      data.forEach((r) => existing.add(r.document_url));
      if (data.length < page) break;
      from += page;
    }
  }
  console.log(`existing census_worklist rows for this source: ${existing.size}\n`);

  const titleCache = new Map();
  const allRows = [];
  const summary = [];

  for (const t of TARGETS) {
    if (!titleCache.has(t.title)) {
      const r = await fetch(`https://www.ecfr.gov/api/versioner/v1/structure/${AS_OF}/title-${t.title}.json`);
      titleCache.set(t.title, await r.json());
    }
    const titleTree = titleCache.get(t.title);
    const chNode = findNode(titleTree, "chapter", t.chapter);
    if (!chNode) { console.log(`Title ${t.title} Chapter ${t.chapter}: NOT FOUND, skipping`); continue; }
    const container = t.subchapter ? findNode(chNode, "subchapter", t.subchapter) : chNode;
    if (!container) { console.log(`Title ${t.title} Chapter ${t.chapter} Subchapter ${t.subchapter}: NOT FOUND, skipping`); continue; }
    const parts = (container.children || []).filter((n) => n.type === "part" && !n.reserved);
    const label = `${t.title}/${t.chapter}${t.subchapter ? "/" + t.subchapter : ""} (${t.agency})`;
    console.log(`${label}: ${parts.length} parts`);

    let inserted = 0, alreadyPresent = 0;
    for (const p of parts) {
      const url = partUrl({ title: t.title, chapter: t.chapter, subchapter: t.subchapter, part: p.identifier });
      if (existing.has(url)) { alreadyPresent++; continue; }
      existing.add(url); // guard against dup within this same run
      allRows.push({
        source_id: sourceId,
        document_url: url,
        lane: "A",
        created_by: CREATED_BY,
        shape_class: "instrument_page",
        enumeration_status: "discovered",
        instrument_identifier: `${t.title} CFR ${p.identifier}`,
        notes: [
          `Title: ${p.label_description || p.label}`,
          `Instrument: ${t.title} CFR Part ${p.identifier}`,
          `Agency: ${t.agency}`,
          `Chapter/Subchapter: ${t.chapter}${t.subchapter ? "/" + t.subchapter : ""}`,
        ].join("\n").slice(0, 1800),
      });
      inserted++;
    }
    summary.push({ label, universe: parts.length, alreadyPresent, new: inserted });
  }

  console.log(`\nTotal new rows to insert: ${allRows.length}`);
  let totalInserted = 0;
  for (let i = 0; i < allRows.length; i += 300) {
    const batch = allRows.slice(i, i + 300);
    const { data, error } = await sb.from("census_worklist").insert(batch).select("id");
    if (error) { console.error(`  [insert error, batch @${i}] ${error.message}`); continue; }
    totalInserted += data.length;
  }

  console.log("\n════ eCFR STOCK ENUMERATION SUMMARY ════");
  for (const s of summary) console.log(`${s.label}: universe ${s.universe}, already-present ${s.alreadyPresent}, new ${s.new}`);
  console.log(`\nTOTAL inserted: ${totalInserted} / attempted ${allRows.length}`);
  console.log(`Wall: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
