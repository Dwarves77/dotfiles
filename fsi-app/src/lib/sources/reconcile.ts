// src/lib/sources/reconcile.ts
//
// Reconcile-loop CONSUMER. Writer for intelligence_changes (recordItemChange /
// recordSourceChangeTrigger, driven by runReconcilePass below — wired in-process from
// check-sources/route.ts after every scan batch, AND via the manual-redrive /api/worker/reconcile
// route; before 2026-09-01 (lane CD) the route had zero callers of any kind and no schedule fired
// it, so this consumer was dead at the queue end of the chain). source_conflicts remains
// writer-less: the openSourceConflict helper authored here was never called and was removed
// 2026-07-11 (see note at end of file).
//
// SCOPE / honesty: the DETECTION input (did a source's content change? the old vs new content
// to diff) is produced by content fetch+hash, which goes through Browserless (the HARD RULE) and
// is gated on the operator restoring quota. This module is the part that runs ONCE a change is
// detected: it records the change + (when two sources disagree) opens a conflict. The pure diff/
// severity logic is unit-tested; recordItemChange is integration-tested against the live table.
//
// The provenance-freshness invariant is already enforced elsewhere: updating an item's content
// fires the set_provenance_status trigger (migration 115), which re-derives status so a changed
// item re-grounds. This module does not re-implement that — it records the change; the content
// write (Browserless-gated) drives the re-derivation. Note the #43 flip guard (migration 118)
// requires the bound reconciler credential for the provenance flip — so the reconcile worker
// must run as the reconciler, not postgres/service-role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bridgeChangedSourceToStagedUpdates } from "./change-sweep.mjs";

// Real vocabularies (the migration-009 CHECK constraints, verified — not the "(inferred)"
// schema comments). change_type names the field that moved; severity ranks customer impact.
export type ChangeType =
  | "new" | "status_change" | "deadline_change" | "scope_change"
  | "penalty_change" | "provision_added" | "provision_amended" | "administrative";
export type ChangeSeverity = "critical" | "significant" | "minor" | "administrative";

export interface FieldDiff { field: string; from: unknown; to: unknown; }

/** Pure: the changed fields between two item snapshots. */
export function computeDiff(previous: Record<string, unknown>, next: Record<string, unknown>): FieldDiff[] {
  const fields = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  const diff: FieldDiff[] = [];
  for (const f of fields) {
    if (JSON.stringify(previous?.[f]) !== JSON.stringify(next?.[f])) diff.push({ field: f, from: previous?.[f], to: next?.[f] });
  }
  return diff;
}

/** Pure: derive (change_type, severity) from which field(s) moved — most-consequential wins.
 *  Maps to the real intelligence_changes CHECK vocabularies. */
export function classifyChange(diff: FieldDiff[]): { changeType: ChangeType; severity: ChangeSeverity } {
  const f = new Set(diff.map((d) => d.field));
  if (f.has("status")) return { changeType: "status_change", severity: "critical" };
  if (f.has("compliance_deadline") || f.has("entry_into_force") || f.has("next_review_date")) return { changeType: "deadline_change", severity: "critical" };
  if (f.has("penalty") || f.has("penalties") || f.has("penalty_amount")) return { changeType: "penalty_change", severity: "significant" };
  if (f.has("jurisdictions") || f.has("jurisdiction_iso") || f.has("scope")) return { changeType: "scope_change", severity: "significant" };
  if (f.has("full_brief")) return { changeType: "provision_amended", severity: "significant" };
  if (f.has("title") || f.has("summary")) return { changeType: "administrative", severity: "minor" };
  return { changeType: "administrative", severity: "administrative" };
}

/** Write one intelligence_changes record (the change-delta the census found writer-less).
 *  Pass changeTypeOverride='new' for a newly-minted item. */
