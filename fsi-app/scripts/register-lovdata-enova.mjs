/**
 * Register two authoritative sources surfaced by the Lane-#4 03b5f234 grounding diagnosis as ABSENT
 * (null-tier) hosts. GOVERNING: source-credibility-model. Operator ruling 2026-07-03.
 *
 * INSTITUTIONAL BASIS (audit record):
 *  - lovdata.no @ T1 — Lovdata is the official publisher of Norsk Lovtidend, the enacted-text repository
 *    for Norwegian law. Tier-1 binding-legal-text publisher, the direct analog of EUR-Lex / Official
 *    Journal, legislation.gov.uk, and planalto.gov.br (per the SC Tier-1 mapping). Reg-facts that ground
 *    to the actual Norwegian legal text (03b5f234) stamped NULL because this host was unregistered.
 *  - enova.no @ T2 — Enova SF is a Norwegian state enterprise under the Ministry of Climate and
 *    Environment; a government authority in its domain (energy/climate programs). T2 regulator/agency
 *    class, analog of the fmcsa.dot.gov / national-agency cell.
 *
 * FETCH-FREE: registerSource does a paginated sources read + an INSERT — NO Browserless, NO reachability
 * fetch (this is NOT verifyCandidate, which is fetch-required and dormant under the scrape hold). Idempotent
 * (dedup by canonical host; activates if present). Registers into sources.base_tier per current schema and
 * rides the Phase 2 tier-home relocation with everything else. Read-back verified. DRY-RUN unless --apply.
 */
import { registerSource, readClient, readAll } from "./lib/db.mjs";
process.loadEnvFile(".env.local");
const APPLY = process.argv.includes("--apply");

const CITE = {
  skill: "source-credibility-model",
  reason: "Register authoritative null-tier hosts from Lane-#4 03b5f234 grounding: lovdata.no T1 (Norsk Lovtidend, EUR-Lex analog), enova.no T2 (state enterprise, Ministry of Climate & Environment). Fetch-free (NOT verifyCandidate). Operator ruling 2026-07-03.",
};
const SOURCES = [
  { url: "https://lovdata.no", name: "Lovdata — Norsk Lovtidend (official enacted-text repository for Norwegian law)", base_tier: 1 },
  { url: "https://www.enova.no", name: "Enova SF — Norwegian state enterprise (Ministry of Climate and Environment)", base_tier: 2 },
];

console.log(`MODE: ${APPLY ? "APPLY" : "DRY-RUN"} | ${SOURCES.length} sources (fetch-free)`);
if (!APPLY) { console.log("DRY-RUN — pass --apply."); process.exit(0); }

for (const s of SOURCES) {
  const out = await registerSource(s, { cite: CITE });
  console.log(`  ✔ ${out.host.padEnd(14)} -> source ${out.source_id} (created=${out.created}, requested base_tier=${s.base_tier})`);
}

console.log("\n=== READ-BACK ===");
const rows = await readAll("sources", "id,url,base_tier,status");
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return "?"; } };
for (const s of SOURCES) {
  const host = hostOf(s.url);
  const hit = rows.filter((r) => hostOf(r.url) === host);
  console.log(`  ${host}: ${JSON.stringify(hit.map((r) => ({ tier: r.base_tier, status: r.status })))} (expect tier=${s.base_tier}, status=active)`);
}
