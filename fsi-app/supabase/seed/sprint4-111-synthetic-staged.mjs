/**
 * sprint4-111-synthetic-staged.mjs — render-verify fixtures for task 1.11.
 *
 * Inserts SENTINEL-MARKED synthetic staged_updates rows (status='pending'),
 * one per provenance failure mode plus a combined row, so the operator can
 * render-verify the ProvenanceFailures panel in the admin "Staged updates" tab.
 *
 * PROVABLY ISOLATED: every row carries batch_id = 'SPRINT4_BLOCK1_SELFTEST_111'.
 * --cleanup deletes exactly those rows (WHERE batch_id = sentinel) and nothing
 * else. No real staged_updates row is read, mutated, or deleted. staged_updates
 * has NO provenance trigger (migration 115 triggers are on intelligence_items /
 * sections / claims only), so these inserts have zero corpus side effects.
 *
 * Usage:
 *   node supabase/seed/sprint4-111-synthetic-staged.mjs            # insert fixtures
 *   node supabase/seed/sprint4-111-synthetic-staged.mjs --cleanup  # remove them
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const PROJECT_REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD missing"); process.exit(1); }
const CONN = POOLER_URL.replace(`postgres.${PROJECT_REF}@`, `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`);

const SENTINEL = "SPRINT4_BLOCK1_SELFTEST_111";
const CLEANUP = process.argv.includes("--cleanup");

// One staged row per failure mode; proposed_data.provenance_failures uses the
// exact shape public.validate_item_provenance returns.
const FIXTURES = [
  {
    reason: "SENTINEL 1.11 — Ungrounded URLs (criterion 2)",
    failures: [
      { criterion: 2, reason: "ungrounded_url", url: "https://example.invalid/not-a-registered-source" },
      { criterion: 2, reason: "ungrounded_url", url: "https://made-up-portal.test/regulation-x" },
    ],
  },
  {
    reason: "SENTINEL 1.11 — Unverified FACT spans (criterion 3)",
    failures: [
      { criterion: 3, reason: "fact_missing_source_span", claim: "The regulation enters force on 1 January 2030." },
      { criterion: 3, reason: "fact_span_not_in_source", claim: "Penalties reach EUR 50,000 per breach.", source_span: "fines up to EUR 50000" },
      { criterion: 3, reason: "fact_below_authority_floor", claim: "Serial-level tracking is mandatory.", source_tier_at_grounding: 5, priority: "HIGH" },
    ],
  },
  {
    reason: "SENTINEL 1.11 — Unlabeled / mislabeled analysis (criterion 4)",
    failures: [
      { criterion: 4, reason: "analysis_missing_label_syntax", claim: "the carrier exposure grows over the next two quarters" },
      { criterion: 4, reason: "unlabeled_assertion", section_row_id: "abcd1234-0000-4000-8000-000000000111" },
    ],
  },
  {
    reason: "SENTINEL 1.11 — Missing required slots (criterion 5)",
    failures: [
      { criterion: 5, reason: "missing_required_slot", slot_key: "effective_date", item_type: "regulation" },
      { criterion: 5, reason: "missing_required_slot", slot_key: "penalty_summary", item_type: "regulation" },
    ],
  },
  {
    reason: "SENTINEL 1.11 — Legal conclusions not routed (criterion 4)",
    failures: [
      { criterion: 4, reason: "legal_not_routed_to_callout", claim: "Liability extends to freight forwarders acting as importer of record." },
    ],
  },
  {
    reason: "SENTINEL 1.11 — Combined (all five modes on one item)",
    failures: [
      { criterion: 2, reason: "ungrounded_url", url: "https://example.invalid/combined" },
      { criterion: 3, reason: "fact_missing_source_span", claim: "Compliance deadline is Q2 2027." },
      { criterion: 4, reason: "analysis_missing_label_syntax", claim: "this likely raises drayage costs" },
      { criterion: 4, reason: "legal_not_routed_to_callout", claim: "The workspace is an obligated party under Article 8." },
      { criterion: 5, reason: "missing_required_slot", slot_key: "jurisdictional_scope", item_type: "regulation" },
    ],
  },
];

const client = new Client({ connectionString: CONN });
await client.connect();
try {
  // Always clean first so re-runs don't pile up duplicates.
  const del = await client.query(`DELETE FROM public.staged_updates WHERE batch_id = $1`, [SENTINEL]);
  console.log(`[1.11-seed] removed ${del.rowCount} prior sentinel rows`);

  if (CLEANUP) {
    console.log("[1.11-seed] --cleanup done; no fixtures inserted.");
  } else {
    for (const fx of FIXTURES) {
      await client.query(
        `INSERT INTO public.staged_updates (update_type, proposed_changes, reason, confidence, status, batch_id)
         VALUES ('update_item', $1::jsonb, $2, 'LOW', 'pending', $3)`,
        [JSON.stringify({ title: fx.reason, provenance_failures: fx.failures }), fx.reason, SENTINEL]
      );
    }
    console.log(`[1.11-seed] inserted ${FIXTURES.length} sentinel staged rows (status=pending).`);
    console.log("[1.11-seed] Open admin -> Staged updates to render-verify the ProvenanceFailures panel.");
    console.log("[1.11-seed] Clean up after: node supabase/seed/sprint4-111-synthetic-staged.mjs --cleanup");
  }
} finally {
  await client.end();
}
