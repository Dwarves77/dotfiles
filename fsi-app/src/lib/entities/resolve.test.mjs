// resolve.test.mjs, lane ALIAS-1 (2026-10-08): proof of resolve.mjs on fixtures with injected deps, no database.
// The fixture is the spec's own example (spec 00 section 1.3): "Maersk" the group, "Maersk A/S" the legal entity,
// "MAEU" the carrier operating identity. The ids are minted by entityId() from synthetic seeds (the names are the
// spec's illustration, no identifier here claims to be the real company's).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_LEVELS, ENTITY_LEVEL_LABELS, LEVEL_NOT_RECORDED_LABEL, MAX_MERGE_HOPS,
  normalizeAliasText, entityLevelLabel, aliasCandidates, resolveEntityByAlias, resolveSurvivors,
  ancestorChain, wouldCreateCycle, buildAliasResolverDeps,
} from "./resolve.mjs";
import { entityId } from "./entity-id.mjs";

const GROUP = entityId("organisation", "fixture-maersk-group.example");
const LEGAL = entityId("organisation", "fixture-maersk-legal.example");
const OPER = entityId("organisation", "fixture-maersk-carrier.example");
const OTHER = entityId("organisation", "fixture-other.example");

const entities = () => [
  { entity_id: GROUP, kind: "organisation", canonical_name: "Maersk (group)", status: "active", merged_into: null, entity_level: "group" },
  { entity_id: LEGAL, kind: "organisation", canonical_name: "Maersk A/S (legal entity)", status: "active", merged_into: null, entity_level: "legal_entity" },
  { entity_id: OPER, kind: "organisation", canonical_name: "MAEU (carrier operating identity)", status: "active", merged_into: null, entity_level: "operating_identity" },
  { entity_id: OTHER, kind: "organisation", canonical_name: "Other org", status: "active", merged_into: null, entity_level: null },
];

const RELATIONS = [
  { parent_entity_id: GROUP, child_entity_id: LEGAL, relation: "legal_entity_of" },
  { parent_entity_id: LEGAL, child_entity_id: OPER, relation: "operating_identity_of" },
];

const alias = (entity_id, text, alias_kind, asserted_by, asserted_at = "2026-10-01T00:00:00Z") =>
  ({ entity_id, alias: text, alias_kind, asserted_by, asserted_at });

const ALIASES = () => [
  alias(GROUP, "Maersk", "name", "editor:fixture-one"),
  alias(LEGAL, "Maersk A/S", "name", "rule:fixture-two"),
  alias(OPER, "MAEU", "scac", "editor:fixture-three"),
];

/** In-memory deps over the fixture tables. */
function fakeDeps({ entityRows = entities(), aliasRows = ALIASES() } = {}) {
  const reads = { aliasTexts: [], entityBatches: [] };
  return {
    reads,
    readAliasesByText: async (text) => { reads.aliasTexts.push(text); return aliasRows.filter((r) => r.alias.toLowerCase() === text.toLowerCase()); },
    readEntities: async (ids) => { reads.entityBatches.push([...ids]); return entityRows.filter((e) => ids.includes(e.entity_id)); },
  };
}

test("the three Maersk-shaped objects resolve to three distinct ids, each at its own level, with who asserted the alias", async () => {
  const deps = fakeDeps();
  const group = await resolveEntityByAlias("Maersk", deps);
  const legal = await resolveEntityByAlias("Maersk A/S", deps);
  const oper = await resolveEntityByAlias("MAEU", deps);

  assert.deepEqual([group.entity_id, legal.entity_id, oper.entity_id], [GROUP, LEGAL, OPER]);
  assert.equal(new Set([group.entity_id, legal.entity_id, oper.entity_id]).size, 3);
  assert.deepEqual([group.level, legal.level, oper.level], ["group", "legal_entity", "operating_identity"]);
  assert.equal(group.matched_alias, "Maersk");
  assert.equal(group.asserted_by, "editor:fixture-one");
  assert.equal(oper.asserted_by, "editor:fixture-three");
  assert.equal(oper.alias_kind, "scac");
});

test("the three objects carry their declared relations: the operating identity's ancestors are its legal entity then its group", () => {
  assert.deepEqual(ancestorChain(OPER, RELATIONS), [LEGAL, GROUP]);
  assert.deepEqual(ancestorChain(LEGAL, RELATIONS), [GROUP]);
  assert.deepEqual(ancestorChain(GROUP, RELATIONS), []);
});

