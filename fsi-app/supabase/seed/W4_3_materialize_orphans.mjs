// W4.3 — Materialize 24 orphan staged_updates
//
// Background
// ──────────
// Before migration 034 + the route fix (PR #20) landed, the approval handler
// flipped `staged_updates.status='approved'` BEFORE attempting to insert
// the corresponding `intelligence_items` row. When the insert failed the
// status flip stuck and no error was captured, leaving 24 "approved" rows
// with no intel item and no recovery path. The W1.B audit at
// docs/W1B-orphan-staged-updates.json identifies these orphans by
// (legacy_id ∪ source_url+title) lookup.
//
// What this script does
// ─────────────────────
// For each orphan, run a per-row materialization with explicit validation:
//
//   1. Re-fetch the live staged_updates row (the audit JSON could be stale).
//      Skip the orphan if it has been materialized in the meantime
//      (materialized_at IS NOT NULL).
//
//   2. Parse `proposed_changes`. Strip legacy/extraneous fields documented
//      in W1.B as schema-incompatible:
//        - key_deadlines        (lived on legacy resources)
//        - source_name          (lives on `sources`, not `intelligence_items`)
//        - why_matters          (column EXISTS on intelligence_items, but the
//                               worker may emit empty strings — pass through
//                               as-is, do not silently drop)
//        - any other top-level keys not present on intelligence_items
//
//      We use an allow-list (INTEL_ITEM_COLUMNS) instead of a deny-list so
//      future schema drift fails closed (logged, not inserted) rather than
//      open.
//
//   3. Validate required-shape:
//        - title (non-empty)
//        - source_url (non-empty)
//        - item_type (one of the enum values)
//        - domain (1..7)
//      Defaults filled where the schema permits (status, severity, priority,
//      confidence — all NOT NULL with DEFAULTs in 004).
//
//   4. Derive `jurisdiction_iso` from `proposed_changes.jurisdictions` using
//      the SAME mapping helper as W4.1 (imported, single source of truth).
//      If derivation is empty fall back to ['GLOBAL'].
//
//   5. INSERT INTO intelligence_items, returning the new id.
//
//   6. UPDATE staged_updates: materialized_at=NOW(), materialized_item_id=<id>,
//      materialization_error=NULL.
//
//   7. On any validation/insert failure, set materialization_error on the
//      staged_updates row (no insert), so the route handler's idempotency
//      branch can re-try later.
//
// Idempotency
// ───────────
// Re-running the script is safe. Step 1 skips already-materialized orphans.
// Inside step 5 we use the `legacy_id` UNIQUE index when available to
// detect a prior duplicate insert (same path the route handler uses); if a
// matching intel row exists we link it instead of re-inserting.
//
// Scope guard
// ───────────
// Touches ONLY `intelligence_items` (INSERT) and `staged_updates`
// (UPDATE of materialization_* columns). Does NOT touch sources,
// provisional_sources, or source_verifications.
//
// Usage (from fsi-app/):
//   node supabase/seed/W4_3_materialize_orphans.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

import { deriveJurisdictionISO } from "./W4_1_iso_backfill.mjs";

// ─── paths + env ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ORPHANS_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W1B-orphan-staged-updates.json"
);

const LOG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "W4-3-materialization-log.json"
);

// ─── allow-listed intelligence_items columns ───────────────────────────────
// Source: migration 004 + 007 + 018 + 033 + 034.
// We pass ONLY these keys through to the INSERT. Anything else from
// `proposed_changes` is logged and dropped.
const INTEL_ITEM_COLUMNS = new Set([
  // identity
  "legacy_id",
  // content
  "title",
  "summary",
  "what_is_it",
  "why_matters",
  "key_data",
  "operational_impact",
  "open_questions",
  "tags",
  "full_brief",
  // classification
  "domain",
  "category",
  "item_type",
  // sources
  "source_id",
  "source_url",
  // dimensions
  "jurisdictions",
  "jurisdiction_iso",
  "transport_modes",
  "verticals",
  // status
  "status",
  "severity",
  "confidence",
  "priority",
  "reasoning",
  // dates
  "entry_into_force",
  "compliance_deadline",
  "next_review_date",
  // urgency tier (mig 018)
  "urgency_tier",
  "format_type",
]);

