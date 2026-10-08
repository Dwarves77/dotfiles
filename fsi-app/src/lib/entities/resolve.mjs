// resolve.mjs, lane ALIAS-1 (2026-10-08), spec 00 section 1.3, migration 377.
//
// WHAT THIS IS. The reader side of the composite/atomic hierarchy and the alias table:
//   - resolveEntityByAlias(text, deps): free text ("Maersk", "MAEU", "A.P. Moller - Maersk A/S") to ONE entity
//     through entity_aliases, with the level it stands at and who asserted the alias. A name that matches no
//     alias, or matches aliases of more than one entity, resolves to null: it is never guessed (spec 00
//     section 8 assertion 1, "zero free-text entity references"; the same fail-safe posture as
//     entity-resolve.mjs, which resolves mentions to ITEMS, not text to ENTITIES).
//   - an alias of a merged entity resolves to the survivor (merged_into is followed, bounded), so a merge never
//     breaks an inbound name (spec 00 section 8 assertion 6).
//   - entityLevelLabel(entity): the words a screen prints to state which level of the hierarchy it shows
//     (spec 00 section 1.3 rule 1, "every screen states which level it shows").
//   - ancestorChain / wouldCreateCycle: pure mirrors of the entity_relations cycle rule, so a writer can
//     decline an edge before the trigger refuses it and the coherence test can check a snapshot.
//
// DATA ACCESS IS INJECTED. Every reader takes a `deps` object (the repo's convention: tests pass fakes, the
// runners pass Supabase-backed readers built below). Nothing here writes: entity_aliases is INSERT-only and
// written by the population lane, entity_relations by the same lane, both through the guarded path.
//
// PLAIN ESM; node: builtins and relative imports only (the no-npm discipline glob imports this through
// scripts/verify/surface-acceptance.mjs's test).

import { fetchAllRows } from "../db/paginate.mjs";

// The closed vocabularies of migration 377. resolve.test.mjs and 377_entity_hierarchy_and_aliases.test.mjs
// assert these equal the migration's CHECK lists, so the two cannot drift.
export const ENTITY_LEVELS = Object.freeze(["group", "legal_entity", "operating_identity"]);
export const RELATIONS = Object.freeze(["group_of", "legal_entity_of", "operating_identity_of"]);
export const ALIAS_KINDS = Object.freeze(["name", "short_name", "former_name", "ticker", "scac", "iata", "other"]);

/** What a screen prints for each level. */
export const ENTITY_LEVEL_LABELS = Object.freeze({
  group: "Group",
  legal_entity: "Legal entity",
  operating_identity: "Operating identity",
});

/** The label for an organisation whose level is not recorded (NULL is "not recorded", never a guess). */
export const LEVEL_NOT_RECORDED_LABEL = "Organisation, level not recorded";

/** Merge hops followed before a chain is called broken (the same bound portfolio-core.mjs uses). */
export const MAX_MERGE_HOPS = 5;

/**
 * Trim and collapse runs of whitespace: the exact form migration 377's CHECK stores an alias in. PURE.
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeAliasText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

const aliasKey = (text) => normalizeAliasText(text).toLowerCase();

/**
 * The words a screen prints to state which level of the composite/atomic hierarchy it shows. PURE.
 * Organisations only: any other kind has no level and returns null.
 * @param {{kind?: string|null, entity_level?: string|null}|null|undefined} entity
 * @returns {string|null}
 */
export function entityLevelLabel(entity) {
  if (!entity) return null;
  if (entity.kind && entity.kind !== "organisation") return null;
  return ENTITY_LEVEL_LABELS[entity.entity_level] ?? LEVEL_NOT_RECORDED_LABEL;
}

const KIND_ORDER = new Map(ALIAS_KINDS.map((k, i) => [k, i]));

/** Latest asserted_at first (a correction is a later row), then alias_kind order, then asserted_by. PURE. */
function compareEvidence(a, b) {
  const ta = Date.parse(a.asserted_at ?? "") || 0;
  const tb = Date.parse(b.asserted_at ?? "") || 0;
  if (ta !== tb) return tb - ta;
  const ka = KIND_ORDER.get(a.alias_kind) ?? 99;
  const kb = KIND_ORDER.get(b.alias_kind) ?? 99;
  if (ka !== kb) return ka - kb;
  return String(a.asserted_by ?? "").localeCompare(String(b.asserted_by ?? ""));
}

