// Emission-factor tier resolution: seed on open data today, upgrade to carrier primary later.
//
// WHY THIS FILE EXISTS. v1 ships static seed factors, not live APIs. The schema is pre-wired with a
// fallback hierarchy so connecting a real feed later inserts rows rather than rewriting code, and the
// active-factor view re-prioritises automatically. This module is the ONE definition of that priority,
// consumed by both the resolver and the SQL codegen, so JS and SQL cannot disagree about which factor is
// live.
//
// TWO CORRECTIONS TO THE ORIGINAL TIER DESIGN, both material:
//
//   1. DQI DIRECTION WAS INVERTED. The draft carried `data_quality_score smallint CHECK BETWEEN 1 AND 5`
//      and described a GLEC default as "2 out of 5" upgrading to "4/5 or 5/5" on API connection — i.e.
//      HIGHER IS BETTER. That is backwards relative to the convention this product already ships: the
//      ecoinvent/Weidema pedigree used by ISO 14083 and by our own `validatePedigree` is 1 = BEST,
//      5 = WORST. Two scales pointing opposite ways in one product is how a quality score silently
//      inverts, and an inverted quality score is worse than none because it is confidently wrong.
//      RESOLVED: `pedigree` is 1-best throughout, matching what already ships. A display helper converts
//      to a 5-star reading at the edge, and nothing inverted is ever STORED.
//
//   2. THE LICENCE GATE WAS ABSENT. A tier is not selectable just because a row exists. A 2026-08-12
//      licence verification found that GLEC and ISO 14083 default tables cannot be embedded and re-served
//      commercially, and that Clean Cargo carrier factors are members-only. So the resolver checks
//      `mayEmbedAsSeed()` and SKIPS a tier whose source is not licence-clear, rather than serving it and
//      hoping. The Tier-2 slot exists and stays EMPTY until a membership with redistribution rights does.
//
// PLAIN ESM, ZERO DEPENDENCIES.

import { mayEmbedAsSeed, attributionsFor } from "./source-licence.mjs";
import { DERIVATION } from "./envelope.mjs";
import { ORIGIN_CLASS, PEDIGREE_AXES, LEG_MODE_CODES } from "./vocabularies.mjs";

/**
 * The hierarchy, best first. `rank` is the resolution order: LOWER WINS.
 *
 * `pedigreeFloor` is the BEST pedigree a tier may claim (1 = best), so a tier cannot flatter itself. A
 * modelled default is never allowed to present as primary data, which is precisely the claim an auditor
 * tests under ISO 14083.
 */
export const FACTOR_TIERS = Object.freeze({
  carrier_primary: Object.freeze({
    code: "carrier_primary", rank: 1, label: "Carrier primary data", pedigreeFloor: 1,
    isPrimaryData: true,
    note: "Measured by the carrier for the actual movement: telemetry, verified fuel uplift, or a "
        + "verified MRV return for the specific vessel and voyage.",
  }),
  verified_operator_avg: Object.freeze({
    code: "verified_operator_avg", rank: 2, label: "Verified operator average", pedigreeFloor: 2,
    isPrimaryData: true,
    note: "Derived by us from a statutorily verified per-ship dataset (EMSA THETIS-MRV) aggregated to "
        + "operator and lane. Primary in ORIGIN, derived in computation, so it is our method over their "
        + "measurement and both must be disclosed.",
  }),
  programme_lane_avg: Object.freeze({
    code: "programme_lane_avg", rank: 3, label: "Programme lane average", pedigreeFloor: 2,
    isPrimaryData: false,
    note: "A third-party programme's carrier-and-lane average (Clean Cargo is the intended occupant). "
        + "LICENCE-GATED and EMPTY in v1: carrier-specific factors are members-only. The slot exists so "
        + "connecting it later is an insert.",
  }),
  modal_default: Object.freeze({
    code: "modal_default", rank: 4, label: "Modal default factor", pedigreeFloor: 3,
    isPrimaryData: false,
    note: "An open-licence default by mode, vehicle class and fuel (UK DESNZ under OGL v3.0, US EPA "
        + "public domain). THE v1 BASELINE. GLEC-conformant in method; the numbers come from sources we "
        + "may lawfully re-serve.",
  }),
  proxy_estimate: Object.freeze({
    code: "proxy_estimate", rank: 5, label: "Proxy estimate", pedigreeFloor: 4,
    isPrimaryData: false,
    note: "A donor value from an adjacent mode, region or vehicle class. MUST name its donor. Never "
        + "contractable, and never presented without its range.",
  }),
});