// item_type CHECK constraint values
const VALID_ITEM_TYPES = new Set([
  "regulation",
  "directive",
  "standard",
  "guidance",
  "technology",
  "market_signal",
  "regional_data",
  "research_finding",
  "innovation",
  "framework",
  "tool",
  "initiative",
]);

// ─── helpers ───────────────────────────────────────────────────────────────

function loadOrphanIds() {
  const raw = readFileSync(ORPHANS_PATH, "utf8");
  const audit = JSON.parse(raw);
  return (audit.orphans ?? []).map((o) => o.id);
}

/**
 * Build a sanitized intelligence_items insert payload from the staged
 * row's proposed_changes. Returns { ok, payload, droppedKeys, reason }.
 */
function buildInsertPayload(staged) {
  const proposed = staged.proposed_changes;
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
    return {
      ok: false,
      reason: "proposed_changes is not a JSON object",
    };
  }

  const droppedKeys = [];
  const payload = {};
  for (const [k, v] of Object.entries(proposed)) {
    if (INTEL_ITEM_COLUMNS.has(k)) {
      payload[k] = v;
    } else {
      droppedKeys.push(k);
    }
  }

  // Required-shape validation
  if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
    return { ok: false, reason: "title missing or empty", droppedKeys };
  }
  if (
    payload.source_url == null ||
    (typeof payload.source_url === "string" && !payload.source_url.trim())
  ) {
    return { ok: false, reason: "source_url missing or empty", droppedKeys };
  }
  if (!payload.item_type) {
    payload.item_type = "regulation"; // schema default
  }
  if (!VALID_ITEM_TYPES.has(payload.item_type)) {
    return {
      ok: false,
      reason: `item_type='${payload.item_type}' not in CHECK constraint`,
      droppedKeys,
    };
  }
  // domain: schema CHECK is 1..7 and NOT NULL with no default
  if (payload.domain == null) {
    return { ok: false, reason: "domain missing (required, 1..7)", droppedKeys };
  }
  if (
    typeof payload.domain !== "number" ||
    !Number.isInteger(payload.domain) ||
    payload.domain < 1 ||
    payload.domain > 7
  ) {
    return {
      ok: false,
      reason: `domain=${payload.domain} out of range (must be int 1..7)`,
      droppedKeys,
    };
  }

  // jurisdiction_iso derivation — share helper with W4.1.
  const briefText =
    payload.full_brief ||
    [payload.summary, payload.what_is_it, payload.why_matters]
      .filter(Boolean)
      .join("\n");
  const isoResult = deriveJurisdictionISO({
    legacyJurisdictions: payload.jurisdictions,
    sourceUrl: payload.source_url,
    briefText,
    titleAndSummary: `${payload.title}\n${payload.summary ?? ""}`,
  });
  // Don't overwrite an explicit jurisdiction_iso the worker provided.
  if (
    !Array.isArray(payload.jurisdiction_iso) ||
    payload.jurisdiction_iso.length === 0
  ) {
    payload.jurisdiction_iso = isoResult.iso;
  }

  return { ok: true, payload, droppedKeys, isoDerivation: isoResult };
}

async function fetchOrphanLive(id) {
  const { data, error } = await supabase
    .from("staged_updates")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  return { row: data };
}

