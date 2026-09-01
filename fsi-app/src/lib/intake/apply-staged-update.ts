// applyStagedUpdate — the MACHINE materialization of a staged_updates row (extracted from the former
// /api/staged-updates/route.ts, Unit 0c-2). The sole live caller is runIntakeCycle
// (no-human-finish-of-intake — the machine gates ARE the approval, RD-20). The legacy
// /api/staged-updates POST human-approve handler was retired to a 410 (Unit 0c) and then the whole route
// was purged 2026-07-18 (dormant-systems P-2/P-8); this materializer stays, reached only by the machine cycle.
//
// It performs the side-effect implied by a staged_update: for `new_item` it mints through the SINGLE
// chokepoint mintIntelligenceItem (congruence 1a/1b + subject-existence dedup + relevance floor + the one
// INSERT), gated first by the entity-gate (a portal-root source_url is a SOURCE, not an item → refused).
// For the other update_types it applies the update/status/archive/source side-effect.
//
// IMPORTANT: this must NEVER throw. All error paths return structured failure so the caller can record
// materialization_error / mark rejected-with-reason. (Verbatim move — no behavior change — so the
// legacy route stays identical and the suite confirms it.)
//
// MOAT BOUNDARY (contract rule 16, "the forward-participation clause", 2026-09-01): `update_item` is the
// ONE other write path (besides mint-item.ts's mint chokepoint) capable of a SUBSTANTIVE update to an
// intelligence_items row's content, so rule 16 applies here too — see isSubstantiveUpdate below for the
// boundary and participateInFlywheel for the (a)/(b)/(d) participation itself, which reuses the exact same
// modules mint-item.ts's own post-insert blocks call (run-discovery.mjs, read-and-extract.mjs,
// flywheel-defect.ts) so the two writers can never drift on shape. This file becomes, alongside
// mint-item.ts, a writer of item_forward_events (see docs/inventories/shared-dataset-ownership.md).
import { createHash } from "node:crypto";
import { urlIsRoot } from "@/lib/sources/entity-gate.mjs";
import { mintIntelligenceItem } from "@/lib/intake/mint-item";
import { classifySourceRole } from "@/lib/sources/classify-source-role";
import { runConnectionDiscovery, CONNECTION_SIGNATURE_COLUMNS } from "@/lib/connections/run-discovery.mjs";
import { readAndExtractForwardEvents } from "@/lib/forward-events/read-and-extract.mjs";
import { recordFlywheelDefect } from "@/lib/intake/flywheel-defect";

export interface ApplyUpdateResult {
  success: boolean;
  error?: string;
  itemId?: string;
  /** Gate decisions — from the mint chokepoint on the new_item path (e.g. ["congruence:1a"],
   *  ["dedup:linked"]), or from rule-16 flywheel participation on a SUBSTANTIVE update_item
   *  (e.g. ["discovery:2"], ["forward-events:1"], ["discovery-failed"], ["stale-events:1"]) — surfaced so
   *  the disposition trail can name WHICH gate/step acted. Absent (or empty) on a non-substantive
   *  update_item, and on every other update_type (status_change / new_source / archive_item), which never
   *  touch content and so never participate in the flywheel (see isSubstantiveUpdate). */
  flags?: string[];
  /** The mint chokepoint's action verb (minted | retyped | linked | exists | duplicate). new_item path only. */
  action?: string;
}

