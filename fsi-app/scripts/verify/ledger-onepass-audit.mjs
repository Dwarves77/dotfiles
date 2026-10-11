// data-audit: label=ledger-onepass hard=true
/** E1: ONE-PASS LEDGER VERIFIER (read-only, deterministic; no LLM, no network).
 *
 *  A single deterministic read-pass over the emitted claim ledger (section_claim_provenance) that
 *  re-derives each item's grounding verdict from the TWO SETTLED PRIMITIVES and asserts the emitted ledger
 *  is faithful to them. It CONSUMES the primitives and CHANGES NEITHER:
 *    (1) the canonical institution RESOLVER (src/lib/sources/institution.ts buildResolver): span → tier,
 *    (2) the PER-ITEM-TYPE authority floor (migration 141: reg ≤T2, research_finding ≤T4,
 *        technology/innovation/tool ≤T5; market_signal/initiative/regional_data EXEMPT), which since
 *        migration 302 is a RATING, not a refusal.
 *
 *  It is an INDEPENDENT JS cross-check of the SQL gate (validate_item_provenance): claims-tier-audit and
 *  substrate-agreement check the resolver-stamp and stored-status-vs-SQL halves separately; this composes
 *  both into one pass that ALSO re-derives the per-type floor in JS, so a drift between the SQL gate and
 *  the JS primitives (e.g. a floor value that lands in one but not the other) is caught here, not in prod.
 *
 *  ASSERTIONS (deterministic):
 *    A. DERIVATION-CONSISTENCY (D1, migration 145): every FACT claim's stored source_tier_at_grounding
 *       equals the tier DERIVED from its stored source_id (COALESCE(tier_override, base_tier) -
 *       base_tier-only/moat-pure, mirroring the live floor); every non-FACT claim carries a NULL tier
 *       stamp. The "span URL would re-resolve to a different source NOW" count is an INFORMATIONAL growth
 *       signal (registry growth since grounding → Phase-3 re-ground engine), NOT an audit failure.
 *       FAILS the audit.
 *    B. PER-TYPE FLOOR RATING (migration 302, operator ruling 2026-09-04: "get the source. then rate the
 *       source."; CLAUDE.md rule 18): a verified item holding a CRITICAL/HIGH FACT below its type floor is
 *       RATED, not refused: validate_item_provenance moved `fact_below_authority_floor` from blocking
 *       `failures` to non-blocking `warnings`, so such an item is correctly verified and the claim's tier
 *       stamp is the rating the surface shows. The assertion REPORTS these items with their worst derived tier;
 *       it does NOT fail the audit. (DATA-1, 2026-10-11: it used to FAIL on exactly this population, mirroring
 *       migration 141 / 145's refusal, which migration 302 overruled; the refusal half of the floor is gone.)
 *
 *  Exit 0 = A holds (ledger faithful to the primitives). Exit 1 = a stamp drift. Read-only.
 *  GOVERNING: source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../lib/is-main.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// PER-TYPE FLOOR: MUST mirror migration 141 v_floor_max. NULL = exempt. (Single source of truth is the
// SQL function; this is the deliberate independent JS copy whose agreement-with-SQL the audit exists to prove.)
export const FLOOR_MAX = (itemType) =>
  ["regulation", "directive", "standard", "guidance", "framework"].includes(itemType) ? 2
  : itemType === "research_finding" ? 4
  : ["technology", "innovation", "tool"].includes(itemType) ? 5
  : null; // market_signal / initiative / regional_data: EXEMPT
const isHigh = (p) => p === "CRITICAL" || p === "HIGH";

/** The pure pass. `sources`, `searches`, `items` (non-archived), `claims` are plain row arrays; `resolver` is the
 *  buildResolver() result (only .resolveSpan is used). Returns every count the report prints. */
