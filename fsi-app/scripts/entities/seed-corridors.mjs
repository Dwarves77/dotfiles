#!/usr/bin/env node
// seed-corridors.mjs — seeds `entities` rows with `kind='corridor'` (migration 282; the enum already
// carries `corridor` — no migration 291 needed, see this file's own README note below) for the corridor
// identity ADR-024 §4 rules on: UN/LOCODE port-pair + mode, minted through `entityId('corridor', seed)`
// in src/lib/entities/entity-id.mjs (the ONE constructor — this script never hand-assembles a
// `cl:corridor:*` id). Lane CORR, wave 2, system-completion train, 2026-09-02.
//
// ── WHY NO MIGRATION 291 ────────────────────────────────────────────────────────────────────────────
// wave2-lanes-2026-09-02.md's CORR paragraph: "one migration if the entity spine needs a corridor kind
// (read migrations 281–287 and ADR-024 §4 first)". Read: migration 282's `entity_kind` enum (line 56-59)
// is `CREATE TYPE public.entity_kind AS ENUM ('corridor','node','jurisdiction','organisation','asset',
// 'instrument','obligation','method','technology','signpost','person')` — `corridor` is already the
// FIRST value, and `entityId('corridor', seed)` already works today (src/lib/entities/entity-id.mjs's
// KINDS frozen array includes it, `id_matches_kind` CHECK already accepts `cl:corridor:*`). The spine
// has carried a corridor kind since migration 282 landed (system-completion train, same day) — this
// lane's job is to WRITE corridor rows into the kind that already exists, not to add the kind. No
// migration 291 is created by this lane.
//
// ── WHERE THE CORRIDOR CANDIDATES COME FROM — READ, NEVER INVENTED ─────────────────────────────────
// The brief: "seeds corridor entities for the corridors the live data actually references (derive
// candidates from market_series / regional_data_facts / item jurisdictions: read what exists, do not
// invent a corridor list; if no data names a corridor pair, seed the ADR's example set and say so)."
// This script reads all three live sources (via `deps.readAll`, same as every other script in
// scripts/entities/) and here is what each one actually is, checked against its own migration/registry
// before writing a single line of derivation logic:
//
//   market_series (migration 268): identity is `(series_key, reference_period)`. `series_key` namespaces
//   by PRODUCER (src/lib/market/series-registry.mjs's four keyPrefixes: eu-oil-bulletin, eex-eua, ecb-fx,
//   eia-v2 — a fuel-product series, an EUA auction series [unimplemented], a currency-pair series, a
//   petroleum-spot series). None is a shipping corridor. `deriveCorridorCandidatesFromMarketSeries()`
//   below reads every live row and recognises exactly one convention this codebase does not yet use
//   anywhere — a `series_key` of the literal shape `corridor:<ORIGIN>-<DEST>:<mode>` (the ADR-024 seed
//   format, namespaced) — so a FUTURE producer that does encode a corridor is picked up automatically;
//   today it returns [] for all four live keyPrefixes (proved in the test file against real key shapes).
//
//   regional_data_facts (migration 106): identity is `(region_id, dimension, fact_label)`. `dimension` is
//   a CLOSED 6-value CHECK (regulatory_feasibility / regional_resources / labor_markets /
//   materials_sourcing / infrastructure / operational_cost) — six Operations dimensions about ONE region,
//   never a route between two. `deriveCorridorCandidatesFromRegionalFacts()` applies the SAME
//   `corridor:<ORIGIN>-<DEST>:<mode>` recognition to `fact_label` for the same future-proofing reason;
//   today it returns [] (region facts describe wages, energy, infrastructure, never a lane).
//
//   intelligence_items.jurisdiction_iso (migration 033, TEXT[]): this is the one source that CANNOT be
//   mined for a corridor pair even in principle, and `deriveCorridorCandidatesFromItemJurisdictions()`
//   documents why rather than attempting it: the array names the jurisdictions an item CONCERNS, with no
//   order and no origin/destination role (src/lib/market/select-modal-factor.mjs's own header, the
//   existing precedent for this exact question: "[a two-element array] is still a fabricated corridor;
//   the signal itself never named a single jurisdiction to begin with"). Picking element 0 as "origin"
//   and element 1 as "dest" would invent a direction the data never asserted — this function always
//   returns [], on principle, not as a gap. It still READS the live rows (never skips the source) so a
//   dry run reports an honest count of what was checked.
//
// When market_series + regional_data_facts together name zero corridor pairs (true for every run against
// today's live data — proved by the tests), `resolveCorridorCandidates()` falls back to
// `ADR_EXAMPLE_CORRIDORS`: the ONE port-pair ADR-024 §4 itself uses as its worked illustration
// ("Shanghai–Rotterdam, ocean" — CNSHA/NLRTM — also migration 258's own `cl_corridor_id()` collision-proof
// pair, `cl_corridor_id('CNSHA','NLRTM','ocean', ...)`), and SAYS SO on stdout — never silently.
//
// ── IDEMPOTENT, GUARDED, DEPS-INJECTED (COMMON lane contract) ───────────────────────────────────────
// Same idiom as scripts/mint/screen-reconcile-records.mjs: `export async function main(opts, deps)` takes
// every DB function as a parameter, so the test file runs with zero DB access; the CLI entry (bottom of
// this file) is the ONLY place that imports the real scripts/lib/db.mjs and checks for creds (exit 2, no
// crash, matching backfill-entities.mjs's own self-skip contract). `--dry` is the default; `--apply`
// writes. Idempotent: entityId() is deterministic, so a second run against the same candidate set creates
// nothing new (checked against a live `entities` read the same way backfill-entities.mjs's
// existingEntityIdSet() does).
//
// backfill-entities.mjs and backfill-lineage-edges.mjs are READ-ONLY for this lane (wave2-lanes contract)
// — this script imports NOTHING from either; it imports only entity-id.mjs (entityId/corridorSeed, the
// ONE id constructor for every kind) and scripts/lib/db.mjs's guarded functions, exactly as
// backfill-entities.mjs itself does for its own three kinds.
//
// FLAGS:
//   --dry     (default) compute + report the plan, write nothing
//   --apply   required to actually write
// Exit 0 done · 2 no DB creds (self-skip, never crash).

