// surface-acceptance.test.mjs, lane ALIAS-1 (2026-10-08): red-then-green proof of the spec 00 section 8 coherence
// test. Rule 15: a guard is proven by attack. Every RUNS check has a case that must come out FAIL, built by
// breaking the fixture world in exactly the way the check exists to catch; the unbroken fixture must pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withoutCredentials } from "../lib/env-file.mjs";
import {
  SPEC_CHECKS, SelfSkip, fixtureWorld, runChecks, runSurfaceAcceptance, readLiveWorld, exitCodeFor, renderReport,
  checkReferencesResolve, checkIdIntegrity, checkIdentifiersValid, checkMergesPreserveLinks, checkOriginClassWeakest,
  checkLinksTypedReciprocal, checkHierarchy, checkAliasProvenance,
} from "./surface-acceptance.mjs";

const SCRIPT = fileURLToPath(new URL("./surface-acceptance.mjs", import.meta.url));
const byId = (w, k) => w.entities.find((e) => e.canonical_name === k) ?? w.entities.find((e) => e.canonical_name.startsWith(k));

test("spec 00 section 8 is covered in full: assertions 1 to 17 appear once each, in order, then the two section 1.3 checks", () => {
  assert.deepEqual(SPEC_CHECKS.map((c) => c.n), [...Array.from({ length: 17 }, (_, i) => i + 1), "H1", "H2"]);
  assert.equal(new Set(SPEC_CHECKS.map((c) => c.id)).size, SPEC_CHECKS.length, "ids unique");
});

test("every check either runs or is skipped with a kind and a reason; no check is silent", () => {
  for (const c of SPEC_CHECKS) {
    assert.ok(c.text && c.text.length > 20, `#${c.n} states the spec text`);
    if (c.skip) {
      assert.ok(["live", "ui", "no-data-source"].includes(c.skip.kind), `#${c.n} skip kind`);
      assert.ok(c.skip.reason.length > 20, `#${c.n} skip reason`);
      assert.equal(c.run, undefined, `#${c.n} cannot both run and skip`);
    } else {
      assert.equal(typeof c.run, "function", `#${c.n} runs`);
    }
  }
  const running = SPEC_CHECKS.filter((c) => !c.skip).map((c) => c.n);
  assert.deepEqual(running, [1, 2, 5, 6, 9, 10, "H1", "H2"]);
});

test("the unbroken fixture world passes every check that runs, skips the rest, and exits 0", async () => {
  const results = await runChecks(fixtureWorld());
  assert.deepEqual(results.filter((r) => r.status === "FAIL"), []);
  assert.equal(results.filter((r) => r.status === "PASS").length, 8);
  assert.equal(results.filter((r) => r.status === "SKIP").length, 11);
  assert.equal(exitCodeFor(results), 0);
  assert.match(renderReport(results, { mode: "fixture" }), /pass 8  fail 0  skip 11  \(skips are not passes\)/);
});

test("#1 refs-resolve: a dangling id, a malformed id, a retired-to-nowhere merge, an unknown name and an ambiguous name each fail", async () => {
  const w = fixtureWorld();
  assert.deepEqual(await checkReferencesResolve(w), []);

  const dangling = fixtureWorld();
  dangling.refs.push({ ref_table: "intelligence_items", ref_id: "x", entity_id: "cl:jurisdiction:ffffffffffffffff", role: "jurisdiction" });
  assert.match((await checkReferencesResolve(dangling))[0], /not in entities \(dangling\)/);

  const freeform = fixtureWorld();
  freeform.refs.push({ ref_table: "intelligence_items", ref_id: "x", entity_id: "Netherlands", role: "jurisdiction" });
  assert.match((await checkReferencesResolve(freeform))[0], /not a cl: entity id/);

  const brokenMerge = fixtureWorld();
  byId(brokenMerge, "Old Maersk").merged_into = "cl:organisation:eeeeeeeeeeeeeeee";
  assert.ok((await checkReferencesResolve(brokenMerge)).some((p) => /does not resolve to a live entity \(entity_missing\)/.test(p)));

  const unknown = fixtureWorld();
  unknown.freeText.push({ where: "a brief", text: "Nobody Shipping Ltd" });
  assert.match((await checkReferencesResolve(unknown))[0], /matches no alias/);

  const ambiguous = fixtureWorld();
  ambiguous.aliases.push({ entity_id: byId(ambiguous, "Maersk A/S").entity_id, alias: "Maersk", alias_kind: "short_name", asserted_by: "x", asserted_at: "2026-10-02T00:00:00Z" });
  ambiguous.freeText.push({ where: "a brief", text: "Maersk" });
  assert.match((await checkReferencesResolve(ambiguous)).at(-1), /is ambiguous/);
});