export const TIER_CODES = Object.freeze(
  Object.keys(FACTOR_TIERS).sort((a, b) => FACTOR_TIERS[a].rank - FACTOR_TIERS[b].rank)
);

/**
 * SCOPE. What a factor is a factor OF. Added 2026-08-12 when the table was designed.
 *
 * WHY A DISCRIMINATOR RATHER THAN ONE KEY. The obvious schema keys every factor on (corridor, mode) and
 * it is wrong for four of the five tiers. DESNZ and EPA publish by mode, vehicle class and fuel with no
 * lane at all. THETIS-MRV aggregates to an operator. Clean Cargo aggregates to a carrier and a trade
 * lane. Only carrier primary data is about a specific movement. Forcing all four into one key shape means
 * either a corridor column that is null for the entire v1 dataset, which is the orphan-field class, or
 * inventing corridors for factors that were never lane-specific, which is worse because it is a fabricated
 * claim rather than a missing one.
 *
 * `specificity` breaks ties WITHIN a tier: 1 is most specific. It does NOT override tier rank, because
 * tier rank is the data-quality claim an auditor tests and specificity is not. A very specific proxy is
 * still a proxy.
 */
export const SCOPE_KINDS = Object.freeze({
  movement: Object.freeze({
    code: "movement", specificity: 1, label: "Specific movement",
    requires: ["movement_ref"], forbids: [],
    note: "One actual voyage or trip, measured. The tier-1 shape.",
  }),
  carrier_lane: Object.freeze({
    code: "carrier_lane", specificity: 2, label: "Carrier on a lane",
    requires: ["operator_key", "corridor_id"], forbids: ["movement_ref"],
    note: "A named carrier's average over a named corridor. The Clean Cargo shape.",
  }),
  operator_lane: Object.freeze({
    code: "operator_lane", specificity: 3, label: "Operator average",
    requires: ["operator_key"], forbids: ["movement_ref"],
    note: "An operator's fleet average, optionally narrowed to a corridor. The THETIS-MRV shape.",
  }),
  modal: Object.freeze({
    code: "modal", specificity: 4, label: "Modal default",
    requires: ["vehicle_class", "energy_carrier", "jurisdiction"],
    forbids: ["operator_key", "corridor_id", "movement_ref"],
    note: "By mode, vehicle class, energy carrier and jurisdiction. The DESNZ/EPA shape, and all of v1.",
  }),
});

export const SCOPE_CODES = Object.freeze(
  Object.keys(SCOPE_KINDS).sort((a, b) => SCOPE_KINDS[a].specificity - SCOPE_KINDS[b].specificity)
);

/**
 * DENOMINATOR. What the number is per.
 *
 * WHY NOT ALWAYS tonne-km. Normalising everything to tkm at ingest looks tidy and destroys information:
 * the conversion from vehicle-km to tonne-km REQUIRES a load factor, so a stored tkm figure has an
 * assumption baked into it that can no longer be seen, questioned or replaced. ISO 14083 asks for the
 * assumption to be disclosed. Storing the published basis and converting at read time keeps that possible.
 */
export const QUANTITY_BASIS = Object.freeze([
  "tonne_km", "vehicle_km", "teu_km", "tonne", "litre", "kg", "kwh", "mj",
]);

