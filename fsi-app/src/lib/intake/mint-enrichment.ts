import type { SupabaseClient } from "@supabase/supabase-js";
import { runConnectionDiscovery } from "../connections/run-discovery.mjs";
import { readAndExtractForwardEvents } from "../forward-events/read-and-extract.mjs";
import { recordFlywheelDefect } from "./flywheel-defect.ts";

/** The subset of a minted item's own fields the discovery scorer reads (mint-item.ts's own
 *  `newItemSignature` shape, unchanged). Every field is optional: apply-mint-batch.mjs's record-grade
 *  kit does not populate operational_scenario_tags/compliance_object_tags/jurisdictions/topic_tags, and
 *  discover-for-items.mjs's scorer already tolerates their absence. */
interface MintItemSignature {
  id: string;
  item_type?: unknown;
  canonical_instrument_key?: unknown;
  source_id?: unknown;
  operational_scenario_tags?: unknown;
  compliance_object_tags?: unknown;
  jurisdictions?: unknown;
  jurisdiction_iso?: unknown;
  topic_tags?: unknown;
  // Index signature: runConnectionDiscovery's own JSDoc types its signature param as
  // Record<string, unknown> (run-discovery.mjs) -- this interface documents the SPECIFIC fields both
  // mint paths actually populate, but must remain assignable to that wider, unconstrained shape.
  [key: string]: unknown;
}

/**
 * Rule-16 enrichment (discovery + forward-event extraction), unconditional, non-fatal per step -- run
 * exactly once per minted item, by either mint path. Returns the flags the caller pushes onto its own
 * result (mint-item.ts's `flags` array; apply-mint-batch.mjs's per-item outcome). Never throws: every
 * step is independently try/catch'd and a failure is recorded via recordFlywheelDefect, the SAME
 * non-fatal posture mint-item.ts's inline blocks always had.
 */
export async function runMintEnrichment(
  sb: SupabaseClient,
  itemId: string,
  signature: MintItemSignature
): Promise<string[]> {
  const flags: string[] = [];

  // -- rule 16(a): connection discovery -----------------------------------------------------------------
  try {
    const written = await runConnectionDiscovery(sb, itemId, signature);
    if (written > 0) flags.push(`discovery:${written}`);
  } catch (e: unknown) {
    await recordFlywheelDefect(sb, itemId, "discovery", e instanceof Error ? e.message : String(e));
    flags.push("discovery-failed");
  }

  // -- rule 16(b): forward-event extraction -------------------------------------------------------------
  try {
    const { events } = await readAndExtractForwardEvents(sb, itemId);
    if (events.length) {
      const rows = events.map((ev: object) => ({ intelligence_item_id: itemId, ...(ev as Record<string, unknown>) }));
      const { error: fwdErr } = await sb.from("item_forward_events").insert(rows);
      if (fwdErr) throw new Error(`item_forward_events insert failed: ${fwdErr.message}`);
      flags.push(`forward-events:${events.length}`);
    }
  } catch (e: unknown) {
    await recordFlywheelDefect(sb, itemId, "forward-events", e instanceof Error ? e.message : String(e));
    flags.push("forward-events-failed");
  }

  return flags;
}
