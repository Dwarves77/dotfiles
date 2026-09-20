// SHARED-WRITER: item_forward_events
// mint-enrichment.ts -- rule-16 enrichment (discovery + forward-event extraction), the ONE shared
// implementation both mint paths call so a batch-minted item receives the identical unconditional
// post-insert participation a single mint always has (audit stage-audit-2026-09-18/s2-mint-gate.md
// finding 4: apply-mint-batch.mjs's own path skipped rule-16 discovery/forward-events entirely; lane M3,
// 2026-09-19, build plan section 6.1 row M3, item 4). This file's OWN direct write is item_forward_events
// only (the SHARED-WRITER line above); connection discovery's own item_cross_references write happens
// inside the imported run-discovery.mjs/write-edges.mjs (that pair's own SHARED-WRITER, unchanged by this
// lane), never duplicated here.
//
// EXTRACTED FROM mint-item.ts (this repo's ONE mint chokepoint, F13-single-mint-chokepoint.mjs), lines
// 307-377 per the stage audit: rule 16(a) connection discovery and rule 16(b) forward-event extraction,
// moved here VERBATIM in behaviour (same calls, same non-fatal try/catch, same recordFlywheelDefect
// posture). mint-item.ts now calls this function instead of running the two blocks inline; nothing about
// what it does or how it fails changed. This does NOT include rule 16(c) compliance-deadline sync, 16(e)
// entity linking, or 16(f) timeline backfill -- the audit's finding 4 and this lane's brief scope the
// "rule-16 enrichment" gap to discovery + forward-events only (apply-mint-batch.mjs's own header:
// "discovery scoring or forward-event extraction... this script has no DB creds for [them] and is not the
// right place to add them" -- that gap is what this module closes).
//
// EVERY IMPORT BELOW IS A RELATIVE PATH, NEVER AN "@/..." ALIAS. apply-mint-batch.mjs (the batch mint
// path) is a plain `node` script with no bundler/jiti loader for that alias -- see its own imports of
// "../../src/lib/domains.ts" for the established precedent of a plain-node-importable src/lib file. This
// module must resolve identically whether Next.js's webpack loads it (via mint-item.ts's own
// "@/lib/intake/mint-enrichment.ts" import) or plain `node` loads it directly (via apply-mint-batch.mjs's
// relative import). run-discovery.mjs and read-and-extract.mjs already import only relative paths
// themselves; flywheel-defect.ts's own single "@/..." import was corrected to a relative path in this same
// lane so it, too, is plain-node-importable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { runConnectionDiscovery } from "../connections/run-discovery.mjs";
import { readAndExtractForwardEvents } from "../forward-events/read-and-extract.mjs";
import { recordFlywheelDefect } from "./flywheel-defect.ts";

/** The subset of a minted item's own fields the discovery scorer reads (mint-item.ts's own
 *  `newItemSignature` shape, unchanged). Every field is optional: apply-mint-batch.mjs's record-grade
 *  kit does not populate operational_scenario_tags/compliance_object_tags/jurisdictions/topic_tags, and
 *  discover-for-items.mjs's scorer already tolerates their absence. */
export interface MintItemSignature {
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
