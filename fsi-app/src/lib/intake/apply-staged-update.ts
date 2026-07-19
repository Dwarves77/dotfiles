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
import { urlIsRoot } from "@/lib/sources/entity-gate.mjs";
import { mintIntelligenceItem } from "@/lib/intake/mint-item";

export interface ApplyUpdateResult {
  success: boolean;
  error?: string;
  itemId?: string;
  /** Gate decisions from the mint chokepoint (e.g. ["congruence:1a"], ["dedup:linked"]) — surfaced so the
   *  disposition trail can name WHICH gate acted. Present only on the new_item path. */
  flags?: string[];
  /** The mint chokepoint's action verb (minted | retyped | linked | exists | duplicate). new_item path only. */
  action?: string;
}

export async function applyStagedUpdate(
  supabase: any,
  update: any
): Promise<ApplyUpdateResult> {
  try {
    switch (update.update_type) {
      case "new_item": {
        const proposed = update.proposed_changes ?? {};
        if (typeof proposed !== "object") {
          return { success: false, error: "proposed_changes is not an object" };
        }
        const {
          key_deadlines: _kd,
          source_name: _sn,
          penalty_range: _pr,
          cost_mechanism: _cm,
          authority_level: _al,
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
        const res = await mintIntelligenceItem(supabase, {
          seed: insertData,
          legacyId: (insertData as { legacy_id?: string | null }).legacy_id ?? null,
          relevance: (insertData as { relevance?: number | null }).relevance ?? null,
          origin: "staged_materialization",
        });
        if (!res.ok) return { success: false, error: res.error, flags: res.flags, action: res.action };
        return { success: true, itemId: res.itemId, flags: res.flags, action: res.action };
      }
      case "update_item": {
        if (!update.item_id) return { success: false, error: "No item_id for update" };
        const { error } = await supabase
          .from("intelligence_items")
          .update(update.proposed_changes ?? {})
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
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
        const { error } = await supabase.from("sources").insert(update.proposed_changes ?? {});
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