export function assessLedger({ sources, searches, items, claims, resolver }) {
  const srcById = new Map(sources.map((s) => [s.id, s]));
  // D1 derivation-consistency basis: the stamp + floor derive from the claim's stored source_id ->
  // COALESCE(tier_override, base_tier) (base_tier-only, moat-pure), mirroring migration 145's live floor.
  const derivedTier = (sid) => { if (!sid) return null; const s = srcById.get(sid); return s ? (s.tier_override ?? s.base_tier ?? null) : null; };
  const searchById = new Map(searches.map((r) => [r.id, r]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  let factChecked = 0, stampDrift = 0, sourceDrift = 0, nonFactStamped = 0;
  const driftSamples = [];
  const belowByItem = new Map(); // item_id -> { n: below-floor FACT count, worst: highest derived tier or null }
  for (const c of claims) {
    const it = itemById.get(c.intelligence_item_id);
    if (!it) continue;
    if (c.claim_kind !== "FACT") {
      if (c.source_tier_at_grounding != null) { nonFactStamped++; if (driftSamples.length < 6) driftSamples.push(`non-FACT stamped: claim ${c.id.slice(0,8)} kind=${c.claim_kind} tier=${c.source_tier_at_grounding}`); }
      continue;
    }
    factChecked++;
    const dtier = derivedTier(c.source_id);
    if (c.source_tier_at_grounding !== dtier) { stampDrift++; if (driftSamples.length < 6) driftSamples.push(`stamp drift: claim ${c.id.slice(0,8)} stored=${c.source_tier_at_grounding} derived=${dtier} source_id=${c.source_id?c.source_id.slice(0,8):"NULL"}`); }
    // GROWTH SIGNAL (informational, NOT a failure): the span URL would now re-resolve to a different source
    // than stored: registry growth since grounding, owned by the Phase-3 re-ground engine, not audit drift.
    const sr = searchById.get(c.search_result_id);
    const reResolved = sr ? resolver.resolveSpan(sr.result_url) : { sourceId: null };
    if ((c.source_id ?? null) !== (reResolved.sourceId ?? null)) sourceDrift++;
    // floor verdict from the DERIVED tier (mirrors the live SQL gate's rating, migration 145 / 302)
    const fmax = FLOOR_MAX(it.item_type);
    if (isHigh(it.priority) && fmax != null && (dtier == null || dtier > fmax)) {
      const cur = belowByItem.get(it.id) || { n: 0, worst: null, unrated: 0 };
      cur.n++;
      if (dtier == null) cur.unrated++;
      else cur.worst = cur.worst == null ? dtier : Math.max(cur.worst, dtier);
      belowByItem.set(it.id, cur);
    }
  }
  // verified items that hold below-floor facts: RATED (migration 302), reported, never failed.
  const ratedBelowFloor = [];
  for (const [id, b] of belowByItem) {
    const it = itemById.get(id);
    if (it.provenance_status === "verified") ratedBelowFloor.push({ key: it.legacy_id || id.slice(0, 8), type: it.item_type, below: b.n, worstTier: b.worst, unrated: b.unrated });
  }
  const byType = {};
  for (const it of items) {
    byType[it.item_type] ??= { items: 0, verified: 0, quarantined: 0, floor: FLOOR_MAX(it.item_type), belowFloorItems: 0 };
    byType[it.item_type].items++;
    byType[it.item_type][it.provenance_status] = (byType[it.item_type][it.provenance_status] || 0) + 1;
    if (belowByItem.has(it.id)) byType[it.item_type].belowFloorItems++;
  }
  // A is the only failing assertion (see the header for B).
  const fail = stampDrift > 0 || nonFactStamped > 0;
  return { factChecked, stampDrift, sourceDrift, nonFactStamped, ratedBelowFloor, byType, driftSamples, fail };
}

async function main() {
  const { createJiti } = await import("jiti");
  const { readAll } = await import("../lib/db.mjs");
  const { loadLocalEnvFile } = await import("../lib/env-file.mjs");
  loadLocalEnvFile();
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");

  const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override");
  const resolver = buildResolver(sources);
  const searches = await readAll("agent_run_searches", "id,result_url");
  const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority,provenance_status", { match: (q) => q.eq("is_archived", false) });
  const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_span,source_id,source_tier_at_grounding,search_result_id");
  const r = assessLedger({ sources, searches, items, claims, resolver });

  console.log("\n===== E1 ONE-PASS LEDGER VERIFIER (deterministic; resolver + per-type floor) =====");
  console.log(`claims ${claims.length} | FACT checked ${r.factChecked} | items ${items.length}`);
  console.log("\nASSERTION A: resolver fidelity:");
  console.log(`  FACT stamp != source_id-derived tier: ${r.stampDrift} | (growth signal, non-failing) source_id != URL-re-resolve: ${r.sourceDrift} | non-FACT carrying a stamp: ${r.nonFactStamped}`);
  console.log("\nASSERTION B: per-type floor RATING (migration 302: below-floor verified items are rated, not failed):");
  console.log(`  verified items holding a below-floor FACT, RATED not failed (migration 302): ${r.ratedBelowFloor.length}`);
  for (const v of r.ratedBelowFloor.slice(0, 12)) console.log(`    ${v.key.padEnd(32)} ${v.type.padEnd(12)} below=${v.below} worst-tier=${v.worstTier ?? "none"}${v.unrated ? ` unrated=${v.unrated}` : ""}`);
  console.log("\nCROSS-FORMAT (item_type | floor | items | verified | quarantined | items-with-below-floor-FACT):");
  for (const t of Object.keys(r.byType).sort()) { const b = r.byType[t]; console.log(`  ${t.padEnd(16)} floor=${String(b.floor ?? "EXEMPT").padEnd(6)} items=${String(b.items).padStart(3)} verified=${String(b.verified||0).padStart(3)} quar=${String(b.quarantined||0).padStart(3)} below=${String(b.belowFloorItems).padStart(3)}`); }
  if (r.driftSamples.length) { console.log("\ndrift samples:"); for (const s of r.driftSamples) console.log(`  ${s}`); }

  console.log(`\n${r.fail ? "FAIL" : "PASS"}: ${r.fail ? "ledger drifts from the settled primitives (see above)" : "emitted ledger is faithful to the resolver; below-floor facts on verified items are rated per migration 302."}`);
  process.exit(r.fail ? 1 : 0);
}

if (isMainModule(import.meta.url)) await main();