/**
 * Follow merged_into from each requested entity id to its live survivor, reading entity rows through
 * deps.readEntities in batches. A missing row, a chain longer than MAX_MERGE_HOPS or a loop is reported as an
 * unresolved id with its reason, never dropped.
 * @param {string[]} ids
 * @param {{readEntities:(ids:string[])=>Promise<object[]>}} deps
 * @returns {Promise<Map<string, {ok:true, entity:object, viaMerge:boolean}|{ok:false, reason:string}>>}
 */
export async function resolveSurvivors(ids, deps) {
  const known = new Map();
  const load = async (want) => {
    const need = [...new Set(want)].filter((id) => !known.has(id));
    if (need.length === 0) return;
    const rows = await deps.readEntities(need);
    for (const r of rows ?? []) known.set(r.entity_id, r);
    for (const id of need) if (!known.has(id)) known.set(id, null);
  };

  const out = new Map();
  let pending = [...new Set(ids)].map((id) => ({ requested: id, current: id, seen: new Set(), hops: 0 }));
  while (pending.length) {
    await load(pending.map((p) => p.current));
    const next = [];
    for (const p of pending) {
      const row = known.get(p.current);
      if (!row) { out.set(p.requested, { ok: false, reason: "entity_missing" }); continue; }
      if (row.status === "merged" && row.merged_into) {
        p.seen.add(p.current);
        p.hops += 1;
        if (p.hops > MAX_MERGE_HOPS) { out.set(p.requested, { ok: false, reason: "merge_chain_too_long" }); continue; }
        if (p.seen.has(row.merged_into)) { out.set(p.requested, { ok: false, reason: "merge_loop" }); continue; }
        p.current = row.merged_into;
        next.push(p);
        continue;
      }
      out.set(p.requested, { ok: true, entity: row, viaMerge: p.current !== p.requested });
    }
    pending = next;
  }
  return out;
}

/**
 * Every entity the text names through an alias, each reduced to its live survivor, with the evidence row
 * (latest asserted_at wins) behind it. One element per distinct survivor. An alias whose entity cannot be
 * resolved is returned with ok:false and its reason.
 * @param {string} text
 * @param {{readAliasesByText:(normalizedText:string)=>Promise<object[]>, readEntities:(ids:string[])=>Promise<object[]>}} deps
 * @returns {Promise<Array<{ok:true, entity_id:string, level:string|null, kind:string, status:string, matched_alias:string, alias_kind:string, asserted_by:string, asserted_at:string|null, via_merge:boolean, requested_entity_id:string}|{ok:false, requested_entity_id:string, reason:string}>>}
 */
export async function aliasCandidates(text, deps) {
  const wanted = aliasKey(text);
  if (!wanted) return [];
  const rows = (await deps.readAliasesByText(normalizeAliasText(text))).filter((r) => aliasKey(r.alias) === wanted);
  if (rows.length === 0) return [];

  const survivors = await resolveSurvivors(rows.map((r) => r.entity_id), deps);
  const bySurvivor = new Map();
  const failed = new Map();
  for (const r of rows) {
    const s = survivors.get(r.entity_id);
    if (!s || !s.ok) {
      if (!failed.has(r.entity_id)) failed.set(r.entity_id, { ok: false, requested_entity_id: r.entity_id, reason: s?.reason ?? "entity_missing" });
      continue;
    }
    const key = s.entity.entity_id;
    const list = bySurvivor.get(key) ?? { entity: s.entity, viaMerge: s.viaMerge, requested: r.entity_id, rows: [] };
    list.rows.push(r);
    bySurvivor.set(key, list);
  }

  const resolved = [...bySurvivor.values()].map(({ entity, viaMerge, requested, rows: evidence }) => {
    const best = [...evidence].sort(compareEvidence)[0];
    return {
      ok: true,
      entity_id: entity.entity_id,
      level: entity.entity_level ?? null,
      kind: entity.kind,
      status: entity.status,
      matched_alias: best.alias,
      alias_kind: best.alias_kind,
      asserted_by: best.asserted_by,
      asserted_at: best.asserted_at ?? null,
      via_merge: viaMerge,
      requested_entity_id: requested,
    };
  });
  resolved.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return [...resolved, ...failed.values()];
}

