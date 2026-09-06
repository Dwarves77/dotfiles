// corridor-scope.ts — the entity_scope reader (docs/specs/08-flywheel-design.md §1.2: "the join table
// that makes any entity addressable from any surface... the mechanism behind 'one corridor, five
// answers'"). Lane SCOPE-READER, 2026-09-06 (operator ruling: "keep spec 08's scoping table, build the
// reader, and make every customer-facing corridor reference human-readable").
//
// WHY THIS FILE. `entity_scope` (migration 282) has had a writer since 2026-09-05
// (scripts/entities/write-entity-scope.mjs, wired into seed-corridors.mjs) and ZERO readers — both
// F14's `TERMINAL_SINK_ALLOWLIST` and closure-gate's `WRITER_READER_ALLOWLIST` carry a grandfathered
// `entity_scope` entry saying exactly that ("DISPOSITION PENDING... candidate: a corridor detail view
// showing touched jurisdictions"). This module is that first reader — both allowlist entries are
// deleted in the same commit (see this lane's REPORT for the gate proof).
//
// WHAT IT ANSWERS, for a corridor entity: (1) the jurisdictions it touches, read straight off
// `entity_scope` (relation='touches_jurisdiction', written by write-entity-scope.mjs) — never re-derived
// from the UN/LOCODE prefix a second time, so this reader can never disagree with what the writer
// actually wrote; (2) through the spine, the instruments in force in those jurisdictions —
// `entity_refs` (ref_table='intelligence_items', role='jurisdiction', migration 283) resolves an item to
// its jurisdiction ENTITY, then `intelligence_items.instrument_entity_id` (migration 283, a real FK,
// backfilled live — 670 non-null rows at authoring time) resolves that item to its instrument entity.
// Both hops are FK-backed; NEITHER is a text match, per spec §1.3 property 1 ("No text entity references
// anywhere... a fitness function fails CI on a query filtering on a name column where an entity_id FK
// exists").
//
// THE ONE PLACE THIS READER *DOES* TEXT-MATCH, NAMED RATHER THAN HIDDEN: `obligations` (migration 290)
// denormalizes `jurisdiction text[]` (ISO codes) directly onto each register row — it carries NO
// entity_id FK to a jurisdiction entity (entity_refs.ref_table's CHECK only allows 'intelligence_items'
// and 'regions', migration 283; obligations was never in scope for that progressive re-keying). Spec
// §1.3 property 1 forbids text matching WHERE AN ENTITY ID FK EXISTS — none does here, so
// `getObligationSummaryForJurisdictions()` below matches on the ISO code array (`.overlaps()`, the same
// operator `src/lib/obligations/read-register.mjs` already uses for the identical column), same posture
// `select-modal-factor.mjs` documents for `intelligence_items.jurisdiction_iso` before this lane. If a
// future migration adds an entity-backed jurisdiction FK to `obligations`, this function is the one that
// needs to switch to it — named here so that lane does not have to re-discover the gap.
//
// PURE CORE, TESTABLE UNDER `node --test` WITH A FAKE CLIENT. This file imports `@supabase/supabase-js`
// as a TYPE ONLY (erased at compile time, same convention `resource-lookup.ts` already uses) — no
// runtime dependency on Next or the real Supabase SDK, so `corridor-scope.test.mjs` exercises every
// function here against a hand-rolled `{ from(table) { ... } }` fake, the same `chain` idiom
// `read-register.test.mjs`/`read-upcoming.test.mjs` already use elsewhere in this codebase. Caching
// (ADR-026's detail-page pattern: `unstable_cache`, tagged, revalidated) lives in the separate thin
// wrapper `corridor-scope-cache.ts`, which imports `next/cache` and therefore CANNOT be loaded by a
// plain `node --test` process — exactly the split `load-detail.ts`/`load-detail-core.ts` already
// establish for the same reason.
//
// DISPLAY LABEL: every corridor and jurisdiction name below prefers a live `display_name` column when
// present (migration — see docs/inventories/migrations.md; backfilled by seed-corridors.mjs's label
// step) and falls back to composing one from UNLOCODE_NAMES/JURISDICTION_NAMES (unlocode-names.mjs) when
// `display_name` is null — so this reader renders a real label even before the coordinator applies the
// migration and re-runs the backfill, and stays correct after.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCorridorLabel, nameForJurisdiction } from "./unlocode-names.mjs";

export const RELATION_TOUCHES_JURISDICTION = "touches_jurisdiction";

