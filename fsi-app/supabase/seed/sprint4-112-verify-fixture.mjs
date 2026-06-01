/**
 * sprint4-112-verify-fixture.mjs — PERSISTENT sentinel fixture for the task 1.12
 * runtime verification (admin verification queue + resumeHook tick + flip).
 *
 * Unlike apply-114.mjs (which builds 6 cases and cleans them up in `finally`),
 * this script SEEDS ONE valid CRITICAL item and LEAVES IT IN PLACE so a real
 * generate-brief workflow run can:
 *   1. loadPendingFactClaims(itemId) -> the 4 FACT claims,
 *   2. open 4 concurrent createHook() gates (Promise.all) and SUSPEND,
 *   3. be ticked via POST /api/admin/verify-claim (resumeHook) per claim,
 *   4. flipToVerifiedIfAllTicked -> pending_human_verify -> verified.
 *
 * The fixture shape is copied verbatim from apply-114.mjs buildValid(CRITICAL):
 * a tier-1 active source + a section + 4 span-grounded FACT claims (one per
 * required regulation slot), each span an exact substring of the search excerpt.
 * The set_provenance_status trigger (migration 115) lands the item at
 * 'pending_human_verify' because it validates as a passing CRITICAL item.
 *
 * SYNTHETIC-ONLY, PROVABLY ISOLATED BY SENTINEL:
 *   - All rows carry marker SPRINT4_BLOCK1_SELFTEST_ (legacy_id / source name),
 *     in a reserved fixed-UUID namespace ending ...000000000112 (distinct from
 *     apply-114's ...000000000114 so the two never collide).
 *   - No real row is read, mutated, or deleted. --cleanup is marker-scoped.
 *
 * MODES:
 *   (default)    seed the fixture (idempotent: pre-cleans its own marker first),
 *                then report the item status + the 4 claim ids.
 *   --report     print the item's current provenance_status + claim ids/verified_at.
 *   --cleanup    delete the 112 sentinel rows (+ any sentinel integrity_flags).
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const PROJECT_REF = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD missing from .env.local");
  process.exit(1);
}
const CONN_STRING = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`
);

const SENTINEL = "SPRINT4_BLOCK1_SELFTEST_";
const MARKER_LIKE = `${SENTINEL}112%`; // scope cleanup to the 112 fixture only

const ID = {
  source:    "5b1a4112-0000-4000-8000-000000000112",
  critValid: "5b1a4012-0000-4000-8000-000000000112",
};
const SRC_URL = "https://selftest.example.gov/source-112";
const EXCERPT =
  "The regulation enters force on effective_date 2026-01-01. " +
  "The headline primary_deadline 2026-06-30 governs compliance. " +
  "The jurisdictional_scope European Union applies throughout. " +
  "The penalty_summary fines up to EUR 50000 may be levied.";

async function cleanup(client) {
  // integrity_flags carries no FK to items; remove sentinel-item flags explicitly
  // (an intermediate quarantine flag can be written while claims are added one by
  // one, before the item recovers to pending_human_verify on the final claim).
  await client.query(
    `DELETE FROM public.integrity_flags WHERE subject_ref = $1`,
    [ID.critValid]
  );
  await client.query(`DELETE FROM public.intelligence_items WHERE legacy_id LIKE $1`, [MARKER_LIKE]);
  await client.query(`DELETE FROM public.sources WHERE name LIKE $1`, [MARKER_LIKE]);
}

async function report(client) {
  const { rows: items } = await client.query(
    `SELECT id, legacy_id, title, summary, domain, source_id, is_archived,
            priority, provenance_status, provenance_verified_at
       FROM public.intelligence_items WHERE id = $1`,
    [ID.critValid]
  );
  if (items.length === 0) {
    console.log("[112-fixture] no fixture item present (id " + ID.critValid + ")");
    return null;
  }
  const it = items[0];
  const isSentinel = typeof it.legacy_id === "string" && it.legacy_id.startsWith("SPRINT4_BLOCK1_SELFTEST_");
  console.log(`[112-fixture] IDENTITY CHECK: legacy_id=${it.legacy_id} title=${it.title}`);
  console.log(`             summary="${it.summary}" domain=${it.domain} is_archived=${it.is_archived} source_id=${it.source_id}`);
  console.log(`             SENTINEL-MARKED=${isSentinel ? "YES (synthetic self-test row, safe)" : "NO *** NOT SENTINEL — DO NOT OPERATE ***"}`);
  const { rows: claims } = await client.query(
    `SELECT id, claim_kind, verified_by, verified_at
       FROM public.section_claim_provenance
      WHERE intelligence_item_id = $1 AND claim_kind = 'FACT'
      ORDER BY claim_text`,
    [ID.critValid]
  );
  console.log(`[112-fixture] item ${it.id}`);
  console.log(`             priority=${it.priority} provenance_status=${it.provenance_status} verified_at=${it.provenance_verified_at}`);
  console.log(`             FACT claims (${claims.length}):`);
  for (const c of claims) {
    console.log(`               ${c.id}  verified_by=${c.verified_by} verified_at=${c.verified_at}`);
  }
  const { rows: vr } = await client.query(
    `SELECT (r).valid AS valid, (r).recommended_status AS rec
       FROM public.validate_item_provenance($1) AS r`,
    [ID.critValid]
  );
  console.log(`             validate_item_provenance -> valid=${vr[0].valid} recommended_status=${vr[0].rec}`);
  return { item: it, claims };
}

async function seed(client) {
  await cleanup(client); // idempotent: clear any prior 112 fixture first

  await client.query(
    `INSERT INTO public.sources (id, name, url, description, tier, tier_at_creation, base_tier, effective_tier, status)
     VALUES ($1, $2, $3, 'sentinel 112 self-test source', 1, 1, 1, 1, 'active')`,
    [ID.source, `${SENTINEL}112_SOURCE_TIER1`, SRC_URL]
  );

  await client.query(
    `INSERT INTO public.intelligence_items
       (id, legacy_id, title, summary, domain, item_type, source_id, source_url, priority, status)
     VALUES ($1, $2, $3, 'sentinel 112 self-test item', 1, 'regulation', $4, $5, 'CRITICAL', 'monitoring')`,
    [ID.critValid, `${SENTINEL}112_CRIT`, `${SENTINEL}112_CRIT`, ID.source, SRC_URL]
  );

  const { rows: sec } = await client.query(
    `INSERT INTO public.intelligence_item_sections (item_id, section_key, section_order, content_md, source_ids)
     VALUES ($1, 'key_obligations', 1, $2, $3) RETURNING id`,
    [
      ID.critValid,
      `Key facts grounded in the source. See ${SRC_URL}. ` +
        `Effective effective_date 2026-01-01; primary_deadline 2026-06-30; ` +
        `jurisdictional_scope European Union; penalty_summary fines up to EUR 50000.`,
      [ID.source],
    ]
  );
  const secId = sec[0].id;

  const { rows: srch } = await client.query(
    `INSERT INTO public.agent_run_searches
       (intelligence_item_id, search_query, result_url, result_title, result_index, result_content_excerpt, searched_at)
     VALUES ($1, 'sentinel q', $2, 'sentinel result', 0, $3, NOW()) RETURNING id`,
    [ID.critValid, SRC_URL, EXCERPT]
  );
  const searchId = srch[0].id;

  const facts = [
    "effective_date 2026-01-01",
    "primary_deadline 2026-06-30",
    "jurisdictional_scope European Union",
    "penalty_summary fines up to EUR 50000",
  ];
  for (const f of facts) {
    await client.query(
      `INSERT INTO public.section_claim_provenance
         (section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding)
       VALUES ($1, $2, $3, 'FACT', $4, $5, $6, 1)`,
      [secId, ID.critValid, f, f, ID.source, searchId]
    );
  }

  // Drop any intermediate quarantine flag written while claims were added; the
  // final state is a valid CRITICAL item -> there should be no open flag.
  await client.query(`DELETE FROM public.integrity_flags WHERE subject_ref = $1`, [ID.critValid]);
}

async function main() {
  const mode = process.argv[2] || "seed";
  const client = new Client({ connectionString: CONN_STRING });
  await client.connect();
  console.log(`[112-fixture] connected to ${PROJECT_REF} (mode=${mode})`);
  try {
    if (mode === "--cleanup") {
      await cleanup(client);
      console.log("[112-fixture] cleanup: 112 sentinel rows removed (marker-scoped)");
    } else if (mode === "--report") {
      await report(client);
    } else {
      await seed(client);
      console.log("[112-fixture] seeded. Post-seed state:");
      const r = await report(client);
      if (!r || r.item.provenance_status !== "pending_human_verify") {
        console.error(
          `[112-fixture] UNEXPECTED: item is not pending_human_verify ` +
            `(got ${r ? r.item.provenance_status : "none"}). The flip test needs this state.`
        );
        process.exitCode = 4;
      } else if (r.claims.length !== 4 || r.claims.some((c) => c.verified_at != null)) {
        console.error(`[112-fixture] UNEXPECTED: expected 4 un-ticked FACT claims, got ${r.claims.length}.`);
        process.exitCode = 4;
      } else {
        console.log("[112-fixture] OK: pending_human_verify + 4 un-ticked FACT claims. Ready for the workflow run.");
      }
    }
  } catch (err) {
    console.error(`[112-fixture] ERROR: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 3;
  } finally {
    await client.end();
  }
}

main();