/**
 * Resolve free text to one entity through its aliases: {entity_id, level, matched_alias, asserted_by} (plus
 * kind, status, alias_kind, asserted_at, via_merge), or null when the text matches no alias, matches the
 * aliases of more than one entity (ambiguous: never guessed; use aliasCandidates to see them), or matches only
 * an alias whose entity cannot be resolved.
 * @param {string} text
 * @param {Parameters<typeof aliasCandidates>[1]} deps
 */
export async function resolveEntityByAlias(text, deps) {
  const candidates = (await aliasCandidates(text, deps)).filter((c) => c.ok);
  return candidates.length === 1 ? candidates[0] : null;
}

// ---- hierarchy (pure mirrors of the migration 377 cycle rule) ---------------------------------------------

/**
 * The ancestors of an entity through every relation type, nearest first, each once. Cycle-safe. PURE.
 * @param {string} entityId
 * @param {Array<{parent_entity_id:string, child_entity_id:string, relation?:string}>} relations
 * @returns {string[]}
 */
export function ancestorChain(entityId, relations) {
  const parentsOf = new Map();
  for (const r of relations ?? []) {
    const list = parentsOf.get(r.child_entity_id) ?? [];
    list.push(r.parent_entity_id);
    parentsOf.set(r.child_entity_id, list);
  }
  const out = [];
  const seen = new Set([entityId]);
  let frontier = [entityId];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const p of [...(parentsOf.get(id) ?? [])].sort()) {
        if (seen.has(p)) continue;
        seen.add(p);
        out.push(p);
        next.push(p);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * True when adding parent -> child would make the child an ancestor of the parent (or the parent itself): the
 * rule the trigger entity_relations_refuse_cycle enforces. PURE.
 * @param {Array<{parent_entity_id:string, child_entity_id:string, relation?:string}>} relations existing edges
 * @param {string} parentId
 * @param {string} childId
 */
export function wouldCreateCycle(relations, parentId, childId) {
  if (parentId === childId) return true;
  return ancestorChain(parentId, relations).includes(childId);
}

// ---- Supabase-backed readers (the runners pass these; tests pass fakes) ------------------------------------

const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

/**
 * The deps object resolveEntityByAlias needs, backed by a Supabase client. An exact, case-insensitive match on
 * the stored (trimmed, collapsed) alias text.
 * @param {object} sb a Supabase client
 */
export function buildAliasResolverDeps(sb) {
  return {
    async readAliasesByText(normalizedText) {
      return fetchAllRows((from, to) =>
        sb.from("entity_aliases")
          .select("entity_id,alias,alias_kind,asserted_by,asserted_at,source_id,provenance")
          .ilike("alias", escapeLike(normalizedText))
          .order("entity_id").order("alias").order("alias_kind")
          .range(from, to));
    },
    async readEntities(ids) {
      const rows = [];
      for (let i = 0; i < ids.length; i += 100) {
        const slice = ids.slice(i, i + 100);
        const { data, error } = await sb.from("entities")
          .select("entity_id,kind,canonical_name,status,merged_into,entity_level")
          .in("entity_id", slice);
        if (error) throw new Error(`entities read failed: ${error.message}`);
        rows.push(...(data ?? []));
      }
      return rows;
    },
  };
}

/**
 * Every entity_relations row, paged on its full primary key.
 * @param {object} sb a Supabase client
 */
export function readEntityRelations(sb) {
  return fetchAllRows((from, to) =>
    sb.from("entity_relations")
      .select("parent_entity_id,child_entity_id,relation,asserted_by,asserted_at,source_id,provenance")
      .order("parent_entity_id").order("child_entity_id").order("relation")
      .range(from, to));
}

/**
 * Every entity_aliases row, paged on its full primary key.
 * @param {object} sb a Supabase client
 */
export function readEntityAliases(sb) {
  return fetchAllRows((from, to) =>
    sb.from("entity_aliases")
      .select("entity_id,alias,alias_kind,asserted_by,asserted_at,source_id,provenance")
      .order("entity_id").order("alias").order("alias_kind")
      .range(from, to));
}
