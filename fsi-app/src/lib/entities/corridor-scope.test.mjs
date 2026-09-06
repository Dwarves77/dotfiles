// Unit tests for corridor-scope.ts — run: node --test fsi-app/src/lib/entities/corridor-scope.test.mjs
// Fake-client idiom mirrors read-register.test.mjs's fakeSupabase()/read-upcoming.mjs's own testing
// shape (see corridor-scope.ts's own header for why this file needs no real Supabase SDK).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCorridorCanonicalName,
  listCorridorScopes,
  listCorridorsTouchingJurisdictions,
  getInstrumentsForJurisdictions,
  getObligationCountForJurisdictions,
  getCorridorScopeSummary,
  RELATION_TOUCHES_JURISDICTION,
} from "./corridor-scope.ts";

// ── parseCorridorCanonicalName (pure) ─────────────────────────────────────────────────────────────────

test("parseCorridorCanonicalName parses the seed-corridors.mjs convention", () => {
  assert.deepEqual(parseCorridorCanonicalName("CNSHA-NLRTM:ocean"), {
    origin: "CNSHA",
    dest: "NLRTM",
    mode: "ocean",
  });
});

test("parseCorridorCanonicalName returns null on a malformed name, never guesses", () => {
  assert.equal(parseCorridorCanonicalName("not-a-corridor"), null);
  assert.equal(parseCorridorCanonicalName(""), null);
  assert.equal(parseCorridorCanonicalName(null), null);
});

// ── fake client ───────────────────────────────────────────────────────────────────────────────────────

function chainOf(terminalResult) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    order: () => chain,
    overlaps: () => chain,
    then: (resolve) => Promise.resolve(terminalResult).then(resolve),
  };
  // Object is directly awaitable (thenable) AND chainable — matches supabase-js's own builder shape,
  // and lets a caller either await the chain directly or keep calling filters first.
  return chain;
}

/**
 * @param {{
 *   corridors?: Array<{entity_id:string, canonical_name:string, display_name?:string|null}>,
 *   jurisdictions?: Array<{entity_id:string, canonical_name:string, display_name?:string|null}>,
 *   scope?: Array<{subject_id:string, scope_id:string, relation:string}>,
 *   entityRefs?: Array<{ref_id:string}>,
 *   items?: Array<{instrument_entity_id:string|null}>,
 *   instruments?: Array<{entity_id:string, canonical_name:string}>,
 *   obligationCount?: number,
 * }} fixtures
 */
function fakeClient(fixtures) {
  return {
    from(table) {
      if (table === "entities") {
        // Distinguish corridor vs jurisdiction vs instrument reads by which fixture list has rows
        // matching what's asked — the real code always filters, so here we just hand back the right
        // bucket per call site's known shape (kind='corridor' first call, then jurisdiction .in(), then
        // possibly instrument .in()+kind='instrument'). Simplify: track call count.
        const state = { kind: null };
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            if (col === "kind") state.kind = val;
            return chain;
          },
          in: (col, ids) => {
            if (state.kind === "instrument") {
              return chainOf({ data: (fixtures.instruments ?? []).filter((r) => ids.includes(r.entity_id)), error: null });
            }
            return chainOf({ data: (fixtures.jurisdictions ?? []).filter((r) => ids.includes(r.entity_id)), error: null });
          },
          order: () => chainOf({ data: fixtures.corridors ?? [], error: null }),
        };
        return chain;
      }
      if (table === "entity_scope") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chainOf({ data: fixtures.scope ?? [], error: null }),
        };
        return chain;
      }
      if (table === "entity_refs") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chainOf({ data: fixtures.entityRefs ?? [], error: null }),
        };
        return chain;
      }
      if (table === "intelligence_items") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          not: () => chainOf({ data: fixtures.items ?? [], error: null }),
          in: () => chain,
        };
        return chain;
      }
      if (table === "obligations") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          overlaps: () => chainOf({ count: fixtures.obligationCount ?? 0, error: null }),
        };
        return chain;
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const CNSHA_NLRTM = { entity_id: "cl:corridor:aaa", canonical_name: "CNSHA-NLRTM:ocean", display_name: null };
const CN = { entity_id: "cl:jurisdiction:cn", canonical_name: "CN", display_name: null };
const NL = { entity_id: "cl:jurisdiction:nl", canonical_name: "NL", display_name: null };

