// src/lib/sources/reconcile.ts
//
// Reconcile-loop CONSUMER. Closes the verified gap from the wired-state census: intelligence_
// changes + source_conflicts had read sites but NO writer (0 rows, 0 functions, 0 triggers).
// This module is that writer.
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

/** Open a source_conflicts row when two sources make incompatible claims about the same item
 *  field (content-derived; called by the reconcile pass once grounded claims are available). */
export async function openSourceConflict(
  supabase: SupabaseClient,
  args: {
    itemId: string;
    sourceA: { id: string; tier: number; claim: string };
    sourceB: { id: string; tier: number; claim: string };
    field: string;
  }
): Promise<{ ok: boolean; conflictId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("source_conflicts")
    .insert({
      item_id: args.itemId,
      source_a_id: args.sourceA.id,
      source_b_id: args.sourceB.id,
      source_a_tier: args.sourceA.tier,
      source_b_tier: args.sourceB.tier,
      source_a_claim: args.sourceA.claim,
      source_b_claim: args.sourceB.claim,
      field_in_dispute: args.field,
      status: "open",
    })
    .select("id")
    .single();
  return { ok: !error, conflictId: data?.id, error: error?.message };
}
