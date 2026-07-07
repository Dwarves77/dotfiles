// Phase 1 STEP 1 proof (pure, no DB): the reg-fact resolver (buildResolver/resolveSpan) is base_tier-ONLY
// after hardening — reputation (effective_tier) can neither RAISE nor LOWER the stamp tier, a NULL base_tier
// resolves to NULL (the latent breach is closed), and a per-host tier_override still wins.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = got === want; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} (got ${got}, want ${want})`); ok ? pass++ : fail++; };
const URL1 = "https://eur-lex.europa.eu/legal/x";

console.log("== reg-fact resolver is base_tier-ONLY (moat) ==");
// effective_tier ABOVE base_tier (better reputation) -> stamp stays base_tier (can't RAISE eligibility).
eq("eff above base -> base_tier", buildResolver([{ id: "a", url: URL1, base_tier: 2, effective_tier: 1 }]).resolveSpan(URL1).tier, 2);
// effective_tier BELOW base_tier (degraded reputation) -> stamp stays base_tier (can't LOWER eligibility).
eq("eff below base -> base_tier", buildResolver([{ id: "b", url: URL1, base_tier: 2, effective_tier: 5 }]).resolveSpan(URL1).tier, 2);
// base_tier NULL + effective_tier set -> NULL (the latent breach: reputation must NOT fill in eligibility).
eq("null base + eff set -> NULL", buildResolver([{ id: "c", url: URL1, base_tier: null, effective_tier: 1 }]).resolveSpan(URL1).tier, null);
// tier_override (deliberate per-host flag) still wins over base_tier.
eq("override wins", buildResolver([{ id: "d", url: URL1, base_tier: 4, effective_tier: 1, tier_override: 2 }]).resolveSpan(URL1).tier, 2);
// normal: base_tier only -> base_tier.
eq("base only -> base_tier", buildResolver([{ id: "e", url: URL1, base_tier: 3 }]).resolveSpan(URL1).tier, 3);

console.log(`\n${fail === 0 ? "ALL PASS — reg-fact resolver locked to base_tier; reputation cannot confer eligibility either direction." : `${fail} FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
