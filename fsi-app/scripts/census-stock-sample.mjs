// census-stock-sample.mjs — EUR-Lex STOCK calibration sample (operator ruling 2026-07-20, Task 4).
//
// The in-force EUR-Lex universe across the five freight chapters is 10,676 distinct instruments (>10,000
// finish-or-defer threshold), so a stratified sample runs FIRST to measure the freight-relevant hit rate,
// the would_mint split, and the dedup rate per chapter before any full pass. METADATA-CLASSIFIED: the
// classifier reads a blob built from SPARQL metadata (title + subject-matter + EuroVoc + resource-type +
// CELEX + chapters), NOT a per-document HTML fetch — the eur-lex.europa.eu HTML site is bot-walled (HTTP
// 202), but the publications.europa.eu SPARQL data endpoint responds normally, so metadata classification
// never hits the wall. Reuses the REAL chokepoint (firstFetchClassify -> buildCandidateSeed ->
// applyStagedUpdate dryRun) so the sample's dispositions are the same gates the flow census used.
//
// SAMPLE SPEC: min 30 per chapter (or the full chapter if fewer), drawn across resource-types (Regulation,
// Directive, Decision, Implementing, Delegated) proportional to the chapter's composition. Plan-mode only:
// zero mints, zero grounding. Haiku classification for the sample is operator-authorized (report actuals).
//
// Env (source .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v} (source fsi-app/.env.local)`); process.exit(2); }
}

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { firstFetchClassify } = await jiti.import("../src/lib/llm/first-fetch-classify.ts");
const { buildCandidateSeed } = await jiti.import("../src/lib/intake/portal-harvest.ts");
const { applyStagedUpdate } = await jiti.import("../src/lib/intake/apply-staged-update.ts");
const { writeCensusRows } = await jiti.import("../src/lib/intake/census-writer.mjs");
const { withLease } = await jiti.import("./lib/mutation-lease.mjs");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EURLEX = { id: "260089a9-e334-4104-843c-cdfc28a94dcc", tier: 1, category: "regulatory", name: "EUR-Lex" };
const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const DIR_BASE = "http://publications.europa.eu/resource/authority/dir-eu-legal-act/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const ALL_CHAPTERS = { "02 Customs": "02", "07 Transport": "07", "09 Taxation": "09", "12 Energy": "12", "15 Environment": "15" };
const argChapter = (() => { const i = process.argv.indexOf("--chapter"); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null; })();
const CHAPTERS = argChapter ? Object.fromEntries(Object.entries(ALL_CHAPTERS).filter(([, c]) => c === argChapter)) : ALL_CHAPTERS;
const argN = (() => { const i = process.argv.indexOf("--n"); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : null; })();
const PER_CHAPTER = argN && Number.isInteger(argN) && argN > 0 ? argN : 30; // minimum sample per chapter (override with --n for a smoke test)
const RELEVANCE_FLOOR = 40;         // D3 relevance floor (matches the flow-census low-relevance split)

