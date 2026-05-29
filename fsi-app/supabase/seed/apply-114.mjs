/**
 * apply-114.mjs — direct apply of migration 114 (Sprint 4 Block 1 task 1.3:
 * validate_item_provenance six-criteria function) to remote Supabase, then
 * run the synthetic auto-test from the task row and design-doc section 3b.
 *
 * Follows the established direct-apply pattern (apply-051.mjs, apply-113.mjs):
 * applies ONLY 114, registers it in schema_migrations, then exercises the
 * function against SENTINEL-MARKED synthetic fixtures created by this script.
 *
 * SYNTHETIC-ONLY, PROVABLY ISOLATED BY SENTINEL (per the RULES):
 *   - All fixtures stamped with marker SPRINT4_BLOCK1_SELFTEST_<n> in a text
 *     field (intelligence_items.legacy_id and title), and a reserved source
 *     name namespace. Every read/insert/delete is scoped by that marker.
 *   - The function under test (validate_item_provenance) is READ-ONLY; it
 *     never touches real rows. The fixtures it reads are all sentinel-marked.
 *   - Cleanup deletes WHERE legacy_id LIKE 'SPRINT4_BLOCK1_SELFTEST_%' (items,
 *     cascades to sections + claims) and WHERE name LIKE the source marker.
 *   - NO real intelligence_items / intelligence_item_sections / sources /
 *     section_claim_provenance / agent_run_searches row is selected, mutated,
 *     or deleted. base_tier of real sources is never changed.
 *
 * Cleanup runs both BEFORE (defensive, in case a prior aborted run left rows)
 * and AFTER the test, always scoped by the sentinel marker.
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
const MIGRATION_PATH_ABS = resolve(FSI_APP_ROOT, "supabase/migrations/114_validate_item_provenance.sql");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD missing from .env.local");
  process.exit(1);
}
const CONN_STRING = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`
);

const VERSION = "114";
const NAME = "validate_item_provenance";

// ── Sentinel namespace ────────────────────────────────────────────────
const SENTINEL = "SPRINT4_BLOCK1_SELFTEST_";
const ITEM_MARKER_LIKE = `${SENTINEL}%`;       // legacy_id LIKE
const SOURCE_MARKER_LIKE = `${SENTINEL}%`;     // sources.name LIKE

// Fixed UUIDs in a reserved sentinel namespace so every write is identifiable.
const ID = {
  source:        "5b1a4000-0000-4000-8000-000000000114", // tiered, active source
  // items
  modValid:      "5b1a4001-0000-4000-8000-000000000114",
  critValid:     "5b1a4002-0000-4000-8000-000000000114",
  bareFact:      "5b1a4003-0000-4000-8000-000000000114",
  analysisNoLbl: "5b1a4004-0000-4000-8000-000000000114",
  legalUnwrap:   "5b1a4005-0000-4000-8000-000000000114",
  missingSlot:   "5b1a4006-0000-4000-8000-000000000114",
};

async function cleanup(client) {
  // Delete sentinel items (cascades to sections + section_claim_provenance +
  // agent_run_searches via ON DELETE CASCADE on intelligence_item_id), then
  // sentinel sources. Scoped strictly by marker.
  await client.query(
    `DELETE FROM public.intelligence_items WHERE legacy_id LIKE $1`,
    [ITEM_MARKER_LIKE]
  );
  await client.query(
    `DELETE FROM public.sources WHERE name LIKE $1`,
    [SOURCE_MARKER_LIKE]
  );
}

async function validate(client, itemId) {
  const { rows } = await client.query(
    `SELECT (r).valid AS valid, (r).failures AS failures, (r).recommended_status AS recommended_status
       FROM public.validate_item_provenance($1) AS r`,
    [itemId]
  );
  return rows[0];
}

async function main() {
  const client = new Client({ connectionString: CONN_STRING });
  await client.connect();
  console.log(`[apply-114] connected to ${PROJECT_REF}`);

  let allPass = true;
  try {
    // ── Pre-checks: dependency tables/columns from tasks 1.1/1.2 exist ──
    const { rows: deps } = await client.query(
      `SELECT
         (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
            AND table_name IN ('agent_run_searches','section_claim_provenance','item_type_required_slots','intelligence_item_sections'))::int AS tbls,
         (SELECT count(*) FROM pg_type WHERE typname='provenance_status')::int AS enum_ok`
    );
    if (deps[0].tbls !== 4 || deps[0].enum_ok !== 1) {
      console.error(`[apply-114] FAILED precheck: dependency objects missing (tbls=${deps[0].tbls}/4, enum=${deps[0].enum_ok})`);
      process.exit(2);
    }

    // ── Apply migration 114 ──
    const existing = await client.query(
      "SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1",
      [VERSION]
    );
    const sql = readFileSync(MIGRATION_PATH_ABS, "utf8");
    console.log(`[apply-114] applying ${MIGRATION_PATH_ABS}`);
    await client.query(sql);
    if (existing.rows.length === 0) {
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
        [VERSION, NAME]
      );
      console.log(`[apply-114] migration ${VERSION} registered in schema_migrations`);
    } else {
      console.log(`[apply-114] migration ${VERSION} already registered; CREATE OR REPLACE re-applied`);
    }
    await client.query("NOTIFY pgrst, 'reload schema'");

    // ── Defensive pre-cleanup (in case a prior run aborted mid-test) ──
    await cleanup(client);

    // ══════════════════════════════════════════════════════════════════
    // BUILD SENTINEL FIXTURES
    // ══════════════════════════════════════════════════════════════════
    // One tiered, active source (base_tier=1) shared by the valid items.
    await client.query(
      `INSERT INTO public.sources (id, name, url, description, tier, tier_at_creation, base_tier, effective_tier, status)
       VALUES ($1, $2, $3, 'sentinel self-test source', 1, 1, 1, 1, 'active')`,
      [ID.source, `${SENTINEL}SOURCE_TIER1`, "https://selftest.example.gov/source-114"]
    );

    // Helper to insert an item.
    const insItem = async (id, n, priority, sourceId, sourceUrl) => {
      await client.query(
        `INSERT INTO public.intelligence_items
           (id, legacy_id, title, summary, domain, item_type, source_id, source_url, priority, status)
         VALUES ($1, $2, $3, 'sentinel self-test item', 1, 'regulation', $4, $5, $6, 'monitoring')`,
        [id, `${SENTINEL}${n}`, `${SENTINEL}${n}`, sourceId, sourceUrl, priority]
      );
    };
    const insSection = async (itemId, key, order, contentMd) => {
      const { rows } = await client.query(
        `INSERT INTO public.intelligence_item_sections (item_id, section_key, section_order, content_md, source_ids)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [itemId, key, order, contentMd, [ID.source]]
      );
      return rows[0].id;
    };
    const insSearch = async (itemId, url, excerpt) => {
      const { rows } = await client.query(
        `INSERT INTO public.agent_run_searches
           (intelligence_item_id, search_query, result_url, result_title, result_index, result_content_excerpt, searched_at)
         VALUES ($1, 'sentinel q', $2, 'sentinel result', 0, $3, NOW()) RETURNING id`,
        [itemId, url, excerpt]
      );
      return rows[0].id;
    };
    const insClaim = async (itemId, sectionRowId, kind, claimText, span, searchResultId, tier) => {
      await client.query(
        `INSERT INTO public.section_claim_provenance
           (section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sectionRowId, itemId, claimText, kind, span, ID.source, searchResultId, tier]
      );
    };

    // The four required slots for item_type='regulation' (seeded in 113).
    const SLOTS = ["effective_date", "primary_deadline", "jurisdictional_scope", "penalty_summary"];
    const SRC_URL = "https://selftest.example.gov/source-114";
    // The excerpt contains each FACT source_span VERBATIM as a substring, so the
    // criterion-3 span-check (case-insensitive substring of result_content_excerpt)
    // passes for the valid items. The spans below are exact substrings of this text.
    const EXCERPT =
      "The regulation enters force on effective_date 2026-01-01. " +
      "The headline primary_deadline 2026-06-30 governs compliance. " +
      "The jurisdictional_scope European Union applies throughout. " +
      "The penalty_summary fines up to EUR 50000 may be levied.";

    // Build a fully-valid item (all slots covered by span-grounded FACT claims
    // whose spans appear in EXCERPT). Returns the section id + search id.
    const buildValid = async (itemId, priority) => {
      await insItem(itemId, priority === "MODERATE" ? "MOD_VALID" : "CRIT_VALID", priority, ID.source, SRC_URL);
      const secId = await insSection(
        itemId,
        "key_obligations",
        1,
        // Prose cites the registered source URL (criterion 2) and contains the
        // facts. No bare strong-modal: the modal "applies" sits under a FACT.
        `Key facts grounded in the source. See ${SRC_URL}. ` +
          `Effective effective_date 2026-01-01; primary_deadline 2026-06-30; ` +
          `jurisdictional_scope European Union; penalty_summary fines up to EUR 50000.`
      );
      const searchId = await insSearch(itemId, SRC_URL, EXCERPT);
      // One span-grounded FACT per slot. Spans are substrings of EXCERPT.
      await insClaim(itemId, secId, "FACT", "effective_date 2026-01-01", "effective_date 2026-01-01", searchId, 1);
      await insClaim(itemId, secId, "FACT", "primary_deadline 2026-06-30", "primary_deadline 2026-06-30", searchId, 1);
      await insClaim(itemId, secId, "FACT", "jurisdictional_scope European Union", "jurisdictional_scope European Union", searchId, 1);
      await insClaim(itemId, secId, "FACT", "penalty_summary fines up to EUR 50000", "penalty_summary fines up to EUR 50000", searchId, 1);
    };

    // CASE 1: valid MODERATE -> verified
    await buildValid(ID.modValid, "MODERATE");

    // CASE 2: same shape but CRITICAL -> pending_human_verify
    await buildValid(ID.critValid, "CRITICAL");

    // CASE 3: bare unsourced fact -> false. MODERATE item, all slots present
    // EXCEPT one FACT claim has NO source_span (bare assertion) and the prose
    // carries a strong-modal without a label -> criterion 3 + criterion 5 fail.
    {
      await insItem(ID.bareFact, "BARE_FACT", "MODERATE", ID.source, SRC_URL);
      const secId = await insSection(
        ID.bareFact,
        "key_obligations",
        1,
        `The operator must comply by the deadline. See ${SRC_URL}.`
      );
      const searchId = await insSearch(ID.bareFact, SRC_URL, EXCERPT);
      // Three slots covered properly...
      await insClaim(ID.bareFact, secId, "FACT", "primary_deadline 2026-06-30", "primary_deadline 2026-06-30", searchId, 1);
      await insClaim(ID.bareFact, secId, "FACT", "jurisdictional_scope European Union", "jurisdictional_scope European Union", searchId, 1);
      await insClaim(ID.bareFact, secId, "FACT", "penalty_summary fines up to EUR 50000", "penalty_summary fines up to EUR 50000", searchId, 1);
      // ...and a BARE FACT for effective_date: no source_span at all.
      await insClaim(ID.bareFact, secId, "FACT", "effective_date 2026-01-01", null, searchId, 1);
    }

    // CASE 4: ANALYSIS span without label syntax -> false. Item is otherwise
    // valid (all four slots covered by FACT claims), but an ANALYSIS claim
    // exists whose content_md does NOT carry any of the four exact labels.
    {
      await insItem(ID.analysisNoLbl, "ANALYSIS_NOLABEL", "MODERATE", ID.source, SRC_URL);
      const secId = await insSection(
        ID.analysisNoLbl,
        "key_obligations",
        1,
        // Contains the analysis claim text but with NO recognized label wrap.
        `Our reading suggests the carrier exposure grows. See ${SRC_URL}. ` +
          `effective_date 2026-01-01; primary_deadline 2026-06-30; ` +
          `jurisdictional_scope European Union; penalty_summary fines up to EUR 50000.`
      );
      const searchId = await insSearch(ID.analysisNoLbl, SRC_URL, EXCERPT);
      await insClaim(ID.analysisNoLbl, secId, "FACT", "effective_date 2026-01-01", "effective_date 2026-01-01", searchId, 1);
      await insClaim(ID.analysisNoLbl, secId, "FACT", "primary_deadline 2026-06-30", "primary_deadline 2026-06-30", searchId, 1);
      await insClaim(ID.analysisNoLbl, secId, "FACT", "jurisdictional_scope European Union", "jurisdictional_scope European Union", searchId, 1);
      await insClaim(ID.analysisNoLbl, secId, "FACT", "penalty_summary fines up to EUR 50000", "penalty_summary fines up to EUR 50000", searchId, 1);
      // Unlabeled ANALYSIS claim.
      await insClaim(ID.analysisNoLbl, secId, "ANALYSIS", "the carrier exposure grows", null, null, null);
    }

    // CASE 5: LEGAL pattern unwrapped -> false. Item otherwise valid, but a
    // LEGAL claim exists and content_md has NO *Legal Confirmation Required:*
    // callout.
    {
      await insItem(ID.legalUnwrap, "LEGAL_UNWRAPPED", "MODERATE", ID.source, SRC_URL);
      const secId = await insSection(
        ID.legalUnwrap,
        "key_obligations",
        1,
        `The instrument is interpreted to extend liability. See ${SRC_URL}. ` +
          `effective_date 2026-01-01; primary_deadline 2026-06-30; ` +
          `jurisdictional_scope European Union; penalty_summary fines up to EUR 50000.`
      );
      const searchId = await insSearch(ID.legalUnwrap, SRC_URL, EXCERPT);
      await insClaim(ID.legalUnwrap, secId, "FACT", "effective_date 2026-01-01", "effective_date 2026-01-01", searchId, 1);
      await insClaim(ID.legalUnwrap, secId, "FACT", "primary_deadline 2026-06-30", "primary_deadline 2026-06-30", searchId, 1);
      await insClaim(ID.legalUnwrap, secId, "FACT", "jurisdictional_scope European Union", "jurisdictional_scope European Union", searchId, 1);
      await insClaim(ID.legalUnwrap, secId, "FACT", "penalty_summary fines up to EUR 50000", "penalty_summary fines up to EUR 50000", searchId, 1);
      // LEGAL claim with no callout wrap in content.
      await insClaim(ID.legalUnwrap, secId, "LEGAL", "liability extends to forwarders", null, null, null);
    }

    // CASE 6: missing required slot -> false. Item covers only THREE of the
    // four required slots (no effective_date FACT or GAP row).
    {
      await insItem(ID.missingSlot, "MISSING_SLOT", "MODERATE", ID.source, SRC_URL);
      const secId = await insSection(
        ID.missingSlot,
        "key_obligations",
        1,
        `Facts grounded in source. See ${SRC_URL}. ` +
          `primary_deadline 2026-06-30; jurisdictional_scope European Union; ` +
          `penalty_summary fines up to EUR 50000.`
      );
      const searchId = await insSearch(ID.missingSlot, SRC_URL, EXCERPT);
      await insClaim(ID.missingSlot, secId, "FACT", "primary_deadline 2026-06-30", "primary_deadline 2026-06-30", searchId, 1);
      await insClaim(ID.missingSlot, secId, "FACT", "jurisdictional_scope European Union", "jurisdictional_scope European Union", searchId, 1);
      await insClaim(ID.missingSlot, secId, "FACT", "penalty_summary fines up to EUR 50000", "penalty_summary fines up to EUR 50000", searchId, 1);
      // effective_date slot: NO covering claim.
    }

    // ══════════════════════════════════════════════════════════════════
    // RUN ASSERTIONS
    // ══════════════════════════════════════════════════════════════════
    const checks = [];
    const assertCase = (label, res, expectValid, expectStatus, mustContainCriterion) => {
      let ok = res.valid === expectValid && res.recommended_status === expectStatus;
      if (mustContainCriterion != null) {
        const crits = (res.failures || []).map((f) => f.criterion);
        if (!crits.includes(mustContainCriterion)) ok = false;
      }
      checks.push({ label, ok, valid: res.valid, status: res.recommended_status, failures: res.failures });
      if (!ok) allPass = false;
      console.log(
        `  [${ok ? "PASS" : "FAIL"}] ${label}\n` +
        `        valid=${res.valid} status=${res.recommended_status} ` +
        `failures=${JSON.stringify(res.failures)}`
      );
    };

    console.log("\n[apply-114] AUTO-TEST (design-doc 3b synthetic cases):");

    assertCase("C1 valid MODERATE -> verified",
      await validate(client, ID.modValid), true, "verified", null);

    assertCase("C2 same item CRITICAL -> pending_human_verify",
      await validate(client, ID.critValid), true, "pending_human_verify", null);

    assertCase("C3 bare unsourced fact -> valid:false (criterion 3 + 5)",
      await validate(client, ID.bareFact), false, "quarantined", 3);

    assertCase("C4 ANALYSIS span without label syntax -> valid:false (criterion 4)",
      await validate(client, ID.analysisNoLbl), false, "quarantined", 4);

    assertCase("C5 LEGAL pattern unwrapped -> valid:false (criterion 4)",
      await validate(client, ID.legalUnwrap), false, "quarantined", 4);

    assertCase("C6 missing required slot -> valid:false (criterion 5)",
      await validate(client, ID.missingSlot), false, "quarantined", 5);

  } catch (err) {
    console.error(`[apply-114] ERROR: ${err.message}`);
    console.error(err.stack);
    allPass = false;
  } finally {
    // ── Always clean up sentinel rows, scoped by marker ──
    try {
      await cleanup(client);
      console.log("\n[apply-114] cleanup: sentinel fixtures removed (scoped by marker)");
    } catch (e) {
      console.error(`[apply-114] cleanup error: ${e.message}`);
    }
    await client.end();
  }

  if (!allPass) {
    console.error("\n[apply-114] VERIFICATION FAILED");
    process.exit(3);
  }
  console.log("\n[apply-114] VERIFICATION PASSED: all 6 design-doc 3b cases behave as specified");
}

main();
