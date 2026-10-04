// lineage-backfill.mjs — pure partition/upgrade-decision logic for the WO-28 phase D $0 backfill
// (scripts/entities/backfill-lineage-edges.mjs). Extracted into its own module (rather than left inline in
// the script) because this is the ONE piece of the backfill that carries real decision logic — everything
// else in the script is I/O orchestration (load rows, call the runtime's own planLinkWrites, print a
// report). Pure + dep-injected (no DB import here) so it is unit-tested without a database, mirroring how
// entity-resolve.mjs itself stays pure and dep-injected.
//
// THE DECISION THIS MAKES: item_cross_references is unique on (source_item_id, target_item_id), ONE row
// per ordered pair shared across every origin (manual / agent_semantic / entity_extraction /
// provenance_discovery — migration 252's CHECK). This backfill and the linkStep runtime BOTH write
// origin='entity_extraction' (planLinkWrites hardcodes it — see entity-resolve.mjs). A pair already carrying
// entity_extraction is OURS: re-running the same planner over it may now produce a MORE SPECIFIC typed
// relationship (implements/amends/depends_on) than the untyped 'related' an earlier entity-extraction pass
// left behind — WO-28 phase 1's whole point — so it gets UPGRADED (relationship + basis). A pair absent
// entirely gets INSERTED. A pair owned by any OTHER origin (manual/agent_semantic/provenance_discovery) is
// a different subsystem's edge with its own more-specific semantics; touching it would be exactly the
// blind-upsert bug write-edges.mjs's ORIGIN OWNERSHIP note documents for the sibling connection-discovery
// backfill, so it is SKIPPED and counted, never clobbered. A pair already entity_extraction AND already
// carrying the SAME relationship+basis this run would produce is UNCHANGED — no write, idempotent re-runs.

// The origin THIS backfill (and the linkStep runtime) writes. Pairs at this origin are "ours" and may be
// upgraded; every other origin value is foreign and must never be touched by this module.
export const LINEAGE_BACKFILL_ORIGIN = "entity_extraction";

export function pairKey(source, target) {
  return `${source}|${target}`;
}

// undefined and null both mean "no basis" (planLinkWrites omits the `basis` key entirely for an untyped
// 'related' edge — see its `...(e.basis ? { basis: e.basis } : {})` spread) — normalize before comparing.
function basisEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const byPair = (a, b) => pairKey(a.source_item_id, a.target_item_id).localeCompare(pairKey(b.source_item_id, b.target_item_id));

/**
 * Partition the item_cross_references rows inside a planLinkWrites() plan against the LIVE edge set,
 * deciding insert / upgrade / skip-foreign / unchanged for each. integrity_flags rows in `writes` are
 * ignored here (flag dedup is its own, simpler, one-open-per-namespace rule — handled in the script).
 *
 * @param {Array<{table:string, row:object}>} writes - planLinkWrites()'s full return value (edges + flags mixed)
 * @param {Map<string,{id:string, origin:string, relationship:string, basis?:any}>} existingEdgesByPair
 *   keyed by pairKey(source_item_id, target_item_id) — the live item_cross_references rows for the pairs
 *   this run might touch (caller loads this once, up front, per rule-015's prior-state-snapshot posture).
 * @returns {{
 *   inserts: Array<object>,                                            // full row objects, ready for guardedInsertMany
 *   upgrades: Array<{id, source_item_id, target_item_id, relationship, basis}>, // one guardedUpdate call each (patches differ per row)
 *   skippedForeign: Array<{source_item_id, target_item_id, foreignOrigin}>,
 *   unchanged: Array<{id, source_item_id, target_item_id}>,
 * }}
 */
export function partitionLineageWrites(writes, existingEdgesByPair) {
  const edgeWrites = (writes || []).filter((w) => w && w.table === "item_cross_references");
  const inserts = [];
  const upgrades = [];
  const skippedForeign = [];
  const unchanged = [];

  for (const w of edgeWrites) {
    const row = w.row;
    const key = pairKey(row.source_item_id, row.target_item_id);
    const existing = existingEdgesByPair ? existingEdgesByPair.get(key) : undefined;

    if (!existing) {
      inserts.push(row);
      continue;
    }
    if (existing.origin !== LINEAGE_BACKFILL_ORIGIN) {
      skippedForeign.push({ source_item_id: row.source_item_id, target_item_id: row.target_item_id, foreignOrigin: existing.origin });
      continue;
    }
    // ours — upgrade iff the typed relationship or its basis actually differs from what's already stored.
    if (existing.relationship === row.relationship && basisEqual(existing.basis, row.basis)) {
      unchanged.push({ id: existing.id, source_item_id: row.source_item_id, target_item_id: row.target_item_id });
      continue;
    }
    upgrades.push({
      id: existing.id,
      source_item_id: row.source_item_id,
      target_item_id: row.target_item_id,
      relationship: row.relationship,
      basis: row.basis ?? null,
    });
  }

  // Deterministic ordering (by source|target pair) — makes the report and the rule-015 snapshot
  // reproducible across runs of the SAME input, independent of Map/array iteration order.
  inserts.sort(byPair);
  upgrades.sort(byPair);
  skippedForeign.sort(byPair);
  unchanged.sort(byPair);

  return { inserts, upgrades, skippedForeign, unchanged };
}