import { entityId, corridorSeed } from "../../src/lib/entities/entity-id.mjs";

export const CITE = Object.freeze({
  skill: "corridor-identity-seed",
  reason:
    "Lane CORR (wave 2, system-completion train, 2026-09-02): seed entities.kind='corridor' rows per " +
    "ADR-024 §4 (UN/LOCODE port-pair + mode), minted through entityId('corridor', seed). Candidates are " +
    "read from market_series/regional_data_facts (a documented future-convention scan, empty today) with " +
    "a fallback to ADR-024's own worked example when live data names no corridor pair.",
});

// The ADR-024 §4 / migration 258 worked example — the ONE corridor pair the ADR itself uses to argue for
// the port-pair+mode scheme ("A customer can be shown 'Shanghai–Rotterdam, ocean'..."), and the same pair
// migration 258's post-check collision-proof hashes two routings of (`cl_corridor_id('CNSHA','NLRTM',
// 'ocean', 1, 'suez', ARRAY['EGSUZ'])` vs the 'cape' variant) — at the FINER emission_factors.corridor_id
// granularity, not this coarse spine identity, but the same two ports, same mode, confirming this is a
// real, ADR-anchored example rather than an invented one.
export const ADR_EXAMPLE_CORRIDORS = Object.freeze([
  Object.freeze({
    origin: "CNSHA",
    dest: "NLRTM",
    mode: "ocean",
    note:
      "ADR-024 §4 worked example (\"Shanghai–Rotterdam, ocean\"); the same port pair migration 258's " +
      "cl_corridor_id() collision-proof post-check uses at the finer routing-leg granularity.",
  }),
]);

// The one series_key / fact_label convention this script recognises as corridor-shaped: a namespaced
// ADR-024 seed, "corridor:<ORIGIN-UNLOCODE>-<DEST-UNLOCODE>:<mode>". Not used by any live producer or
// dimension today (see file header) — recognised so a FUTURE one is picked up without a code change here.
const CORRIDOR_CONVENTION_RE = /^corridor:([A-Za-z]{2}[A-Za-z2-9]{3})-([A-Za-z]{2}[A-Za-z2-9]{3}):([a-z_]+)$/;

