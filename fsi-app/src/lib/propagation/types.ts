// types.ts — the propagation engine's shared type vocabulary (docs/specs/08-flywheel-design.md §3.1,
// §3.3, §4 Layer 2). Lane DP-ENGINE, system-completion train, 2026-09-02.
//
// PLAIN RELATIVE IMPORTS ONLY, NO `@/` ALIAS — deliberately, so this file (and every other .ts file in
// this directory) is importable DIRECTLY by Node's native type-stripping (Node 22.7+/24, no jiti, no
// bundler; `.discipline/run-test-suite.sh`'s own header note: "Node 24 type-stripping makes relative .ts
// imports portable too"), the same reason `src/lib/agent/canonical-pipeline.ts` needs jiti (it imports
// through the `@/` alias, which only Next.js's bundler resolves) and this module does not. This is a
// deliberate simplification versus the governing plan's own literal wording ("jiti-loads drain.ts") —
// jiti is unnecessary when nothing in this directory uses the alias or imports an npm package at module
// scope; every DB client (`sb`) is passed in as a parameter, never imported. See drain.ts's header for the
// same note applied to the drain driver.
//
// LAYER 2 OF SPEC §4's FOUR-LAYER STATUTORY/ESTIMATE ISOLATION LIVES HERE: `Contractable` /
// `NonContractable` / `StatutoryInput` make mixing a compile error, not a runtime check. Migration 286's
// `assert_statutory_purity()` trigger is Layer 3, the DB-level backstop for a caller that bypasses this
// type barrier (a raw INSERT, or plain JS with no type-checker).

/** The nine derivation classes (src/lib/contracts/envelope.mjs DERIVATION), split by whether a value of
 *  that class may be put in a contract or a regulatory filing (`isContractable()`, same module). */
export type Contractable = "statutory_fixed" | "statutory_formula" | "observed" | "transacted_index" | "assessed" | "calculated";
export type NonContractable = "interpolated" | "modelled" | "estimated";
export type Derivation = Contractable | NonContractable;

/** The seven origin classes (src/lib/contracts/vocabularies.mjs ORIGIN_CLASS), lowest-strength first. */
export type OriginClass =
  | "community"
  | "community-corroborated"
  | "modelled"
  | "derived"
  | "partner"
  | "verified"
  | "official";

/** Spec §3.1's lifecycle axis — what the evidence has DONE. Independent of Admissibility (below). */
export type Lifecycle =
  | "emerging"
  | "strengthening"
  | "corroborated"
  | "verified"
  | "stalled"
  | "falsified"
  | "superseded"
  | "obsolete";

/** Spec §3.1's admissibility axis — what a consumer MAY DO with the value. `stale` is set ONLY by the
 *  governed drain (invalidate_dependents(), never a trigger — migration 285's header). */
export type Admissibility = "display_only" | "analysis_ok" | "calculation_ok" | "filing_ok" | "stale";

/** Spec §3.3's four consuming uses, ordered by what is at stake if the reader is wrong (ADR-024
 *  decision 3's own framing: "monotonically increasing with what is at stake"). */
export type Use = "display" | "analysis" | "calculation" | "filing";

/** One element of a `derived_values.inputs` / `statutory_computations.inputs` jsonb array — the SAME
 *  shape both migrations 285 and 286 document in their own column comments; this is the ONE place the
 *  shape is typed, so the DB comment and the TS shape can never independently drift (both point back
 *  here). `table` is one of derivation_edges' closed allowlist (migration 285:
 *  derivation_edges_from_table_allowed) — kept as a bare `string` here rather than a literal union so a
 *  future table can be added to the DB allowlist without a matching TS release, per this codebase's own
 *  "DB CHECK is the enforcement, TS documents the common case" posture for other jsonb-shaped columns. */
export interface InputRef {
  table: string;
  pk: string;
  version?: string | null;
}

/** A `derived_values` row (or the shape returned by `derived_values_admissible`, which additionally
 *  carries `effectiveConfidence` pre-computed — see admissible-for.ts's own `Value` extension there). */
export interface Value {
  valueId: string;
  entityId: string | null;
  methodId: string;
  methodVersion: string;
  value: number | null;
  valueLow: number | null;
  valueHigh: number | null;
  unit: string | null;
  currency: string | null;
  derivation: Derivation;
  originClass: OriginClass;
  lifecycle: Lifecycle;
  admissibility: Admissibility;
  baseConfidence: number;
  assertedAt: string; // ISO 8601
  halfLifeDays: number | null;
  inputs: InputRef[];
  supersedes: string | null;
  computedAt: string;
  computedBy: string;
  obsStatus?: string | null; // SDMX CL_OBS_STATUS code, when this value wraps an observation (spec §3.3's isMissing() check)
}

/** admissibleFor()'s return shape (spec §3.3, exact). A refusal names WHY; a pass carries the decayed
 *  confidence the caller must not re-derive. */
export type Verdict =
  | { ok: false; reason: string }
  | { ok: true; effectiveConfidence: number; mustLabel: OriginClass };

// ── Layer 2, spec §4: the statutory input type barrier ─────────────────────────────────────────────────

/** An as-of triple (spec 00 §2 / envelope.mjs's as_of): event_date is required, the other two optional. */
export interface AsOfTriple {
  eventDate: string;
  sourcePublishedAt?: string | null;
  ingestedAt?: string | null;
}

/** Spec §4 Layer 2: "Accepts ONLY contractable inputs. Passing a modelled value does not type-check."
 *  `derivation` is narrowed to `Contractable` — a caller that has only a `Derivation` (the wider type)
 *  must narrow it first, which is exactly the compile-time barrier the spec names. */
export interface StatutoryInput {
  derivation: Contractable;
  value: number;
  unit: string;
  citation: string;
  asOf: AsOfTriple;
}

/** The result shape a formula function returns — pure, no I/O, no defaulting (spec §4 Layer 2). Formula
 *  bodies live in src/lib/propagation/methods/ (DP-SURF's write set) and are registered through the
 *  METHODS seam (methods/index.ts); this type is what a registered formula function must return. */
export interface StatutoryResult {
  result: number;
  resultUnit: string;
  formulaVersion: string;
}
