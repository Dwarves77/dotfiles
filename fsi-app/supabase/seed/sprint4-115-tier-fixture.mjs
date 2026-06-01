/**
 * sprint4-115-tier-fixture.mjs — sentinel fixture for task 1.15 runtime verification
 * (source-tier audit: recommendSourceTier Haiku round-trip + commit-tier-change
 * base_tier write + SourceTierAuditPanel render, on BOTH a seeded and a provisional
 * source).
 *
 * Seeds two SENTINEL-marked synthetic sources:
 *   - SEEDED (in `sources`, status active): a GOV-PRIMARY identity (federalregister.gov)
 *     so the Haiku tier recommendation is sanity-checkable (should lean Tier 1-2).
 *     base_tier seeded deliberately WRONG (6) so the commit-tier-change write to a
 *     lower tier is an unambiguous, read-back-verifiable change.
 *   - PROVISIONAL (in `provisional_sources`, status pending_review): a TRADE-PRESS
 *     identity (freightwaves.com) so the recommendation should lean lower (~Tier 5).
 *
 * SENTINEL-ONLY: both rows carry marker SPRINT4_BLOCK1_SELFTEST_115_ in name; cleanup
 * is marker-scoped; no real row is read, mutated, or deleted.
 *
 * MODES: (default) seed + report ids/tiers | --report | --cleanup
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PW = process.env.SUPABASE_DB_PASSWORD;
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(PW)}@`);

const MARKER = "SPRINT4_BLOCK1_SELFTEST_115";
const ID = {
  seeded: "5b1a4115-0000-4000-8000-000000000115",
  provisional: "5b1a4215-0000-4000-8000-000000000115",
};
const SEEDED_URL = "https://www.federalregister.gov/";
const PROV_URL = "https://www.freightwaves.com/";

async function cleanup(c) {
  await c.query(`DELETE FROM public.sources WHERE name LIKE $1`, [`${MARKER}%`]);
  await c.query(`DELETE FROM public.provisional_sources WHERE name LIKE $1`, [`${MARKER}%`]);
}

async function report(c) {
  const { rows: s } = await c.query(
    `SELECT id, name, url, base_tier, effective_tier, status FROM public.sources WHERE id = $1`,
    [ID.seeded]
  );
  const { rows: p } = await c.query(
    `SELECT id, name, url, provisional_tier, status FROM public.provisional_sources WHERE id = $1`,
    [ID.provisional]
  );
  console.log("SEEDED  (sources):", s[0] ? `${s[0].id} base_tier=${s[0].base_tier} status=${s[0].status} name=${s[0].name}` : "(absent)");
  console.log("PROVIS. (provisional_sources):", p[0] ? `${p[0].id} provisional_tier=${p[0].provisional_tier} status=${p[0].status} name=${p[0].name}` : "(absent)");
  return { seeded: s[0] || null, provisional: p[0] || null };
}

async function main() {
  const mode = process.argv[2] || "seed";
  const c = new Client({ connectionString: CONN });
  await c.connect();
  console.log(`[115-fixture] connected to ${REF} (mode=${mode})`);
  try {
    if (mode === "--cleanup") {
      await cleanup(c);
      console.log("[115-fixture] cleanup: 115 sentinel sources removed (marker-scoped)");
    } else if (mode === "--report") {
      await report(c);
    } else {
      await cleanup(c); // idempotent
      // SEEDED gov-primary source: base_tier deliberately WRONG (6) for the write test.
      await c.query(
        `INSERT INTO public.sources (id, name, url, description, tier, tier_at_creation, base_tier, effective_tier, status)
         VALUES ($1, $2, $3, 'sentinel 115 gov-primary self-test source', 6, 6, 6, 6, 'active')`,
        [ID.seeded, `${MARKER}_GOV`, SEEDED_URL]
      );
      // PROVISIONAL trade-press source.
      await c.query(
        `INSERT INTO public.provisional_sources (id, name, url, description, provisional_tier, status)
         VALUES ($1, $2, $3, 'sentinel 115 trade-press self-test provisional', 7, 'pending_review')`,
        [ID.provisional, `${MARKER}_PRESS`, PROV_URL]
      );
      console.log("[115-fixture] seeded. Post-seed:");
      await report(c);
      console.log("\nFor the browser snippets:");
      console.log(`  SEEDED_ID      = ${ID.seeded}   (gov-primary; expect Haiku tier ~1-2; base_tier starts at 6)`);
      console.log(`  PROVISIONAL_ID = ${ID.provisional}   (trade-press; expect Haiku tier ~5; commit-tier-change kind:provisional -> 409 defer)`);
    }
  } catch (err) {
    console.error(`[115-fixture] ERROR: ${err.message}`);
    process.exitCode = 3;
  } finally {
    await c.end();
  }
}

main();