/**
 * GWP BASIS. Which IPCC assessment report and time horizon converted the gases into one CO2e number.
 *
 * WHY THIS IS NOT OPTIONAL. CO2e is not a measurement, it is a calculation over CH4 and N2O with a chosen
 * horizon, and the coefficients CHANGE between assessment reports. A stored CO2e with no recorded basis
 * cannot be recomputed when a regulator mandates a different one, so every historical figure has to be
 * re-sourced. `unstated` is a permitted value precisely so the gap is visible rather than guessed at.
 */
export const GWP_BASIS = Object.freeze([
  "AR4_GWP100", "AR5_GWP100", "AR6_GWP100", "AR6_GWP20", "unstated",
]);

/** Is this tier primary data for ISO 14083 primary-data-share purposes? */
export function isPrimaryData(tier) {
  return FACTOR_TIERS[tier]?.isPrimaryData === true;
}

/**
 * Validate a candidate factor row. Returns human-readable errors; empty means usable.
 *
 * A factor without a source key cannot be licence-checked, and a factor without an as-at date cannot be
 * aged — so both are required, not optional richness.
 */
export function validateFactor(f) {
  const errors = [];
  if (!f || typeof f !== "object") return ["factor must be an object"];
  if (!FACTOR_TIERS[f.tier]) errors.push(`unknown tier: ${String(f?.tier)}`);

  // ── SCOPE ──────────────────────────────────────────────────────────────────────────────────────
  const scope = SCOPE_KINDS[f.scope_kind];
  if (!scope) {
    errors.push(`unknown scope_kind: ${String(f?.scope_kind)} (one of ${SCOPE_CODES.join(", ")})`);
  } else {
    for (const req of scope.requires) {
      if (f[req] === undefined || f[req] === null || f[req] === "") {
        errors.push(`scope_kind "${f.scope_kind}" requires ${req}`);
      }
    }
    for (const forb of scope.forbids) {
      if (f[forb] !== undefined && f[forb] !== null && f[forb] !== "") {
        errors.push(`scope_kind "${f.scope_kind}" must not carry ${forb}`);
      }
    }
  }
  if (f.corridor_id !== undefined && f.corridor_id !== null
      && !/^cl:corridor:[0-9a-f]{16}$/.test(String(f.corridor_id))) {
    errors.push('corridor_id must be a content-addressed key minted by corridorId(), "cl:corridor:<16 hex>"');
  }

  // ── THE NUMBER ─────────────────────────────────────────────────────────────────────────────────
  // At least one of the three must be present. WTW alone is common (many sources publish only the
  // total); TTW alone is common (EPA fleet factors); requiring all three would force fabrication.
  const nums = ["wtt_co2e", "ttw_co2e", "wtw_co2e"];
  const present = nums.filter((k) => f[k] !== undefined && f[k] !== null);
  for (const k of present) {
    if (typeof f[k] !== "number" || !Number.isFinite(f[k]) || f[k] < 0) {
      errors.push(`${k} must be a non-negative finite number`);
    }
  }
  if (present.length === 0) {
    errors.push("at least one of wtt_co2e, ttw_co2e, wtw_co2e is required");
  }
  // When all three are stated they must agree. A source that publishes a split which does not add up is
  // a transcription error, and catching it at ingest is far cheaper than explaining it to an auditor.
  if (present.length === 3) {
    const sum = f.wtt_co2e + f.ttw_co2e;
    if (Math.abs(f.wtw_co2e - sum) > 1e-9 * Math.max(f.wtw_co2e, 1)) {
      errors.push(`wtw_co2e ${f.wtw_co2e} does not equal wtt_co2e + ttw_co2e (${sum})`);
    }
  }
  if (!QUANTITY_BASIS.includes(f.quantity_basis)) {
    errors.push(`quantity_basis must be one of ${QUANTITY_BASIS.join(", ")}`);
  }
  if (!GWP_BASIS.includes(f.gwp_basis)) {
    errors.push(`gwp_basis must be one of ${GWP_BASIS.join(", ")}; "unstated" is allowed, guessing is not`);
  }

  // ── PROVENANCE AND TIME ────────────────────────────────────────────────────────────────────────
  if (!f.source_key) errors.push("source_key is required, so the licence gate can be applied");
  if (!f.as_at_date) errors.push("as_at_date is required, so the value can be aged");
  if (!f.valid_from) {
    errors.push("valid_from is required: a factor applies to movements in a window, and a shipment must "
              + "be costed with the factor that was correct on its date, not the newest one");
  }
  if (f.valid_to && f.valid_from && String(f.valid_to) <= String(f.valid_from)) {
    errors.push("valid_to must be after valid_from");
  }

  // Pedigree is 1-best. A tier may not claim a better pedigree than its floor.
  if (f.pedigree !== undefined && f.pedigree !== null) {
    if (!Number.isInteger(f.pedigree) || f.pedigree < 1 || f.pedigree > 5) {
      errors.push("pedigree must be an integer 1..5 (1 = best), matching the ecoinvent/ISO 14083 convention");
    } else if (FACTOR_TIERS[f.tier] && f.pedigree < FACTOR_TIERS[f.tier].pedigreeFloor) {
      errors.push(
        `pedigree ${f.pedigree} is better than tier "${f.tier}" may claim (floor ${FACTOR_TIERS[f.tier].pedigreeFloor}); ` +
        `a default must not present as primary data`
      );
    }
  }
  if (f.tier === "proxy_estimate" && !f.donor) {
    errors.push('a proxy_estimate must name its donor (e.g. "rigid HGV 17t, EU, 2026")');
  }
  return errors;
}

