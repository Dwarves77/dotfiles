/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediation-discipline.
 *
 *  INVARIANT SC-7 (claims-tier honesty): every FACT claim's source_tier_at_grounding equals the CANONICAL
 *  INSTITUTIONAL TIER of the source CONTAINING ITS SPAN — resolved via the span row
 *  (search_result_id -> agent_run_searches.result_url -> institution -> base_tier), the flagged-override
 *  row tier where present, or NULL when the span host is unregistered. NO CONSTANTS (the old hardcoded
 *  `2` is a violation). WIDE DENOMINATOR (rider 1): the audit covers the FULL claim population — non-FACT
 *  claims (GAP/ANALYSIS/LEGAL) carry NO span grounding and MUST hold a NULL stamp; a non-NULL stamp on a
 *  non-FACT claim is also a violation. So green certifies every row, not just FACT. Resolution comes from
 *  the SINGLE module src/lib/sources/institution.ts (same code production runs). Exit 1 on any mismatch.
 *
 *  NOTE: honestly RED until the Phase 1 backfill (A6) re-stamps every FACT claim from the resolver. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");

const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override");
const claims = await readAll("section_claim_provenance", "id,claim_kind,search_result_id,source_tier_at_grounding");
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));
const resolver = buildResolver(sources);

let factMismatch = 0, nonFactStamped = 0; const sample = [];
for (const c of claims) {
  const stored = c.source_tier_at_grounding ?? null;
  if (c.claim_kind === "FACT") {
    const sr = searchById.get(c.search_result_id);
    const expected = sr ? resolver.resolveSpan(sr.result_url).tier : null;
    if (stored !== expected) {
      factMismatch++;
      if (sample.length < 12) sample.push(`FACT ${c.id.slice(0, 8)} stored=${stored} expected=${expected ?? "NULL"} host=${hostOf(sr?.result_url || "")}`);
    }
  } else if (stored !== null) {
    nonFactStamped++;
    if (sample.length < 12) sample.push(`${c.claim_kind} ${c.id.slice(0, 8)} stored=${stored} expected=NULL`);
  }
}
const total = factMismatch + nonFactStamped;
console.log(`[claims-tier] claims: ${claims.length} (FACT ${claims.filter((c) => c.claim_kind === "FACT").length}) | FACT stamp!=resolved: ${factMismatch} | non-FACT carrying a stamp: ${nonFactStamped}`);
for (const s of sample) console.log(`  MISMATCH ${s}`);
if (total) {
  console.log(`\nFAIL: ${total} claim(s) violate claims-tier honesty (no constants; non-FACT must be NULL). Re-stamp via the Phase 1 backfill.`);
  process.exit(1);
}
console.log("PASS: every FACT stamp == canonical institutional tier of its span source; every non-FACT stamp is NULL.");
process.exit(0);
