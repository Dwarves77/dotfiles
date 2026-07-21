// ncleg-complete.mjs (scratch) — complete the ncleg Chapter 136 R2(c) js_shell block.
// FINDING (browser-captured via ncleg HTML statute view, challenge resolved, 2026-07-21): of the 109
// candidates the genre-regex extracted from the Chapter 136 index, 108 are REPEALED / RESERVED /
// TRANSFERRED statute sections (dead law — the index lists repealed section numbers, each PDF a short
// repeal notice), and exactly 1 is a substantive in-force section: GS 136-135 (illegal-outdoor-advertising
// enforcement, Class 1 misdemeanor). The R2(c) block masked mostly-dead-law; it was an extractor artifact,
// not a real coverage gap. Completion: the 1 substantive section is classified through the real chokepoint
// and snapshotted to raw_fetches; the 108 dead-law sections are dispositioned not_an_item with their
// verified state cited (a repeal notice is definitionally not a mintable instrument — no Haiku needed to
// confirm dead law, the disposition is the verified fact, not a guess).
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { firstFetchClassify } = await jiti.import("../src/lib/llm/first-fetch-classify.ts");
const { buildCandidateSeed } = await jiti.import("../src/lib/intake/portal-harvest.ts");
const { applyStagedUpdate } = await jiti.import("../src/lib/intake/apply-staged-update.ts");
const { writeCensusRows } = await jiti.import("../src/lib/intake/census-writer.mjs");
const { writeSnapshot } = await jiti.import("../src/lib/sources/snapshot-store.mjs");
const { withLease } = await jiti.import("./lib/mutation-lease.mjs");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NCLEG = { id: "393f7044-5bff-4881-86c0-dd7b19826fab", tier: null, category: "regulatory", name: "NC General Assembly — Chapter 136" };
const B = "https://ncleg.gov/EnactedLegislation/Statutes/PDF/";

// The one substantive in-force section (full text captured from the ncleg HTML view).
const SUBSTANTIVE = {
  url: B + "BySection/Chapter_136/GS_136-135.pdf",
  text: "G.S. 136-135. Enforcement provisions. Any person, firm, corporation or association, placing, erecting or maintaining outdoor advertising along the interstate system or primary system in violation of this Article or rules adopted by the Department of Transportation shall be guilty of a Class 1 misdemeanor. In addition thereto, the Department of Transportation may seek injunctive relief in the Superior Court of Wake County or of the county where the outdoor advertising is located and require the outdoor advertising to conform to the provisions of this Article or rules adopted pursuant hereto, or require the removal of the said illegal outdoor advertising. (1967, c. 1248, s. 10; 1973, c. 507, s. 5; 1975, c. 568, s. 14; 1977, c. 464, s. 32; 1993, c. 539, s. 998; 1994, Ex. Sess., c. 24, s. 14(c); 1999-404, s. 4.)",
};

