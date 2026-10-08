// data-audit: label=surface-acceptance hard=false
// surface-acceptance.mjs -- the COHERENCE TEST of docs/specs/00-foundation-the-spine.md section 8 (lane
// ALIAS-1, 2026-10-08; the file the spec has named since Phase 1 and the repo never had).
// GOVERNING SKILLS: remediation-discipline (a guard is proven by attack, not by presence: every check below is
// proven red-then-green in surface-acceptance.test.mjs).
//
// WHAT IT DOES. Section 8 lists seventeen spine-level assertions. Each is an entry in SPEC_CHECKS below with its
// spec text, and each is in exactly one of two states, stated in the entry and never silent:
//   - RUNS: a pure check over a "world" (entities, identifiers, aliases, relations, refs, free-text references,
//     typed links, aggregates). It runs today on a fixture world (`--fixture`) and, with database credentials, on
//     the live tables (default mode, read only).
//   - SKIP, with a kind and a reason: `live` (needs rows or a catalogue this runtime cannot read from a
//     fixture), `ui` (needs a rendered surface or a built route), or `no-data-source` (the thing it would
//     measure is not stored anywhere yet). A skipped check is listed in every report; it is never counted as a
//     pass.
// Two further checks (H1, H2) run the spec 00 section 1.3 rules this lane built: the hierarchy has no cycle and
// every member states its level; every alias carries who asserted it and when.
//
// MODES AND EXIT CODES.
//   node scripts/verify/surface-acceptance.mjs --fixture   run every RUNS check on the built-in fixture world.
//                                                         exit 0 all pass, 1 any fail.
//   node scripts/verify/surface-acceptance.mjs             read the live tables (read only) and run the same
//                                                         checks. exit 0 all pass, 1 any fail, 2 SELF-SKIP with
//                                                         the reason (no credentials, or migration 377 not
//                                                         applied yet): the sibling-audit contract, never a crash.
// It is a SOFT data-audit (marker on line 1): it informs the nightly lane and never blocks generation.
//
// DATA ACCESS is injected into runSurfaceAcceptance(); the live reader is imported dynamically inside main() so
// this file's static import graph stays free of npm packages (the no-npm discipline glob imports it).

import {
  ENTITY_LEVELS, RELATIONS, ALIAS_KINDS, LEVEL_NOT_RECORDED_LABEL, entityLevelLabel, normalizeAliasText,
  resolveSurvivors, aliasCandidates, ancestorChain,
  readEntityAliases, readEntityRelations,
} from "../../src/lib/entities/resolve.mjs";
import { assertEntityId, entityId, entityKindOf } from "../../src/lib/entities/entity-id.mjs";
import { SCHEMES, VALIDATORS } from "../../src/lib/entities/crosswalk.mjs";
import { RELATION, inverseRelation, weakestOriginClass } from "../../src/lib/contracts/vocabularies.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

/** Thrown by a reader when the live check cannot run at all (no credentials, tables absent). Exit 2. */
export class SelfSkip extends Error {}

// ---- world helpers -----------------------------------------------------------------------------------------

const asArray = (v) => (Array.isArray(v) ? v : []);
const present = (v) => typeof v === "string" && v.trim() !== "";

/** In-memory deps (the shape resolve.mjs wants) over a world's entities and aliases. */
function worldDeps(world) {
  const aliases = asArray(world.aliases);
  const entities = asArray(world.entities);
  return {
    readAliasesByText: async (text) => aliases.filter((a) => normalizeAliasText(a.alias).toLowerCase() === text.toLowerCase()),
    readEntities: async (ids) => entities.filter((e) => ids.includes(e.entity_id)),
  };
}

// ---- the checks (each: async (world) => string[] of problems; [] is a pass) --------------------------------

