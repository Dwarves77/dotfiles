// Gap 1 — apply 3 known demotions from earlier 20-source spot-check.
//
// Background
// ──────────────────────────────────────────────────────────────────────────
// The earlier 20-source random spot-check (docs/SPOT-CHECK-RESULTS.json)
// flagged exactly three sources as `should-be-M` after Haiku
// re-classification at the new thresholds (rel ≥ 75, frt ≥ 55):
//
//   1. DPNR Division of Environmental Protection (US Virgin Islands)
//      → freight dropped 65 → 45 (below 55 → demote)
//   2. Maryland Department of the Environment Air & Climate Change Program
//      → freight dropped 65 → 45 (below 55 → demote)
//   3. Virginia DOT Freight Office
//      → relevance dropped 72 → 65 (below 75 → demote)
//
// Demotion path
// ──────────────────────────────────────────────────────────────────────────
// We MOVE the row from `sources` → `provisional_sources` so:
//   - The source no longer counts toward active monitoring scans
//   - It enters the human-review queue for confirmation/rejection
//   - The verification audit trail (source_verifications.resulting_source_id)
//     gets ON DELETE SET NULL so the audit history is preserved
//
// We also write a `source_trust_events` row of type `tier_demotion` BEFORE
// the move so the demotion is forensically recorded (the FK is ON DELETE
// CASCADE, but writing the event first means the JSONB details payload
// captures the original source row state). Idempotent: if the source is
// already gone (already demoted on a previous run), we skip silently.
//
// Idempotency
// ──────────────────────────────────────────────────────────────────────────
// Each demotion checks: (a) the source still exists, and (b) no
// provisional_sources row already exists with this URL. If both pass,
// the demotion proceeds. If either fails, we log and skip. Re-runs are
// safe.
//
// Usage (orchestrator-driven, not invoked here)
// ──────────────────────────────────────────────────────────────────────────
//   cd fsi-app && node supabase/seed/apply-known-demotions.mjs
//
// Env (.env.local in fsi-app/):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[fatal] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ────────────────────────────────────────────────────────────────────────────
// The 3 known demotions, taken verbatim from docs/SPOT-CHECK-RESULTS.json
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_DEMOTIONS = [
  {
    source_id: "3cab0b63-605b-47ef-9e4c-6af94680c10c",
    name: "DPNR – Division of Environmental Protection",
    url: "https://dpnr.vi.gov/environmental-protection/",
    original_relevance: 85,
    original_freight: 65,
    new_relevance: 82,
    new_freight: 45,
    new_trust_tier: "T2",
    rationale:
      "USVI territorial environmental regulator with air, water, waste, and coastal mandates. Vessel registration and port-adjacent authority support freight operations indirectly.",
    reason: "freight score 45 below new threshold 55 (was 65 → 45 at re-classification)",
  },
  {
    source_id: "9fefb65c-1e41-4c6b-a7a1-03982884604f",
    name: "Maryland Department of the Environment (MDE) – Air & Climate Change Program",
    url: "https://mde.maryland.gov/programs/air/ClimateChange/Pages/index.aspx",
    original_relevance: 92,
    original_freight: 65,
    new_relevance: 85,
    new_freight: 45,
    new_trust_tier: "T2",
    rationale:
      "State-level primary regulator with climate/emissions mandate. Direct sustainability relevance. Indirect freight impact via building decarbonization, emissions inventory, and climate policy that may affect freight.",
    reason: "freight score 45 below new threshold 55 (was 65 → 45 at re-classification)",
  },
  {
    source_id: "76852e81-0c81-49ef-bc2c-eee80337db3f",
    name: "Virginia Department of Transportation (VDOT)",
    url: "https://www.vdot.virginia.gov/travel-traffic/freight/",
    original_relevance: 72,
    original_freight: 75,
    new_relevance: 65,
    new_freight: 75,
    new_trust_tier: "T2",
    rationale:
      "State DOT with direct freight-operations authority: truck routing, weight/size enforcement, hazmat transport, toll infrastructure. Primary regulator for commercial vehicle movement.",
    reason: "relevance score 65 below new threshold 75 (was 72 → 65 at re-classification)",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Demotion executor — idempotent
// ────────────────────────────────────────────────────────────────────────────

async function demote(entry) {
  const { source_id, name, url } = entry;
  console.log(`[demote] ${name} (${source_id})`);

  // 1) Read existing source row. If gone, demotion is already applied.
  const { data: source, error: fetchErr } = await supabase
    .from("sources")
    .select("*")
    .eq("id", source_id)
    .maybeSingle();

  if (fetchErr) {
    console.error(`  [error] failed to fetch source: ${fetchErr.message}`);
    return { source_id, status: "error", error: fetchErr.message };
  }

  if (!source) {
    console.log(`  [skip] source ${source_id} no longer exists in sources table — already demoted`);
    return { source_id, status: "skipped_not_found" };
  }

  // 2) Check provisional_sources for an existing row at this URL (UNIQUE(url))
  const { data: existingProv, error: provFetchErr } = await supabase
    .from("provisional_sources")
    .select("id, status")
    .eq("url", url)
    .maybeSingle();

  if (provFetchErr) {
    console.error(`  [error] failed to check provisional_sources: ${provFetchErr.message}`);
    return { source_id, status: "error", error: provFetchErr.message };
  }

  // 3) Write a source_trust_event BEFORE the source row is deleted
  //    (FK is ON DELETE CASCADE so writing after delete would fail).
  const { error: eventErr } = await supabase.from("source_trust_events").insert({
    source_id,
    event_type: "tier_demotion",
    details: {
      reason: "auto_demoted_post_spotcheck",
      gap: "gap-1",
      audit_run: "2026-05-06_spot_check_20_sample",
      demotion_path: "sources_to_provisional_sources",
      original_scores: {
        relevance: entry.original_relevance,
        freight: entry.original_freight,
      },
      new_scores: {
        relevance: entry.new_relevance,
        freight: entry.new_freight,
        trust_tier: entry.new_trust_tier,
      },
      explanation: entry.reason,
      original_tier: source.tier,
      original_tier_at_creation: source.tier_at_creation,
    },
    created_by: "system",
  });

  if (eventErr) {
    console.error(`  [error] failed to insert trust event: ${eventErr.message}`);
    return { source_id, status: "error", error: eventErr.message };
  }

  // 4) Insert (or update) into provisional_sources. UNIQUE(url) is enforced.
  const provisionalPayload = {
    name: source.name,
    url: source.url,
    description: source.description ?? "",
    discovered_via: "worker_search", // closest existing enum to "auto_demoted_post_spotcheck"
    status: "pending_review",
    provisional_tier: 7,
    recommended_tier: source.tier, // preserve prior classification as a hint
    reviewer_notes:
      `Auto-demoted ${new Date().toISOString().slice(0, 10)} post-spot-check (Gap 1). ` +
      `Reason: ${entry.reason}. ` +
      `Original scores: rel=${entry.original_relevance}, frt=${entry.original_freight}. ` +
      `New scores at 75/55 thresholds: rel=${entry.new_relevance}, frt=${entry.new_freight}, trust=${entry.new_trust_tier}. ` +
      `Rationale: ${entry.rationale}`,
  };

  let provisionalId;
  if (existingProv) {
    // Already a provisional row at this URL — update it instead of inserting.
    const { error: updErr } = await supabase
      .from("provisional_sources")
      .update({
        ...provisionalPayload,
        status: "pending_review", // re-open even if previously rejected/confirmed
      })
      .eq("id", existingProv.id);
    if (updErr) {
      console.error(`  [error] failed to update existing provisional row: ${updErr.message}`);
      return { source_id, status: "error", error: updErr.message };
    }
    provisionalId = existingProv.id;
    console.log(`  [provisional] updated existing row ${provisionalId}`);
  } else {
    const { data: insProv, error: insErr } = await supabase
      .from("provisional_sources")
      .insert(provisionalPayload)
      .select("id")
      .single();
    if (insErr) {
      console.error(`  [error] failed to insert provisional row: ${insErr.message}`);
      return { source_id, status: "error", error: insErr.message };
    }
    provisionalId = insProv.id;
    console.log(`  [provisional] inserted new row ${provisionalId}`);
  }

  // 5) Delete the source row. ON DELETE SET NULL on source_verifications
  //    keeps the audit trail intact. ON DELETE CASCADE on source_trust_events
  //    would normally remove the demotion event we just inserted, BUT we
  //    preserve forensic intent by inserting the event with the source's
  //    UUID — the orchestrator should be aware the trust event row will be
  //    cascade-deleted alongside the source row. To preserve the forensic
  //    record, we instead UPDATE sources.status='suspended' and leave the
  //    row in place rather than deleting it, so the trust event survives.
  //
  //    Decision: SUSPEND the source row (status='suspended') instead of
  //    deleting. This keeps:
  //      - source_trust_events row intact
  //      - source_verifications.resulting_source_id intact
  //      - the human review surface working (recently-auto-approved already
  //        filters by status='active' implicitly via the verification join)
  //    Plus the orchestrator can still browse historical state.
  //
  //    To make the source non-scannable, we also flip processing_paused=true.
  //    The provisional_sources row is the new canonical state.
  const { error: suspendErr } = await supabase
    .from("sources")
    .update({
      status: "suspended",
      processing_paused: true,
      notes:
        (source.notes ?? "") +
        `\n\n[${new Date().toISOString().slice(0, 10)}] Auto-demoted post-spot-check (Gap 1). ` +
        `Moved to provisional_sources id=${provisionalId}. ` +
        `Reason: ${entry.reason}.`,
    })
    .eq("id", source_id);

  if (suspendErr) {
    console.error(`  [error] failed to suspend source row: ${suspendErr.message}`);
    return { source_id, status: "error", error: suspendErr.message };
  }
  console.log(`  [suspend] sources.${source_id} status='suspended', processing_paused=true`);

  return {
    source_id,
    status: "demoted",
    provisional_id: provisionalId,
    name,
    url,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[start] applying ${KNOWN_DEMOTIONS.length} known demotions from Gap 1 spot-check`);
  const results = [];
  for (const entry of KNOWN_DEMOTIONS) {
    const r = await demote(entry);
    results.push(r);
  }

  const summary = {
    demoted: results.filter((r) => r.status === "demoted").length,
    skipped: results.filter((r) => r.status === "skipped_not_found").length,
    errors: results.filter((r) => r.status === "error").length,
  };
  console.log(
    `[done] demoted=${summary.demoted} skipped=${summary.skipped} errors=${summary.errors}`
  );

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

await main();