// The 108 dead-law section URLs (repealed / reserved / transferred), verified via the HTML statute view.
const DEAD_SUFFIXES = ["ByArticle/Chapter_136/Article_13","ByArticle/Chapter_136/Article_2E","ByArticle/Chapter_136/Article_8","BySection/Chapter_136/GS_136-102.50","BySection/Chapter_136/GS_136-103.1","BySection/Chapter_136/GS_136-11","BySection/Chapter_136/GS_136-12.1","BySection/Chapter_136/GS_136-12.2","BySection/Chapter_136/GS_136-125.2","BySection/Chapter_136/GS_136-156_through_136-174","BySection/Chapter_136/GS_136-16.4","BySection/Chapter_136/GS_136-16.5","BySection/Chapter_136/GS_136-16.6","BySection/Chapter_136/GS_136-16.7","BySection/Chapter_136/GS_136-16.8","BySection/Chapter_136/GS_136-16.9","BySection/Chapter_136/GS_136-17.1","BySection/Chapter_136/GS_136-17.2A","BySection/Chapter_136/GS_136-177.1","BySection/Chapter_136/GS_136-177","BySection/Chapter_136/GS_136-178","BySection/Chapter_136/GS_136-179","BySection/Chapter_136/GS_136-17","BySection/Chapter_136/GS_136-180.1","BySection/Chapter_136/GS_136-180","BySection/Chapter_136/GS_136-18.1","BySection/Chapter_136/GS_136-181","BySection/Chapter_136/GS_136-182","BySection/Chapter_136/GS_136-183","BySection/Chapter_136/GS_136-184","BySection/Chapter_136/GS_136-185","BySection/Chapter_136/GS_136-187","BySection/Chapter_136/GS_136-188","BySection/Chapter_136/GS_136-189","BySection/Chapter_136/GS_136-19.1","BySection/Chapter_136/GS_136-19.2","BySection/Chapter_136/GS_136-1_through_136-3","BySection/Chapter_136/GS_136-203","BySection/Chapter_136/GS_136-225","BySection/Chapter_136/GS_136-226","BySection/Chapter_136/GS_136-27.3A","BySection/Chapter_136/GS_136-28.3","BySection/Chapter_136/GS_136-28","BySection/Chapter_136/GS_136-31","BySection/Chapter_136/GS_136-33.2","BySection/Chapter_136/GS_136-36","BySection/Chapter_136/GS_136-37","BySection/Chapter_136/GS_136-38_through_136-41","BySection/Chapter_136/GS_136-4.1_through_136-5","BySection/Chapter_136/GS_136-42","BySection/Chapter_136/GS_136-43","BySection/Chapter_136/GS_136-44.2A","BySection/Chapter_136/GS_136-44.2C","BySection/Chapter_136/GS_136-44.30_through_136-44.34","BySection/Chapter_136/GS_136-44.4","BySection/Chapter_136/GS_136-44.50","BySection/Chapter_136/GS_136-44.51","BySection/Chapter_136/GS_136-44.52","BySection/Chapter_136/GS_136-44.53","BySection/Chapter_136/GS_136-44.54","BySection/Chapter_136/GS_136-44.5","BySection/Chapter_136/GS_136-44.9","BySection/Chapter_136/GS_136-46_through_136-47","BySection/Chapter_136/GS_136-48_through_136-50","BySection/Chapter_136/GS_136-52_through_136-53","BySection/Chapter_136/GS_136-55","BySection/Chapter_136/GS_136-56","BySection/Chapter_136/GS_136-57","BySection/Chapter_136/GS_136-58","BySection/Chapter_136/GS_136-60_through_136-61","BySection/Chapter_136/GS_136-65_through_136-66","BySection/Chapter_136/GS_136-6_through_136-9","BySection/Chapter_136/GS_136-71.13","BySection/Chapter_136/GS_136-73_through_136-75","BySection/Chapter_136/GS_136-76","BySection/Chapter_136/GS_136-77","BySection/Chapter_136/GS_136-79","BySection/Chapter_136/GS_136-82.2","BySection/Chapter_136/GS_136-83","BySection/Chapter_136/GS_136-84_through_136-87","BySection/Chapter_136/GS_136-89.12_through_136-89.30","BySection/Chapter_136/GS_136-89.159","BySection/Chapter_136/GS_136-89.160","BySection/Chapter_136/GS_136-89.161","BySection/Chapter_136/GS_136-89.162","BySection/Chapter_136/GS_136-89.163","BySection/Chapter_136/GS_136-89.164","BySection/Chapter_136/GS_136-89.165","BySection/Chapter_136/GS_136-89.166","BySection/Chapter_136/GS_136-89.167","BySection/Chapter_136/GS_136-89.168","BySection/Chapter_136/GS_136-89.169","BySection/Chapter_136/GS_136-89.170","BySection/Chapter_136/GS_136-89.171","BySection/Chapter_136/GS_136-89.172","BySection/Chapter_136/GS_136-89.173","BySection/Chapter_136/GS_136-89.174","BySection/Chapter_136/GS_136-89.175","BySection/Chapter_136/GS_136-89.176","BySection/Chapter_136/GS_136-89.177","BySection/Chapter_136/GS_136-89.178","BySection/Chapter_136/GS_136-89.179","BySection/Chapter_136/GS_136-89.1_through_136-89.11H","BySection/Chapter_136/GS_136-89.31_through_136-89.47","BySection/Chapter_136/GS_136-89.57","BySection/Chapter_136/GS_136-89.60_through_136-89.76","BySection/Chapter_136/GS_136-89.77","BySection/Chapter_136/GS_136-99_through_136-101"];