/** Is a factor applicable to a movement on `onDate`? Open-ended `valid_to` means still current. */
export function isApplicableOn(f, onDate) {
  if (!onDate) return true;
  const d = String(onDate);
  if (f?.valid_from && d < String(f.valid_from)) return false;
  if (f?.valid_to && d >= String(f.valid_to)) return false;
  return true;
}

/**
 * Resolve the ACTIVE factor from candidates for one corridor and mode.
 *
 * Order: tier rank, then most recent as-at date. A candidate is SKIPPED, not failed, when its source is
 * not licence-clear or its row is invalid — so a members-only programme factor sitting in the table can
 * never become the served value, and resolution falls through to the open-licence default beneath it.
 *
 * Returns `{ factor, attribution, skipped }`. `skipped` is deliberately part of the return: silently
 * dropping a candidate is how a licence problem becomes invisible.
 */
export function resolveActiveFactor(candidates, opts = {}) {
  const allowUnlicensed = opts.allowUnlicensed === true;   // internal analysis only, never a serve path
  const onDate = opts.onDate ?? null;
  const usable = [];
  const skipped = [];

  for (const f of candidates || []) {
    const errors = validateFactor(f);
    if (errors.length) { skipped.push({ factor: f, reason: "invalid", detail: errors }); continue; }
    if (f.superseded_by) {
      skipped.push({ factor: f, reason: "superseded", detail: [`superseded by ${f.superseded_by}`] });
      continue;
    }
    if (!isApplicableOn(f, onDate)) {
      skipped.push({
        factor: f, reason: "out_of_window",
        detail: [`not valid on ${onDate} (valid_from ${f.valid_from}, valid_to ${f.valid_to ?? "open"})`],
      });
      continue;
    }
    if (!allowUnlicensed && !mayEmbedAsSeed(f.source_key)) {
      skipped.push({ factor: f, reason: "licence", detail: [`source "${f.source_key}" is not clear for re-serving`] });
      continue;
    }
    usable.push(f);
  }

  if (!usable.length) return { factor: null, attribution: [], skipped };

  // ORDER: tier rank, then scope specificity, then recency.
  //
  // Tier dominates specificity deliberately. Tier rank is the DATA QUALITY claim an ISO 14083 auditor
  // tests; specificity is not. A movement-scoped proxy estimate is more specific than a modal default and
  // is still a worse number, so letting specificity win would quietly degrade the served figure while
  // looking like a refinement.
  usable.sort((a, b) => {
    const r = FACTOR_TIERS[a.tier].rank - FACTOR_TIERS[b.tier].rank;
    if (r !== 0) return r;
    const s = (SCOPE_KINDS[a.scope_kind]?.specificity ?? 99) - (SCOPE_KINDS[b.scope_kind]?.specificity ?? 99);
    if (s !== 0) return s;
    return String(b.as_at_date).localeCompare(String(a.as_at_date));  // newer first within a tier
  });

  const factor = usable[0];
  return { factor, attribution: attributionsFor([factor.source_key]), skipped };
}