/** Assertion 1: every entity referenced resolves to a live cl: id; zero free-text entity references. */
export async function checkReferencesResolve(world) {
  const problems = [];
  const entities = asArray(world.entities);
  const ids = new Set(entities.map((e) => e.entity_id));
  const refs = asArray(world.refs);
  const survivors = await resolveSurvivors(refs.map((r) => r.entity_id).filter((id) => ids.has(id)), worldDeps(world));
  for (const r of refs) {
    const where = `${r.ref_table ?? "?"}/${r.ref_id ?? "?"}`;
    try { assertEntityId(r.entity_id); } catch { problems.push(`reference ${where} names "${r.entity_id}", which is not a cl: entity id (a free-text or malformed reference)`); continue; }
    if (!ids.has(r.entity_id)) { problems.push(`reference ${where} names ${r.entity_id}, which is not in entities (dangling)`); continue; }
    const s = survivors.get(r.entity_id);
    if (!s?.ok) problems.push(`reference ${where} names ${r.entity_id}, which does not resolve to a live entity (${s?.reason ?? "unknown"})`);
  }
  const deps = worldDeps(world);
  for (const f of asArray(world.freeText)) {
    const candidates = (await aliasCandidates(f.text, deps)).filter((c) => c.ok);
    if (candidates.length === 0) problems.push(`free-text entity reference "${f.text}" (${f.where ?? "?"}) matches no alias`);
    else if (candidates.length > 1) problems.push(`free-text entity reference "${f.text}" (${f.where ?? "?"}) is ambiguous: ${candidates.map((c) => c.entity_id).join(", ")}`);
  }
  return problems;
}

/** Assertion 2 (the part a snapshot can decide): ids are well formed, unique, kind-consistent; merges point somewhere real. */
export async function checkIdIntegrity(world) {
  const problems = [];
  const entities = asArray(world.entities);
  const seen = new Set();
  const byId = new Map(entities.map((e) => [e.entity_id, e]));
  for (const e of entities) {
    try { assertEntityId(e.entity_id); } catch (err) { problems.push(`entity id "${e.entity_id}" is malformed: ${err.message}`); continue; }
    if (seen.has(e.entity_id)) problems.push(`entity id ${e.entity_id} appears twice (an id is never reused)`);
    seen.add(e.entity_id);
    if (entityKindOf(e.entity_id) !== e.kind) problems.push(`entity ${e.entity_id} is stored as kind "${e.kind}" but its id says "${entityKindOf(e.entity_id)}"`);
    if (e.status === "merged") {
      if (!e.merged_into) problems.push(`entity ${e.entity_id} is merged and names no survivor`);
      else if (e.merged_into === e.entity_id) problems.push(`entity ${e.entity_id} is merged into itself`);
      else if (!byId.has(e.merged_into)) problems.push(`entity ${e.entity_id} is merged into ${e.merged_into}, which does not exist`);
    } else if (e.merged_into) {
      problems.push(`entity ${e.entity_id} has status "${e.status}" but names a merge survivor`);
    }
    if (e.entity_level != null) {
      if (e.kind !== "organisation") problems.push(`entity ${e.entity_id} (${e.kind}) carries entity_level "${e.entity_level}"; only organisations have a level`);
      else if (!ENTITY_LEVELS.includes(e.entity_level)) problems.push(`entity ${e.entity_id} carries entity_level "${e.entity_level}", outside ${ENTITY_LEVELS.join(", ")}`);
    }
  }
  return problems;
}

/** Assertion 5: every external identifier validates against its standard's format and check digit. */
export async function checkIdentifiersValid(world) {
  const problems = [];
  const ids = new Set(asArray(world.entities).map((e) => e.entity_id));
  const owner = new Map();
  for (const row of asArray(world.identifiers)) {
    const label = `${row.scheme}:${row.value} on ${row.entity_id}`;
    if (!SCHEMES.includes(row.scheme)) { problems.push(`identifier ${label}: unknown scheme`); continue; }
    if (!VALIDATORS[row.scheme](String(row.value ?? ""))) problems.push(`identifier ${label} fails the ${row.scheme} format or check digit`);
    if (!ids.has(row.entity_id)) problems.push(`identifier ${label}: the entity does not exist`);
    if (!present(row.asserted_by)) problems.push(`identifier ${label} has no asserted_by`);
    const key = `${row.scheme}|${String(row.value).toUpperCase()}|${row.scheme_version ?? ""}`;
    if (owner.has(key) && owner.get(key) !== row.entity_id) problems.push(`identifier ${row.scheme}:${row.value} resolves to two entities (${owner.get(key)}, ${row.entity_id})`);
    else owner.set(key, row.entity_id);
  }
  return problems;
}

