// origin-class-map.mjs — the item_type + sources.tier -> origin_class rule table, as pure code.
//
// WHY THIS IS NEW LOGIC, NOT A WRAPPED SCRIPT (Lane MAINT, 2026-09-02). `grep -rn origin_class
// fsi-app/scripts` (run this session) finds only CONSUMERS of origin_class (propagation/seed-derived-
// values.mjs, the market/regional producers, the migration-267/268/271 generators) — no script anywhere
// in the repo implements the WO-19 backfill itself. docs/plans/wo19-origin-class-backfill-mapping.md §4
// gives the mapping as raw SQL for a coordinator to run directly against the live database; migration
// 267's own header confirms "NO BACKFILL HERE... runs as a separate, later pass." This module is that
// missing translation — the SAME rule table, transcribed 1:1 from the plan's §2 table / §4 CASE
// statement, as a pure function a guarded script can call. Every branch below cites the exact plan row
// it mirrors; do not add a branch that isn't in that document (the plan is explicit that widening the
// mapping beyond item_type+tier is exactly the "guessing" it forbids — Addendum 26).
//
// `tool` is deliberately unmapped (plan §2's own flagged row: "not ruled on... needs an explicit
// operator ruling before it can leave NULL") — returns null here, same as every other cell the plan
// itself leaves NULL. A null `source_id` (no tier to read) is the CALLER's job to short-circuit before
// ever calling this (mirrors the plan's own `WHEN ii.source_id IS NULL THEN NULL` first line) — this
// function only encodes the item_type/tier cross-tabulation, not the source_id-null special case.

/**
 * @param {string} itemType one of intelligence_items.item_type's 12 CHECK values
 * @param {number|null|undefined} tier sources.tier (1-7), or null/undefined when unknown
 * @returns {"official"|"partner"|"verified"|"community-corroborated"|"derived"|null}
 */
export function originClassFor(itemType, tier) {
  if (tier == null) return null;
  switch (itemType) {
    // plan §2 row 1-3: regulation/directive/standard — T1/T2 official, everything else NULL (pre-vocabulary).
    case "regulation":
    case "directive":
    case "standard":
      return tier === 1 || tier === 2 ? "official" : null;

    // plan §2 row 4-7: guidance/framework — T1-T3 official, T5 partner, T4/T6/T7 NULL.
    case "guidance":
    case "framework":
      if (tier === 1 || tier === 2 || tier === 3) return "official";
      if (tier === 5) return "partner";
      return null;

    // plan §2 row 8-11: research_finding — T1-T4 verified, T5 community-corroborated, T6/T7 NULL.
    case "research_finding":
      if (tier >= 1 && tier <= 4) return "verified";
      if (tier === 5) return "community-corroborated";
      return null;

    // plan §2 row 12-13: market_signal — T1-T6 community-corroborated unconditionally, T7 NULL.
    case "market_signal":
      return tier >= 1 && tier <= 6 ? "community-corroborated" : null;

    // plan §2 row 14-16: regional_data — T1-T3 official, T4/T5 derived, T6/T7 NULL.
    case "regional_data":
      if (tier === 1 || tier === 2 || tier === 3) return "official";
      if (tier === 4 || tier === 5) return "derived";
      return null;

    // plan §2 row 17-19: technology/innovation — T1-T3 verified, T4/T5 community-corroborated, T6/T7 NULL.
    case "technology":
    case "innovation":
      if (tier === 1 || tier === 2 || tier === 3) return "verified";
      if (tier === 4 || tier === 5) return "community-corroborated";
      return null;

    // plan §2 row 20-22: initiative — T1-T3 official, T4/T5 partner, T6/T7 NULL.
    case "initiative":
      if (tier === 1 || tier === 2 || tier === 3) return "official";
      if (tier === 4 || tier === 5) return "partner";
      return null;

    // plan §2 row 23: tool — NOT RULED ON. Left NULL until an operator ruling (see this file's header).
    case "tool":
      return null;

    // Any item_type the plan's table doesn't name (there is none live today — the 12 CHECK values are
    // all covered above) also stays NULL rather than guessed.
    default:
      return null;
  }
}

/** The 7 live origin_class vocabulary values this function ever returns (never widened — Addendum 26). */
export const ORIGIN_CLASS_OUTPUTS = Object.freeze(["official", "partner", "verified", "community-corroborated", "derived"]);