test("#2 id integrity: a duplicate id, a kind that disagrees with the id, a merge to nowhere, a level on a jurisdiction and a bad level each fail", async () => {
  assert.deepEqual(await checkIdIntegrity(fixtureWorld()), []);

  const dup = fixtureWorld(); dup.entities.push({ ...dup.entities[0] });
  assert.match((await checkIdIntegrity(dup))[0], /appears twice/);

  const kind = fixtureWorld(); byId(kind, "NL").kind = "node";
  assert.ok((await checkIdIntegrity(kind)).some((p) => /stored as kind "node" but its id says "jurisdiction"/.test(p)));

  const nowhere = fixtureWorld(); byId(nowhere, "Old Maersk").merged_into = "cl:organisation:eeeeeeeeeeeeeeee";
  assert.ok((await checkIdIntegrity(nowhere)).some((p) => /does not exist/.test(p)));

  const selfMerge = fixtureWorld(); const o = byId(selfMerge, "Old Maersk"); o.merged_into = o.entity_id;
  assert.ok((await checkIdIntegrity(selfMerge)).some((p) => /merged into itself/.test(p)));

  const lvl = fixtureWorld(); byId(lvl, "NL").entity_level = "group";
  assert.ok((await checkIdIntegrity(lvl)).some((p) => /only organisations have a level/.test(p)));

  const bad = fixtureWorld(); byId(bad, "Maersk (group)").entity_level = "subsidiary";
  assert.ok((await checkIdIntegrity(bad)).some((p) => /outside group, legal_entity, operating_identity/.test(p)));

  const malformed = fixtureWorld(); malformed.entities.push({ entity_id: "not-an-id", kind: "node", status: "active" });
  assert.ok((await checkIdIntegrity(malformed)).some((p) => /malformed/.test(p)));
});

test("#5 identifiers: a bad check digit, an unknown scheme, a missing assertor and one value on two entities each fail", async () => {
  assert.deepEqual(await checkIdentifiersValid(fixtureWorld()), []);

  const digit = fixtureWorld(); digit.identifiers.push({ entity_id: byId(digit, "MAEU").entity_id, scheme: "IMO_SHIP", value: "9074720", asserted_by: "x" });
  assert.ok((await checkIdentifiersValid(digit)).some((p) => /IMO_SHIP.*fails the IMO_SHIP format or check digit/.test(p)));

  const scheme = fixtureWorld(); scheme.identifiers.push({ entity_id: byId(scheme, "MAEU").entity_id, scheme: "DUNS9", value: "1", asserted_by: "x" });
  assert.ok((await checkIdentifiersValid(scheme)).some((p) => /unknown scheme/.test(p)));

  const who = fixtureWorld(); who.identifiers[0].asserted_by = "  ";
  assert.ok((await checkIdentifiersValid(who)).some((p) => /no asserted_by/.test(p)));

  const two = fixtureWorld(); two.identifiers.push({ entity_id: byId(two, "Maersk (group)").entity_id, scheme: "SCAC", value: "maeu", asserted_by: "x" });
  assert.ok((await checkIdentifiersValid(two)).some((p) => /resolves to two entities/.test(p)));
});

test("#6 merges: a merged entity with no live survivor, and an alias that no longer reaches its survivor, each fail", async () => {
  assert.deepEqual(await checkMergesPreserveLinks(fixtureWorld()), []);

  const noSurvivor = fixtureWorld(); byId(noSurvivor, "Old Maersk").merged_into = "cl:organisation:eeeeeeeeeeeeeeee";
  assert.ok((await checkMergesPreserveLinks(noSurvivor)).some((p) => /does not reach a live survivor/.test(p)));

  const loop = fixtureWorld(); const legal = byId(loop, "Maersk A/S"); const old = byId(loop, "Old Maersk");
  legal.status = "merged"; legal.merged_into = old.entity_id;
  assert.ok((await checkMergesPreserveLinks(loop)).some((p) => /merge_loop/.test(p)));

  const blank = fixtureWorld();
  blank.aliases.push({ entity_id: byId(blank, "Old Maersk").entity_id, alias: "   ", alias_kind: "other", asserted_by: "x", asserted_at: "2026-10-01T00:00:00Z" });
  assert.ok((await checkMergesPreserveLinks(blank)).some((p) => /does not reach its survivor/.test(p)));

  const shared = fixtureWorld();
  shared.aliases.push({ entity_id: byId(shared, "MAEU").entity_id, alias: "Old Maersk Co", alias_kind: "other", asserted_by: "x", asserted_at: "2026-10-01T00:00:00Z" });
  assert.deepEqual(await checkMergesPreserveLinks(shared), [], "two entities share the alias now, but the survivor is still among the candidates");
});