// ── SUBSTANTIVE-UPDATE BOUNDARY (rule 16, contract v2.2) ─────────────────────────────────────────────────
// `update_item` is the only update_type whose proposed_changes is applied to intelligence_items with NO
// field allowlist (`.update(update.proposed_changes ?? {})`, verbatim) — every other update_type either
// writes a fixed, named column set (status_change → status only; archive_item → is_archived/archive_reason/
// archive_note/archived_date) or a different table entirely (new_source → sources). So for update_item,
// and ONLY for update_item, "which fields the path can actually update" is genuinely "any intelligence_items
// column" — the boundary has to be derived from what those columns MEAN, not from a fixed shape the path
// itself already restricts to.
//
// intelligence_items' own schema (migration 004_source_trust_framework.sql) already groups its columns by
// comment header: "Content" (title, summary, what_is_it, why_matters, key_data, operational_impact,
// open_questions, tags) vs "Status and severity" (status, severity, confidence, priority, reasoning) vs
// "Archive" (is_archived, archive_reason, archive_note, archived_date, replaced_by) vs "Version history"
// (version_history) vs "Timestamps" (created_at, updated_at) — plus later additions: full_brief (007, the
// rendered brief body — content), and 018_b2_brief_schema.sql's urgency_tier/format_type/
// last_regenerated_at/regeneration_skill_version/sources_used (presentation/regeneration bookkeeping, not
// new information). `entry_into_force` / `compliance_deadline` / `next_review_date` are the DATE columns
// item_forward_events (migration 274/275) exists to extract obligation dates INTO — a change to one of
// these is exactly the kind of update rule 16(b) cares about, so they are classified as content, not dates
// metadata, despite living in the schema's own "Dates" group alongside `added_date`/`last_verified` (which
// ARE bookkeeping — administrative timestamps, not obligation content).
//
// NON_SUBSTANTIVE_UPDATE_FIELDS is therefore a DENY-list, not an allow-list: an update_item whose
// proposed_changes touches ONLY these bookkeeping/workflow columns is non-substantive (status-only /
// metadata-only) and skips rule-16 participation entirely; a change touching ANY column NOT in this set —
// including a column this list has never heard of — is treated as SUBSTANTIVE. Fail toward RUNNING the
// flywheel on an unrecognized column, never toward silently skipping it: the same "never silently skip"
// posture rule 16(d) applies to (a)/(b) failures applies here to the boundary decision itself.
const NON_SUBSTANTIVE_UPDATE_FIELDS = new Set([
  // status / severity / workflow triage — `status` also has its own dedicated update_type
  // (status_change, below), but update_item's unrestricted proposed_changes can carry it too, and a
  // status-only change routed through THIS update_type must be recognized as non-substantive as well.
  "status", "severity", "confidence", "priority",
  // archive fields — own dedicated update_type (archive_item, below); listed here for the same reason.
  "is_archived", "archive_reason", "archive_note", "archived_date", "replaced_by",
  // presentation / regeneration bookkeeping (018_b2_brief_schema.sql) — describes HOW the brief was
  // produced/rendered, not what it says.
  "urgency_tier", "format_type", "last_regenerated_at", "regeneration_skill_version", "sources_used",
  // audit/version metadata — a RECORD of changes, not new content itself.
  "version_history", "last_verified", "added_date", "created_at", "updated_at",
  // identity bookkeeping — never itself a content change.
  "legacy_id",
]);

/**
 * True when `proposedChanges` touches at least one intelligence_items column outside
 * NON_SUBSTANTIVE_UPDATE_FIELDS — see the boundary comment above this constant for the full derivation.
 * An empty (or missing) proposed_changes touches nothing and is non-substantive.
 */
export function isSubstantiveUpdate(proposedChanges: Record<string, unknown> | null | undefined): boolean {
  const keys = Object.keys(proposedChanges ?? {});
  if (keys.length === 0) return false;
  return keys.some((k) => !NON_SUBSTANTIVE_UPDATE_FIELDS.has(k));
}

function md5Hex(s: unknown): string {
  return createHash("md5").update(String(s ?? ""), "utf8").digest("hex");
}

/** Migration 275's replacement dedupe key: (intelligence_item_id, event_date, event_kind,
 *  md5(obligation_text), coalesce(source_claim_id, source_section_id)) — the intelligence_item_id part is
 *  implicit here (every row this scans is already scoped `.eq("intelligence_item_id", itemId)`). */
function forwardEventDedupeKey(row: Record<string, unknown>): string {
  const sourceObjectId = row.source_claim_id ?? row.source_section_id ?? "";
  return `${row.event_date}|${row.event_kind}|${md5Hex(row.obligation_text)}|${sourceObjectId}`;
}

/**
 * Rule 16 (a)/(b)/(d) participation for a SUBSTANTIVE update_item — the same non-fatal, try/catch-per-step
 * posture mint-item.ts's post-insert blocks use, reusing the exact same shared modules (run-discovery.mjs,
 * read-and-extract.mjs, flywheel-defect.ts) so the two writers can never drift on shape. Appends its own
 * gate-decision strings onto `flags` (mint-item.ts's own convention) rather than returning a second value.
 * NEVER throws — every failure is caught, recorded via recordFlywheelDefect (rule 16d), and flagged.
 */
