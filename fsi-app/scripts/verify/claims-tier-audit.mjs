/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediation-discipline.
 *
 *  INVARIANT SC-7 (claims-tier honesty) — D1 DERIVATION-CONSISTENCY basis (migration 145). Every FACT
 *  claim's stored source_tier_at_grounding equals the tier DERIVED from its resolved source:
 *  section_claim_provenance.source_id -> sources.COALESCE(tier_override, base_tier) — base_tier-only +
 *  the sanctioned per-host override, NEVER effective_tier (moat-pure); NULL when source_id is
 *  null/unregistered. This VERIFIES THE BASELINE IS INTACT — the stored cache stays consistent with the
 *  live derivation the authority floor (migration 145) uses. It deliberately does NOT re-resolve the span
 *  URL "now": a host that becomes registered AFTER a claim was grounded is NEW INTELLIGENCE that should
 *  move the claim POSITIVE from its baseline via the Phase-3 re-ground (growth) engine — that is GROWTH,
 *  not drift the audit polices. WIDE DENOMINATOR: non-FACT claims (GAP/ANALYSIS/LEGAL) carry no span
 *  grounding and MUST hold a NULL stamp; a non-NULL stamp on a non-FACT claim is a violation. The
 *  derivation mirrors the SINGLE module src/lib/sources/institution.ts (tierOfSource = base_tier; override
 *  wins). Exit 1 on any mismatch. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const sources = await readAll("sources", "id,base_tier,tier_override");
const claims = await readAll("section_claim_provenance", "id,claim_kind,source_id,source_tier_at_grounding");
const srcById = new Map(sources.map((s) => [s.id, s]));
// Moat-pure derivation, mirroring institution.ts tierOfSource: sanctioned per-host override wins, else
// base_tier (the static authority-origin), else NULL. effective_tier is never consulted.
const derivedTier = (sid) => {
  if (!sid) return null;
  const s = srcById.get(sid);
  if (!s) return null;
  return s.tier_override ?? s.base_tier ?? null;
};

let factMismatch = 0, nonFactStamped = 0; const sample = [];
for (const c of claims) {
  const stored = c.source_tier_at_grounding ?? null;
  if (c.claim_kind === "FACT") {
    const expected = derivedTier(c.source_id);
    if (stored !== expected) {
      factMismatch++;
      if (sample.length < 12) sample.push(`FACT ${c.id.slice(0, 8)} stored=${stored} derived=${expected ?? "NULL"} source_id=${c.source_id ? c.source_id.slice(0, 8) : "NULL"}`);
    }
  } else if (stored !== null) {
    nonFactStamped++;
    if (sample.length < 12) sample.push(`${c.claim_kind} ${c.id.slice(0, 8)} stored=${stored} expected=NULL`);
  }
}
const total = factMismatch + nonFactStamped;
console.log(`[claims-tier] claims: ${claims.length} (FACT ${claims.filter((c) => c.claim_kind === "FACT").length}) | FACT stored!=derived(source_id): ${factMismatch} | non-FACT carrying a stamp: ${nonFactStamped}`);
for (const s of sample) console.log(`  MISMATCH ${s}`);
if (total) {
  console.log(`\nFAIL: ${total} claim(s) violate claims-tier derivation-consistency (stored stamp != source_id-derived tier; non-FACT must be NULL).`);
  process.exit(1);
}
console.log("PASS: every FACT stamp == source_id-derived tier (base_tier/override, moat-pure); every non-FACT stamp is NULL.");
process.exit(0);