test("wouldCreateCycle mirrors the trigger: a self edge, a reversal and a loop are refused, a fresh edge is not", () => {
  assert.equal(wouldCreateCycle(RELATIONS, OPER, OPER), true, "self");
  assert.equal(wouldCreateCycle(RELATIONS, LEGAL, GROUP), true, "reversal of group -> legal");
  assert.equal(wouldCreateCycle(RELATIONS, OPER, GROUP), true, "loop through the chain");
  assert.equal(wouldCreateCycle(RELATIONS, GROUP, OPER), false, "a shortcut that is not a loop");
  assert.equal(wouldCreateCycle(RELATIONS, OTHER, GROUP), false, "an unrelated organisation above the group");
});

test("ancestorChain terminates on bad input that already contains a loop", () => {
  const loop = [
    { parent_entity_id: GROUP, child_entity_id: LEGAL },
    { parent_entity_id: LEGAL, child_entity_id: GROUP },
  ];
  assert.deepEqual(ancestorChain(LEGAL, loop), [GROUP]);
});

test("matching ignores case and runs of whitespace; the reader is asked for the normalised text", async () => {
  const deps = fakeDeps();
  const hit = await resolveEntityByAlias("   maersk   A/S ", deps);
  assert.equal(hit.entity_id, LEGAL);
  assert.deepEqual(deps.reads.aliasTexts, ["maersk A/S"]);
  assert.equal(normalizeAliasText("  a \t b\n c "), "a b c");
  assert.equal(normalizeAliasText(null), "");
});

test("no match, blank text and a reader that returns a loose match all resolve to null", async () => {
  const deps = fakeDeps();
  assert.equal(await resolveEntityByAlias("Nobody Ltd", deps), null);
  assert.equal(await resolveEntityByAlias("   ", deps), null);
  assert.equal(await resolveEntityByAlias(undefined, deps), null);
  const loose = { ...deps, readAliasesByText: async () => [alias(GROUP, "Maersk Line", "name", "x")] };
  assert.equal(await resolveEntityByAlias("Maersk", loose), null, "a row whose alias differs from the text is not a match");
});

test("an alias shared by two entities is ambiguous: null from resolve, both visible through aliasCandidates", async () => {
  const deps = fakeDeps({ aliasRows: [...ALIASES(), alias(LEGAL, "Maersk", "short_name", "rule:fixture-two")] });
  assert.equal(await resolveEntityByAlias("Maersk", deps), null);
  const candidates = await aliasCandidates("Maersk", deps);
  assert.deepEqual(candidates.map((c) => c.entity_id).sort(), [GROUP, LEGAL].sort());
});

test("two aliases of one entity are one candidate, and the latest assertion is the evidence (a correction is a later row)", async () => {
  const aliasRows = [
    alias(LEGAL, "Maersk A/S", "former_name", "editor:old", "2026-01-01T00:00:00Z"),
    alias(LEGAL, "Maersk A/S", "name", "editor:new", "2026-09-01T00:00:00Z"),
  ];
  const hit = await resolveEntityByAlias("maersk a/s", fakeDeps({ aliasRows }));
  assert.equal(hit.entity_id, LEGAL);
  assert.equal(hit.asserted_by, "editor:new");
  assert.equal(hit.alias_kind, "name");
});

test("the same alias asserted by two parties is two evidence rows and one candidate; the latest assertion is reported", async () => {
  const aliasRows = [
    alias(LEGAL, "Maersk A/S", "name", "editor:first", "2026-03-01T00:00:00Z"),
    alias(LEGAL, "Maersk A/S", "name", "editor:second", "2026-08-01T00:00:00Z"),
  ];
  const deps = fakeDeps({ aliasRows });
  const candidates = await aliasCandidates("Maersk A/S", deps);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].asserted_by, "editor:second");
  assert.equal((await resolveEntityByAlias("Maersk A/S", deps)).entity_id, LEGAL);
});

test("an alias of a merged entity resolves to the survivor (301, never 404)", async () => {
  const OLD = entityId("organisation", "fixture-old-name.example");
  const entityRows = [
    ...entities(),
    { entity_id: OLD, kind: "organisation", canonical_name: "Old", status: "merged", merged_into: LEGAL, entity_level: null },
  ];
  const deps = fakeDeps({ entityRows, aliasRows: [...ALIASES(), alias(OLD, "Old Maersk Co", "former_name", "editor:merge")] });
  const hit = await resolveEntityByAlias("Old Maersk Co", deps);
  assert.equal(hit.entity_id, LEGAL);
  assert.equal(hit.via_merge, true);
  assert.equal(hit.requested_entity_id, OLD);
  assert.equal(hit.level, "legal_entity");
});

