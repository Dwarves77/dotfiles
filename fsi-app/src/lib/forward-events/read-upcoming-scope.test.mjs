// read-upcoming-scope.test.mjs: proof for the SCOPED read added to read-upcoming.mjs (lane MKT-1,
// 2026-10-08, operator ruling: the Market policy timeline is filtered to the active mode and region, with
// the spec 00 section 4 "N hidden by your scope" count). Pure functions plus readUpcoming against a fake
// supabase-shaped client; $0, in-process, no network, no npm dependency.
//
// What is attacked: the scope resolution order (facet first, else profile, per dimension), the mode rule
// (an item with no modes is mode-agnostic and is KEPT), the hidden count (counted against the same window
// with no scope at all), and the guarantee that an unscoped read, the one Regulations uses, is unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modeMatches,
  resolveScope,
  scopeLabel,
  selectUpcoming,
  readUpcoming,
  fetchUpcomingObligations,
} from "./read-upcoming.mjs";

// ── modeMatches ──────────────────────────────────────────────────────────────────────────────────────

test("modeMatches: null or empty filter matches everything", () => {
  assert.equal(modeMatches(["ocean"], null), true);
  assert.equal(modeMatches(["ocean"], []), true);
});

test("modeMatches: case-insensitive any-of over the item's modes", () => {
  assert.equal(modeMatches(["Ocean", "road"], ["ocean"]), true);
  assert.equal(modeMatches(["air"], ["ocean", "road"]), false);
  assert.equal(modeMatches(["air", "road"], ["ocean", "road"]), true);
});

test("modeMatches: an item that declares no modes is mode-agnostic and is kept, never hidden as no match", () => {
  assert.equal(modeMatches(null, ["ocean"]), true);
  assert.equal(modeMatches([], ["ocean"]), true);
  assert.equal(modeMatches(undefined, ["ocean"]), true);
});

// ── resolveScope: facet first, else profile, each dimension on its own ───────────────────────────────

test("resolveScope: facets win over the profile on the dimensions they set", () => {
  const s = resolveScope({
    facetModes: ["ocean"],
    facetRegions: ["eu"],
    profileModes: ["air", "road"],
    profileJurisdictions: { us: 2, gb: 1 },
  });
  assert.deepEqual(s.modes, ["ocean"]);
  assert.deepEqual(s.regions, ["eu"]);
  assert.deepEqual(s.source, { modes: "facet", regions: "facet" });
});

test("resolveScope: no facets falls back to the profile's modes and jurisdictions", () => {
  const s = resolveScope({ profileModes: ["Air", "ocean"], profileJurisdictions: { EU: 3, global: 1 } });
  assert.deepEqual(s.modes, ["air", "ocean"]);
  assert.deepEqual(s.regions, ["eu"]);
  assert.deepEqual(s.source, { modes: "profile", regions: "profile" });
});

test("resolveScope: a mode facet with no region facet still takes the profile's regions", () => {
  const s = resolveScope({ facetModes: "road", profileModes: ["air"], profileJurisdictions: { us: 1 } });
  assert.deepEqual(s.modes, ["road"]);
  assert.deepEqual(s.regions, ["us"]);
  assert.deepEqual(s.source, { modes: "facet", regions: "profile" });
});

test("resolveScope: a generic region facet is never a filter; nothing at all resolves to no filter", () => {
  const g = resolveScope({ facetRegions: ["global"], profileJurisdictions: { global: 1 } });
  assert.equal(g.regions, null);
  assert.equal(g.source.regions, null);
  const none = resolveScope({});
  assert.deepEqual(none, { modes: null, regions: null, source: { modes: null, regions: null } });
});

test("resolveScope: facet values arrive as a comma string from the route and are trimmed and lower-cased", () => {
  const s = resolveScope({ facetModes: " Ocean, ROAD ", facetRegions: "EU,us" });
  assert.deepEqual(s.modes, ["ocean", "road"]);
  assert.deepEqual(s.regions, ["eu", "us"]);
});

// ── scopeLabel: the filter as text ───────────────────────────────────────────────────────────────────

test("scopeLabel: modes in title case then regions, short codes upper-cased", () => {
  assert.equal(scopeLabel({ modes: ["ocean"], regions: ["eu"] }), "Ocean, EU");
  assert.equal(scopeLabel({ modes: ["air", "road"], regions: ["us", "imo"] }), "Air, Road, US, IMO");
  assert.equal(scopeLabel({ modes: null, regions: ["singapore"] }), "Singapore");
  assert.equal(scopeLabel({ modes: null, regions: null }), "");
});

