/**
 * source-state-min-wage.mjs
 *
 * DATA PROGRAM (operator ruling 2026-07-07: run the state-cost program with
 * REAL, cited figures — never fabricated). Populates state_cost_facts
 * (migration 152) with the 2026 statewide minimum-wage figure for the major
 * US freight states, so the Operations "By state" sub-list renders real sourced
 * numbers instead of dashes.
 *
 * PROVENANCE (integrity rule — no invented cost figures):
 *   - Figures were LIVE-SOURCED on 2026-07-07 from NCSL (National Conference of
 *     State Legislatures, "State Minimum Wages" table) and CORROBORATED against
 *     a second web source (NELP / news aggregators) for CA $16.90, WA $17.13,
 *     OH $11.00, NJ $15.92 — all agreed exactly.
 *   - source_id = NCSL (registered here). statute_citation = the enacting-
 *     instrument descriptor AS NCSL states it (e.g. "2016 ballot measure,
 *     indexed") — NOT a code section pulled from memory (the schema requires
 *     statute_citation never be inferred; precise §-level cites are a future
 *     enhancement when each state statute is fetched directly).
 *   - A state NOT in this list renders a dash on the surface — never a national
 *     average. States with regional variance (NY, OR) use the statewide floor
 *     with the metro rate noted in the citation.
 *
 * SAFETY: DRY-RUN by default; --execute writes via guarded db.mjs helpers
 *   (cite + snapshot + service-role). Idempotent on (state_code, dimension,
 *   fact_label) — a re-run updates the value/citation rather than duplicating.
 *   No fetch, no spend, no Browserless.
 *
 * RUN:
 *   node scripts/source-state-min-wage.mjs            # dry-run
 *   node scripts/source-state-min-wage.mjs --execute  # write
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedInsert, guardedUpdate, registerSource } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(ROOT, ".env.local"));
} catch {
  // env may already be loaded by the caller.
}

const EXECUTE = process.argv.includes("--execute");

// US region row (regions table). Verified 2026-07-07.
const US_REGION_ID = "a264285d-04d9-4312-a910-e6635da3db5e";

const cite = {
  skill: "source-credibility-model",
  reason: "State-cost data program — 2026 statewide minimum wage per state, sourced from NCSL (live 2026-07-07, corroborated), each cited to its enacting instrument",
};

// value = the 2026 statewide standard rate. citation = NCSL's enacting-instrument
// descriptor. effective = the date THIS rate took effect where corroborated,
// else null (never inferred). trend = up (indexed/rising) | flat (static).
const FACTS = [
  { code: "US-CA", label: "California", value: "$16.90", citation: "2016 minimum-wage legislation; indexed annually (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-WA", label: "Washington", value: "$17.13", citation: "2016 ballot measure; indexed annually (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-NY", label: "New York", value: "$16.00", citation: "NY minimum-wage law — statewide floor; NYC/Nassau/Suffolk/Westchester $17.00 (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-NJ", label: "New Jersey", value: "$15.92", citation: "2019 minimum-wage legislation; indexed (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-IL", label: "Illinois", value: "$15.00", citation: "Illinois minimum-wage law (reached $15.00 in 2025) (NCSL)", effective: null, trend: "flat" },
  { code: "US-MA", label: "Massachusetts", value: "$15.00", citation: "Massachusetts minimum-wage law; auto-increase if federal exceeds state (NCSL)", effective: null, trend: "flat" },
  { code: "US-AZ", label: "Arizona", value: "$15.15", citation: "2016 ballot measure; indexed annually (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-CO", label: "Colorado", value: "$15.16", citation: "2016 constitutional amendment; indexed annually (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-OH", label: "Ohio", value: "$11.00", citation: "2006 constitutional amendment; indexed annually (NCSL)", effective: "2026-01-01", trend: "up" },
  { code: "US-FL", label: "Florida", value: "$14.00", citation: "Constitutional amendment; rises to $15.00 on 2026-09-30 (NCSL)", effective: null, trend: "up" },
  { code: "US-TX", label: "Texas", value: "$7.25", citation: "No state minimum above federal — FLSA federal rate ($7.25) applies (NCSL)", effective: null, trend: "flat" },
  { code: "US-GA", label: "Georgia", value: "$7.25", citation: "State rate below federal — FLSA federal rate ($7.25) applies to covered employers (NCSL)", effective: null, trend: "flat" },
  { code: "US-PA", label: "Pennsylvania", value: "$7.25", citation: "No state minimum above federal — FLSA federal rate ($7.25) applies (NCSL)", effective: null, trend: "flat" },
];

const DIMENSION = "labor_markets";
const FACT_LABEL = "Minimum wage";
const UNIT = "/hr";

async function main() {
  console.log(`\nsource-state-min-wage — ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  // 1. Register NCSL as the source (dedups by host).
  const ncsl = await registerSource(
    { url: "https://www.ncsl.org/labor-and-employment/state-minimum-wages", name: "National Conference of State Legislatures (NCSL) — State Minimum Wages", base_tier: 4 },
    { cite }
  );
  console.log(`source: NCSL → ${ncsl.source_id} (${ncsl.created ? "created" : "existing"})\n`);

  // 2. Existing state_cost_facts for idempotent upsert.
  const existing = await readAll("state_cost_facts", "id, state_code, dimension, fact_label, value");
  const byKey = new Map(existing.map((r) => [`${r.state_code}|${r.dimension}|${r.fact_label}`, r]));

  let created = 0;
  let updated = 0;
  for (const f of FACTS) {
    const key = `${f.code}|${DIMENSION}|${FACT_LABEL}`;
    const row = {
      region_id: US_REGION_ID,
      state_code: f.code,
      state_label: f.label,
      dimension: DIMENSION,
      fact_label: FACT_LABEL,
      value: f.value,
      unit: UNIT,
      trend: f.trend,
      source_id: ncsl.source_id,
      statute_citation: f.citation,
      effective_date: f.effective,
    };
    const prior = byKey.get(key);
    if (!EXECUTE) {
      console.log(`${prior ? "would update" : "would create"}  ${f.code.padEnd(6)} ${f.value.padEnd(7)} ${f.citation}`);
      continue;
    }
    if (prior) {
      await guardedUpdate("state_cost_facts", (qb) => qb.eq("id", prior.id), {
        value: row.value, unit: row.unit, trend: row.trend, source_id: row.source_id,
        statute_citation: row.statute_citation, effective_date: row.effective_date,
        state_label: row.state_label, last_updated: new Date().toISOString(),
      }, { cite });
      console.log(`updated  ${f.code} → ${f.value}`);
      updated += 1;
    } else {
      const res = await guardedInsert("state_cost_facts", row, { cite });
      console.log(`created  ${f.code} → ${f.value}  (snapshot ${res.snapshot})`);
      created += 1;
    }
  }

  console.log(
    `\n${EXECUTE ? `done — ${created} created, ${updated} updated (${FACTS.length} states)` : "dry-run complete — pass --execute to write"}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
