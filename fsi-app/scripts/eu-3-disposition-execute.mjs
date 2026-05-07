/**
 * eu-3-disposition-execute.mjs — EU 3 already-exist disposition writes.
 *
 * Authorized scope per Jason's dispatch (2026-05-07):
 *
 *   A. ReFuelEU (a3) — SKIP. No action. Documented as intentional no-op.
 *   B. AFIR — Promote l3 content into eu-alternative-fuels-infrastructure-
 *      regulation-afir, repoint xref source_item_id, delete l3.
 *   C. Archive trade-restrictions-industrial-policy as duplicate of t1
 *      (CBAM canonical).
 *
 * Per-step verification (PR-A1 pattern). Halt on any failure.
 *
 * File scope:
 *   - UPDATE intelligence_items (eu-alternative-fuels...afir) — promote content
 *   - UPDATE item_cross_references (1 row, repoint l3 → main id)
 *   - DELETE intelligence_items (l3)
 *   - UPDATE intelligence_items (trade-restrictions-industrial-policy, archive)
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "eu-3-disposition-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

const AFIR_MAIN_LEGACY = "eu-alternative-fuels-infrastructure-regulation-afir";
const AFIR_L3_LEGACY = "l3";
const CBAM_CANONICAL_LEGACY = "t1";
const CBAM_DUP_LEGACY = "trade-restrictions-industrial-policy";

// ─── A. ReFuelEU (a3) SKIP — documented no-op ───────────────────────────
step(
  "refueleu_skip",
  true,
  "a3 left untouched per Jason's call (intentional no-op)"
);

// ─── B. AFIR promotion ──────────────────────────────────────────────────

// Step B1: read both rows in full
const ALL_FIELDS =
  "id, legacy_id, title, summary, what_is_it, why_matters, key_data, " +
  "operational_impact, open_questions, tags, domain, category, item_type, " +
  "source_id, source_url, jurisdictions, transport_modes, verticals, status, " +
  "severity, confidence, priority, reasoning, jurisdiction_iso, full_brief, " +
  "last_regenerated_at, regeneration_skill_version, is_archived, " +
  "archive_reason, archive_note, archived_date";

let mainRow = null;
let l3Row = null;
{
  const { data: m, error: e1 } = await supabase
    .from("intelligence_items")
    .select(ALL_FIELDS)
    .eq("legacy_id", AFIR_MAIN_LEGACY)
    .maybeSingle();
  if (e1 || !m) {
    step("afir_main_fetch", false, e1?.message ?? "main row not found");
  }
  mainRow = m;

  const { data: l, error: e2 } = await supabase
    .from("intelligence_items")
    .select(ALL_FIELDS)
    .eq("legacy_id", AFIR_L3_LEGACY)
    .maybeSingle();
  if (e2 || !l) {
    step("afir_l3_fetch", false, e2?.message ?? "l3 row not found");
  }
  l3Row = l;
}

// Step B2: pre-state log + halt guards
{
  const mainBriefLen = (mainRow.full_brief ?? "").length;
  const l3BriefLen = (l3Row.full_brief ?? "").length;

  step(
    "afir_main_pre_state",
    true,
    `main id=${mainRow.id} full_brief=${mainBriefLen} chars source_id=${mainRow.source_id ?? "NULL"} priority=${mainRow.priority}`
  );
  step(
    "afir_l3_pre_state",
    true,
    `l3 id=${l3Row.id} full_brief=${l3BriefLen} chars source_id=${l3Row.source_id ?? "NULL"}`
  );

  // Drift guards
  if (mainBriefLen > 0) {
    step(
      "afir_drift_guard_main_empty",
      false,
      `main row full_brief already has ${mainBriefLen} chars (>0). Another agent likely populated it. HALT.`
    );
  }
  if (l3BriefLen < 25000) {
    step(
      "afir_drift_guard_l3_full",
      false,
      `l3 full_brief is ${l3BriefLen} chars (<25000). Investigation said 25201. Drift detected. HALT.`
    );
  }
  step(
    "afir_drift_guards_ok",
    true,
    "main empty + l3 full: pre-conditions match investigation"
  );
}

// Step B3: AFIR xref pre-state — find row(s) where source_item_id = l3.id
let l3XrefRowIds = [];
{
  const { data: xrefs, error } = await supabase
    .from("item_cross_references")
    .select("id, source_item_id, target_item_id, relationship")
    .eq("source_item_id", l3Row.id);
  if (error) {
    step("afir_xref_pre_fetch", false, error.message);
  }
  l3XrefRowIds = (xrefs ?? []).map((r) => r.id);
  step(
    "afir_xref_pre_state",
    true,
    `${xrefs?.length ?? 0} outbound xrefs from l3 found: ${JSON.stringify(xrefs)}`
  );

  // Validate target rows exist
  if (xrefs && xrefs.length > 0) {
    const targetIds = xrefs.map((r) => r.target_item_id);
    const { data: targets, error: terr } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title")
      .in("id", targetIds);
    if (terr) {
      step("afir_xref_target_validate", false, terr.message);
    }
    const allFound = targets && targets.length === targetIds.length;
    step(
      "afir_xref_target_validate",
      !!allFound,
      `${targets?.length ?? 0}/${targetIds.length} target rows resolved: ${JSON.stringify(targets?.map((t) => ({ id: t.id, legacy_id: t.legacy_id })))}`
    );
  }
}

// Step B4: Promote l3 content into main row.
// Copy content + provenance fields. Do NOT overwrite main's legacy_id, ISO codes, or jurisdiction_iso.
{
  const updatePayload = {
    full_brief: l3Row.full_brief,
    summary: l3Row.summary || mainRow.summary,
    what_is_it: l3Row.what_is_it || mainRow.what_is_it,
    why_matters: l3Row.why_matters || mainRow.why_matters,
    key_data:
      Array.isArray(l3Row.key_data) && l3Row.key_data.length > 0
        ? l3Row.key_data
        : mainRow.key_data,
    operational_impact: l3Row.operational_impact || mainRow.operational_impact,
    open_questions:
      Array.isArray(l3Row.open_questions) && l3Row.open_questions.length > 0
        ? l3Row.open_questions
        : mainRow.open_questions,
    source_id: l3Row.source_id ?? mainRow.source_id,
    last_regenerated_at:
      l3Row.last_regenerated_at ?? mainRow.last_regenerated_at,
    regeneration_skill_version:
      l3Row.regeneration_skill_version ?? mainRow.regeneration_skill_version,
    // Fill missing classification fields from l3 if main lacks them
    priority:
      mainRow.priority && mainRow.priority !== "MODERATE"
        ? mainRow.priority
        : l3Row.priority || mainRow.priority,
    item_type: mainRow.item_type || l3Row.item_type,
    transport_modes:
      Array.isArray(mainRow.transport_modes) &&
      mainRow.transport_modes.length > 0
        ? mainRow.transport_modes
        : l3Row.transport_modes,
    domain: mainRow.domain || l3Row.domain,
  };

  const { error } = await supabase
    .from("intelligence_items")
    .update(updatePayload)
    .eq("id", mainRow.id);
  step("afir_promote_update", !error, error?.message ?? "update issued");
}

// Step B5: read-back verify promotion
let mainPostBriefLen = 0;
{
  const { data: post, error } = await supabase
    .from("intelligence_items")
    .select(
      "id, legacy_id, full_brief, source_id, priority, item_type, last_regenerated_at, regeneration_skill_version"
    )
    .eq("id", mainRow.id)
    .maybeSingle();
  if (error || !post) {
    step("afir_promote_verify", false, error?.message ?? "row gone after update");
  }
  mainPostBriefLen = (post.full_brief ?? "").length;
  const sourceMatch = post.source_id === l3Row.source_id;
  const briefOk = mainPostBriefLen > 25000;
  step(
    "afir_promote",
    briefOk && sourceMatch,
    `main full_brief=${mainPostBriefLen} chars, source_id=${post.source_id} (l3 had ${l3Row.source_id}), priority=${post.priority}, item_type=${post.item_type}`
  );
}

// Step B6: repoint xref source_item_id from l3.id to mainRow.id
{
  if (l3XrefRowIds.length === 0) {
    step("afir_xref_repoint", true, "0 xrefs to repoint (none existed)");
  } else {
    const { error, data } = await supabase
      .from("item_cross_references")
      .update({ source_item_id: mainRow.id })
      .in("id", l3XrefRowIds)
      .select("id, source_item_id, target_item_id");
    if (error) {
      step("afir_xref_repoint", false, error.message);
    }
    const allRepointed =
      data && data.every((r) => r.source_item_id === mainRow.id);
    step(
      "afir_xref_repoint",
      !!allRepointed,
      `${data?.length ?? 0} xref(s) repointed l3 → main (${mainRow.id})`
    );

    // Verify xref still points to a valid target after repoint
    const targetIds = (data ?? []).map((r) => r.target_item_id);
    if (targetIds.length > 0) {
      const { data: targets } = await supabase
        .from("intelligence_items")
        .select("id, legacy_id")
        .in("id", targetIds);
      const allValid = targets && targets.length === targetIds.length;
      step(
        "afir_xref_targets_still_valid",
        !!allValid,
        `${targets?.length ?? 0}/${targetIds.length} xref target rows still resolve`
      );
    }
  }
}

// Step B7: delete l3
{
  const { error } = await supabase
    .from("intelligence_items")
    .delete()
    .eq("legacy_id", AFIR_L3_LEGACY);
  step("afir_l3_delete_issued", !error, error?.message ?? "delete issued");

  // Verify gone
  const { data: gone, error: e2 } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id")
    .eq("legacy_id", AFIR_L3_LEGACY)
    .maybeSingle();
  if (e2) {
    step("afir_l3_delete", false, e2.message);
  }
  step(
    "afir_l3_delete",
    !gone,
    gone ? `l3 still present (id=${gone.id})` : "row gone"
  );
}

// ─── C. CBAM duplicate archive ──────────────────────────────────────────

// Step C1: read t1 + duplicate row
let t1Row = null;
let cbamDupRow = null;
{
  const { data: t1, error: e1 } = await supabase
    .from("intelligence_items")
    .select(ALL_FIELDS)
    .eq("legacy_id", CBAM_CANONICAL_LEGACY)
    .maybeSingle();
  if (e1 || !t1) {
    step("cbam_t1_fetch", false, e1?.message ?? "t1 not found");
  }
  t1Row = t1;

  const { data: dup, error: e2 } = await supabase
    .from("intelligence_items")
    .select(ALL_FIELDS)
    .eq("legacy_id", CBAM_DUP_LEGACY)
    .maybeSingle();
  if (e2 || !dup) {
    step("cbam_dup_fetch", false, e2?.message ?? "duplicate row not found");
  }
  cbamDupRow = dup;
  step(
    "cbam_pre_state",
    true,
    `t1 id=${t1Row.id} priority=${t1Row.priority}; dup id=${cbamDupRow.id} is_archived=${cbamDupRow.is_archived} item_type=${cbamDupRow.item_type}`
  );
}

// Step C2: count xrefs touching t1 (both directions)
let t1XrefPreCount = 0;
{
  const { count, error } = await supabase
    .from("item_cross_references")
    .select("id", { count: "exact", head: true })
    .or(`source_item_id.eq.${t1Row.id},target_item_id.eq.${t1Row.id}`);
  if (error) {
    step("cbam_t1_xref_count_pre", false, error.message);
  }
  t1XrefPreCount = count ?? 0;
  step(
    "cbam_t1_xref_count_pre",
    t1XrefPreCount === 5,
    `${t1XrefPreCount} xrefs touching t1 (expected 5)`
  );
}

// Step C3: archive the duplicate row
{
  const archiveNote =
    "Archived 2026-05-07: duplicate of t1 (EU CBAM). Source URL CELEX:32023R0956 = Regulation EU 2023/956 = CBAM. Per EU 3 disposition writes phase.";

  const { error } = await supabase
    .from("intelligence_items")
    .update({
      is_archived: true,
      archive_reason: "duplicate",
      archive_note: archiveNote,
      archived_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", cbamDupRow.id);
  step("cbam_archive_update", !error, error?.message ?? "archive update issued");
}

// Step C4: read-back verify archive
{
  const { data: post, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, is_archived, archive_reason, archive_note, archived_date")
    .eq("id", cbamDupRow.id)
    .maybeSingle();
  if (error || !post) {
    step("cbam_archive_verify_fetch", false, error?.message ?? "no row");
  }
  step(
    "cbam_trade_archive",
    post.is_archived === true && !!post.archive_note,
    `is_archived=${post.is_archived}, archive_reason=${post.archive_reason}, note_len=${(post.archive_note ?? "").length}, archived_date=${post.archived_date}`
  );
}

// Step C5: re-count t1 xrefs to confirm intact
{
  const { count, error } = await supabase
    .from("item_cross_references")
    .select("id", { count: "exact", head: true })
    .or(`source_item_id.eq.${t1Row.id},target_item_id.eq.${t1Row.id}`);
  if (error) {
    step("cbam_t1_xref_count_post", false, error.message);
  }
  step(
    "cbam_t1_xref_count_post",
    count === t1XrefPreCount && count === 5,
    `${count} xrefs touching t1 (pre=${t1XrefPreCount}, expected 5)`
  );
}

// ─── Final state snapshot ──────────────────────────────────────────────
{
  const { data: afirFinal } = await supabase
    .from("intelligence_items")
    .select(
      "legacy_id, full_brief, source_id, priority, item_type, transport_modes"
    )
    .eq("legacy_id", AFIR_MAIN_LEGACY)
    .maybeSingle();
  const { data: l3Final } = await supabase
    .from("intelligence_items")
    .select("legacy_id")
    .eq("legacy_id", AFIR_L3_LEGACY)
    .maybeSingle();
  const { data: cbamFinal } = await supabase
    .from("intelligence_items")
    .select("legacy_id, is_archived, archive_reason, archived_date")
    .eq("legacy_id", CBAM_DUP_LEGACY)
    .maybeSingle();

  console.log(
    "\nFinal state:\n",
    JSON.stringify(
      {
        afir_main: {
          ...afirFinal,
          full_brief_chars: (afirFinal?.full_brief ?? "").length,
          full_brief: undefined,
        },
        l3_present: !!l3Final,
        cbam_dup: cbamFinal,
      },
      null,
      2
    )
  );
}

writeFileSync(
  resolve("..", "docs", "eu-3-disposition-execute-log.json"),
  JSON.stringify({ completed: true, log }, null, 2),
  "utf8"
);
console.log(
  "\n✓ EU 3 disposition writes complete. Log: docs/eu-3-disposition-execute-log.json"
);
