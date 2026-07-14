/** QUARANTINE RE-DIAGNOSIS — $0, read-only (operator CRITICAL DISPATCH Unit 2, 2026-07-14). Runs the
 *  COMPLETED ladder's DISCOVERY rung (discoverCandidateUrls) + holdings classification over every live
 *  quarantined item WITHOUT fetching, and classifies each item's TRUE blocker so the resumed pass acts on
 *  truth, not the stale manifest. NO LLM, NO Browserless, NO paid call.
 *
 *  Per item: current-URL verdict + best discovered candidate + holdings quality + TRUE blocker class:
 *    wrong_url            -> re-point + fetch the discovered candidate (cheapest; identifier resolves it)
 *    furniture_stub       -> discovery + fetch (held capture is a shell)
 *    truncated            -> re-collect via the fetch-align-diff engine
 *    language             -> non-EN extraction fix (URL fine, clean content, 0 claims)
 *    reattribution_debt   -> covers_grounding + full ledger held sub-floor (NOT a fetch problem)
 *    genuine_absence      -> real acquisition line (ONLY when no identifier AND no candidate)
 *  Output: scripts/tmp/quarantine-rediagnosis.json + a printed table + per-class counts.
 *  Usage: node scripts/quarantine-rediagnose.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { readAll, readClient } from "./lib/db.mjs";
import { discoverCandidateUrls } from "../src/lib/sources/identifier-variants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const EN_LANG_JURIS = new Set(["EU", "UK", "GB", "US", "IE", "AU", "NZ", "CA", "SG", "ZA", "IN"]); // English-official
const hostOf = (u) => { try { return new URL(String(u)).host.toLowerCase(); } catch { return ""; } };
const registrableDiffers = (a, b) => { const ha = hostOf(a), hb = hostOf(b); return ha && hb && ha !== hb ? false : a !== b; };

async function main() {
  const rc = readClient();
  const [items, hq, prov, runs, sources] = await Promise.all([
    readAll("intelligence_items", "id, legacy_id, title, item_type, instrument_type, instrument_identifier, canonical_instrument_key, jurisdiction_iso, source_url, source_id, provenance_status, is_archived"),
    readAll("holdings_quality", "intelligence_item_id, capture_kind, completeness, sufficiency, bytes_collected, publisher_shape"),
    readAll("section_claim_provenance", "intelligence_item_id, claim_kind"),
    readAll("agent_runs", "intelligence_item_id, created_at"),
    readAll("sources", "id, url, base_tier, tier_override"),
  ]);

  const srcById = new Map(sources.map((s) => [s.id, s]));
  // holdings aggregate per item
  const hqByItem = new Map();
  for (const r of hq) {
    const cur = hqByItem.get(r.intelligence_item_id) || { covers: false, anyClean: false, anyFurnitureStub: false, anyTruncated: false, maxBytes: 0, shapes: new Set() };
    if (r.sufficiency === "covers_grounding") cur.covers = true;
    if (r.completeness === "NO-KNOWN-DEFECT") cur.anyClean = true;
    if (r.completeness === "FURNITURE" || r.completeness === "STUB") cur.anyFurnitureStub = true;
    if (r.completeness === "TRUNCATED") cur.anyTruncated = true;
    cur.maxBytes = Math.max(cur.maxBytes, Number(r.bytes_collected || 0));
    if (r.publisher_shape) cur.shapes.add(r.publisher_shape);
    hqByItem.set(r.intelligence_item_id, cur);
  }
  const claimsByItem = new Map();
  for (const p of prov) { const c = claimsByItem.get(p.intelligence_item_id) || { n: 0, facts: 0 }; c.n++; if (p.claim_kind === "FACT") c.facts++; claimsByItem.set(p.intelligence_item_id, c); }
  const lastRunByItem = new Map();
  for (const r of runs) { if (!r.intelligence_item_id) continue; const prev = lastRunByItem.get(r.intelligence_item_id); if (!prev || r.created_at > prev) lastRunByItem.set(r.intelligence_item_id, r.created_at); }

  const quarantined = items.filter((i) => i.provenance_status === "quarantined" && i.is_archived !== true);
  const rows = [];
  for (const it of quarantined) {
    const disc = discoverCandidateUrls({
      identifier: it.instrument_identifier, canonicalKey: it.canonical_instrument_key, itemType: it.item_type,
      instrumentType: it.instrument_type, title: it.title, jurisdiction: it.jurisdiction_iso, sourceUrl: it.source_url,
    });
    const bestCandidate = disc.candidates.find((c) => c.kind === "canonical")?.url || disc.candidates[0]?.url || null;
    const hasIdentifier = !!(it.instrument_identifier || it.canonical_instrument_key) || disc.identifiers.length > 0;
    const h = hqByItem.get(it.id) || { covers: false, anyClean: false, anyFurnitureStub: false, anyTruncated: false, maxBytes: 0, shapes: new Set() };
    const cl = claimsByItem.get(it.id) || { n: 0, facts: 0 };
    const juris = Array.isArray(it.jurisdiction_iso) ? it.jurisdiction_iso[0] : it.jurisdiction_iso;
    const nonEnglish = juris && !EN_LANG_JURIS.has(juris);

    // classify TRUE blocker (ordered — most specific first)
    let blocker, action;
    const candidateDiffersFromSource = bestCandidate && registrableDiffers(bestCandidate, it.source_url);
    if (h.anyFurnitureStub && !h.anyClean) {
      blocker = candidateDiffersFromSource ? "wrong_url" : "furniture_stub";
      action = candidateDiffersFromSource ? "re-point to discovered candidate + fetch" : "discovery + fetch (held capture is a shell)";
    } else if (nonEnglish && h.anyClean && cl.facts === 0 && cl.n === 0) {
      blocker = "language"; action = "non-EN extraction fix (URL fine; clean content held; 0 claims)";
    } else if (cl.facts > 0 && h.covers) {
      blocker = "reattribution_debt"; action = "floor-first re-attribution / relabel (NOT a fetch problem — ledger exists, held sub-floor)";
    } else if (h.anyTruncated || (h.maxBytes > 40000 && cl.facts > 0)) {
      blocker = "truncated"; action = "re-collect via fetch-align-diff engine (held > grounding read)";
    } else if (cl.facts === 0 && candidateDiffersFromSource) {
      blocker = "wrong_url"; action = "re-point to discovered candidate + fetch (0 claims, better URL exists)";
    } else if (bestCandidate) {
      blocker = "needs_discovery_fetch"; action = "fetch the machine-derived candidate (identifier resolves it)";
    } else {
      // REFERENCED-LAW-EXISTS: a title/identifier-bearing item is NEVER "absent" before the search runs.
      // Unit 2 is $0 (no fetch/search), so the honest verdict is "needs_search" (open-web/title discovery
      // required at fetch time); "genuine_absence" is reachable ONLY after N×M is logged (never here).
      blocker = "needs_search"; action = "open-web/title discovery required (no machine candidate; NOT absent until N×M logged)";
    }

    rows.push({
      id: it.id, item: it.legacy_id || (it.title || "").slice(0, 34), type: it.item_type, juris: juris || null,
      facts: cl.facts, held_bytes: h.maxBytes, sufficiency: h.covers ? "covers" : (h.anyFurnitureStub ? "shell" : "sub-floor"),
      has_identifier: hasIdentifier, source_url: it.source_url,
      best_candidate: bestCandidate, candidate_differs: !!candidateDiffersFromSource,
      blocker, action,
    });
  }

  // per-class tally + projected fetch counts (cents-class candidate fetches vs named lines)
  const byClass = rows.reduce((m, r) => (m[r.blocker] = (m[r.blocker] || 0) + 1, m), {});
  const fetchClasses = ["wrong_url", "furniture_stub", "needs_discovery_fetch"]; // cheap candidate fetches
  const projectedFetches = rows.filter((r) => fetchClasses.includes(r.blocker)).length;

  console.log("\n===== QUARANTINE RE-DIAGNOSIS (Unit 2, $0) =====");
  console.log(`live quarantined items: ${quarantined.length}`);
  console.log(`TRUE blocker classes: ${JSON.stringify(byClass, null, 0)}`);
  console.log(`projected candidate fetches (cents-class): ${projectedFetches}`);
  console.log(`re-point candidates (URL differs from source): ${rows.filter((r) => r.candidate_differs).length}`);
  console.log("\nitem | type | juris | facts | held | suff | blocker | candidate_differs");
  for (const r of rows.sort((a, b) => a.blocker.localeCompare(b.blocker))) {
    console.log(`${(r.item||"").padEnd(34)} ${(r.type||"").padEnd(14)} ${(r.juris||"").padEnd(4)} ${String(r.facts).padStart(3)} ${String(r.held_bytes).padStart(7)} ${r.sufficiency.padEnd(9)} ${r.blocker.padEnd(20)} ${r.candidate_differs ? "YES" : ""}`);
  }

  const outDir = resolve(ROOT, "scripts/tmp");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "quarantine-rediagnosis.json"), JSON.stringify({ generated: "2026-07-14", count: quarantined.length, byClass, projectedFetches, rows }, null, 2));
  console.log(`\n-> scripts/tmp/quarantine-rediagnosis.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