/** Parse one text value against the corridor-key convention. Pure. Returns {origin, dest, mode} (origin/
 *  dest upper-cased, mode passed through as-is for corridorSeed()'s own normaliseMode() to validate) or
 *  null when the text does not match — never guesses, never partial-matches. */
export function parseCorridorConvention(text) {
  const s = String(text ?? "").trim();
  const m = s.match(CORRIDOR_CONVENTION_RE);
  if (!m) return null;
  const [, origin, dest, mode] = m;
  return { origin: origin.toUpperCase(), dest: dest.toUpperCase(), mode };
}

/** market_series carries no corridor-shaped column (see file header) — reads every row's series_key
 *  against the recognised convention. Pure. `rows` is [{series_key, ...}]. */
export function deriveCorridorCandidatesFromMarketSeries(rows) {
  const out = [];
  for (const r of rows ?? []) {
    const hit = parseCorridorConvention(r?.series_key);
    if (hit) out.push({ ...hit, source: `market_series:${r.series_key}` });
  }
  return out;
}

/** regional_data_facts carries no corridor-shaped column either (see file header) — reads every row's
 *  fact_label against the same convention. Pure. `rows` is [{fact_label, ...}]. */
export function deriveCorridorCandidatesFromRegionalFacts(rows) {
  const out = [];
  for (const r of rows ?? []) {
    const hit = parseCorridorConvention(r?.fact_label);
    if (hit) out.push({ ...hit, source: `regional_data_facts:${r.fact_label}` });
  }
  return out;
}

/** intelligence_items.jurisdiction_iso is an UNORDERED set of countries an item CONCERNS, never a
 *  directed origin/dest pair (select-modal-factor.mjs's own established doctrine, cited in the file
 *  header). Reads `items` (so the caller's dry-run count is honest about what was checked) but NEVER
 *  attempts to pair elements into a corridor — that would invent a direction the data never asserted.
 *  Always returns []; the shape of the parameter is kept so a future, genuinely corridor-carrying column
 *  on this table has an obvious place to extend this function, named rather than silently absent. */
export function deriveCorridorCandidatesFromItemJurisdictions(items) {
  void items; // read by the caller for the honest count; deliberately unused here — see header.
  return [];
}

/** Combine the three read sources; fall back to ADR_EXAMPLE_CORRIDORS when live data names nothing.
 *  Pure. Returns { candidates, usingFallback, checked: {marketSeries, regionalFacts, items} }. */