test("#9 origin class: an aggregate reporting stronger than its weakest input fails", async () => {
  assert.deepEqual(await checkOriginClassWeakest(fixtureWorld()), []);
  const w = fixtureWorld(); w.aggregates[0].reported = "official";
  assert.match((await checkOriginClassWeakest(w))[0], /the weakest of .* is "modelled"/);
  const unknown = fixtureWorld(); unknown.aggregates.push({ name: "u", inputs: ["official", "mystery"], reported: "official" });
  assert.match((await checkOriginClassWeakest(unknown))[0], /is "community"/);
});

test("#10 links: an untyped link, a missing reciprocal and a dangling endpoint each fail", async () => {
  assert.deepEqual(await checkLinksTypedReciprocal(fixtureWorld()), []);
  const untyped = fixtureWorld(); untyped.links.push({ source_id: untyped.linkNodes[0], relation: "related", target_id: untyped.linkNodes[1] });
  assert.ok((await checkLinksTypedReciprocal(untyped)).some((p) => /not typed with a RELATION code/.test(p)));
  const oneWay = fixtureWorld(); oneWay.links.pop();
  assert.ok((await checkLinksTypedReciprocal(oneWay)).some((p) => /has no reciprocal implemented_by|has no reciprocal implements/.test(p)));
  const dangling = fixtureWorld(); dangling.links.push({ source_id: dangling.linkNodes[0], relation: "contradicts", target_id: "gone" }, { source_id: "gone", relation: "contradicts", target_id: dangling.linkNodes[0] });
  assert.ok((await checkLinksTypedReciprocal(dangling)).some((p) => /dangling/.test(p)));
});

test("H1 hierarchy: a cycle, a self edge, an unknown relation, an unknown endpoint and an unrecorded level each fail", async () => {
  assert.deepEqual(await checkHierarchy(fixtureWorld()), []);
  const [group, legal, oper] = ["Maersk (group)", "Maersk A/S", "MAEU"].map((k) => byId(fixtureWorld(), k).entity_id);

  const cycle = fixtureWorld(); cycle.relations.push({ parent_entity_id: oper, child_entity_id: group, relation: "group_of", asserted_by: "x" });
  assert.ok((await checkHierarchy(cycle)).some((p) => /closes a cycle/.test(p)));

  const self = fixtureWorld(); self.relations.push({ parent_entity_id: legal, child_entity_id: legal, relation: "group_of", asserted_by: "x" });
  assert.ok((await checkHierarchy(self)).some((p) => /self edge/.test(p)));

  const rel = fixtureWorld(); rel.relations[0].relation = "owns";
  assert.ok((await checkHierarchy(rel)).some((p) => /outside group_of, legal_entity_of, operating_identity_of/.test(p)));

  const ghost = fixtureWorld(); ghost.relations.push({ parent_entity_id: group, child_entity_id: "cl:organisation:dddddddddddddddd", relation: "group_of", asserted_by: "x" });
  assert.ok((await checkHierarchy(ghost)).some((p) => /not in entities/.test(p)));

  const level = fixtureWorld(); byId(level, "MAEU").entity_level = null;
  assert.ok((await checkHierarchy(level)).some((p) => /level is not recorded/.test(p)));

  const who = fixtureWorld(); who.relations[0].asserted_by = "";
  assert.ok((await checkHierarchy(who)).some((p) => /no asserted_by/.test(p)));
});