/** Assertion 6: merges and renames preserve inbound links (301, never 404). */
export async function checkMergesPreserveLinks(world) {
  const problems = [];
  const deps = worldDeps(world);
  const merged = asArray(world.entities).filter((e) => e.status === "merged");
  const survivors = await resolveSurvivors(merged.map((e) => e.entity_id), deps);
  for (const e of merged) {
    const s = survivors.get(e.entity_id);
    if (!s?.ok) { problems.push(`merged entity ${e.entity_id} does not reach a live survivor (${s?.reason ?? "unknown"})`); continue; }
    for (const a of asArray(world.aliases).filter((x) => x.entity_id === e.entity_id)) {
      const cands = await aliasCandidates(a.alias, deps);
      if (!candidatesInclude(cands, s.entity.entity_id)) problems.push(`alias "${a.alias}" of merged entity ${e.entity_id} does not reach its survivor ${s.entity.entity_id}`);
    }
  }
  return problems;
}
const candidatesInclude = (cands, id) => cands.some((c) => c.ok && c.entity_id === id);

/** Assertion 9: origin_class of an aggregate is the weakest constituent. */
export async function checkOriginClassWeakest(world) {
  const problems = [];
  for (const [i, agg] of asArray(world.aggregates).entries()) {
    const expected = weakestOriginClass(agg.inputs);
    if (agg.reported !== expected) problems.push(`aggregate ${agg.name ?? i} reports origin_class ${JSON.stringify(agg.reported)}; the weakest of ${JSON.stringify(agg.inputs)} is ${JSON.stringify(expected)}`);
  }
  return problems;
}

/** Assertion 10: every cross-surface link is typed, reciprocal and non-dangling. */
export async function checkLinksTypedReciprocal(world) {
  const problems = [];
  const links = asArray(world.links);
  const nodes = new Set(asArray(world.linkNodes));
  const have = new Set(links.map((l) => `${l.source_id}|${l.relation}|${l.target_id}`));
  for (const l of links) {
    const label = `${l.source_id} ${l.relation} ${l.target_id}`;
    if (!RELATION[l.relation]) { problems.push(`link ${label} is not typed with a RELATION code`); continue; }
    if (!nodes.has(l.source_id) || !nodes.has(l.target_id)) problems.push(`link ${label} is dangling (an endpoint does not exist)`);
    const inv = inverseRelation(l.relation);
    if (!have.has(`${l.target_id}|${inv}|${l.source_id}`)) problems.push(`link ${label} has no reciprocal ${inv}`);
  }
  return problems;
}

/** H1 (spec 00 section 1.3 rule 1): the hierarchy is acyclic, uses the closed relations, and every member states its level. */
export async function checkHierarchy(world) {
  const problems = [];
  const byId = new Map(asArray(world.entities).map((e) => [e.entity_id, e]));
  const relations = asArray(world.relations);
  const members = new Set();
  for (const r of relations) {
    const label = `${r.parent_entity_id} -> ${r.child_entity_id} (${r.relation})`;
    if (!RELATIONS.includes(r.relation)) problems.push(`relation ${label} is outside ${RELATIONS.join(", ")}`);
    if (r.parent_entity_id === r.child_entity_id) problems.push(`relation ${label} is a self edge`);
    for (const id of [r.parent_entity_id, r.child_entity_id]) {
      if (!byId.has(id)) problems.push(`relation ${label}: ${id} is not in entities`);
      else members.add(id);
    }
    if (!present(r.asserted_by)) problems.push(`relation ${label} has no asserted_by`);
    if (r.parent_entity_id !== r.child_entity_id && ancestorChain(r.parent_entity_id, relations).includes(r.child_entity_id)) {
      problems.push(`relation ${label} closes a cycle: the child is already an ancestor of the parent`);
    }
  }
  for (const id of members) {
    if (entityLevelLabel(byId.get(id)) === LEVEL_NOT_RECORDED_LABEL) problems.push(`entity ${id} is in the hierarchy but its level is not recorded, so a screen cannot state which level it shows`);
  }
  return problems;
}