export function resolveCorridorCandidates({ marketSeries = [], regionalFacts = [], items = [] } = {}) {
  const fromSeries = deriveCorridorCandidatesFromMarketSeries(marketSeries);
  const fromFacts = deriveCorridorCandidatesFromRegionalFacts(regionalFacts);
  const fromItems = deriveCorridorCandidatesFromItemJurisdictions(items);
  const derived = [...fromSeries, ...fromFacts, ...fromItems];
  // De-dupe by (origin,dest,mode) — two sources naming the same corridor is not two corridors.
  const seen = new Map();
  for (const c of derived) {
    const key = `${c.origin}-${c.dest}:${c.mode}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  const uniqueDerived = [...seen.values()];
  const usingFallback = uniqueDerived.length === 0;
  return {
    candidates: usingFallback ? ADR_EXAMPLE_CORRIDORS.map((c) => ({ ...c })) : uniqueDerived,
    usingFallback,
    checked: { marketSeries: marketSeries.length, regionalFacts: regionalFacts.length, items: items.length },
  };
}

/**
 * Plan `entities` rows (kind='corridor') for a candidate list, skipping ids that already exist.
 * `existingEntityIds` is a Set<string> of live `entities.entity_id` values (kind='corridor' suffices —
 * entityId() namespaces by kind already, so checking the full set is harmless and matches
 * backfill-entities.mjs's own existingEntityIdSet() shape). A candidate whose (origin, dest, mode) fails
 * corridorSeed()'s own validation (bad UN/LOCODE shape, unrecognised mode) is SKIPPED with a logged
 * reason, never crashes the whole batch — the same "one bad row does not sink the run" posture
 * backfill-entities.mjs's per-row try/catch uses for its FK updates. Returns { entities, planned, skipped }
 * where `planned` names every candidate's minted id (even pre-existing ones) for the dry-run report.
 */
export function planCorridorEntities(candidates, existingEntityIds = new Set()) {
  const entities = [];
  const planned = [];
  const skipped = [];
  for (const c of candidates ?? []) {
    let seed;
    let id;
    try {
      seed = corridorSeed(c);
      id = entityId("corridor", seed);
    } catch (e) {
      skipped.push({ candidate: c, reason: e.message });
      continue;
    }
    const alreadyExists = existingEntityIds.has(id);
    planned.push({ candidate: c, seed, entityId: id, alreadyExists });
    if (!alreadyExists) {
      entities.push({ entity_id: id, kind: "corridor", canonical_name: seed, status: "active" });
    }
  }
  return { entities, planned, skipped };
}

// ── orchestration (DB reads/writes via injected deps) ──────────────────────────────────────────────────

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  return { apply, dry: !apply };
}

/**
 * @param {{ apply?: boolean }} opts
 * @param {{ readAll: Function, guardedInsertMany: Function }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, guardedInsertMany } = deps;
  console.log(`[seed-corridors] mode = ${apply ? "APPLY" : "DRY-RUN (default)"}`);

  const [marketSeries, regionalFacts, items, existingCorridors] = await Promise.all([
    readAll("market_series", "series_key"),
    readAll("regional_data_facts", "fact_label"),
    readAll("intelligence_items", "id,jurisdiction_iso"),
    // PK is entity_id, not id — readAll()'s default orderBy="id" fails on this table (same fix
    // backfill-entities.mjs already carries, found by propagation-drain run 33627113501).
    readAll("entities", "entity_id", { match: (q) => q.eq("kind", "corridor"), orderBy: "entity_id" }),
  ]);
  const existingEntityIds = new Set(existingCorridors.map((r) => r.entity_id));
  console.log(
    `[seed-corridors] read market_series ${marketSeries.length} row(s), regional_data_facts ${regionalFacts.length} row(s), ` +
      `intelligence_items ${items.length} row(s) (jurisdiction check — cannot yield a directed pair, see file header), ` +
      `${existingEntityIds.size} pre-existing corridor entities.`,
  );

  const { candidates, usingFallback, checked } = resolveCorridorCandidates({ marketSeries, regionalFacts, items });
  console.log(
    usingFallback
      ? `[seed-corridors] no live data names a corridor pair (checked ${checked.marketSeries} market_series + ${checked.regionalFacts} regional_data_facts rows) — falling back to ADR-024's example set (${candidates.length} corridor).`
      : `[seed-corridors] derived ${candidates.length} corridor candidate(s) from live data.`,
  );

  const { entities, planned, skipped } = planCorridorEntities(candidates, existingEntityIds);
  for (const p of planned) {
    console.log(`   ${p.seed} -> ${p.entityId}${p.alreadyExists ? " (existing)" : " (would_create)"}`);
  }
  for (const s of skipped) {
    console.error(`[seed-corridors] SKIPPED candidate ${JSON.stringify(s.candidate)}: ${s.reason}`);
  }
  console.log(`[seed-corridors] candidates: ${candidates.length}; would_create: ${entities.length}; existing: ${candidates.length - entities.length - skipped.length}; skipped: ${skipped.length}`);

  if (apply && entities.length) {
    await guardedInsertMany("entities", entities, { cite: CITE, select: "entity_id" });
    console.log(`[seed-corridors] applied: inserted ${entities.length} corridor entit${entities.length === 1 ? "y" : "ies"}.`);
  } else if (apply) {
    console.log("[seed-corridors] applied: nothing to insert (every candidate already exists).");
  } else {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
  }

  return {
    mode: apply ? "apply" : "dry-run",
    usingFallback,
    candidateCount: candidates.length,
    created: entities.length,
    existing: candidates.length - entities.length - skipped.length,
    skipped: skipped.length,
    planned,
  };
}

async function loadEnv() {
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    await loadEnv();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[seed-corridors] no DB creds — cannot run here (exit 2).");
      process.exit(2);
    }
    const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
    const opts = parseArgs(process.argv.slice(2));
    try {
      await main(opts, { readAll, guardedInsertMany });
      process.exit(0);
    } catch (e) {
      console.error("[seed-corridors] FATAL:", e);
      process.exit(1);
    }
  })();
}