async function participateInFlywheel(supabase: any, itemId: string, flags: string[]): Promise<void> {
  // ── rule 16(a): re-run connection discovery against the item's CURRENT (post-update) signature. A
  // fresh re-read (rather than merging proposed_changes over the pre-update row in memory) is the only way
  // to get an authoritative full signature when proposed_changes may have touched only SOME of the
  // signature columns — the same signature shape mint-item.ts builds from its just-inserted seed.
  try {
    const { data: row, error: readErr } = await supabase
      .from("intelligence_items")
      .select(CONNECTION_SIGNATURE_COLUMNS)
      .eq("id", itemId)
      .single();
    if (readErr) throw new Error(`intelligence_items re-read for discovery failed: ${readErr.message}`);
    const written = await runConnectionDiscovery(supabase, itemId, row);
    if (written > 0) flags.push(`discovery:${written}`);
  } catch (e: unknown) {
    await recordFlywheelDefect(supabase, itemId, "discovery", e instanceof Error ? e.message : String(e), { context: "update" });
    flags.push("discovery-failed");
  }

  // ── rule 16(b): re-extract forward events from the item's CURRENT grounded content, write only the
  // events not already present (migration-275 dedupe key), and — without ever deleting a row itself —
  // flag any EXISTING item_forward_events row whose supporting claim/section has since disappeared
  // ("stale-events"), so a human/later pass decides what to do with it.
  try {
    const { events, claims, sections } = await readAndExtractForwardEvents(supabase, itemId);

    const { data: existingRows, error: existingErr } = await supabase
      .from("item_forward_events")
      .select("id, event_date, event_kind, obligation_text, source_claim_id, source_section_id")
      .eq("intelligence_item_id", itemId);
    if (existingErr) throw new Error(`item_forward_events read failed: ${existingErr.message}`);
    const existing: Array<Record<string, unknown>> = existingRows ?? [];

    // stale-events: an existing row's supporting claim/section is no longer among the item's CURRENT
    // FACT/GAP claims / rendered sections (re-grounding removed or reclassified it). Grounding rule 1
    // (migration 274) guarantees exactly one of source_claim_id/source_section_id is set per row.
    const currentClaimIds = new Set((claims ?? []).map((c: any) => c.claim_id));
    const currentSectionIds = new Set((sections ?? []).map((s: any) => s.section_id));
    const staleRows = existing.filter((r) =>
      r.source_claim_id ? !currentClaimIds.has(r.source_claim_id as string)
        : r.source_section_id ? !currentSectionIds.has(r.source_section_id as string)
        : false
    );
    if (staleRows.length) {
      await recordFlywheelDefect(
        supabase,
        itemId,
        "stale-events",
        `${staleRows.length} existing item_forward_events row(s) reference a claim/section no longer present: ${staleRows.map((r) => r.id).join(", ")}`,
        { context: "update" }
      );
      flags.push(`stale-events:${staleRows.length}`);
    }

    // dedupe against the migration-275 key: PostgREST's upsert onConflict only accepts a plain column
    // list, and the real unique index is EXPRESSION-based (md5(obligation_text),
    // coalesce(source_claim_id, source_section_id)) — not expressible that way — so idempotency is done
    // at the application layer: compute the same key the index computes, skip anything already present
    // (or repeated within this same extraction batch), and plain-INSERT only what's left. A residual
    // 23505 (unique_violation) — e.g. a concurrent writer landing the same key first — means the dedupe
    // key already did its job; treated as zero-new, not a failure.
    const existingKeys = new Set(existing.map((r) => forwardEventDedupeKey(r)));
    const seenInBatch = new Set<string>();
    const newRows: Array<Record<string, unknown>> = [];
    for (const ev of events as Array<Record<string, unknown>>) {
      const row: Record<string, unknown> = { intelligence_item_id: itemId, ...ev };
      const key = forwardEventDedupeKey(row);
      if (existingKeys.has(key) || seenInBatch.has(key)) continue;
      seenInBatch.add(key);
      newRows.push(row);
    }
    if (newRows.length) {
      const { error: fwdErr } = await supabase.from("item_forward_events").insert(newRows);
      if (fwdErr) {
        if (fwdErr.code === "23505") {
          flags.push("forward-events:0");
        } else {
          throw new Error(`item_forward_events insert failed: ${fwdErr.message}`);
        }
      } else {
        flags.push(`forward-events:${newRows.length}`);
      }
    }
  } catch (e: unknown) {
    await recordFlywheelDefect(supabase, itemId, "forward-events", e instanceof Error ? e.message : String(e), { context: "update" });
    flags.push("forward-events-failed");
  }
}