export async function recordItemChange(
  supabase: SupabaseClient,
  args: { itemId: string; previous: Record<string, unknown>; next: Record<string, unknown>; changeTypeOverride?: ChangeType }
): Promise<{ ok: boolean; severity: ChangeSeverity; changeType: ChangeType; changeId?: string; error?: string }> {
  const diff = computeDiff(args.previous, args.next);
  const derived = classifyChange(diff);
  const changeType = args.changeTypeOverride ?? derived.changeType;
  const severity = args.changeTypeOverride === "new" ? "significant" : derived.severity;
  const change_summary =
    changeType === "new" ? "item created"
    : diff.length ? `${changeType}: ${diff.map((d) => d.field).join(", ")}` : "no field change";
  const { data, error } = await supabase
    .from("intelligence_changes")
    .insert({
      item_id: args.itemId,
      change_type: changeType,
      change_severity: severity,
      previous_value: args.previous,
      new_value: args.next,
      change_summary,
      raw_diff: JSON.stringify(diff),
    })
    .select("id")
    .single();
  return { ok: !error, severity, changeType, changeId: data?.id, error: error?.message };
}

/** Record the lightweight "a source's content changed, this item is flagged for re-grounding"
 *  event — what the reconcile worker can record WITHOUT content (the detailed field-diff is
 *  written post-re-ground by generation via recordItemChange). change_type 'provision_amended'
 *  is the closest real CHECK value for "the source's provisions moved". */
export async function recordSourceChangeTrigger(
  supabase: SupabaseClient,
  args: { itemId: string; sourceUrl: string | null }
): Promise<{ ok: boolean; changeId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("intelligence_changes")
    .insert({
      item_id: args.itemId,
      change_type: "provision_amended",
      change_severity: "significant",
      previous_value: null,
      new_value: null,
      change_summary: `source content changed (${args.sourceUrl ?? "unknown url"}) — item flagged for re-grounding`,
      raw_diff: null,
    })
    .select("id")
    .single();
  return { ok: !error, changeId: data?.id, error: error?.message };
}

// (openSourceConflict was removed 2026-07-11: zero callers were ever wired, so source_conflicts
// remains writer-less in practice (0 rows) — the header's "this module is that writer" claim held
// only for intelligence_changes. Restore from git history if the reconcile pass gains a
// grounded-claims comparison step. Audit CODE-1 F-11.)

// ── THE RECONCILE-LOOP CORE (2026-09-01, lane CD — change-detection chain repair) ──────────────────────
// Moved here from /api/worker/reconcile/route.ts so the SAME consumer can be called two ways: the
// worker-secret-gated route (manual re-drive) and check-sources/route.ts (in-process, one dispatch of
// source-monitoring.yml both detects AND reconciles — no HTTP self-call). Before this move,
// /api/worker/reconcile had ZERO callers of any kind; check-sources never called it and no schedule fires
// it (source-monitoring.yml's cron is intentionally commented out — dispatch-only per the operator's
// acquisition-freeze ruling). This function is what makes the queue -> intelligence_changes hop live
// without adding a schedule.
export interface ReconcilePassResult {
  processed: number;
  changesRecorded: number;
  /** staged_updates rows written by the change-sweep amendment-diff bridge (see bridgeChangedSourceToStagedUpdates). */
  staged: number;
  pending: number;
  errors: string[];
  /** True when this result is a COUNT-ONLY projection (opts.dryRun) — nothing in this pass was written. */
  dryRun?: boolean;
}

const RECONCILE_BATCH = 200;

// The bridge's own default per-source cap (bridgeChangedSourceToStagedUpdates's `limit = 50`,
// change-sweep.mjs) — mirrored here ONLY so dryRun can project the same bound the real bridge call would
// apply, without importing a private constant. If that default ever changes, this literal must move with
// it (both are read together at review time; there is no third callsite to drift against).
const BRIDGE_DEFAULT_LIMIT = 50;