test("H2 alias provenance: no assertor, no date, an unknown kind, unnormalised text, a missing entity and a duplicate each fail", async () => {
  assert.deepEqual(await checkAliasProvenance(fixtureWorld()), []);
  const mut = (fn) => { const w = fixtureWorld(); fn(w.aliases[0], w); return checkAliasProvenance(w); };
  assert.ok((await mut((a) => { a.asserted_by = ""; })).some((p) => /no asserted_by/.test(p)));
  assert.ok((await mut((a) => { a.asserted_at = null; })).some((p) => /no usable asserted_at/.test(p)));
  assert.ok((await mut((a) => { a.alias_kind = "nickname"; })).some((p) => /outside name, short_name/.test(p)));
  assert.ok((await mut((a) => { a.alias = "Maersk  Line "; })).some((p) => /trimmed with whitespace collapsed/.test(p)));
  assert.ok((await mut((a) => { a.entity_id = "cl:organisation:cccccccccccccccc"; })).some((p) => /the entity does not exist/.test(p)));
  assert.ok((await mut((a, w) => { w.aliases.push({ ...a }); })).some((p) => /appears twice/.test(p)));
});

test("a run with any FAIL exits 1 and names the problem; skips alone never fail the run and never count as passes", async () => {
  const lines = [];
  const broken = fixtureWorld(); broken.aggregates[0].reported = "official";
  const out = await runSurfaceAcceptance({ mode: "live", readWorld: async () => broken, log: (s) => lines.push(s) });
  assert.equal(out.code, 1);
  assert.match(lines.join("\n"), /FAIL {2}#9 {2}origin-class-weakest/);
  assert.match(lines.join("\n"), /skip 12/, "assertion 10 is also skipped in live mode");
});

test("live mode skips assertion 10 (a different relation vocabulary), fixture mode runs it", async () => {
  const live = await runChecks(fixtureWorld(), { mode: "live" });
  assert.equal(live.find((r) => r.n === 10).status, "SKIP");
  const fixture = await runChecks(fixtureWorld(), { mode: "fixture" });
  assert.equal(fixture.find((r) => r.n === 10).status, "PASS");
});

test("a reader that cannot run (no credentials, tables absent) is a self-skip: exit 2 with the reason, never a crash", async () => {
  const lines = [];
  const out = await runSurfaceAcceptance({ mode: "live", readWorld: async () => { throw new SelfSkip("migration 377 is NOT APPLIED"); }, log: (s) => lines.push(s) });
  assert.equal(out.code, 2);
  assert.match(lines[0], /SELF-SKIP \(exit 2\): migration 377 is NOT APPLIED/);
  await assert.rejects(runSurfaceAcceptance({ mode: "live", readWorld: async () => { throw new Error("boom"); }, log: () => {} }), /boom/, "an unexpected error is not swallowed");
});

test("readLiveWorld: reads the five spine tables through the injected helpers; a missing table becomes a self-skip", async () => {
  const world = fixtureWorld();
  const seen = [];
  const db = {
    readAll: async (table, _cols, opts) => { seen.push([table, opts.orderBy]); return world[{ entities: "entities", entity_identifiers: "identifiers", entity_refs: "refs" }[table]]; },
  };
  const sb = { from: (table) => {
    const q = { select() { return q; }, order() { return q; }, range() { return Promise.resolve({ data: table === "entity_aliases" ? world.aliases : world.relations, error: null }); } };
    return q;
  } };
  const live = await readLiveWorld(sb, db);
  assert.deepEqual(seen.map((s) => s[0]), ["entities", "entity_identifiers", "entity_refs"]);
  assert.deepEqual(seen.find((s) => s[0] === "entity_refs")[1], ["ref_table", "ref_id", "entity_id", "role"], "paged on the full primary key");
  assert.equal(live.aliases.length, world.aliases.length);
  assert.equal(live.relations.length, world.relations.length);
  assert.deepEqual((await runChecks(live, { mode: "live" })).filter((r) => r.status === "FAIL" && r.n !== 1), []);

  const missing = { ...db, readAll: async (table) => { if (table === "entities") return []; throw new Error('relation "public.entity_refs" does not exist'); } };
  await assert.rejects(readLiveWorld(sb, missing), SelfSkip);
  const sbMissing = { from: () => ({ select() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: null, error: { message: "Could not find the table 'public.entity_aliases' in the schema cache" } }); } }) };
  await assert.rejects(readLiveWorld(sbMissing, db), SelfSkip);
});

test("the CLI: --fixture exits 0 and prints the report; with no credentials the default mode self-skips with exit 2", () => {
  const fx = spawnSync(process.execPath, [SCRIPT, "--fixture"], { encoding: "utf8" });
  assert.equal(fx.status, 0, fx.stderr);
  assert.match(fx.stdout, /pass 8  fail 0  skip 11/);

  const live = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: withoutCredentials() });
  assert.equal(live.status, 2, live.stderr);
  assert.match(live.stdout, /SELF-SKIP \(exit 2\): no database credentials/);
});