/** H2 (spec 00 section 1.3 rule 2): every alias carries who asserted it and when, in the stored form. */
export async function checkAliasProvenance(world) {
  const problems = [];
  const ids = new Set(asArray(world.entities).map((e) => e.entity_id));
  const keys = new Set();
  for (const a of asArray(world.aliases)) {
    const label = `alias "${a.alias}" of ${a.entity_id}`;
    if (!ids.has(a.entity_id)) problems.push(`${label}: the entity does not exist`);
    if (!present(a.asserted_by)) problems.push(`${label} has no asserted_by`);
    if (!Number.isFinite(Date.parse(a.asserted_at ?? ""))) problems.push(`${label} has no usable asserted_at`);
    if (!ALIAS_KINDS.includes(a.alias_kind)) problems.push(`${label} has alias_kind "${a.alias_kind}", outside ${ALIAS_KINDS.join(", ")}`);
    if (!present(a.alias) || a.alias !== normalizeAliasText(a.alias)) problems.push(`${label} is not stored trimmed with whitespace collapsed`);
    const key = `${a.entity_id}|${a.alias}|${a.alias_kind}|${a.asserted_by}`;
    if (keys.has(key)) problems.push(`${label} (${a.alias_kind}) appears twice`);
    keys.add(key);
  }
  return problems;
}

// ---- spec 00 section 8, in full ----------------------------------------------------------------------------

const skip = (kind, reason) => ({ kind, reason });