test("a merge loop, a too-long chain and a missing entity are reported with a reason, never resolved", async () => {
  const mk = (n) => entityId("organisation", `fixture-chain-${n}.example`);
  const loopA = mk("a"); const loopB = mk("b");
  const chain = Array.from({ length: MAX_MERGE_HOPS + 3 }, (_, i) => mk(`c${i}`));
  const entityRows = [
    { entity_id: loopA, kind: "organisation", canonical_name: "A", status: "merged", merged_into: loopB, entity_level: null },
    { entity_id: loopB, kind: "organisation", canonical_name: "B", status: "merged", merged_into: loopA, entity_level: null },
    ...chain.map((id, i) => i < chain.length - 1
      ? { entity_id: id, kind: "organisation", canonical_name: id, status: "merged", merged_into: chain[i + 1], entity_level: null }
      : { entity_id: id, kind: "organisation", canonical_name: id, status: "active", merged_into: null, entity_level: null }),
  ];
  const missing = mk("missing");
  const survivors = await resolveSurvivors([loopA, chain[0], missing], fakeDeps({ entityRows }));
  assert.deepEqual(survivors.get(loopA), { ok: false, reason: "merge_loop" });
  assert.deepEqual(survivors.get(chain[0]), { ok: false, reason: "merge_chain_too_long" });
  assert.deepEqual(survivors.get(missing), { ok: false, reason: "entity_missing" });

  const deps = fakeDeps({ entityRows, aliasRows: [alias(loopA, "Loop Co", "name", "x")] });
  assert.equal(await resolveEntityByAlias("Loop Co", deps), null);
  const [c] = await aliasCandidates("Loop Co", deps);
  assert.deepEqual([c.ok, c.reason], [false, "merge_loop"]);
});

test("entityLevelLabel states the level for an organisation, says so when it is not recorded, and is null for other kinds", () => {
  assert.deepEqual(ENTITY_LEVELS.map((l) => entityLevelLabel({ kind: "organisation", entity_level: l })),
    ["Group", "Legal entity", "Operating identity"]);
  assert.deepEqual(Object.keys(ENTITY_LEVEL_LABELS), [...ENTITY_LEVELS]);
  assert.equal(entityLevelLabel({ kind: "organisation", entity_level: null }), LEVEL_NOT_RECORDED_LABEL);
  assert.equal(entityLevelLabel({ kind: "organisation" }), LEVEL_NOT_RECORDED_LABEL);
  assert.equal(entityLevelLabel({ kind: "jurisdiction", entity_level: null }), null);
  assert.equal(entityLevelLabel({ kind: "corridor" }), null);
  assert.equal(entityLevelLabel(null), null);
});

test("an unknown level value is never printed as if it were a level", () => {
  assert.equal(entityLevelLabel({ kind: "organisation", entity_level: "subsidiary" }), LEVEL_NOT_RECORDED_LABEL);
});

test("the Supabase-backed deps escape LIKE wildcards, page on the full key and chunk entity reads", async () => {
  const calls = [];
  const chain = (table) => {
    const rec = { table, ops: [] };
    calls.push(rec);
    const q = {
      select(cols) { rec.ops.push(["select", cols]); return q; },
      ilike(col, pat) { rec.ops.push(["ilike", col, pat]); return q; },
      in(col, vals) { rec.ops.push(["in", col, vals]); return q; },
      order(col) { rec.ops.push(["order", col]); return q; },
      range(from, to) {
        rec.ops.push(["range", from, to]);
        return Promise.resolve({ data: table === "entity_aliases" ? [alias(GROUP, "100%_Maersk", "name", "x")] : entities().slice(0, 1), error: null });
      },
      then(res, rej) {
        return Promise.resolve({ data: table === "entities" ? entities().filter((e) => rec.ops.find((o) => o[0] === "in")[2].includes(e.entity_id)) : [], error: null }).then(res, rej);
      },
    };
    return q;
  };
  const sb = { from: chain };
  const deps = buildAliasResolverDeps(sb);

  const rows = await deps.readAliasesByText("100%_Maersk");
  assert.equal(rows.length, 1);
  const aliasCall = calls[0];
  assert.deepEqual(aliasCall.ops.find((o) => o[0] === "ilike"), ["ilike", "alias", "100\\%\\_Maersk"]);
  assert.deepEqual(aliasCall.ops.filter((o) => o[0] === "order").map((o) => o[1]), ["entity_id", "alias", "alias_kind"]);

  const ids = Array.from({ length: 150 }, (_, i) => `cl:organisation:${String(i).padStart(16, "0")}`);
  await deps.readEntities([GROUP, ...ids]);
  const entityReads = calls.filter((c) => c.table === "entities");
  assert.equal(entityReads.length, 4, "151 distinct ids read in chunks of at most 50 (fetchAllByIdChunks)");
  assert.ok(entityReads.every((c) => c.ops.find((o) => o[0] === "in")[2].length <= 50));
});