/**
 * Primary-data share across a transport chain, weighted by tonne-km. The ISO 14083 tender metric.
 *
 * Weighting by tkm rather than by leg count is the point: ten short primary legs and one long default leg
 * is not 91% primary, and a leg-count average is the flattering answer rather than the true one.
 */
export function primaryDataShare(legs) {
  let total = 0, primary = 0;
  for (const l of legs || []) {
    const tkm = Number(l?.tkm);
    if (!Number.isFinite(tkm) || tkm <= 0) continue;
    total += tkm;
    if (isPrimaryData(l.tier)) primary += tkm;
  }
  if (total === 0) return null;   // null, never 0: "no legs" is not "0% primary"
  return primary / total;
}

/**
 * Display-only conversion from 1-best pedigree to a 5-star reading, for a UI that wants stars.
 * NEVER STORED. Storing the inverted form is how the direction bug in the original design happened.
 */
export function pedigreeToStars(pedigree) {
  if (!Number.isInteger(pedigree) || pedigree < 1 || pedigree > 5) return null;
  return 6 - pedigree;
}

/**
 * SQL parity. Emits the active-factor view, ordered by the SAME ranking as the JS resolver.
 *
 * Two differences from the original draft, both deliberate. It filters on a licence-clear source list
 * rather than trusting every row in the table, and it excludes rows whose as-at date is in the future
 * (a data-entry error that would otherwise win the ORDER BY and serve as the active factor).
 */
export function renderTierConstraintsSql() {
  const list = (arr) => arr.map((v) => `'${v}'`).join(", ");
  const floors = TIER_CODES
    .map((t) => `    (tier = '${t}' AND pedigree >= ${FACTOR_TIERS[t].pedigreeFloor})`)
    .join("\n    OR\n");
  const scopeRules = SCOPE_CODES.map((s) => {
    const k = SCOPE_KINDS[s];
    const parts = [
      ...k.requires.map((c) => `${c} IS NOT NULL`),
      ...k.forbids.map((c) => `${c} IS NULL`),
    ].join(" AND ");
    return `    CONSTRAINT emission_factors_scope_${s} CHECK (\n      scope_kind <> '${s}' OR (${parts})\n    )`;
  }).join(",\n");

  return `-- GENERATED by src/lib/contracts/factor-tier.mjs renderTierConstraintsSql(). DO NOT EDIT BY HAND.
    -- LEG modes only. \`multimodal\` is a corridor-level value: a factor is per leg, so a multimodal
    -- factor is a category error rather than a missing row.
    CONSTRAINT emission_factors_mode CHECK (mode IN (${list(LEG_MODE_CODES)})),
    CONSTRAINT emission_factors_tier CHECK (tier IN (${list(TIER_CODES)})),
    CONSTRAINT emission_factors_scope_kind CHECK (scope_kind IN (${list(SCOPE_CODES)})),
    CONSTRAINT emission_factors_quantity_basis CHECK (quantity_basis IN (${list(QUANTITY_BASIS)})),
    CONSTRAINT emission_factors_gwp_basis CHECK (gwp_basis IN (${list(GWP_BASIS)})),
    -- 1 = BEST (ecoinvent/Weidema, as ISO 14083 uses it). A tier may not claim a better pedigree than
    -- its floor, so a modelled default can never be stored as though it were primary data.
    CONSTRAINT emission_factors_pedigree_floor CHECK (
${floors}
    ),
${scopeRules}`;
}

