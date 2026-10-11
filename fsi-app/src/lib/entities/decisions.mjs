/**
 * ADR-024 decision 1 (spec §8.1): drain granularity is BATCH TO A QUIESCENT POINT, not per-event.
 * Reader notice is the product; five notices for one causal event is noise, not five insights.
 * Consumed by `runPropagationDrain(caller, {mode, batch})` in DP-ENGINE's src/lib/propagation/drain.ts.
 * Only two values are meaningful; the type is documented here rather than widened speculatively.
 * @type {"batch"}
 */

export const DRAIN_MODE = "batch";

/**
 * ADR-024 decision 2 (spec §8.2): `estimated_values` NEVER backs a customer-visible point decision —
 * only a customer-visible RANGE (a bare point is never shown for an estimate).
 * Consumed by DP-SURF's `<EstimatedFigure>` (always renders low/high; no point-only mode).
 * @type {"range"}
 */
export const ESTIMATE_DISPLAY = "range";

/**
 * ADR-024 decision 3 (spec §8.3, §3.3's `FLOOR[use]`): the confidence floor per admissibility use.
 * `effectiveConfidence(v, now) < FLOOR[use]` refuses admission (spec §3.3's `admissibleFor`). Higher
 * stakes require less-decayed evidence: filing (customer-facing, defensible in an audit) needs the
 * least decay tolerance; analysis (exploratory, internal) tolerates the most. See ADR-024 for the
 * half-life arithmetic that motivated these three specific numbers over other candidates.
 * @type {{ analysis: number, calculation: number, filing: number }}
 */
export const FLOOR = Object.freeze({
  analysis: 0.50,
  calculation: 0.75,
  filing: 0.90,
});

/**
 * ADR-024 decision 4 (spec §8.4, §1.2): corridor identity is the UN/LOCODE PORT-PAIR + MODE (not
 * Xeneta-style price-correlation clustering — harder to explain to a customer for a marginal analytical
 * gain). The id itself is minted by `entityId('corridor', seed)` in ./entity-id.mjs; this constant
 * documents the SCHEME so a reader does not have to reconstruct it from the hash call site, and so
 * DP-ENGINE/DP-SURF can assert against the documented shape rather than a magic literal.
 *
 * NOT the same key as `emission_factors.corridor_id` (migration 258's `cl_corridor_id()`), which is
 * DELIBERATELY finer-grained — it additionally hashes `leg_ordinal`/`routing_key`/`via[]` so a Suez
 * routing and a Cape routing between the same two ports hash differently, because a factor genuinely
 * differs by route. The entity-spine corridor is the coarser PORT-PAIR+MODE identity two independent
 * ingest paths agree on with zero coordination, for cross-surface linking (Market Intel, Operations).
 * Both key shapes match `^cl:corridor:[0-9a-f]{16}$` (migration 258's own CHECK), so either can sit in
 * the `entities.entity_id` column format-wise; only THIS shape is ever minted into `entities`. Reconciling
 * the two (e.g. an attribute table from a fine-grained factor corridor to its coarse spine entity) is
 * named, not built, in ADR-024 — v1 scope is deliberately narrow.
 * @type {{ basis: string, seedFormat: string, hashAlgorithm: string, hashHexLength: number, idPrefix: string }}
 */
export const CORRIDOR_ID_SCHEME = Object.freeze({
  basis: "UN/LOCODE port-pair + mode",
  seedFormat: "ORIGIN-DEST:mode", // origin/dest UN/LOCODE upper, mode lower-canonical (never sea/maritime)
  hashAlgorithm: "sha256",
  hashHexLength: 16,
  idPrefix: "cl:corridor:",
});