/** The seventeen assertions of spec 00 section 8, in the spec's order, then this lane's two section 1.3 checks. */
export const SPEC_CHECKS = Object.freeze([
  { n: 1, id: "refs-resolve", text: "Every entity referenced on any surface resolves to a cl: ID. Zero free-text entity references.",
    run: checkReferencesResolve,
    note: "live mode checks entity_refs only: no table holds the free-text mentions on rendered surfaces, so the free-text half runs on the fixture world and on any freeText a caller supplies" },
  { n: 2, id: "no-id-reuse", text: "No cl: ID is reused after retirement.",
    run: checkIdIntegrity,
    note: "runs the part a snapshot can decide (well formed, unique, kind-consistent, merges point at a real survivor); reuse across time needs a history of retired ids that no table keeps" },
  { n: 3, id: "one-detail-page", text: "One canonical detail page per entity; all five surfaces link to the same URL.",
    skip: skip("ui", "needs a canonical entity detail route; fsi-app/src/app has no entity page (the only entity route is the community threads API)") },
  { n: 4, id: "entity-survives-surface-switch", text: "Loading an entity and switching surfaces preserves the entity.",
    skip: skip("ui", "needs a rendered session across surfaces (an end to end browser check)") },
  { n: 5, id: "identifiers-valid", text: "Every external identifier validates against its standard's format and check digit.",
    run: checkIdentifiersValid },
  { n: 6, id: "merges-preserve-links", text: "Merges and renames preserve inbound links (301, never 404).",
    run: checkMergesPreserveLinks },
  { n: 7, id: "one-enum-per-vocabulary", text: "Exactly one enum per vocabulary in the codebase; zero per-surface variants.",
    skip: skip("live", "owned by scripts/verify/check-vocabulary-drift.mjs, which compares the vocabularies with the live database CHECKs and needs a direct Postgres connection") },
  { n: 8, id: "vocabulary-one-component", text: "Every vocabulary value renders with the identical component on every surface.",
    skip: skip("ui", "needs the rendered surfaces; the rendering guard is the place for it") },
  { n: 9, id: "origin-class-weakest", text: "origin_class propagates to the weakest constituent in every aggregate, and survives export.",
    run: checkOriginClassWeakest,
    note: "the fixture aggregates exercise weakestOriginClass; survival through an export needs a built export" },
  { n: 10, id: "links-typed-reciprocal", text: "Every cross-surface link is typed, reciprocal and non-dangling.",
    run: checkLinksTypedReciprocal,
    note: "fixture only: item_cross_references carries its own relationship CHECK (related, supersedes, implements, conflicts, amends, depends_on per entity-resolve.mjs), a different vocabulary from RELATION, so live reciprocity cannot be judged until the two are aligned",
    liveSkip: true },
  { n: 11, id: "numeric-claims-sourced", text: "Every numeric claim links to a cl:method and a source with an as-of.",
    skip: skip("live", "needs the published numeric claims and their method and source links, read from the live tables") },
  { n: 12, id: "six-empty-states", text: "Six empty states are distinguishable; no bare dash, no zero-fill.",
    skip: skip("no-data-source", "spec 00 section 4 is not built: OBS_STATUS carries four of the six states and no component maps a state to a treatment") },
  { n: 13, id: "aggregate-denominator", text: "Every aggregate shows its denominator.",
    skip: skip("ui", "needs the rendered aggregates") },
  { n: 14, id: "portfolio-add-same-record", text: "Adding an entity to a portfolio from any surface produces the same record.",
    skip: skip("ui", "needs an add action driven from each surface (portfolio-core.mjs holds the idempotent add; its surfaces are not driven here)") },
  { n: 15, id: "scope-filters-everything", text: "Active scope filters every surface plus Dashboard, Map and Assistant, and is always visible.",
    skip: skip("ui", "needs the rendered surfaces under an active scope") },
  { n: 16, id: "digests-compose", text: "Digests compose across surfaces into one message.",
    skip: skip("ui", "needs a composed digest message") },
  { n: 17, id: "assistant-cited", text: "Assistant: zero uncited factual sentences; numbers equal Operations numbers for the same query.",
    skip: skip("live", "needs Assistant output for a query set, and the Operations numbers for the same queries") },
  { n: "H1", id: "hierarchy", text: "Spec 00 section 1.3 rule 1: composite and atomic objects are separate, related, acyclic, and every screen states which level it shows.",
    run: checkHierarchy },
  { n: "H2", id: "alias-provenance", text: "Spec 00 section 1.3 rule 2: every alias carries who asserted it and when; aliases are evidence, not edits.",
    run: checkAliasProvenance },
]);

// ---- the fixture world -------------------------------------------------------------------------------------

/**
 * A small coherent world: the spec's Maersk-shaped group, legal entity and operating identity (synthetic seeds;
 * no identifier here claims to be the real company's), a node, a jurisdiction and a merged organisation, with
 * valid identifiers, aliases, references, typed links and aggregates. Every RUNS check passes on it.
 */