// Mirrors write-entity-scope.mjs's own CORRIDOR_NAME_RE (the shape seed-corridors.mjs's corridorSeed()
// produces, "ORIGIN-DEST:mode") — this reader parses the SAME canonical_name string the writer already
// validated, never a second independent regex with room to drift. Duplicated rather than imported
// because write-entity-scope.mjs lives in scripts/ (service-role, Node-only) and this file lives in
// src/lib (bundled into the Next app) — the same directory boundary seed-corridors.mjs's own header
// gives for restating ADR-024's example corridor rather than importing it from scripts/.
const CORRIDOR_NAME_RE = /^([A-Z]{2}[A-Z2-9]{3})-([A-Z]{2}[A-Z2-9]{3}):([a-z_]+)$/;

export interface ParsedCorridorName {
  origin: string;
  dest: string;
  mode: string;
}

/** Parse a corridor entity's canonical_name ("ORIGIN-DEST:mode") back into its parts, or null when it
 *  does not match the convention seed-corridors.mjs itself writes. Pure. */
export function parseCorridorCanonicalName(name: string | null | undefined): ParsedCorridorName | null {
  const m = String(name ?? "").match(CORRIDOR_NAME_RE);
  if (!m) return null;
  const [, origin, dest, mode] = m;
  return { origin, dest, mode };
}

export interface CorridorJurisdiction {
  entityId: string;
  code: string;
  name: string | null;
}

export interface CorridorScope {
  entityId: string;
  canonicalName: string;
  displayName: string | null;
  /** Always a real name — displayName when set, else composed from unlocode-names.mjs, else the raw
   *  canonical_name (never a fabricated name; see unlocode-names.mjs's own "never guessed" rule). */
  label: string;
  parsed: ParsedCorridorName | null;
  jurisdictions: CorridorJurisdiction[];
}

interface EntityRow {
  entity_id: string;
  canonical_name: string;
  display_name?: string | null;
}

interface EntityScopeRow {
  subject_id: string;
  scope_id: string;
  relation: string;
}

function resolveLabel(entity: EntityRow, parsed: ParsedCorridorName | null): string {
  if (entity.display_name) return entity.display_name;
  if (parsed) return formatCorridorLabel(parsed);
  return entity.canonical_name;
}

/**
 * Every live corridor entity, joined through `entity_scope` to the jurisdictions it touches. Two reads
 * (`entities` kind='corridor', `entity_scope` for those subjects) plus one more (`entities` for the
 * scope_id jurisdiction rows) — no N+1, all three keyed by an `.in()` batch. Returns `[]` on any read
 * error (fail-soft, matching this codebase's other reader modules) rather than throwing into a render.
 */
export async function listCorridorScopes(client: SupabaseClient): Promise<CorridorScope[]> {
  const { data: corridorRows, error: corridorErr } = await client
    .from("entities")
    .select("entity_id,canonical_name,display_name")
    .eq("kind", "corridor")
    .eq("status", "active")
    .order("entity_id", { ascending: true });
  if (corridorErr || !corridorRows || corridorRows.length === 0) return [];

  const corridorIds = (corridorRows as EntityRow[]).map((r) => r.entity_id);

  const { data: scopeRows } = await client
    .from("entity_scope")
    .select("subject_id,scope_id,relation")
    .eq("relation", RELATION_TOUCHES_JURISDICTION)
    // fitness-allow: F39 (corridor/jurisdiction entity_id set — real-world geography cardinality, structurally small)
    .in("subject_id", corridorIds);

  const jurisdictionIds = Array.from(
    new Set(((scopeRows as EntityScopeRow[] | null) ?? []).map((r) => r.scope_id)),
  );

  let jurisdictionById = new Map<string, EntityRow>();
  if (jurisdictionIds.length > 0) {
    const { data: jurisdictionRows } = await client
      .from("entities")
      .select("entity_id,canonical_name,display_name")
      // fitness-allow: F39 (corridor/jurisdiction entity_id set — real-world geography cardinality, structurally small)
      .in("entity_id", jurisdictionIds);
    jurisdictionById = new Map(
      ((jurisdictionRows as EntityRow[] | null) ?? []).map((r) => [r.entity_id, r]),
    );
  }

  const scopesBySubject = new Map<string, EntityScopeRow[]>();
  for (const row of (scopeRows as EntityScopeRow[] | null) ?? []) {
    const list = scopesBySubject.get(row.subject_id) ?? [];
    list.push(row);
    scopesBySubject.set(row.subject_id, list);
  }

  return (corridorRows as EntityRow[]).map((entity) => {
    const parsed = parseCorridorCanonicalName(entity.canonical_name);
    const jurisdictions: CorridorJurisdiction[] = (scopesBySubject.get(entity.entity_id) ?? []).map(
      (scope) => {
        const j = jurisdictionById.get(scope.scope_id);
        const code = j?.canonical_name ?? "";
        return {
          entityId: scope.scope_id,
          code,
          name: j?.display_name ?? nameForJurisdiction(code),
        };
      },
    );
    return {
      entityId: entity.entity_id,
      canonicalName: entity.canonical_name,
      displayName: entity.display_name ?? null,
      label: resolveLabel(entity, parsed),
      parsed,
      jurisdictions,
    };
  });
}

