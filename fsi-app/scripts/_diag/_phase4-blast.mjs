// Phase 4 READ-ONLY blast-radius probe (verification-before-authorization).
// Quantifies what changes when validate_item_provenance's authority floor switches from reading the
// STORED source_tier_at_grounding to deriving it INLINE from the claim's source_id ->
// sources.(tier_override ?? base_tier). NOTHING is written. Run before authoring the migration.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const floorMax = (t) => REG.has(t) ? 2 : t === "research_finding" ? 4 : ["technology", "innovation", "tool"].includes(t) ? 5 : null;

console.log("Loading section_claim_provenance, sources, intelligence_items …");
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_id,source_tier_at_grounding");
const sources = await readAll("sources", "id,base_tier,tier_override,status");
const items = await readAll("intelligence_items", "id,priority,item_type,provenance_status");

const srcById = new Map(sources.map((s) => [s.id, s]));
const itemById = new Map(items.map((i) => [i.id, i]));
const derivedTier = (sid) => {
  if (!sid) return null;
  const s = srcById.get(sid);
  if (!s) return null;
  return s.tier_override ?? s.base_tier ?? null;
};

const fact = claims.filter((c) => c.claim_kind === "FACT");
const nonFact = claims.filter((c) => c.claim_kind !== "FACT");

// 1. non-FACT rows carrying a non-NULL stamp (must be NULL per SC-7) — the "41".
const nonFactStamped = nonFact.filter((c) => c.source_tier_at_grounding != null);

// 2. FACT stamp drift: stored != inline-derived.
let factSrcNull = 0, factStampNull = 0, drift = 0, agree = 0;
for (const c of fact) {
  if (!c.source_id) factSrcNull++;
  if (c.source_tier_at_grounding == null) factStampNull++;
  const d = derivedTier(c.source_id);
  if (d === c.source_tier_at_grounding) agree++; else drift++;
}

// 3. Floor PASS/FAIL flip — the real blast radius on verification status.
// Only CRITICAL/HIGH items with a non-null floor_max gate FACT claims.
const passes = (tier, fmax) => fmax == null ? true : (tier != null && tier <= fmax);
const itemFlip = new Map(); // item_id -> {storedFail, derivedFail}
let claimFlipToFail = 0, claimFlipToPass = 0, gatedClaims = 0;
for (const c of fact) {
  const it = itemById.get(c.intelligence_item_id);
  if (!it) continue;
  const high = it.priority === "CRITICAL" || it.priority === "HIGH";
  const fmax = floorMax(it.item_type);
  if (!high || fmax == null) continue;
  gatedClaims++;
  const storedPass = passes(c.source_tier_at_grounding, fmax);
  const derivedPass = passes(derivedTier(c.source_id), fmax);
  if (storedPass && !derivedPass) claimFlipToFail++;
  if (!storedPass && derivedPass) claimFlipToPass++;
  const rec = itemFlip.get(it.id) || { storedAllPass: true, derivedAllPass: true, status: it.provenance_status };
  rec.storedAllPass = rec.storedAllPass && storedPass;
  rec.derivedAllPass = rec.derivedAllPass && derivedPass;
  itemFlip.set(it.id, rec);
};

let itemsToFail = 0, itemsToPass = 0;
for (const [, r] of itemFlip) {
  if (r.storedAllPass && !r.derivedAllPass) itemsToFail++;   // was floor-clean, now would fail
  if (!r.storedAllPass && r.derivedAllPass) itemsToPass++;   // was floor-failing, now would pass
}

console.log("\n=========== PHASE 4 BLAST RADIUS (read-only) ===========");
console.log(`claims total: ${claims.length}  | FACT: ${fact.length}  non-FACT: ${nonFact.length}`);
console.log(`sources: ${sources.length}  items: ${items.length}`);
console.log("\n--- (A) non-FACT rows with a non-NULL stamp (SC-7 says must be NULL; the '41') ---");
console.log(`  count: ${nonFactStamped.length}`);
console.log("\n--- (B) FACT stamp vs inline-derive(source_id -> tier_override ?? base_tier) ---");
console.log(`  FACT claims with source_id NULL: ${factSrcNull}`);
console.log(`  FACT claims with stored stamp NULL: ${factStampNull}`);
console.log(`  stored == derived (agree): ${agree}`);
console.log(`  stored != derived (DRIFT): ${drift}`);
console.log("\n--- (C) authority-floor PASS/FAIL flips (CRITICAL/HIGH, reg/research/tech only) ---");
console.log(`  gated FACT claims: ${gatedClaims}`);
console.log(`  claims: stored-PASS -> derived-FAIL: ${claimFlipToFail}`);
console.log(`  claims: stored-FAIL -> derived-PASS: ${claimFlipToPass}`);
console.log(`  ITEMS that would flip floor-clean -> floor-FAIL: ${itemsToFail}  <-- the verification blast radius`);
console.log(`  ITEMS that would flip floor-FAIL -> floor-clean: ${itemsToPass}`);
console.log("========================================================");
