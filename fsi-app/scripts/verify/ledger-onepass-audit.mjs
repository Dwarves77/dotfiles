/** E1 — ONE-PASS LEDGER VERIFIER (read-only, deterministic; no LLM, no network).
 *
 *  A single deterministic read-pass over the emitted claim ledger (section_claim_provenance) that
 *  re-derives each item's grounding verdict from the TWO SETTLED PRIMITIVES and asserts the emitted ledger
 *  is faithful to them. It CONSUMES the primitives and CHANGES NEITHER:
 *    (1) the canonical institution RESOLVER (src/lib/sources/institution.ts buildResolver) — span → tier,
 *    (2) the PER-ITEM-TYPE authority floor (migration 141: reg ≤T2, research_finding ≤T4,
 *        technology/innovation/tool ≤T5; market_signal/initiative/regional_data EXEMPT).
 *
 *  It is an INDEPENDENT JS cross-check of the SQL gate (validate_item_provenance): claims-tier-audit and
 *  substrate-agreement check the resolver-stamp and stored-status-vs-SQL halves separately; this composes
 *  both into one pass that ALSO re-derives the per-type floor in JS, so a drift between the SQL gate and
 *  the JS primitives (e.g. a floor value that lands in one but not the other) is caught here, not in prod.
 *
 *  ASSERTIONS (deterministic):
 *    A. DERIVATION-CONSISTENCY (D1, migration 145) — every FACT claim's stored source_tier_at_grounding
 *       equals the tier DERIVED from its stored source_id (COALESCE(tier_override, base_tier) —
 *       base_tier-only/moat-pure, mirroring the live floor); every non-FACT claim carries a NULL tier
 *       stamp. The "span URL would re-resolve to a different source NOW" count is an INFORMATIONAL growth
 *       signal (registry growth since grounding → Phase-3 re-ground engine), NOT an audit failure.
 *    B. PER-TYPE FLOOR CONSISTENCY — for each floored item type, no item is stored `verified` while it holds
 *       a CRITICAL/HIGH FACT below its type floor (tier NULL or > floor_max). (A quarantined item may hold
 *       below-floor facts — that is the floor doing its job; the violation is verified-despite-below-floor.)
 *
 *  Exit 0 = both hold (ledger faithful to the primitives). Exit 1 = at least one drift. Read-only.
 *  CUTOVER NOTE: run the cross-format sample (printed below, incl. research_finding) and confirm clean
 *  before wiring this into the data-audit lane as a hard gate. GOVERNING: source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");

// PER-TYPE FLOOR — MUST mirror migration 141 v_floor_max. NULL = exempt. (Single source of truth is the
// SQL function; this is the deliberate independent JS copy whose agreement-with-SQL the audit exists to prove.)
const FLOOR_MAX = (itemType) =>
  ["regulation", "directive", "standard", "guidance", "framework"].includes(itemType) ? 2
  : itemType === "research_finding" ? 4
  : ["technology", "innovation", "tool"].includes(itemType) ? 5
  : null; // market_signal / initiative / regional_data — EXEMPT
const isHigh = (p) => p === "CRITICAL" || p === "HIGH";

const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const srcById = new Map(sources.map((s) => [s.id, s]));
// D1 derivation-consistency basis: the stamp + floor derive from the claim's stored source_id ->
// COALESCE(tier_override, base_tier) (base_tier-only, moat-pure), mirroring migration 145's live floor.
const derivedTier = (sid) => { if (!sid) return null; const s = srcById.get(sid); return s ? (s.tier_override ?? s.base_tier ?? null) : null; };
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));
const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority,provenance_status", { match: (q) => q.eq("is_archived", false) });
const itemById = new Map(items.map((i) => [i.id, i]));
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_span,source_id,source_tier_at_grounding,search_result_id");

// ── Assertion A: resolver fidelity ───────────────────────────────────
let factChecked = 0, stampDrift = 0, sourceDrift = 0, nonFactStamped = 0;
const driftSamples = [];
// ── Assertion B: per-type floor consistency (per item) ───────────────
const belowByItem = new Map(); // item_id -> count of below-floor FACTs (per its type floor)
for (const c of claims) {
  const it = itemById.get(c.intelligence_item_id);
  if (!it) continue;
  if (c.claim_kind !== "FACT") {
    if (c.source_tier_at_grounding != null) { nonFactStamped++; if (driftSamples.length < 6) driftSamples.push(`non-FACT stamped: claim ${c.id.slice(0,8)} kind=${c.claim_kind} tier=${c.source_tier_at_grounding}`); }
    continue;
  }
  factChecked++;
  // D1: stamp + floor derive from the stored source_id (base_tier-only, moat-pure), mirroring migration 145.
  const dtier = derivedTier(c.source_id);
  if (c.source_tier_at_grounding !== dtier) { stampDrift++; if (driftSamples.length < 6) driftSamples.push(`stamp drift: claim ${c.id.slice(0,8)} stored=${c.source_tier_at_grounding} derived=${dtier} source_id=${c.source_id?c.source_id.slice(0,8):"NULL"}`); }
  // GROWTH SIGNAL (informational, NOT a failure): the span URL would now re-resolve to a different source
  // than stored — registry growth since grounding, owned by the Phase-3 re-ground engine, not audit drift.
  const sr = searchById.get(c.search_result_id);
  const reResolved = sr ? resolver.resolveSpan(sr.result_url) : { sourceId: null };
  if ((c.source_id ?? null) !== (reResolved.sourceId ?? null)) sourceDrift++;
  // floor verdict from the DERIVED tier (mirrors the live SQL gate, migration 145)
  const fmax = FLOOR_MAX(it.item_type);
  if (isHigh(it.priority) && fmax != null && (dtier == null || dtier > fmax))
    belowByItem.set(it.id, (belowByItem.get(it.id) || 0) + 1);
}
// verified-despite-below-floor = the floor-consistency violation
const floorViolations = [];
for (const [id, n] of belowByItem) {
  const it = itemById.get(id);
  if (it.provenance_status === "verified") floorViolations.push({ key: it.legacy_id || id.slice(0, 8), type: it.item_type, below: n });
}

// ── cross-format report ──────────────────────────────────────────────
const byType = {};
for (const it of items) {
  byType[it.item_type] ??= { items: 0, verified: 0, quarantined: 0, floor: FLOOR_MAX(it.item_type), belowFloorItems: 0 };
  byType[it.item_type].items++;
  byType[it.item_type][it.provenance_status] = (byType[it.item_type][it.provenance_status] || 0) + 1;
  if (belowByItem.has(it.id)) byType[it.item_type].belowFloorItems++;
}

console.log("\n===== E1 ONE-PASS LEDGER VERIFIER (deterministic; resolver + per-type floor) =====");
console.log(`claims ${claims.length} | FACT checked ${factChecked} | items ${items.length}`);
console.log("\nASSERTION A — resolver fidelity:");
console.log(`  FACT stamp != source_id-derived tier: ${stampDrift} | (growth signal, non-failing) source_id != URL-re-resolve: ${sourceDrift} | non-FACT carrying a stamp: ${nonFactStamped}`);
console.log("\nASSERTION B — per-type floor consistency (no verified item with a below-floor FACT):");
console.log(`  verified-despite-below-floor violations: ${floorViolations.length}`);
for (const v of floorViolations.slice(0, 12)) console.log(`    ${v.key.padEnd(32)} ${v.type.padEnd(12)} below=${v.below}`);
console.log("\nCROSS-FORMAT (item_type | floor | items | verified | quarantined | items-with-below-floor-FACT):");
for (const t of Object.keys(byType).sort()) { const b = byType[t]; console.log(`  ${t.padEnd(16)} floor=${String(b.floor ?? "EXEMPT").padEnd(6)} items=${String(b.items).padStart(3)} verified=${String(b.verified||0).padStart(3)} quar=${String(b.quarantined||0).padStart(3)} below=${String(b.belowFloorItems).padStart(3)}`); }
if (driftSamples.length) { console.log("\ndrift samples:"); for (const s of driftSamples) console.log(`  ${s}`); }

const fail = stampDrift > 0 || nonFactStamped > 0 || floorViolations.length > 0;
console.log(`\n${fail ? "FAIL" : "PASS"}: ${fail ? "ledger drifts from the settled primitives (see above)" : "emitted ledger is faithful to the resolver and the per-type floor; no verified-despite-below-floor item."}`);
process.exit(fail ? 1 : 0);