// ── selectUpcoming with a mode filter ────────────────────────────────────────────────────────────────

const OCEAN_EU = { id: "i1", title: "FuelEU", legacy_id: null, jurisdiction_iso: ["EU"], transport_modes: ["ocean"] };
const AIR_EU = { id: "i2", title: "ReFuelEU", legacy_id: null, jurisdiction_iso: ["EU"], transport_modes: ["air"] };
const OCEAN_US = { id: "i3", title: "US port rule", legacy_id: null, jurisdiction_iso: ["US"], transport_modes: ["ocean"] };
const AGNOSTIC_EU = { id: "i4", title: "CSRD", legacy_id: null, jurisdiction_iso: ["EU"], transport_modes: [] };
const ITEMS = new Map([OCEAN_EU, AIR_EU, OCEAN_US, AGNOSTIC_EU].map((i) => [i.id, i]));
const ev = (id, itemId, date) => ({
  id, intelligence_item_id: itemId, event_date: date, date_precision: "day", event_kind: "compliance_deadline",
  obligation_text: `o ${id}`, source_kind: "claim", confidence: "high",
});
const EVENTS = [ev("e1", "i1", "2026-11-01"), ev("e2", "i2", "2026-11-02"), ev("e3", "i3", "2026-11-03"), ev("e4", "i4", "2026-11-04")];

test("selectUpcoming: modeFilter and jurisdictionFilter compose; a mode-agnostic item survives the mode filter", () => {
  const out = selectUpcoming(EVENTS, ITEMS, { modeFilter: ["ocean"], jurisdictionFilter: ["eu"] });
  assert.deepEqual(out.map((e) => e.id), ["e1", "e4"]);
});

test("selectUpcoming: no modeFilter is the old behaviour", () => {
  assert.deepEqual(selectUpcoming(EVENTS, ITEMS, { jurisdictionFilter: ["eu"] }).map((e) => e.id), ["e1", "e2", "e4"]);
  assert.equal(selectUpcoming(EVENTS, ITEMS, {}).length, 4);
});

// ── readUpcoming against a fake client ───────────────────────────────────────────────────────────────

/** A chainable, awaitable stand-in for a supabase-js query builder over fixed rows. */
function fakeClient({ events, items }) {
  const builder = (rows) => {
    const b = {
      select: () => b, gte: () => b, in: () => b, order: () => b, limit: () => b, eq: () => b,
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return b;
  };
  return { from: (table) => builder(table === "item_forward_events" ? events : items) };
}
const CLIENT = fakeClient({ events: EVENTS, items: [...ITEMS.values()] });

test("readUpcoming: a scoped read returns the filtered events and counts what the scope hid in the same window", async () => {
  const r = await readUpcoming(CLIENT, { jurisdictionFilter: ["eu"], modeFilter: ["ocean"], countHidden: true, limit: 8 });
  assert.deepEqual(r.events.map((e) => e.id), ["e1", "e4"]);
  assert.equal(r.hiddenByScope, 2, "the air EU event and the ocean US event are hidden");
});

test("readUpcoming: the hidden count is over the whole window, not the capped page", async () => {
  const r = await readUpcoming(CLIENT, { jurisdictionFilter: ["eu"], modeFilter: ["ocean"], countHidden: true, limit: 1 });
  assert.equal(r.events.length, 1);
  assert.equal(r.hiddenByScope, 2);
});

test("readUpcoming: an unscoped read reports hiddenByScope null and is the old read", async () => {
  const r = await readUpcoming(CLIENT, { jurisdictionFilter: ["eu"], limit: 8 });
  assert.equal(r.hiddenByScope, null);
  assert.deepEqual(r.events.map((e) => e.id), ["e1", "e2", "e4"]);
});

test("fetchUpcomingObligations still returns a plain array, so every pre-existing caller is unchanged", async () => {
  const out = await fetchUpcomingObligations(CLIENT, { limit: 8 });
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 4);
});

test("readUpcoming: no events at all is an empty result, with a zero hidden count only when scoped", async () => {
  const empty = fakeClient({ events: [], items: [] });
  assert.deepEqual(await readUpcoming(empty, { countHidden: true }), { events: [], hiddenByScope: 0 });
  assert.deepEqual(await readUpcoming(empty, {}), { events: [], hiddenByScope: null });
});