async function findExistingByLegacyId(legacyId) {
  if (!legacyId) return null;
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function persistMaterializationFailure(stagedId, reason) {
  const { error } = await supabase
    .from("staged_updates")
    .update({
      materialization_error: reason,
      materialized_at: null,
      materialized_item_id: null,
    })
    .eq("id", stagedId);
  if (error) {
    return { ok: false, persistError: error.message };
  }
  return { ok: true };
}

async function persistMaterializationSuccess(stagedId, itemId) {
  const { error } = await supabase
    .from("staged_updates")
    .update({
      materialized_at: new Date().toISOString(),
      materialized_item_id: itemId,
      materialization_error: null,
    })
    .eq("id", stagedId);
  if (error) return { ok: false, persistError: error.message };
  return { ok: true };
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("W4.3 — Materialize orphan staged_updates");
  console.log("─".repeat(60));

  const orphanIds = loadOrphanIds();
  console.log(`Loaded ${orphanIds.length} orphan ids from W1B audit.`);

  const log = {
    generated_at: new Date().toISOString(),
    orphan_count: orphanIds.length,
    materialized: 0,
    linked_existing: 0,
    skipped_already_done: 0,
    failed_validation: 0,
    failed_insert: 0,
    failed_persist: 0,
    decisions: [],
  };

  for (const id of orphanIds) {
    const decision = { staged_update_id: id };

    const live = await fetchOrphanLive(id);
    if (live.error) {
      decision.outcome = "fetch_error";
      decision.error = live.error;
      log.failed_persist += 1;
      log.decisions.push(decision);
      console.warn(`  [err] ${id} fetch failed: ${live.error}`);
      continue;
    }
    const su = live.row;
    decision.title = su.proposed_changes?.title ?? null;

    if (su.materialized_at && su.materialized_item_id) {
      decision.outcome = "skip_already_materialized";
      decision.materialized_item_id = su.materialized_item_id;
      log.skipped_already_done += 1;
      log.decisions.push(decision);
      console.log(`  [skip] ${id} already materialized → ${su.materialized_item_id}`);
      continue;
    }

    // Idempotency lookup by legacy_id BEFORE building the payload — if the
    // intel row already exists from a prior partial run, link to it.
    const legacyId = su.proposed_changes?.legacy_id;
    if (legacyId) {
      const existing = await findExistingByLegacyId(legacyId);
      if (existing?.id) {
        const persist = await persistMaterializationSuccess(id, existing.id);
        decision.outcome = persist.ok ? "linked_existing" : "linked_existing_persist_error";
        decision.linked_item_id = existing.id;
        if (!persist.ok) decision.persist_error = persist.persistError;
        if (persist.ok) log.linked_existing += 1;
        else log.failed_persist += 1;
        log.decisions.push(decision);
        console.log(
          `  [link] ${id} → existing intel ${existing.id} via legacy_id=${legacyId}`
        );
        continue;
      }
    }

    const built = buildInsertPayload(su);
    if (!built.ok) {
      decision.outcome = "validation_failed";
      decision.reason = built.reason;
      decision.dropped_keys = built.droppedKeys ?? [];
      const persist = await persistMaterializationFailure(id, built.reason);
      if (!persist.ok) decision.persist_error = persist.persistError;
      log.failed_validation += 1;
      log.decisions.push(decision);
      console.warn(`  [skip-fail] ${id} validation: ${built.reason}`);
      continue;
    }

    decision.dropped_keys = built.droppedKeys;
    decision.derived_iso = built.payload.jurisdiction_iso;

    const { data: inserted, error: insertErr } = await supabase
      .from("intelligence_items")
      .insert(built.payload)
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      const reason = insertErr?.message || "insert returned no id";
      decision.outcome = "insert_failed";
      decision.error = reason;
      const persist = await persistMaterializationFailure(id, reason);
      if (!persist.ok) decision.persist_error = persist.persistError;
      log.failed_insert += 1;
      log.decisions.push(decision);
      console.warn(`  [insert-fail] ${id}: ${reason}`);
      continue;
    }

    const persist = await persistMaterializationSuccess(id, inserted.id);
    if (!persist.ok) {
      decision.outcome = "inserted_but_persist_failed";
      decision.materialized_item_id = inserted.id;
      decision.persist_error = persist.persistError;
      log.failed_persist += 1;
      log.decisions.push(decision);
      console.warn(
        `  [persist-fail] ${id} inserted intel ${inserted.id} but staged_update update failed: ${persist.persistError}`
      );
      continue;
    }

    decision.outcome = "materialized";
    decision.materialized_item_id = inserted.id;
    log.materialized += 1;
    log.decisions.push(decision);
    console.log(
      `  [ok]   ${id} → intel ${inserted.id}  (${decision.title?.slice(0, 60) ?? ""})`
    );
  }

  log.elapsed_ms = Date.now() - t0;

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");

  console.log("─".repeat(60));
  console.log(`Materialized (new INSERT):       ${log.materialized}`);
  console.log(`Linked to existing intel:        ${log.linked_existing}`);
  console.log(`Already materialized (skipped):  ${log.skipped_already_done}`);
  console.log(`Validation failures:             ${log.failed_validation}`);
  console.log(`Insert failures:                 ${log.failed_insert}`);
  console.log(`Persist failures:                ${log.failed_persist}`);
  console.log(`Elapsed:                         ${log.elapsed_ms} ms`);
  console.log(`Log:                             ${LOG_PATH}`);
  console.log("─".repeat(60));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
