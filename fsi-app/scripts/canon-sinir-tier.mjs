/** CANONICALIZE sinir.gov.br to ONE institutional tier (source-credibility-model §3 — "one canonical
 *  institutional tier per host group; inconsistent per-row tiers are the duplicate-row defect and MUST be
 *  canonicalized"). Surfaced by the data-audit lane (one-tier-per-host) while clearing item 2.
 *
 *  sinir.gov.br = Brazil's Sistema Nacional de Informações sobre a Gestão dos Resíduos Sólidos — an agency
 *  DATA PORTAL / operational system run by the Ministry of the Environment. T1 is reserved for primary legal
 *  text ("the source IS the rule": EUR-Lex, legislation.gov.uk, Federal Register); the Brazilian primary law
 *  lives at planalto.gov.br, NOT here. An agency data portal is a REGULATOR/agency system = T2. So the T2 row
 *  (MTR manifest platform) is correct and the T1 row ("Logística Reversa data portal") is the mis-tier.
 *
 *  Canonicalize the T1 row -> T2. Both rows are PROVISIONAL and 0 intelligence_items ground against either, so
 *  zero grounding blast radius. Guarded (snapshot + reversible). Targeted by (host, base_tier=1) so it is a
 *  no-op if already canonical. DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");

const rows = await readAll("sources", "id,name,url,base_tier,tier_override,status", { match: (q) => q.ilike("url", "%sinir.gov.br%") });
console.log(`\n===== CANONICALIZE sinir.gov.br TIER (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
for (const r of rows) console.log(`  ${r.id.slice(0, 8)} T${r.base_tier} ${r.status.padEnd(11)} ${r.name}`);

// SAFETY: refuse if any row carries a deliberate tier_override (that's an intentional per-row exception, not
// a defect) or if any grounding item depends on these rows (blast radius must be zero for this quiet fix).
const ids = rows.map((r) => r.id);
const dependents = await readAll("intelligence_items", "id", { match: (q) => q.in("source_id", ids) });
const overridden = rows.filter((r) => r.tier_override != null);
if (overridden.length) { console.log(`REFUSE: a row carries tier_override (deliberate exception) — surface, don't auto-canonicalize.`); process.exit(1); }
if (dependents.length) { console.log(`REFUSE: ${dependents.length} intelligence_items depend on these rows — not a zero-blast-radius fix; surface.`); process.exit(1); }

const misTiered = rows.filter((r) => r.base_tier === 1);
console.log(`\ncanonical tier = T2 (agency data portal). rows to fix (currently T1): ${misTiered.length}`);
if (!misTiered.length) { console.log("already canonical — no-op."); process.exit(0); }
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to set ${misTiered.map((r) => r.id.slice(0, 8)).join(", ")} to T2.`); process.exit(0); }

for (const r of misTiered) {
  await guardedUpdate("sources", (qb) => qb.eq("id", r.id), { base_tier: 2 }, {
    cite: { skill: "source-credibility-model", reason: `canonicalize sinir.gov.br to one institutional tier: agency data portal T1->T2 (T1 is primary legal text only)` },
  });
  console.log(`  ${r.id.slice(0, 8)} base_tier 1 -> 2 (canonicalized)`);
}
console.log(`\nDONE: sinir.gov.br canonicalized to T2. Re-run one-tier-per-host-audit to confirm green.`);
process.exit(0);