const outcomes = [];

// 1) The 108 dead-law sections: verified-state disposition (not_an_item), no Haiku.
for (const s of DEAD_SUFFIXES) {
  const url = B + s + ".pdf";
  const sec = s.split("/").pop().replace(/^GS_/, "").replace(/^Article_/, "Article ");
  outcomes.push({
    url, disposition: "not_an_item",
    reason: `repealed/reserved/transferred NC statute section (dead law), verified via the ncleg HTML statute view 2026-07-21; masked by the R2(c) js_shell block on direct fetch. Not a mintable in-force instrument.`,
    title: `NC G.S. ${sec} (repealed/reserved)`, surfaceTags: [],
  });
}

// 2) The 1 substantive section: snapshot + classify through the real chokepoint.
try { await writeSnapshot(sb, NCLEG.id, { html: SUBSTANTIVE.text, status: 200 }); console.log("snapshot: GS 136-135 captured to raw_fetches"); }
catch (e) { console.warn(`snapshot GS 136-135 failed: ${e instanceof Error ? e.message : String(e)}`); }
const res = await firstFetchClassify({ text: SUBSTANTIVE.text, source_url: SUBSTANTIVE.url, source_id: NCLEG.id, source_tier: NCLEG.tier, source_category: NCLEG.category, source_name: NCLEG.name }, process.env.ANTHROPIC_API_KEY);
if (!res.ok) { outcomes.push({ url: SUBSTANTIVE.url, disposition: "skipped", reason: `classify: ${res.error}` }); }
else {
  const cls = res.result;
  if (cls.entity_verdict !== "specific_document" || !cls.item_type) {
    outcomes.push({ url: SUBSTANTIVE.url, disposition: "not_an_item", reason: `entity-gate: ${cls.entity_verdict} — ${cls.rationale ?? ""}`, title: cls.title_candidate, surfaceTags: cls.surface_tags });
  } else {
    const seed = buildCandidateSeed({ url: SUBSTANTIVE.url, source_id: NCLEG.id }, cls);
    const dry = await applyStagedUpdate(sb, { update_type: "new_item", proposed_changes: { ...seed } }, { dryRun: true });
    const disp = dry.success && dry.action === "exists" ? "exists" : !dry.success ? "would_reject" : "would_mint";
    outcomes.push({ url: SUBSTANTIVE.url, disposition: disp, reason: `GS 136-135 (substantive): dry ${dry.action ?? disp}`, itemType: seed.item_type, title: seed.title, surfaceTags: cls.surface_tags, itemId: dry.itemId ?? null });
    console.log(`GS 136-135 classified: ${disp}, item_type=${seed.item_type}, surface_tags=${JSON.stringify(cls.surface_tags)}, relevance=${cls.relevance}`);
  }
}

const cw = await writeCensusRows(sb, outcomes, { sourceId: NCLEG.id, lane: "A", createdBy: "session-A-ncleg-render", capHit: false, shapeClass: "pdf_direct", withLease });
console.log(`\nncleg completion: ${outcomes.length} outcomes (${outcomes.filter(o => o.disposition === "not_an_item").length} dead-law not_an_item, ${outcomes.filter(o => o.disposition === "would_mint").length} would_mint, ${outcomes.filter(o => o.disposition === "skipped").length} skipped).`);
console.log(`census-write: ${cw.written ?? 0} rows upserted, ${cw.skipped ?? 0} skipped${cw.leaseError ? ` (LEASE REFUSED: ${cw.leaseError})` : ""}`);
