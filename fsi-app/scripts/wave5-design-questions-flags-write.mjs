/**
 * wave5-design-questions-flags-write.mjs — Wave 5 design-questions dispatch.
 *
 * Track D operations agent: surface 7 walkthrough design questions to the
 * platform integrity_flags Admin queue. Per Wave 4 design_drift agent
 * contract + migration 048 (PRECONDITION: applied per Jason).
 *
 * Per-row verification (PR-A1 pattern). Halt on any failure.
 *
 * File scope:
 *   - INSERT integrity_flags (7 rows)
 *   - Read-back per insert (id, category, subject_ref) to verify
 *   - Final log written to docs/wave5-design-questions-flags-log.json
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
const flagIds = [];

function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "wave5-design-questions-flags-log.json"),
      JSON.stringify({ aborted_at: name, log, flagIds }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ─── Precondition: confirm integrity_flags table exists ─────────────────
// Use a real SELECT (not head:true) — head:true silently returns count:null
// when PostgREST can't find the table in its schema cache.
{
  const { error } = await supabase
    .from("integrity_flags")
    .select("id")
    .limit(1);
  if (error) {
    step(
      "precondition_table_exists",
      false,
      `integrity_flags table not reachable: ${error.message} (code=${error.code ?? "?"}). Migration 048 may not be applied OR PostgREST schema cache is stale. HALT.`
    );
  }
  step("precondition_table_exists", true, "integrity_flags table reachable via PostgREST");
}

// ─── 7 flag specifications ──────────────────────────────────────────────

const FLAGS = [
  {
    label: "flag1_research_pipeline",
    row: {
      category: "design_drift",
      subject_type: "surface",
      subject_ref: "/research",
      description:
        "Research Pipeline shows regulations in workflow stages, not research-type intelligence per Decision #5 horizon scan framing. Operator confusion observed in walkthrough. Decision needed: reframe Pipeline content vs differentiate Research from Pipeline as separate concepts.",
      recommended_actions: [
        {
          action: "Reframe",
          rationale:
            "Move regulations to a dedicated Pipeline concept and use Research for research-type intelligence per original Decision #5",
        },
        {
          action: "Differentiate",
          rationale:
            "Add visual + semantic separation between research findings and tracked-regulations queue",
        },
        {
          action: "Accept",
          rationale:
            "Document the operator-facing meaning and align Decision #5 to current behavior",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag2_market_intel_mixed",
    row: {
      category: "design_drift",
      subject_type: "surface",
      subject_ref: "/market",
      description:
        "Market Intel surface mixes regulations (CARB) and pure market signals (SAF pricing) without operator-visible differentiation. Decision needed: filter to item_type=market_signal, add visual type badging, or accept mixed model with operator education.",
      recommended_actions: [
        {
          action: "Filter",
          rationale:
            "Restrict /market to item_type=market_signal only; route regulations to /regulations",
        },
        {
          action: "Badge",
          rationale: "Keep mixed view; add a visible type chip per item",
        },
        {
          action: "Accept-with-docs",
          rationale:
            "Document mixed model in Methodology card; train operators to read both",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag3_exposure_tab",
    row: {
      category: "surface_concern",
      subject_type: "surface",
      subject_ref: "/regulations/[id]/exposure",
      description:
        "Regulation detail Exposure tab is empty and operators are unclear on its purpose vs Summary. Decision needed: define what Exposure shows, build the data + UI, or remove the tab.",
      recommended_actions: [
        {
          action: "Define+Build",
          rationale:
            "Specify Exposure as workspace-specific impact (lanes, volumes, surcharge cost) and build the data + UI",
        },
        {
          action: "Remove",
          rationale:
            "Drop the tab until the data layer can populate it; reduce surface confusion",
        },
        {
          action: "Coming-soon",
          rationale:
            "Keep tab visible with explicit Phase D placeholder per ComingSoonBanner pattern",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag4_pending_brief_banner",
    row: {
      category: "surface_concern",
      subject_type: "surface",
      subject_ref: "/regulations/[id]",
      description:
        "Regulation detail lacks visible 'detailed analysis pending' affordance when deep brief data isn't yet ingested. Operators see empty/sparse state without context. Decision needed: add Phase D pending banner, or wait until ingestion populates.",
      recommended_actions: [
        {
          action: "Pending-banner",
          rationale:
            "Add a top-of-detail banner when full_brief is short/empty: 'Detailed analysis pending — regulation tracked, brief generation queued.'",
        },
        {
          action: "Wait",
          rationale:
            "Track A worker activation may resolve sparse-brief state within 48h; revisit then",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag5_market_source_citation",
    row: {
      category: "data_quality",
      subject_type: "surface",
      subject_ref: "/market",
      description:
        "Market Intel items lack visible source-citation drill-down. Operators see data without knowing where it came from. Worker activation (Track A) may improve this; revisit after 48h post-activation. If still gap, dispatch sourcing UI add.",
      recommended_actions: [
        {
          action: "Wait-and-revisit",
          rationale:
            "Worker activation (Track A) likely populates more source linkages; check post-48h",
        },
        {
          action: "Sourcing-UI",
          rationale:
            "Add visible source attribution kicker per Market item, drill-down to source registry on click",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag6_owner_team",
    row: {
      category: "workflow_gap",
      subject_type: "surface",
      subject_ref: "/regulations/[id]/owner-team",
      description:
        "Operators have no UI to add Owner or assign for review on regulation detail. Workflow features deferred to Phase D scoping pass.",
      recommended_actions: [
        {
          action: "Phase-D-scope",
          rationale:
            "Group with other workflow features (notifications, assignments, review status) in a dedicated Phase D dispatch",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
  {
    label: "flag7_org_notes",
    row: {
      category: "workflow_gap",
      subject_type: "surface",
      subject_ref: "/regulations/[id]/notes",
      description:
        "Operators want to capture private intelligence (e.g., Cargolux 1M liter SAF minimum, Delta per-route SAF specifics) org-scoped. Workflow feature deferred to Phase D scoping pass.",
      recommended_actions: [
        {
          action: "Phase-D-scope",
          rationale:
            "Build org-scoped notes UI with RLS-gated visibility (workspace_id-bound) in Phase D",
        },
      ],
      status: "open",
      created_by: "wave-5-design-questions-dispatch",
    },
  },
];

// ─── Constraint check: workflow_gap not in migration 048's CHECK constraint
// (per migration: design_drift | data_quality | source_issue | coverage_gap |
//  data_integrity | surface_concern). Halt early if any spec'd category is
// outside the allowed set, BEFORE attempting the insert. Surface honestly.
{
  const ALLOWED = new Set([
    "design_drift",
    "data_quality",
    "source_issue",
    "coverage_gap",
    "data_integrity",
    "surface_concern",
  ]);
  const offenders = FLAGS.filter((f) => !ALLOWED.has(f.row.category));
  step(
    "precondition_category_check",
    offenders.length === 0,
    offenders.length === 0
      ? "all 7 flag categories within migration 048 CHECK constraint"
      : `categories outside CHECK: ${offenders
          .map((o) => `${o.label}=${o.row.category}`)
          .join(", ")}. Migration 048 does not allow 'workflow_gap'. HALT.`
  );
}

// ─── Per-row insert + read-back verification ────────────────────────────

for (const flag of FLAGS) {
  // Insert
  const { data: inserted, error: insErr } = await supabase
    .from("integrity_flags")
    .insert(flag.row)
    .select("id, category, subject_type, subject_ref, status, created_by")
    .single();

  if (insErr || !inserted) {
    step(
      `${flag.label}_insert`,
      false,
      `insert failed: ${insErr?.message ?? "no row returned"}`
    );
  }
  step(
    `${flag.label}_insert`,
    true,
    `id=${inserted.id} category=${inserted.category} subject_ref=${inserted.subject_ref}`
  );
  flagIds.push({
    label: flag.label,
    id: inserted.id,
    category: inserted.category,
    subject_ref: inserted.subject_ref,
  });

  // Read-back
  const { data: readBack, error: rbErr } = await supabase
    .from("integrity_flags")
    .select(
      "id, category, subject_type, subject_ref, status, created_by, recommended_actions"
    )
    .eq("id", inserted.id)
    .maybeSingle();

  if (rbErr || !readBack) {
    step(
      `${flag.label}_readback`,
      false,
      `read-back failed: ${rbErr?.message ?? "row not found after insert"}`
    );
  }

  const categoryMatch = readBack.category === flag.row.category;
  const subjectRefMatch = readBack.subject_ref === flag.row.subject_ref;
  const statusOpen = readBack.status === "open";
  const createdByMatch =
    readBack.created_by === "wave-5-design-questions-dispatch";
  const actionsArr = Array.isArray(readBack.recommended_actions)
    ? readBack.recommended_actions
    : [];
  const actionsMatch =
    actionsArr.length === flag.row.recommended_actions.length;

  const ok =
    categoryMatch &&
    subjectRefMatch &&
    statusOpen &&
    createdByMatch &&
    actionsMatch;

  step(
    `${flag.label}_readback`,
    ok,
    ok
      ? `category=${readBack.category} subject_ref=${readBack.subject_ref} status=${readBack.status} actions=${actionsArr.length}`
      : `MISMATCH category=${readBack.category}/${flag.row.category} subject_ref=${readBack.subject_ref}/${flag.row.subject_ref} status=${readBack.status} created_by=${readBack.created_by} actions=${actionsArr.length}/${flag.row.recommended_actions.length}`
  );
}

// ─── Final cohort verification ──────────────────────────────────────────
{
  const ids = flagIds.map((f) => f.id);
  const { data: cohort, error } = await supabase
    .from("integrity_flags")
    .select("id, category, status, created_by")
    .in("id", ids);

  if (error) {
    step("cohort_verify", false, `cohort fetch failed: ${error.message}`);
  }

  const allOpen = (cohort ?? []).every((r) => r.status === "open");
  const allTagged = (cohort ?? []).every(
    (r) => r.created_by === "wave-5-design-questions-dispatch"
  );
  const correctCount = (cohort ?? []).length === 7;

  step(
    "cohort_verify",
    correctCount && allOpen && allTagged,
    `${cohort?.length ?? 0}/7 rows present, all_open=${allOpen}, all_tagged=${allTagged}`
  );
}

// ─── Final log artifact ─────────────────────────────────────────────────
writeFileSync(
  resolve("..", "docs", "wave5-design-questions-flags-log.json"),
  JSON.stringify(
    {
      completed: true,
      created_at: new Date().toISOString(),
      created_by: "wave-5-design-questions-dispatch",
      flag_count: flagIds.length,
      flagIds,
      log,
    },
    null,
    2
  ),
  "utf8"
);

console.log(
  `\n✓ Wave 5 design-questions flags written. ${flagIds.length} rows. Log: docs/wave5-design-questions-flags-log.json`
);
console.log("\nFlag IDs:");
for (const f of flagIds) {
  console.log(`  ${f.label.padEnd(35)} ${f.id}  ${f.category}  ${f.subject_ref}`);
}
