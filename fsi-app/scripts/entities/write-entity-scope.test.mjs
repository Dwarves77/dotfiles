// Run: node --test scripts/entities/write-entity-scope.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entityId } from "../../src/lib/entities/entity-id.mjs";
import {
  RELATION_CORRIDOR_JURISDICTION,
  ATTRIBUTED_BY,
  CITE,
  parseCorridorCanonicalName,
  deriveCorridorJurisdictionCodes,
  planCorridorJurisdictionScope,
  main,
} from "./write-entity-scope.mjs";

// ── parseCorridorCanonicalName ──────────────────────────────────────────────────────────────────────

test("parseCorridorCanonicalName: recognises seed-corridors.mjs's own ORIGIN-DEST:mode convention", () => {
  assert.deepEqual(parseCorridorCanonicalName("CNSHA-NLRTM:ocean"), { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
});

test("parseCorridorCanonicalName: null on anything malformed, never guesses", () => {
  assert.equal(parseCorridorCanonicalName(null), null);
  assert.equal(parseCorridorCanonicalName(""), null);
  assert.equal(parseCorridorCanonicalName("Shanghai to Rotterdam"), null);
  assert.equal(parseCorridorCanonicalName("CNSHA-NLRTM"), null); // no mode
  assert.equal(parseCorridorCanonicalName("CN-NLRTM:ocean"), null); // origin too short for UN/LOCODE shape
});

// ── deriveCorridorJurisdictionCodes ─────────────────────────────────────────────────────────────────

test("deriveCorridorJurisdictionCodes: a two-country corridor yields two pairs and two distinct ISO codes", () => {
  const r = deriveCorridorJurisdictionCodes([{ entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" }]);
  assert.deepEqual(r.isoCodes, ["CN", "NL"]);
  assert.deepEqual(r.pairs, [
    { corridorEntityId: "cl:corridor:a", iso: "CN" },
    { corridorEntityId: "cl:corridor:a", iso: "NL" },
  ]);
  assert.equal(r.skipped.length, 0);
});

test("deriveCorridorJurisdictionCodes: a same-country corridor (two US ports) yields ONE pair, not two identical ones", () => {
  const r = deriveCorridorJurisdictionCodes([{ entity_id: "cl:corridor:b", canonical_name: "USLAX-USNYC:ocean" }]);
  assert.deepEqual(r.isoCodes, ["US"]);
  assert.deepEqual(r.pairs, [{ corridorEntityId: "cl:corridor:b", iso: "US" }]);
});

test("deriveCorridorJurisdictionCodes: a malformed canonical_name is skipped by name, never guessed at, and does not crash the batch", () => {
  const r = deriveCorridorJurisdictionCodes([
    { entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" },
    { entity_id: "cl:corridor:bad", canonical_name: "not-a-corridor-seed" },
  ]);
  assert.equal(r.pairs.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].entity_id, "cl:corridor:bad");
  assert.match(r.skipped[0].reason, /does not match/);
});

test("deriveCorridorJurisdictionCodes: non-array input treated as empty, never throws", () => {
  const r = deriveCorridorJurisdictionCodes(null);
  assert.deepEqual(r, { isoCodes: [], pairs: [], skipped: [] });
});

// ── planCorridorJurisdictionScope ───────────────────────────────────────────────────────────────────

test("planCorridorJurisdictionScope: builds a well-formed entity_scope row per pair", () => {
  const byCode = new Map([["CN", entityId("jurisdiction", "CN")], ["NL", entityId("jurisdiction", "NL")]]);
  const pairs = [{ corridorEntityId: "cl:corridor:a", iso: "CN" }, { corridorEntityId: "cl:corridor:a", iso: "NL" }];
  const { rows, skipped } = planCorridorJurisdictionScope(pairs, byCode);
  assert.equal(rows.length, 2);
  assert.equal(skipped.length, 0);
  assert.deepEqual(rows[0], {
    subject_id: "cl:corridor:a",
    scope_id: entityId("jurisdiction", "CN"),
    relation: RELATION_CORRIDOR_JURISDICTION,
    confidence: 1.0,
    attributed_to: ATTRIBUTED_BY,
  });
});

test("planCorridorJurisdictionScope: an already-scoped pairing is skipped, never re-inserted (idempotent)", () => {
  const byCode = new Map([["CN", entityId("jurisdiction", "CN")]]);
  const pairs = [{ corridorEntityId: "cl:corridor:a", iso: "CN" }];
  const existing = new Set([`cl:corridor:a|${entityId("jurisdiction", "CN")}|${RELATION_CORRIDOR_JURISDICTION}`]);
  const { rows, skipped } = planCorridorJurisdictionScope(pairs, byCode, existing);
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
});

test("planCorridorJurisdictionScope: falls back to entityId('jurisdiction', iso) when byCode lacks the code (defensive, matches entityId's own determinism)", () => {
  const { rows } = planCorridorJurisdictionScope([{ corridorEntityId: "cl:corridor:a", iso: "US" }], new Map());
  assert.equal(rows[0].scope_id, entityId("jurisdiction", "US"));
});

// ── main(): deps-injected orchestration ─────────────────────────────────────────────────────────────

function deps(calls, { corridors = [], jurisdictions = [], identifiers = [], scope = [] } = {}) {
  return {
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table]);
      if (table === "entities") {
        // Distinguish the two `entities` reads by which kind filter main() applies.
        const probe = { eq: (col, val) => { probe._kind = val; return probe; } };
        if (opts?.match) opts.match(probe);
        return probe._kind === "jurisdiction" ? jurisdictions : corridors;
      }
      if (table === "entity_identifiers") return identifiers;
      if (table === "entity_scope") return scope;
      throw new Error(`unexpected readAll(${table})`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      calls.push(["guardedInsertMany", table, rows, opts]);
      return { inserted: rows.length };
    },
  };
}

test("main dry-run: reads live corridors, plans jurisdiction entities + scope rows, writes nothing", async () => {
  const calls = [];
  const r = await main({ mode: "dry" }, deps(calls, { corridors: [{ entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" }] }));
  assert.equal(r.mode, "dry-run");
  assert.equal(r.corridorsRead, 1);
  assert.equal(r.jurisdictionCodes, 2);
  assert.equal(r.jurisdictionEntitiesCreated, 2);
  assert.equal(r.scopeRowsPlanned, 2);
  assert.equal(r.scopeRowsWritten, 0);
  assert.ok(!calls.some((c) => c[0] === "guardedInsertMany"));
});

test("main apply: writes jurisdiction entities then entity_scope rows through the guarded path, with the CITE", async () => {
  const calls = [];
  const r = await main({ mode: "apply" }, deps(calls, { corridors: [{ entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" }] }));
  assert.equal(r.scopeRowsWritten, 2);
  const entityWrite = calls.find((c) => c[0] === "guardedInsertMany" && c[1] === "entities");
  const scopeWrite = calls.find((c) => c[0] === "guardedInsertMany" && c[1] === "entity_scope");
  assert.ok(entityWrite, "jurisdiction entities are written");
  assert.equal(entityWrite[2].length, 2);
  assert.ok(entityWrite[2].every((e) => e.kind === "jurisdiction"));
  assert.ok(scopeWrite, "entity_scope rows are written");
  assert.equal(scopeWrite[2].length, 2);
  assert.equal(scopeWrite[3].cite, CITE);
  assert.ok(scopeWrite[2].every((r2) => r2.relation === RELATION_CORRIDOR_JURISDICTION));
});

test("main: pre-existing jurisdiction entities and an already-scoped pair are not re-written", async () => {
  const cnId = entityId("jurisdiction", "CN");
  const nlId = entityId("jurisdiction", "NL");
  const calls = [];
  const r = await main({ mode: "apply" }, deps(calls, {
    corridors: [{ entity_id: "cl:corridor:a", canonical_name: "CNSHA-NLRTM:ocean" }],
    jurisdictions: [{ entity_id: cnId }, { entity_id: nlId }],
    scope: [{ subject_id: "cl:corridor:a", scope_id: cnId, relation: RELATION_CORRIDOR_JURISDICTION }],
  }));
  assert.equal(r.jurisdictionEntitiesCreated, 0);
  assert.equal(r.scopeRowsWritten, 1); // only the NL pairing is new
  assert.ok(!calls.some((c) => c[0] === "guardedInsertMany" && c[1] === "entities"));
  const scopeWrite = calls.find((c) => c[0] === "guardedInsertMany" && c[1] === "entity_scope");
  assert.equal(scopeWrite[2][0].scope_id, nlId);
});

test("main: a corridor with an unparseable canonical_name is named as skipped, never crashes the run", async () => {
  const calls = [];
  const r = await main({ mode: "dry" }, deps(calls, { corridors: [{ entity_id: "cl:corridor:bad", canonical_name: "garbage" }] }));
  assert.equal(r.parseSkipped, 1);
  assert.equal(r.scopeRowsPlanned, 0);
});