test("listCorridorScopes: joins entities -> entity_scope -> entities into a labeled, jurisdiction-listed corridor", async () => {
  const client = fakeClient({
    corridors: [CNSHA_NLRTM],
    scope: [
      { subject_id: CNSHA_NLRTM.entity_id, scope_id: CN.entity_id, relation: RELATION_TOUCHES_JURISDICTION },
      { subject_id: CNSHA_NLRTM.entity_id, scope_id: NL.entity_id, relation: RELATION_TOUCHES_JURISDICTION },
    ],
    jurisdictions: [CN, NL],
  });
  const result = await listCorridorScopes(client);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, "Shanghai (CN) → Rotterdam (NL), ocean");
  assert.equal(result[0].jurisdictions.length, 2);
  assert.deepEqual(
    result[0].jurisdictions.map((j) => j.code).sort(),
    ["CN", "NL"],
  );
});

test("listCorridorScopes: prefers a live display_name over the composed label", async () => {
  const named = { ...CNSHA_NLRTM, display_name: "Shanghai to Rotterdam" };
  const client = fakeClient({ corridors: [named], scope: [], jurisdictions: [] });
  const result = await listCorridorScopes(client);
  assert.equal(result[0].label, "Shanghai to Rotterdam");
});

test("listCorridorScopes: returns [] when no corridor entities exist, never throws", async () => {
  const client = fakeClient({ corridors: [] });
  assert.deepEqual(await listCorridorScopes(client), []);
});

test("listCorridorsTouchingJurisdictions: filters to corridors whose scope includes the given codes", async () => {
  const other = { entity_id: "cl:corridor:bbb", canonical_name: "CNSHA-USNYC:ocean", display_name: null };
  const US = { entity_id: "cl:jurisdiction:us", canonical_name: "US", display_name: null };
  const client = fakeClient({
    corridors: [CNSHA_NLRTM, other],
    scope: [
      { subject_id: CNSHA_NLRTM.entity_id, scope_id: NL.entity_id, relation: RELATION_TOUCHES_JURISDICTION },
      { subject_id: other.entity_id, scope_id: US.entity_id, relation: RELATION_TOUCHES_JURISDICTION },
    ],
    jurisdictions: [NL, US],
  });
  const result = await listCorridorsTouchingJurisdictions(client, ["nl"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].entityId, CNSHA_NLRTM.entity_id);
});

test("listCorridorsTouchingJurisdictions: empty iso list returns [] without reading anything", async () => {
  const client = fakeClient({ corridors: [CNSHA_NLRTM] });
  assert.deepEqual(await listCorridorsTouchingJurisdictions(client, []), []);
});

test("getInstrumentsForJurisdictions: hops entity_refs -> intelligence_items -> entities, never text-matches", async () => {
  const client = fakeClient({
    entityRefs: [{ ref_id: "item-1" }, { ref_id: "item-2" }],
    items: [{ instrument_entity_id: "cl:instrument:x" }, { instrument_entity_id: null }],
    instruments: [{ entity_id: "cl:instrument:x", canonical_name: "32023R1805" }],
  });
  const result = await getInstrumentsForJurisdictions(client, [CN.entity_id]);
  assert.deepEqual(result, [{ entityId: "cl:instrument:x", canonicalName: "32023R1805" }]);
});

test("getInstrumentsForJurisdictions: [] jurisdiction list short-circuits to [], no read", async () => {
  const client = fakeClient({});
  assert.deepEqual(await getInstrumentsForJurisdictions(client, []), []);
});

test("getObligationCountForJurisdictions: reads the overlap count, [] codes short-circuits to 0", async () => {
  const client = fakeClient({ obligationCount: 12 });
  assert.equal(await getObligationCountForJurisdictions(client, ["CN", "NL"]), 12);
  assert.equal(await getObligationCountForJurisdictions(client, []), 0);
});

test("getCorridorScopeSummary: bundles jurisdictions + instruments + obligation count for one corridor", async () => {
  const client = fakeClient({
    corridors: [CNSHA_NLRTM],
    scope: [{ subject_id: CNSHA_NLRTM.entity_id, scope_id: CN.entity_id, relation: RELATION_TOUCHES_JURISDICTION }],
    jurisdictions: [CN],
    entityRefs: [{ ref_id: "item-1" }],
    items: [{ instrument_entity_id: "cl:instrument:x" }],
    instruments: [{ entity_id: "cl:instrument:x", canonical_name: "32023R1805" }],
    obligationCount: 3,
  });
  const summary = await getCorridorScopeSummary(client, CNSHA_NLRTM.entity_id);
  assert.equal(summary.instruments.length, 1);
  assert.equal(summary.obligationCount, 3);
});

test("getCorridorScopeSummary: returns null for an unknown corridor id, never a fabricated summary", async () => {
  const client = fakeClient({ corridors: [] });
  assert.equal(await getCorridorScopeSummary(client, "cl:corridor:missing"), null);
});