export async function applyStagedUpdate(
  supabase: any,
  update: any,
  opts: { dryRun?: boolean } = {}
): Promise<ApplyUpdateResult> {
  try {
    switch (update.update_type) {
      case "new_item": {
        const proposed = update.proposed_changes ?? {};
        if (typeof proposed !== "object") {
          return { success: false, error: "proposed_changes is not an object" };
        }
        // `relevance` is a CHOKEPOINT INPUT (the Fork-4 surface-only floor), not a column —
        // intelligence_items has no relevance column, so it must never reach the seed INSERT.
        // Destructured out here and passed to the mint plan explicitly below. (B1 portal-harvest is
        // the first relevance-bearing caller; a dryRun cannot catch this because dry stops before
        // the write — schema-audited 2026-07-19.)
        const {
          key_deadlines: _kd,
          source_name: _sn,
          penalty_range: _pr,
          cost_mechanism: _cm,
          authority_level: _al,
          relevance: proposedRelevance,
          ...insertData
        } = proposed;

        // ENTITY GATE (source != item): a root / landing source_url is the portal homepage — a SOURCE,
        // not an item. Do NOT materialize it as an intelligence_item even on approve. (Triage gate, upstream
        // of the mint chokepoint — a deterministic machine reject with a named reason.)
        if (typeof insertData.source_url === "string" && urlIsRoot(insertData.source_url)) {
          return {
            success: false,
            error: `entity-gate: ${insertData.source_url} is a portal root URL — a source, not an item; not materialized`,
          };
        }

        // Leakage warn (do not reject) when item_type is unambiguously non-regulation but domain=1.
        const _itemType = (insertData as { item_type?: unknown }).item_type;
        const _domain = (insertData as { domain?: unknown }).domain;
        const NON_REG_TYPES = new Set([
          "market_signal",
          "research_finding",
          "regional_data",
          "technology",
          "innovation",
        ]);
        if (
          _domain === 1 &&
          typeof _itemType === "string" &&
          NON_REG_TYPES.has(_itemType)
        ) {
          console.warn(
            `[apply-staged-update] suspicious insert: item_type=${_itemType} but domain=1; possible bypass of classifier (staged_update_id=${update.id})`
          );
        }

        // ── the mint chokepoint owns congruence (1a/1b) + subject-existence dedup + the single INSERT. ──
        // F6: dryRun threads through — the entity-gate reject above is read-only, so a dry materialization
        // runs the identical apply path (entity-gate → chokepoint gates) minus the INSERT.
        const res = await mintIntelligenceItem(supabase, {
          seed: insertData,
          legacyId: (insertData as { legacy_id?: string | null }).legacy_id ?? null,
          relevance: typeof proposedRelevance === "number" ? proposedRelevance : null,
          origin: "staged_materialization",
        }, { dryRun: opts.dryRun });
        if (!res.ok) return { success: false, error: res.error, flags: res.flags, action: res.action };
        return { success: true, itemId: res.itemId, flags: res.flags, action: res.action };
      }
      case "update_item": {
        if (!update.item_id) return { success: false, error: "No item_id for update" };
        const itemId = update.item_id as string;
        const proposedChanges = (update.proposed_changes ?? {}) as Record<string, unknown>;
        const { error } = await supabase
          .from("intelligence_items")
          .update(proposedChanges)
          .eq("id", itemId);
        if (error) return { success: false, error: error.message };

        // rule 16 (contract v2.2, "the forward-participation clause"): non-fatal flywheel participation
        // on every SUBSTANTIVE update — see isSubstantiveUpdate's boundary comment above for exactly which
        // proposed_changes keys trigger this. A status-only/metadata-only update (e.g. {status: "..."})
        // touches neither (a) discovery nor (b) forward-event extraction, matching the boundary derived
        // from what update_item's unrestricted proposed_changes can actually mean.
        const flags: string[] = [];
        if (isSubstantiveUpdate(proposedChanges)) {
          await participateInFlywheel(supabase, itemId, flags);
        }
        return { success: true, itemId, flags };
      }
      case "status_change": {
        if (!update.item_id) return { success: false, error: "No item_id for status change" };
        const newStatus = update.proposed_changes?.status;
        if (!newStatus) return { success: false, error: "proposed_changes.status missing" };
        const { error } = await supabase
          .from("intelligence_items")
          .update({ status: newStatus })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
      }
      case "new_source": {
        // source_role at BIRTH on the LIVE intake path (2026-08-11). classify-source-role.ts's own
        // contract is "a source is never created with a NULL role". It was wired into the three
        // admin onboarding routes, and (earlier today) into scripts/lib/db.mjs registerSource —
        // but NOT here, the machine mint chokepoint reached by runIntakeCycle and portalHarvest.
        // This is the path that actually runs unattended, so it was the one silently minting
        // role-less rows, and a later triage then read "no role" as "inert" and demoted live
        // regulators. Deterministic, name+URL only, no fetch, no LLM, $0. An explicit source_role
        // in proposed_changes still wins; null stays null when genuinely undeterminable.
        const proposed = (update.proposed_changes ?? {}) as Record<string, unknown>;
        const row = {
          ...proposed,
          source_role:
            proposed.source_role ??
            classifySourceRole(
              typeof proposed.name === "string" ? proposed.name : null,
              typeof proposed.url === "string" ? proposed.url : null
            ),
        };
        const { error } = await supabase.from("sources").insert(row);
        if (error) return { success: false, error: error.message };
        return { success: true };
      }
      case "archive_item": {
        if (!update.item_id) return { success: false, error: "No item_id for archive" };
        const proposed = update.proposed_changes ?? {};
        const { error } = await supabase
          .from("intelligence_items")
          .update({
            is_archived: true,
            archive_reason: proposed.archive_reason || "Manual",
            archive_note: proposed.archive_note || "",
            archived_date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
      }
      default:
        return { success: false, error: `Unknown update type: ${update.update_type}` };
    }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