export function fixtureWorld() {
  const group = entityId("organisation", "fixture-maersk-group.example");
  const legal = entityId("organisation", "fixture-maersk-legal.example");
  const oper = entityId("organisation", "fixture-maersk-carrier.example");
  const old = entityId("organisation", "fixture-maersk-old.example");
  const node = entityId("node", "NLRTM");
  const nl = entityId("jurisdiction", "NL");
  const t = "2026-10-01T00:00:00Z";
  const org = (id, name, level, extra = {}) => ({ entity_id: id, kind: "organisation", canonical_name: name, status: "active", merged_into: null, entity_level: level, ...extra });
  const alias = (entity_id, text, alias_kind, asserted_by) => ({ entity_id, alias: text, alias_kind, asserted_by, asserted_at: t });
  const itemA = "00000000-0000-4000-8000-0000000000a1";
  const itemB = "00000000-0000-4000-8000-0000000000b2";
  return {
    entities: [
      org(group, "Maersk (group)", "group"),
      org(legal, "Maersk A/S (legal entity)", "legal_entity"),
      org(oper, "MAEU (carrier operating identity)", "operating_identity"),
      org(old, "Old Maersk Co", null, { status: "merged", merged_into: legal }),
      { entity_id: node, kind: "node", canonical_name: "NLRTM", status: "active", merged_into: null, entity_level: null },
      { entity_id: nl, kind: "jurisdiction", canonical_name: "NL", status: "active", merged_into: null, entity_level: null },
    ],
    identifiers: [
      { entity_id: oper, scheme: "SCAC", value: "MAEU", scheme_version: null, asserted_by: "fixture", asserted_at: t },
      { entity_id: node, scheme: "UNLOCODE", value: "NLRTM", scheme_version: null, asserted_by: "fixture", asserted_at: t },
      { entity_id: nl, scheme: "ISO3166_1", value: "NL", scheme_version: null, asserted_by: "fixture", asserted_at: t },
      { entity_id: group, scheme: "HOST", value: "fixture-maersk-group.example", scheme_version: null, asserted_by: "fixture", asserted_at: t },
    ],
    aliases: [
      alias(group, "Maersk", "name", "editor:fixture-one"),
      alias(legal, "Maersk A/S", "name", "rule:fixture-two"),
      alias(oper, "MAEU", "scac", "editor:fixture-three"),
      alias(old, "Old Maersk Co", "former_name", "editor:fixture-merge"),
    ],
    relations: [
      { parent_entity_id: group, child_entity_id: legal, relation: "legal_entity_of", asserted_by: "editor:fixture-one", asserted_at: t },
      { parent_entity_id: legal, child_entity_id: oper, relation: "operating_identity_of", asserted_by: "editor:fixture-one", asserted_at: t },
    ],
    refs: [
      { ref_table: "intelligence_items", ref_id: itemA, entity_id: nl, role: "jurisdiction" },
      { ref_table: "intelligence_items", ref_id: itemB, entity_id: old, role: "jurisdiction" },
    ],
    freeText: [
      { where: "fixture item title", text: "Maersk A/S" },
      { where: "fixture brief body", text: "  maeu " },
    ],
    linkNodes: [itemA, itemB],
    links: [
      { source_id: itemA, relation: "implements", target_id: itemB },
      { source_id: itemB, relation: "implemented_by", target_id: itemA },
    ],
    aggregates: [
      { name: "fixture portfolio", inputs: ["official", "derived", "modelled"], reported: "modelled" },
      { name: "fixture single input", inputs: ["official"], reported: "official" },
    ],
  };
}

// ---- running -----------------------------------------------------------------------------------------------

/**
 * Run every check against a world.
 * @param {object} world
 * @param {{mode?: "fixture"|"live"}} [opts] in live mode a check marked liveSkip is skipped
 * @returns {Promise<Array<{n:number|string, id:string, text:string, status:"PASS"|"FAIL"|"SKIP", problems:string[], skipKind?:string, reason?:string, note?:string}>>}
 */
export async function runChecks(world, { mode = "fixture" } = {}) {
  const out = [];
  for (const c of SPEC_CHECKS) {
    const base = { n: c.n, id: c.id, text: c.text };
    if (c.skip) { out.push({ ...base, status: "SKIP", problems: [], skipKind: c.skip.kind, reason: c.skip.reason }); continue; }
    if (mode === "live" && c.liveSkip) { out.push({ ...base, status: "SKIP", problems: [], skipKind: "live", reason: c.note }); continue; }
    const problems = await c.run(world);
    out.push({ ...base, status: problems.length ? "FAIL" : "PASS", problems, ...(c.note ? { note: c.note } : {}) });
  }
  return out;
}