/**
 * Claim pending monitoring_queue rows (change_detected=true, reconciled_at IS NULL), record the
 * lightweight "source changed" trigger into intelligence_changes for every LIVE item on that source
 * (recordSourceChangeTrigger), bridge the same source's live items into the staged_updates review queue
 * (change-sweep.mjs's amendment-diff bridge — the analysis-side hop, distinct from the log write above),
 * then stamp each processed row reconciled_at so re-runs are idempotent. Never throws: a per-row or
 * per-item failure is recorded in `errors` and the pass continues.
 *
 * `opts.dryRun` (lane CD, change-detection runtime, 2026-09-02): read-only projection. The SAME claim
 * query runs (still read-only — it was always a plain SELECT) and the SAME per-source live-item read
 * runs (also always read-only), but the three writes below it — recordSourceChangeTrigger's
 * intelligence_changes insert, the staged_updates bridge, and the reconciled_at stamp — are skipped
 * entirely. `changesRecorded`/`staged` become COUNTS of what those writes would have produced (one
 * intelligence_changes row per live item; one staged_updates row per live item, capped at the bridge's
 * own default per-source limit, `BRIDGE_DEFAULT_LIMIT` — the exact bound bridgeChangedSourceToStagedUpdates
 * applies), and `processed` counts rows that WOULD be marked reconciled, not rows actually stamped.
 * Existing callers (check-sources/route.ts, /api/worker/reconcile) never pass `dryRun`; `dryRun` is
 * `false` in that case and is OMITTED from the returned object entirely (not just falsey) — the result
 * shape those callers already read (and JSON.stringify into an API response) is byte-for-byte unchanged.
 */
export async function runReconcilePass(
  supabase: SupabaseClient,
  opts: { batch?: number; dryRun?: boolean } = {}
): Promise<ReconcilePassResult> {
  const batch = opts.batch ?? RECONCILE_BATCH;
  const dryRun = opts.dryRun ?? false;
  const dryRunField = dryRun ? { dryRun: true as const } : {};
  const errors: string[] = [];

  const { data: pending, error: qErr } = await supabase
    .from("monitoring_queue")
    .select("id, source_id, checked_at")
    .eq("change_detected", true)
    .is("reconciled_at", null)
    .order("checked_at", { ascending: true })
    .limit(batch);
  if (qErr) {
    return { processed: 0, changesRecorded: 0, staged: 0, pending: 0, errors: [`queue read failed: ${qErr.message}`], ...dryRunField };
  }
  if (!pending?.length) return { processed: 0, changesRecorded: 0, staged: 0, pending: 0, errors: [], ...dryRunField };

  let processed = 0;
  let changesRecorded = 0;
  let staged = 0;

  for (const row of pending) {
    // The source's live items are the ones whose grounding is now suspect.
    const { data: items, error: itemsErr } = await supabase
      .from("intelligence_items")
      .select("id, source_url")
      .eq("source_id", row.source_id)
      .eq("is_archived", false);
    if (itemsErr) errors.push(`items read for source ${row.source_id}: ${itemsErr.message}`);

    if (dryRun) {
      // COUNT ONLY — no intelligence_changes insert, no staged_updates bridge, no reconciled_at stamp.
      changesRecorded += (items ?? []).length;
      if (items?.length) staged += Math.min(items.length, BRIDGE_DEFAULT_LIMIT);
      processed++;
      continue;
    }

    for (const item of items ?? []) {
      const r = await recordSourceChangeTrigger(supabase, { itemId: item.id, sourceUrl: item.source_url });
      if (r.ok) changesRecorded++;
      else errors.push(`item ${item.id.slice(0, 8)}: ${r.error}`);
    }

    // B4 amendment bridge: stage an update_item review row per live item so the existing
    // apply-staged-update.ts review/apply path can re-verify content and re-run rule 16 on apply. Never
    // fatal to the pass — a bridge failure is recorded and the row is still marked reconciled below (the
    // intelligence_changes log write above already succeeded independently).
    if (items?.length) {
      try {
        const bridged = await bridgeChangedSourceToStagedUpdates(supabase, { sourceId: row.source_id, items });
        staged += bridged.staged;
        for (const e of bridged.errors) errors.push(`bridge source ${row.source_id}: ${e}`);
      } catch (e: unknown) {
        errors.push(`bridge source ${row.source_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Mark the queue row reconciled so re-runs are idempotent.
    const { error: mErr } = await supabase
      .from("monitoring_queue")
      .update({ reconciled_at: new Date().toISOString() })
      .eq("id", row.id);
    if (mErr) errors.push(`queue ${row.id}: ${mErr.message}`);
    else processed++;
  }

  return { processed, changesRecorded, staged, pending: pending.length, errors: errors.slice(0, 20), ...dryRunField };
}
