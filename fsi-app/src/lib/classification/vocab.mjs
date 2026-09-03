// vocab.mjs — closed vocabularies for the 5-axis source-classification framework's still-unbuilt
// axes (docs/plans/source-classification-framework-2026-05-10.md). Axis 1 (role) already has a live
// classifier (src/lib/sources/classify-source-role.ts) and Axis 2 (tier)'s role->tier mapping was
// explicitly SUPERSEDED 2026-06-01 (that doc's own inline note: base_tier is independently set, never
// derived from source_role) — neither is this module's concern. This file is the vocabulary SoT for
// Axis 3 (jurisdiction shape), Axis 4a (scope topics), Axis 4c (scope verticals), and the Axis 5
// (expected output) category set. Axis 4b (scope modes) needs no new vocabulary: it is a subset of the
// TRANSPORT_MODES this repo already ships in src/lib/contracts/vocabularies.mjs, imported below.
//
// NO INVENTED VALUES WHERE A REAL SoT EXISTS:
//   - jurisdiction shape/sentinels are PORTED VERBATIM from src/lib/jurisdictions/iso.ts's
//     KNOWN_FREE_TEXT_JURISDICTIONS + its two ISO regexes (same technique source-type-taxonomy.mjs's
//     header documents for porting logic out of a TS module into plain ESM — see that file). This
//     module's own test statically greps iso.ts's source text so the port cannot drift silently.
//   - the Axis 5 category set REUSES src/lib/surface-of.mjs's SURFACES ("regulations"/"market"/
//     "operations"/"research" — the single, drift-guarded item->surface classification home) plus one
//     additional sentinel, "out_of_scope" (the framework's fifth bucket, which surfaceOf's
//     "uncategorized" output is treated as an alias of — see expected-output.mjs).
// Topics (4a) and verticals (4c) have no existing structured SoT anywhere in the codebase (confirmed:
// REC-2-plans.md §9 lists them as never built) — the framework document itself is therefore the SoT
// for those two, and their value sets are transcribed here closed and frozen, never free text.
//
// PLAIN ESM, ZERO DEPENDENCIES beyond relative .mjs siblings (portable to the no-npm-ci discipline job,
// same constraint vocabularies.mjs and surface-of.mjs state for themselves). Do not add .ts imports.

import { LEG_MODE_CODES } from "../contracts/vocabularies.mjs";
import { SURFACES } from "../surface-of.mjs";

function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") Object.freeze(v);
  }
  return Object.freeze(obj);
}

// ─────────────────────────── Axis 3: jurisdiction ───────────────────────────
// Ported verbatim from src/lib/jurisdictions/iso.ts (KNOWN_FREE_TEXT_JURISDICTIONS,
// ISO_3166_1_PATTERN, ISO_3166_2_PATTERN). iso.ts "[v]alidates shape, not membership" — same posture
// kept here: there is no closed list of every ISO 3166 country code shipped in this repo, so
// isValidJurisdictionValue checks SHAPE (two-letter, or two-letter-dash-subdivision) plus the small
// closed set of supranational free-text sentinels, exactly as iso.ts does for intelligence_items.
export const KNOWN_FREE_TEXT_JURISDICTIONS = Object.freeze(["EU", "GLOBAL", "IMO", "ICAO"]);
const ISO_3166_1_PATTERN = /^[A-Z]{2}$/;
const ISO_3166_2_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/** True iff `value` is a well-shaped Axis-3 jurisdiction token: a known free-text sentinel, an ISO
 *  3166-1 alpha-2 country code, or an ISO 3166-2 subdivision code. Shape, not membership (mirrors
 *  iso.ts) — there is no bundled ISO country-code table in this repo to validate membership against. */
export function isValidJurisdictionValue(value) {
  const v = String(value ?? "");
  return KNOWN_FREE_TEXT_JURISDICTIONS.includes(v) || ISO_3166_1_PATTERN.test(v) || ISO_3166_2_PATTERN.test(v);
}

// ─────────────────────────── Axis 4a: scope topics ───────────────────────────
// Verbatim from the framework doc, "Axis 4: Scope / 4a. Topics / Valid values" (source-classification-
// framework-2026-05-10.md). No other structured home exists for this list (REC-2-plans.md §9).
export const SCOPE_TOPICS = Object.freeze([
  "regulatory", "finance", "technology", "fuel", "labor", "infrastructure", "environmental",
  "social", "governance", "transport", "packaging", "customs", "conservation", "materials_science",
]);

export function isValidScopeTopic(value) {
  return SCOPE_TOPICS.includes(String(value ?? ""));
}

// ─────────────────────────── Axis 4b: scope modes ───────────────────────────
// A source-level SCOPE value ("does this source cover this mode with regular material coverage?") is
// coarser than an item/corridor-level LEG mode: the framework additionally allows "all" (multi-mode
// generalist) and "none" (source never addresses transport) as source-scope-only sentinels. The four
// concrete modes are LEG_MODE_CODES from the canonical vocabularies.mjs (never a second name for the
// same mode — see that file's own header on why `ocean` is canonical). `multimodal` (a corridor-only
// leg-chain concept, not a source-scope concept) is deliberately excluded.
export const SCOPE_MODE_SENTINELS = Object.freeze(["all", "none"]);
export const SCOPE_MODES = Object.freeze([...LEG_MODE_CODES, ...SCOPE_MODE_SENTINELS]);

export function isValidScopeMode(value) {
  return SCOPE_MODES.includes(String(value ?? ""));
}

// ─────────────────────────── Axis 4c: scope verticals ───────────────────────────
// Verbatim from the framework doc, "Axis 4: Scope / 4c. Verticals / Valid values", and reconfirmed
// closed by open question 6 ("the six verticals ... are fixed in the framework. If a seventh vertical
// emerges, the framework needs amendment, not just an enum value addition").
export const SCOPE_VERTICALS = Object.freeze([
  "fine_art", "live_events", "luxury", "film_tv", "automotive", "humanitarian",
  "freight_general", "all", "none",
]);

export function isValidScopeVertical(value) {
  return SCOPE_VERTICALS.includes(String(value ?? ""));
}

// ─────────────────────────── Axis 5: expected-output category set ───────────────────────────
// REUSES surface-of.mjs's SURFACES (the single drift-guarded item->surface classification home) rather
// than inventing a sixth spelling of the same four buckets. "out_of_scope" is the framework's fifth
// bucket, with no direct surfaceOf equivalent; expected-output.mjs documents the uncategorized<->
// out_of_scope treatment used when comparing against live item data.
export const AXIS5_OUT_OF_SCOPE = "out_of_scope";
export const AXIS5_CATEGORIES = Object.freeze([...SURFACES, AXIS5_OUT_OF_SCOPE]);

export function isValidAxis5Category(value) {
  return AXIS5_CATEGORIES.includes(String(value ?? ""));
}

// Every classification vocabulary this module owns, by axis name — mirrors vocabularies.mjs's own
// VOCABULARIES registry idiom so a future acceptance-gate-style sweep has one place to iterate.
export const CLASSIFICATION_VOCABULARIES = deepFreeze({
  scope_topics: SCOPE_TOPICS,
  scope_modes: SCOPE_MODES,
  scope_verticals: SCOPE_VERTICALS,
  axis5_category: AXIS5_CATEGORIES,
});
