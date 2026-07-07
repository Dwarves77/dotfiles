// READ-ONLY: Category-3B — mid-band (2–12KB) pool rows that are FLOOR-QUALIFYING primaries carrying FACT
// claims, where the instrument class implies a much larger enacted text (size-vs-class gap). Reports the ONE
// blocking number (how many of the ~992 mid-band rows are floor-qualifying-on-FACT at all) + the suspects.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const floorFor = (t) => REG.has(t) ? 2 : t === "research_finding" ? 4 : (t === "technology" || t === "innovation" || t === "tool") ? 5 : null; // null = exempt/out-of-scope
const ENACTED_HOST = /eur-lex\.europa\.eu|legislation\.gov\.uk|lovdata\.no|federalregister\.gov|ecfr\.gov|gesetze-im-internet|legifrance|gazzettaufficiale/i;
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };

const items = await readAll("intelligence_items", "id,legacy_id,item_type,provenance_status", { match: (q) => q.eq("is_archived", false) });
const byId = new Map(items.map((i) => [i.id, i]));

// mid-band pool rows (2000–12000, real sources)
const pool = await readAll("agent_run_searches", "id,intelligence_item_id,result_index,result_url,result_content_excerpt");
const mid = pool.filter((r) => (r.result_index ?? 0) < 90 && (r.result_content_excerpt || "").length > 2000 && (r.result_content_excerpt || "").length <= 12000);
const midById = new Map(mid.map((r) => [r.id, r]));

// FACT claims → search_result_id + tier
const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id,source_tier_at_grounding");
const facts = claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id);

// a mid-band row is floor-qualifying-on-FACT if a FACT claim points at it (search_result_id) with tier ≤ item floor
const qualRows = new Set();
const suspects = [];
for (const f of facts) {
  const row = midById.get(f.search_result_id);
  if (!row) continue;
  const it = byId.get(f.intelligence_item_id || row.intelligence_item_id);
  if (!it) continue;
  const floor = floorFor(it.item_type);
  if (floor == null) continue;                                   // exempt/signal — out of scope
  const tier = f.source_tier_at_grounding;
  if (tier == null || tier > floor) continue;                    // not floor-qualifying
  qualRows.add(row.id);
}
// build suspect list (dedup by row): enacted-instrument host + reg-family + the size-vs-class gap
for (const rowId of qualRows) {
  const row = midById.get(rowId);
  const it = byId.get(row.intelligence_item_id);
  const host = hostOf(row.result_url);
  const enacted = ENACTED_HOST.test(row.result_url);
  const len = row.result_content_excerpt.length;
  const preview = row.result_content_excerpt.slice(0, 200).replace(/\s+/g, " ");
  const hasOperative = /\bArticle\s+\d|\bSection\s+\d|\bshall\b|\bmust\b|\(\d+\)/.test(row.result_content_excerpt);
  suspects.push({ key: it?.legacy_id || row.intelligence_item_id.slice(0, 8), status: it?.status, type: it?.item_type, host, enacted, len, hasOperative, url: row.result_url, preview });
}
const enactedSuspects = suspects.filter((s) => s.enacted);

console.log(`\n=== CATEGORY-3B (mid-band floor-qualifying-on-FACT) ===`);
console.log(`mid-band rows (2–12KB, real): ${mid.length}`);
console.log(`>>> OF THOSE, floor-qualifying-on-FACT-items: ${qualRows.size}  (${((qualRows.size / (mid.length || 1)) * 100).toFixed(0)}% of mid-band)`);
console.log(`   of those, on ENACTED-instrument hosts (CELEX/legislation.gov.uk/lovdata/…): ${enactedSuspects.length}  ← the size-vs-class suspects`);
console.log(`\n=== ENACTED-HOST SUSPECTS (size-vs-class gap; adjudicate fragment vs legit-short) ===`);
for (const s of enactedSuspects.sort((a, b) => a.len - b.len)) console.log(`  ${s.key.padEnd(28)} ${String(s.status).padEnd(11)} ${s.type.padEnd(11)} ${(s.len + "ch").padEnd(8)} operative=${s.hasOperative} ${s.host}\n      "${s.preview}"`);
process.exit(0);