/** The process exit code for a set of results: 1 if any check failed, else 0. PURE. */
export function exitCodeFor(results) {
  return results.some((r) => r.status === "FAIL") ? 1 : 0;
}

/** Plain-text report, ASCII only. PURE. */
export function renderReport(results, { mode }) {
  const lines = [`surface-acceptance (spec 00 section 8), mode=${mode}`];
  for (const r of results) {
    lines.push(`  ${r.status.padEnd(4)}  #${String(r.n).padEnd(2)} ${r.id}`);
    for (const p of r.problems) lines.push(`          - ${p}`);
    if (r.status === "SKIP") lines.push(`          skipped (${r.skipKind}): ${r.reason}`);
    else if (r.note && mode === "live") lines.push(`          note: ${r.note}`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  lines.push(`pass ${count("PASS")}  fail ${count("FAIL")}  skip ${count("SKIP")}  (skips are not passes)`);
  return lines.join("\n");
}

/**
 * The whole run with injected data access. In live mode `readWorld` may throw SelfSkip, which becomes exit 2.
 * @param {{mode:"fixture"|"live", readWorld?: () => Promise<object>, log?: (s:string)=>void}} opts
 * @returns {Promise<{code:number, results?: object[]}>}
 */
export async function runSurfaceAcceptance({ mode, readWorld, log = console.log }) {
  let world;
  if (mode === "fixture") world = fixtureWorld();
  else {
    try { world = await readWorld(); } catch (e) {
      if (e instanceof SelfSkip) { log(`surface-acceptance: SELF-SKIP (exit 2): ${e.message}`); return { code: 2 }; }
      throw e;
    }
  }
  const results = await runChecks(world, { mode });
  log(renderReport(results, { mode }));
  return { code: exitCodeFor(results), results };
}

/**
 * Read the live world with a read-only client. Missing tables (migration 377 not applied) and a missing
 * credential are SelfSkip, never a crash.
 * @param {object} sb a read-only Supabase client
 * @param {{readAll: Function}} db the scripts/lib/db.mjs read helpers
 */
export async function readLiveWorld(sb, db) {
  try {
    const entities = await db.readAll("entities", "entity_id,kind,canonical_name,status,merged_into,entity_level", { client: sb, orderBy: "entity_id" });
    const identifiers = await db.readAll("entity_identifiers", "entity_id,scheme,value,scheme_version,asserted_by,asserted_at", { client: sb, orderBy: ["entity_id", "scheme", "value"] });
    const refs = await db.readAll("entity_refs", "ref_table,ref_id,entity_id,role", { client: sb, orderBy: ["ref_table", "ref_id", "entity_id", "role"] });
    const aliases = await readEntityAliases(sb);
    const relations = await readEntityRelations(sb);
    return { entities, identifiers, refs, aliases, relations, freeText: [], links: [], linkNodes: [], aggregates: [] };
  } catch (e) {
    if (/does not exist|Could not find the table|schema cache|42P01|PGRST205/i.test(String(e?.message ?? e))) {
      throw new SelfSkip(`a spine table is not readable (${String(e.message).slice(0, 160)}); migration 377 is NOT APPLIED until the coordinator applies it`);
    }
    throw e;
  }
}

async function main() {
  const fixture = process.argv.includes("--fixture");
  if (fixture) {
    const { code } = await runSurfaceAcceptance({ mode: "fixture" });
    process.exit(code);
  }
  loadLocalEnvFile();
  const { code } = await runSurfaceAcceptance({
    mode: "live",
    readWorld: async () => {
      const db = await import("../lib/db.mjs");
      let sb;
      try { sb = db.readClient(); } catch (e) { throw new SelfSkip(`no database credentials (${String(e?.message ?? e).slice(0, 120)})`); }
      return readLiveWorld(sb, db);
    },
  });
  process.exit(code);
}

if (isMainModule(import.meta.url)) await main();