// ── ABSENT-PARENT GAP FLAGS -> DISCOVERY TARGETS (lane s2a-typed-edges, 2026-10-04) ─────────────────────
// planLinkWrites (entity-resolve.mjs) raises ONE aggregated integrity_flags row per item, namespace
// created_by='lineage-gap:absent-parent', whenever a lineage-typed identifier mention (implements /
// amends / depends_on) resolves to NO held item. Until this function nothing consumed that flag: it sat
// open forever whether or not the parent was later acquired. This is the pure half of the consumer
// (scripts/maintenance/lineage-gap-targets.mjs is the I/O half): it turns the open flags into
// discovery targets (identifier, citing item, relationship) and decides which flags are already
// resolvable because every parent they name is now held. No flag waits on a person: a held parent
// resolves the flag by rule, an absent parent is a target by rule, and a flag this function cannot
// parse is reported as residue with its reason, never silently dropped and never a blocker.
//
// Held-ness uses the SAME resolver the linker uses (resolve() in entity-resolve.mjs, identifier kind):
// a parent is held when it resolves to one OR MORE corpus items (an ambiguous parent is still not
// absent; the linker's own one-item wiring rule is a separate, stricter question about wiring an edge).
import { resolve as resolveMention } from "./entity-resolve.mjs";

export const LINEAGE_GAP_CREATED_BY = "lineage-gap:absent-parent";

// recommended_actions rationale written by planLinkWrites: `item ${relationship} ${mention}, which does
// not resolve to any item in the corpus` (never truncated per action; the description IS truncated at
// 480 chars, so actions are the primary source and the description only a fallback).
const GAP_ACTION_RE = /^item (\w+) (.+), which does not resolve to any item in the corpus$/;
// description fallback: `...: ${mention} (${relationship}), ${mention} (${relationship})`
const GAP_DESC_ITEM_RE = /([^,():]+?) \((\w+)\)(?:,|$)/g;

/**
 * Extract the (identifier, relationship) mentions one lineage-gap flag names. Pure.
 * @param {{recommended_actions?: any, description?: string}} flag
 * @returns {Array<{identifier:string, relationship:string}>} empty when the flag carries nothing parseable
 */
export function parseLineageGapFlag(flag) {
  const out = [];
  const actions = Array.isArray(flag?.recommended_actions) ? flag.recommended_actions : [];
  for (const a of actions) {
    const m = GAP_ACTION_RE.exec(String(a?.rationale ?? ""));
    if (m) out.push({ relationship: m[1], identifier: m[2].trim() });
  }
  if (out.length) return out;
  const desc = String(flag?.description ?? "");
  const idx = desc.indexOf(": ");
  if (idx === -1) return out;
  for (const m of desc.slice(idx + 2).matchAll(GAP_DESC_ITEM_RE)) out.push({ identifier: m[1].trim(), relationship: m[2] });
  return out;
}

/**
 * @param {Array<{id:string, subject_ref:string, created_by?:string, recommended_actions?:any, description?:string}>} openFlags
 *   OPEN lineage-gap flags (the caller filters status; a row of another created_by namespace is ignored here)
 * @param {Array<{id:string, title?:string|null, instrument_identifier?:string|null}>} corpus held (non-archived) items
 * @returns {{
 *   targets: Array<{identifier:string, relationship:string, citing_item_id:string, flag_id:string}>,
 *   resolvable: Array<{flag_id:string, citing_item_id:string, parents:Array<{identifier:string, relationship:string, parent_item_ids:string[]}>}>,
 *   residue: Array<{flag_id:string, citing_item_id:string|null, reason:string}>
 * }} sorted deterministically; `targets` is the discovery list (parents still absent)
 */
export function planLineageGapTargets(openFlags, corpus) {
  const targets = [];
  const resolvable = [];
  const residue = [];
  for (const flag of Array.isArray(openFlags) ? openFlags : []) {
    if (!flag || typeof flag.id !== "string") continue;
    if (flag.created_by !== undefined && flag.created_by !== LINEAGE_GAP_CREATED_BY) continue;
    const citing = typeof flag.subject_ref === "string" && flag.subject_ref ? flag.subject_ref : null;
    const mentions = parseLineageGapFlag(flag);
    if (!citing || !mentions.length) {
      residue.push({ flag_id: flag.id, citing_item_id: citing, reason: !citing ? "flag has no subject_ref" : "flag names no parseable parent instrument" });
      continue;
    }
    const held = [];
    const absent = [];
    for (const m of mentions) {
      const r = resolveMention({ kind: "identifier", value: m.identifier, canonical: m.identifier }, corpus, citing);
      if (r.count >= 1) held.push({ ...m, parent_item_ids: r.ids.slice().sort() });
      else absent.push(m);
    }
    for (const m of absent) targets.push({ identifier: m.identifier, relationship: m.relationship, citing_item_id: citing, flag_id: flag.id });
    if (!absent.length) resolvable.push({ flag_id: flag.id, citing_item_id: citing, parents: held });
  }
  const byKey = (a, b) => `${a.citing_item_id}|${a.identifier}`.localeCompare(`${b.citing_item_id}|${b.identifier}`);
  targets.sort(byKey);
  resolvable.sort((a, b) => a.flag_id.localeCompare(b.flag_id));
  residue.sort((a, b) => a.flag_id.localeCompare(b.flag_id));
  return { targets, resolvable, residue };
}
