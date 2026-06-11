/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: source-credibility-model + remediation-discipline.
 *
 *  INVARIANT SC-6 (one canonical tier per host group): every institution (eTLD+1 with documented
 *  super-domain exceptions) has exactly ONE base_tier across its source rows — UNLESS a row carries a
 *  deliberate tier_override (explicit per-row flag, default none). A multi-tier host with no override is
 *  the duplicate-row-at-inconsistent-tiers defect (Phase 0' class fix). Exit 1 on any violation.
 *  Resolution comes from the SINGLE module src/lib/sources/institution.ts (same code production runs). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, hostInstitution } = await jiti.import("../../src/lib/sources/institution.ts");

const sources = await readAll("sources", "id,url,base_tier,effective_tier,tier_override,status");
const byInst = new Map();
for (const s of sources) {
  if (s.tier_override != null) continue;            // explicit override exempt
  const k = hostInstitution(hostOf(s.url));
  if (!k) continue;
  if (!byInst.has(k)) byInst.set(k, new Map());
  const tiers = byInst.get(k);
  const t = s.base_tier ?? null;
  tiers.set(t, (tiers.get(t) || 0) + 1);
}
const violations = [...byInst.entries()].filter(([, tiers]) => new Set([...tiers.keys()]).size > 1);

console.log(`[one-tier-per-host] institutions checked: ${byInst.size} | multi-tier violations: ${violations.length}`);
for (const [k, tiers] of violations.sort((a, b) => b[1].size - a[1].size))
  console.log(`  VIOLATION ${k.padEnd(34)} base_tiers={${[...tiers.entries()].map(([t, n]) => `${t}:${n}`).join(",")}}`);
if (violations.length) {
  console.log(`\nFAIL: ${violations.length} host(s) carry inconsistent base_tier without a tier_override. Canonicalize via Phase 0' / source-credibility-model.`);
  process.exit(1);
}
console.log("PASS: every host group has one canonical institutional tier (or an explicit override).");
process.exit(0);