/** listCorridorScopes(), narrowed to corridors whose scope touches at least one of `isoCodes`
 *  (case-insensitive). Used by the regulation detail "Corridors this applies on" block — spec §1.2's
 *  "one corridor, five answers" run in the other direction (from a jurisdiction back to its corridors). */
export async function listCorridorsTouchingJurisdictions(
  client: SupabaseClient,
  isoCodes: string[],
): Promise<CorridorScope[]> {
  const wanted = new Set((isoCodes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return [];
  const all = await listCorridorScopes(client);
  return all.filter((c) => c.jurisdictions.some((j) => wanted.has(j.code.toUpperCase())));
}

export interface InstrumentRef {
  entityId: string;
  canonicalName: string;
}

/**
 * Instruments in force in the given jurisdiction entities, via the spine (never text matching — spec
 * §1.3 property 1): `entity_refs` (role='jurisdiction') resolves a jurisdiction entity to the
 * `intelligence_items` rows scoped to it, `intelligence_items.instrument_entity_id` resolves each of
 * those to its instrument entity, `entities` resolves the instrument entity to its canonical CELEX key.
 * Archived items are excluded. Returns `[]` (never throws) when the jurisdiction list is empty or every
 * read comes back empty — an honest empty result, not a degrade.
 */
export async function getInstrumentsForJurisdictions(
  client: SupabaseClient,
  jurisdictionEntityIds: string[],
): Promise<InstrumentRef[]> {
  const ids = Array.from(new Set((jurisdictionEntityIds ?? []).filter(Boolean)));
  if (ids.length === 0) return [];

  const { data: refRows } = await client
    .from("entity_refs")
    .select("ref_id")
    .eq("ref_table", "intelligence_items")
    .eq("role", "jurisdiction")
    // fitness-allow: F39 (corridor/jurisdiction entity_id set — real-world geography cardinality, structurally small)
    .in("entity_id", ids);
  const itemIds = Array.from(new Set(((refRows as { ref_id: string }[] | null) ?? []).map((r) => r.ref_id)));
  if (itemIds.length === 0) return [];

  const { data: itemRows } = await client
    .from("intelligence_items")
    .select("instrument_entity_id")
    // fitness-allow: F39 (corridor/jurisdiction entity_id set — real-world geography cardinality, structurally small)
    .in("id", itemIds)
    .eq("is_archived", false)
    .not("instrument_entity_id", "is", null);
  const instrumentIds = Array.from(
    new Set(
      ((itemRows as { instrument_entity_id: string | null }[] | null) ?? [])
        .map((r) => r.instrument_entity_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  if (instrumentIds.length === 0) return [];

  const { data: instrumentRows } = await client
    .from("entities")
    .select("entity_id,canonical_name")
    .eq("kind", "instrument")
    // fitness-allow: F39 (corridor/jurisdiction entity_id set — real-world geography cardinality, structurally small)
    .in("entity_id", instrumentIds);
  return ((instrumentRows as EntityRow[] | null) ?? []).map((r) => ({
    entityId: r.entity_id,
    canonicalName: r.canonical_name,
  }));
}

/**
 * Obligation count in force in the given jurisdictions. TEXT MATCH, by design — see file header for why
 * `obligations.jurisdiction` carries no entity_id FK to match against instead. `.overlaps()` mirrors
 * `read-register.mjs`'s own operator choice for the identical column.
 */
export async function getObligationCountForJurisdictions(
  client: SupabaseClient,
  isoCodes: string[],
): Promise<number> {
  const codes = Array.from(new Set((isoCodes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean)));
  if (codes.length === 0) return 0;
  const { count } = await client
    .from("obligations")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .overlaps("jurisdiction", codes);
  return count ?? 0;
}

export interface CorridorScopeSummary extends CorridorScope {
  instruments: InstrumentRef[];
  obligationCount: number;
}

/** Full "one corridor, five answers" bundle for a single corridor entity — jurisdictions plus, through
 *  the spine, the instruments and obligation count in force there. Returns null when the corridor id
 *  does not resolve (never a fabricated summary). */
export async function getCorridorScopeSummary(
  client: SupabaseClient,
  corridorEntityId: string,
): Promise<CorridorScopeSummary | null> {
  const all = await listCorridorScopes(client);
  const corridor = all.find((c) => c.entityId === corridorEntityId);
  if (!corridor) return null;
  const jurisdictionIds = corridor.jurisdictions.map((j) => j.entityId);
  const isoCodes = corridor.jurisdictions.map((j) => j.code);
  const [instruments, obligationCount] = await Promise.all([
    getInstrumentsForJurisdictions(client, jurisdictionIds),
    getObligationCountForJurisdictions(client, isoCodes),
  ]);
  return { ...corridor, instruments, obligationCount };
}
