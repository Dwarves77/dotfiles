#!/usr/bin/env node
/**
 * Wave-α Track B4 — one-off disposition of the single stuck approved-unmaterialized staged_update.
 *
 * AUTHOR-ONLY deliverable. The orchestrator runs it (dry-run first, then --apply) inside the DDL window,
 * AFTER migration 167 (reviewer_notes) is applied. It does NOT depend on 167 but is sequenced with the
 * Track-B batch.
 *
 * EVIDENCE (read-only SQL, 2026-07-11 — captured before authoring; the script re-verifies at runtime):
 *   staged_updates b631762e-c0af-4542-83d4-ae694813cebf
 *     update_type       = new_item
 *     status            = approved
 *     materialized_at   = 2026-05-05 16:34:30Z   (SET)
 *     materialized_item_id = NULL                (MISSING — the inconsistency)
 *     materialization_error = NULL
 *     proposed_changes.source_url = https://ww2.arb.ca.gov/our-work/programs/advanced-clean-fleets-rule
 *     proposed_changes.title      = "California Advanced Clean Fleets Rule"
 *   intelligence_items lookup:
 *     NO item at that exact source_url (item_by_url = 0), no legacy_id.
 *     BUT the same regulation ALREADY EXISTS, verified, as:
 *       ccee10a4-da4a-4a65-810e-51142ec3b753  legacy_id w4_ca_acf
 *       "California Advanced Clean Fleets Rule (CARB)"
 *       source_url https://ww2.arb.ca.gov/our-work/programs/advanced-clean-fleets   (note: no "-rule")
 *     — minted by the PR-A1 California work.
 *
 * DECISION (materialize-vs-reset, from the evidence): RECONCILE, do NOT re-materialize.
 *   The reviewer's intent (add California ACF) is already fulfilled by ccee10a4. The staged row is a
 *   legacy orphan: materialized_at was stamped by a pre-contract code path that never recorded the item id
 *   (the row pre-dates the W1.B materialization contract in migration 034 / route.ts). Re-materializing
 *   would risk a DUPLICATE mint — mintIntelligenceItem dedups by exact source_url/legacy_id, and this row's
 *   URL (".../advanced-clean-fleets-rule") differs from the live item's (".../advanced-clean-fleets"), so
 *   the dedup would NOT catch it. The honest, dup-safe disposition is to backfill the pointer to the
 *   pre-existing item and record why.
 *
 * ACTION (only with --apply): set materialized_item_id = ccee10a4, stamp a materialization_error note
 * documenting the reconciliation. This makes the row consistent (approved + materialized to the existing
 * item) and makes any future re-approve a no-op via the route's idempotency guard.
 *
 * Rule-012: no hardcoded absolute paths — env-driven credentials, import.meta.url-relative dotenv load.
 * Dry-run by default; pass --apply to write. Re-verifies state before and reads back after.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Best-effort .env load (repo root is three levels up: scripts/_wave-alpha -> scripts -> fsi-app).
function loadEnv() {
  for (const rel of ["../../.env.local", "../../.env"]) {
    try {
      const txt = readFileSync(resolve(__dirname, rel), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* file absent — rely on ambient env */
    }
  }
}
loadEnv();

const STAGED_ID = "b631762e-c0af-4542-83d4-ae694813cebf";
const RECONCILE_TO_ITEM = "ccee10a4-da4a-4a65-810e-51142ec3b753"; // legacy_id w4_ca_acf
const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`[b4-disposition] mode = ${APPLY ? "APPLY" : "DRY-RUN"}`);

  // 1. Re-verify the staged row is still the stuck orphan we investigated.
  const { data: row, error: rowErr } = await sb
    .from("staged_updates")
    .select("id, update_type, status, materialized_at, materialized_item_id, materialization_error")
    .eq("id", STAGED_ID)
    .single();
  if (rowErr || !row) {
    console.error("[b4-disposition] staged row not found — abort:", rowErr?.message);
    process.exit(1);
  }
  if (!(row.status === "approved" && !row.materialized_item_id)) {
    console.log(
      "[b4-disposition] row is no longer approved-unmaterialized — nothing to do:",
      JSON.stringify(row)
    );
    return;
  }

  // 2. Re-verify the reconcile target still exists and is verified.
  const { data: item, error: itemErr } = await sb
    .from("intelligence_items")
    .select("id, legacy_id, title, provenance_status")
    .eq("id", RECONCILE_TO_ITEM)
    .single();
  if (itemErr || !item) {
    console.error(
      "[b4-disposition] reconcile target ccee10a4 (w4_ca_acf) not found — abort (do NOT re-materialize blindly):",
      itemErr?.message
    );
    process.exit(1);
  }
  console.log("[b4-disposition] target item:", JSON.stringify(item));

  const note =
    "Wave-a Track B4 disposition: reconciled to pre-existing item ccee10a4 (legacy_id w4_ca_acf, " +
    "'California Advanced Clean Fleets Rule (CARB)'). This staged row was a legacy orphan (materialized_at " +
    "stamped by a pre-contract path, no item id recorded). Not re-materialized to avoid a duplicate mint " +
    "(URLs differ by the '-rule' suffix, dedup would miss).";

  if (!APPLY) {
    console.log("[b4-disposition] DRY-RUN — would set:", {
      materialized_item_id: RECONCILE_TO_ITEM,
      materialization_error: note,
    });
    return;
  }

  const { error: updErr } = await sb
    .from("staged_updates")
    .update({ materialized_item_id: RECONCILE_TO_ITEM, materialization_error: note })
    .eq("id", STAGED_ID)
    .eq("status", "approved"); // guard: only if still approved
  if (updErr) {
    console.error("[b4-disposition] update failed:", updErr.message);
    process.exit(1);
  }

  // 3. Read-back verification.
  const { data: after } = await sb
    .from("staged_updates")
    .select("id, status, materialized_at, materialized_item_id, materialization_error")
    .eq("id", STAGED_ID)
    .single();
  console.log("[b4-disposition] read-back:", JSON.stringify(after));
  if (after?.materialized_item_id !== RECONCILE_TO_ITEM) {
    console.error("[b4-disposition] VERIFY FAILED — pointer not set.");
    process.exit(1);
  }
  console.log("[b4-disposition] DONE — row reconciled.");
}

main().catch((e) => {
  console.error("[b4-disposition] fatal:", e);
  process.exit(1);
});