async function sparql(q) {
  const u = `${ENDPOINT}?query=${encodeURIComponent(q)}&format=${encodeURIComponent("application/sparql-results+json")}`;
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)", accept: "application/sparql-results+json, application/json, */*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(280_000) });
  if (!r.ok) throw new Error(`SPARQL HTTP ${r.status}`);
  return r.json();
}
const P = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#>`;
const celexUrl = (celex) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;

// 1) Lightweight enumerate: every in-force celex + resource-type in a chapter (for stratification).
async function enumerateChapter(code) {
  const q = `${P}
SELECT ?celex ?rt WHERE {
  ?work cdm:resource_legal_in-force "true"^^<${XSD}boolean> .
  ?work cdm:resource_legal_is_about_concept_directory-code ?dc .
  FILTER(STRSTARTS(STR(?dc), "${DIR_BASE}${code}"))
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_has_resource-type ?rt .
}`;
  const j = await sparql(q);
  const byCelex = new Map(); // celex -> resource-type short (last path segment)
  for (const b of j.results.bindings) {
    const celex = b.celex.value;
    const rt = b.rt.value.split("/").pop();
    if (!byCelex.has(celex)) byCelex.set(celex, rt);
  }
  return byCelex;
}

// Proportional stratified pick: allocate `target` across resource-type strata by share, min 1 per present
// stratum; within a stratum take an evenly-spaced spread over celex-sorted ids (avoids year-clustering).
function stratifiedPick(byCelex, target) {
  const strata = new Map();
  for (const [celex, rt] of byCelex) { if (!strata.has(rt)) strata.set(rt, []); strata.get(rt).push(celex); }
  for (const list of strata.values()) list.sort();
  const total = byCelex.size;
  const picks = [];
  const entries = [...strata.entries()].sort((a, b) => b[1].length - a[1].length);
  let remaining = Math.min(target, total);
  for (const [rt, list] of entries) {
    if (remaining <= 0) break;
    const share = Math.max(1, Math.round((list.length / total) * target));
    const n = Math.min(share, list.length, remaining);
    const step = list.length / n;
    for (let i = 0; i < n; i++) picks.push({ celex: list[Math.floor(i * step)], rt });
    remaining -= n;
  }
  return picks;
}

// 2) Full metadata for a set of celex (title via EN expression, subject-matter + EuroVoc labels).
async function fetchMetadata(celexList) {
  const values = celexList.map((c) => `"${c}"^^<${XSD}string>`).join(" ");
  const q = `${P}
SELECT ?celex (SAMPLE(?title) AS ?title) (GROUP_CONCAT(DISTINCT ?sm; separator="; ") AS ?subjects) (GROUP_CONCAT(DISTINCT ?ev; separator="; ") AS ?eurovoc) WHERE {
  VALUES ?celex { ${values} }
  ?work cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?expr cdm:expression_belongs_to_work ?work . ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> . ?expr cdm:expression_title ?title . }
  OPTIONAL { ?work cdm:resource_legal_is_about_subject-matter ?smc . ?smc skos:prefLabel ?sm . FILTER(LANG(?sm)="en") }
  OPTIONAL { ?work cdm:work_is_about_concept_eurovoc ?evc . ?evc skos:prefLabel ?ev . FILTER(LANG(?ev)="en") }
} GROUP BY ?celex`;
  const j = await sparql(q);
  const md = new Map();
  for (const b of j.results.bindings) {
    md.set(b.celex.value, { title: b.title?.value ?? "", subjects: b.subjects?.value ?? "", eurovoc: b.eurovoc?.value ?? "" });
  }
  return md;
}

function metadataBlob({ celex, rt, title, subjects, eurovoc, chapters }) {
  return [
    `Title: ${title || "(title unavailable in EN)"}`,
    `Instrument: EU ${rt} (CELEX ${celex})`,
    `Directory chapters: ${chapters.join(", ")}`,
    subjects ? `Subject matter: ${subjects}` : null,
    eurovoc ? `EuroVoc concepts: ${eurovoc}` : null,
    `Source: EUR-Lex, Official Journal of the European Union. In-force EU legal instrument.`,
  ].filter(Boolean).join("\n");
}

// Session C sweep4 dedup set: recovered providers/instruments (coverage_gap_census_findings). We flag a
// dedup-MISS as an anomaly per operator note only where a match was expected; here we simply record whether
// a sampled instrument's subject already appears in sweep4 (title/instrument overlap, coarse).
async function loadSweep4() {
  const { data, error } = await sb.from("coverage_gap_census_findings").select("instrument, subject_ref, url").eq("sweep", "sweep4_found_then_lost_recovery");
  if (error) { console.warn(`[sweep4] read failed: ${error.message}`); return []; }
  return (data ?? []).map((r) => `${r.instrument ?? ""} ${r.subject_ref ?? ""} ${r.url ?? ""}`.toLowerCase());
}

async function main() {
  const started = Date.now();
  const sweep4 = await loadSweep4();
  console.log(`EUR-Lex STOCK calibration sample — ${PER_CHAPTER}/chapter, metadata-classified. sweep4 rows loaded: ${sweep4.length}`);
  const report = [];
  const allOutcomes = [];
  let haikuCalls = 0, costEst = 0;

  for (const [label, code] of Object.entries(CHAPTERS)) {
    const byCelex = await enumerateChapter(code);
    const picks = stratifiedPick(byCelex, PER_CHAPTER);
    const md = await fetchMetadata(picks.map((p) => p.celex));
    const rows = [];
    for (const pick of picks) {
      const m = md.get(pick.celex) ?? { title: "", subjects: "", eurovoc: "" };
      const chapters = [...byCelex.get(pick.celex) ? [label.slice(0, 2)] : []];
      const text = metadataBlob({ celex: pick.celex, rt: pick.rt, ...m, chapters: [label] });
      const url = celexUrl(pick.celex);
      let cls;
      try {
        const res = await firstFetchClassify({ text, source_url: url, source_id: EURLEX.id, source_tier: EURLEX.tier, source_category: EURLEX.category, source_name: EURLEX.name }, process.env.ANTHROPIC_API_KEY);
        haikuCalls++; costEst += res.result?.cost_usd_estimated ?? 0;
        if (!res.ok) { rows.push({ celex: pick.celex, rt: pick.rt, disposition: "skipped", reason: `classify: ${res.error}` }); continue; }
        cls = res.result;
      } catch (e) { rows.push({ celex: pick.celex, rt: pick.rt, disposition: "skipped", reason: `classify threw: ${e instanceof Error ? e.message : String(e)}` }); continue; }

      const relevant = typeof cls.relevance === "number" && cls.relevance >= RELEVANCE_FLOOR;
      const sweep4Hit = sweep4.some((s) => m.title && s.includes(String(m.title).toLowerCase().slice(0, 40)));

      if (cls.entity_verdict !== "specific_document" || !cls.item_type) {
        rows.push({ celex: pick.celex, rt: pick.rt, disposition: "not_an_item", reason: cls.rationale, relevant, surfaceTags: cls.surface_tags, sweep4Hit, url, title: cls.title_candidate });
        continue;
      }
      let seed;
      try { seed = buildCandidateSeed({ url, source_id: EURLEX.id }, cls); }
      catch (e) { rows.push({ celex: pick.celex, rt: pick.rt, disposition: "skipped", reason: `seed: ${e instanceof Error ? e.message : String(e)}` }); continue; }
      const dry = await applyStagedUpdate(sb, { update_type: "new_item", proposed_changes: { ...seed } }, { dryRun: true });
      let disposition, reason, itemId = null;
      if (dry.success && dry.action === "exists" && dry.itemId) { disposition = "exists"; reason = `exists: ${dry.itemId}`; itemId = dry.itemId; }
      else if (!dry.success) { disposition = "would_reject"; reason = `${dry.action ? `chokepoint:${dry.action}` : "entity-gate"} — ${dry.error ?? "rejected"}`; }
      else { disposition = "would_mint"; reason = `dry: ${dry.action ?? "minted"}${dry.flags?.length ? ` [${dry.flags.join(",")}]` : ""}${relevant ? "" : " [low-relevance]"}`; }
      rows.push({ celex: pick.celex, rt: pick.rt, disposition, reason, relevant, surfaceTags: cls.surface_tags, sweep4Hit, itemId, itemType: seed.item_type, title: seed.title, url });
    }

    // per-chapter tallies
    const n = rows.length;
    const wm = rows.filter((r) => r.disposition === "would_mint");
    const wmRelevant = wm.filter((r) => r.relevant);
    const dedup = rows.filter((r) => r.disposition === "exists");
    const sweep4Hits = rows.filter((r) => r.sweep4Hit);
    report.push({ label, universe: byCelex.size, sampled: n, would_mint: wm.length, relevant_would_mint: wmRelevant.length, would_reject: rows.filter((r) => r.disposition === "would_reject").length, not_an_item: rows.filter((r) => r.disposition === "not_an_item").length, dedup_exists: dedup.length, sweep4_hits: sweep4Hits.length, hit_rate: n ? (wmRelevant.length / n) : 0, byRt: rows.reduce((a, r) => { a[r.rt] = (a[r.rt] || 0) + 1; return a; }, {}) });

    // census-write the sample outcomes (idempotent on (source_id, document_url)); plan-mode only.
    const outcomes = rows.filter((r) => r.url && (r.disposition === "would_mint" || r.disposition === "would_reject" || r.disposition === "exists" || r.disposition === "not_an_item"))
      .map((r) => ({ url: r.url, disposition: r.disposition === "would_reject" ? "would_reject" : r.disposition, reason: r.reason, itemType: r.itemType, title: r.title, surfaceTags: r.surfaceTags, itemId: r.itemId }));
    allOutcomes.push(...outcomes);
    console.log(`  ${label}: universe ${byCelex.size}, sampled ${n} → would_mint ${wm.length} (relevant ${wmRelevant.length}), reject ${rows.filter((r) => r.disposition === "would_reject").length}, not_item ${rows.filter((r) => r.disposition === "not_an_item").length}, dedup ${dedup.length}, sweep4 ${sweep4Hits.length}`);
  }

  // Write all sample census rows in one leased batch (idempotent).
  const cw = await writeCensusRows(sb, allOutcomes, { sourceId: EURLEX.id, lane: "A", createdBy: "session-A-stock-sample", capHit: false, shapeClass: "instrument_page", withLease });
  console.log(`\ncensus-write: ${cw.written ?? 0} rows upserted, ${cw.skipped ?? 0} skipped${cw.leaseError ? ` (LEASE REFUSED: ${cw.leaseError})` : ""}`);

  console.log("\n════ CALIBRATION REPORT ════");
  for (const r of report) {
    console.log(`${r.label}: universe ${r.universe}, sampled ${r.sampled}, freight-relevant hit-rate ${(r.hit_rate * 100).toFixed(0)}% (relevant would_mint ${r.relevant_would_mint}/${r.sampled}), would_mint ${r.would_mint} (relevant ${r.relevant_would_mint} / low-rel ${r.would_mint - r.relevant_would_mint}), would_reject ${r.would_reject}, not_an_item ${r.not_an_item}, dedup(exists) ${r.dedup_exists}, sweep4 ${r.sweep4_hits}; act-types ${JSON.stringify(r.byRt)}`);
  }
  console.log(`\nHaiku calls: ${haikuCalls} | est cost $${costEst.toFixed(3)} | wall ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(JSON.stringify({ report }, null, 0));
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