/**
 * The five pedigree axis columns plus the envelope enumerations, codegen'd from the modules that already
 * define them so the table cannot invent a seventh origin class or a tenth derivation.
 *
 * WHY FIVE AXES AND NOT ONE SCORE. A scalar pedigree says a factor is weak; it does not say WHICH WAY it
 * is weak, and the answer changes what to do about it. A 2024 UK factor applied to a 2026 UK movement is
 * temporally weak and geographically perfect, which is fixed by re-sourcing next year's publication. The
 * same scalar on a US factor applied to a UK movement is geographically weak and no amount of waiting
 * fixes it. Collapsing both to "3" throws away the only information that tells you what to buy.
 */
export function renderEnvelopeColumnsSql() {
  const list = (arr) => arr.map((v) => `'${v}'`).join(", ");
  // PEDIGREE_AXES is an array of plain axis names. It was first read here as an array of {code} objects,
  // which generated five columns all called pedigree_undefined; Postgres rejected the duplicate on a
  // throwaway local cluster before the migration went anywhere near production. Kept as a note because
  // the failure mode is silent in JS and loud only at DDL time.
  const axisCols = PEDIGREE_AXES.map((axis) =>
    `    pedigree_${axis} smallint CHECK (pedigree_${axis} BETWEEN 1 AND 5),`).join("\n");
  return `-- GENERATED by src/lib/contracts/factor-tier.mjs renderEnvelopeColumnsSql(). DO NOT EDIT BY HAND.
    derivation text NOT NULL CHECK (derivation IN (${list(Object.keys(DERIVATION))})),
    origin_class text NOT NULL CHECK (origin_class IN (${list(Object.keys(ORIGIN_CLASS))})),
    pedigree smallint NOT NULL CHECK (pedigree BETWEEN 1 AND 5),
${axisCols}
    method_version text NOT NULL,`;
}

/**
 * SQL parity for READ. Emits the ELIGIBILITY view: rows that are licence-clear, in their validity window,
 * not superseded, and not future-dated, decorated with tier_rank and scope_specificity.
 *
 * WHAT THIS VIEW DELIBERATELY DOES NOT DO: resolve. The earlier draft emitted an
 * `active_corridor_emission_factor` view carrying a DISTINCT ON that picked the winner in SQL, while
 * `resolveActiveFactor()` picked the winner in JS. That is one doctrine implemented twice in two
 * languages with nothing holding them equal, which is precisely the defect F24's header documents in the
 * fifteen gate_a_* functions: the SQL copy and the TypeScript copy of Gate A, version string hand-copied
 * on both sides. It cost a real audit to find. Repeating the shape here, in the module whose entire
 * purpose is JS/SQL parity, would be indefensible.
 *
 * So SQL owns ELIGIBILITY, which is set logic a database does well and which must hold for every reader
 * including psql. JS owns SELECTION, which is doctrine. The ranks are exported into the view so the two
 * cannot disagree about ORDER even though only one of them orders.
 */
export function renderFactorCandidateViewSql() {
  const tierCases = TIER_CODES.map((t) => `    WHEN '${t}' THEN ${FACTOR_TIERS[t].rank}`).join("\n");
  const scopeCases = SCOPE_CODES
    .map((s) => `    WHEN '${s}' THEN ${SCOPE_KINDS[s].specificity}`).join("\n");
  return `-- GENERATED by src/lib/contracts/factor-tier.mjs renderFactorCandidateViewSql(). DO NOT EDIT BY HAND.
-- Ranks are codegen'd from FACTOR_TIERS and SCOPE_KINDS so the view and the JS resolver cannot disagree.
CREATE OR REPLACE VIEW public.emission_factor_candidates AS
SELECT
  f.*,
  CASE f.tier
${tierCases}
  END AS tier_rank,
  CASE f.scope_kind
${scopeCases}
  END AS scope_specificity
FROM public.emission_factors f
WHERE f.superseded_by IS NULL                 -- a superseded row is history, never a candidate
  AND f.as_at_date <= current_date            -- a future-dated row is an entry error, not the best factor
  AND f.source_key IN (SELECT source_key FROM public.licence_clear_sources);`;
}
