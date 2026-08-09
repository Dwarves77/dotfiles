// Test for the read-time relevance lens (Option B, mig 251). Pure — runs in the no-npm discipline suite
// (wired via the src/lib/workspace/*.test.mjs glob in run-test-suite.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeItemRelevance } from "./relevance.mjs";

const SECTORS = [
  { id: "fine-art", label: "Fine Art & Museum Logistics", keywords: ["artwork", "fine art", "gallery", "museum"] },
  { id: "luxury-goods", label: "Luxury Goods & High Value", keywords: ["luxury", "jewelry", "watches"] },
  { id: "automotive", label: "Automotive", keywords: ["vehicle", "automotive", "car"] },
];
const PROFILE = {
  roles: ["freight forwarder", "importer", "exporter"],
  transport_modes: ["air", "ocean", "road"],
  verticals: ["fine-art", "luxury-goods", "automotive", "film-tv", "live-events", "humanitarian"],
  jurisdictions: { global: 1, eu: 1, us: 0.9, imo: 1 },
};

test("mode + vertical + geo match → high band, summary names them", () => {
  const item = { transport_modes: ["ocean"], jurisdictions: ["eu"], title: "Fine art export controls", topic_tags: ["customs"], compliance_object_tags: ["export declaration"] };
  const r = computeItemRelevance(item, PROFILE, SECTORS);
  assert.equal(r.band, "high");
  assert.deepEqual(r.matchedModes, ["ocean"]);
  assert.equal(r.matchedVerticals.some((v) => v.id === "fine-art"), true);
  assert.equal(r.roleSignals.length, 3); // export/customs → all roles engage
  assert.match(r.summary, /ocean/);
  assert.match(r.summary, /Fine Art/);
});

test("mode-agnostic item (no transport_modes) applies across modes, not 'no match'", () => {
  const item = { jurisdictions: ["global"], title: "Corporate sustainability reporting directive", topic_tags: ["esg"] };
  const r = computeItemRelevance(item, PROFILE, SECTORS);
  assert.notEqual(r.band, "low");
  assert.match(r.summary, /across modes/);
});

test("global profile puts every jurisdiction in scope", () => {
  const item = { transport_modes: ["air"], jurisdictions: ["brazil"], title: "Air cargo rule" };
  const r = computeItemRelevance(item, PROFILE, SECTORS);
  assert.equal(r.matchedJurisdictions.includes("brazil"), true);
});

test("item outside the reader's modes still matches on geo/vertical but not the absent mode", () => {
  const item = { transport_modes: ["rail"], jurisdictions: ["eu"], title: "Rail freight luxury goods" };
  const r = computeItemRelevance(item, PROFILE, SECTORS);
  assert.deepEqual(r.matchedModes, []); // rail not in profile
  assert.equal(r.matchedVerticals.some((v) => v.id === "luxury-goods"), true);
});

test("empty/degenerate inputs never throw and yield a safe low/general result", () => {
  const r = computeItemRelevance({}, {}, []);
  assert.equal(typeof r.summary, "string");
  assert.ok(["high", "medium", "low"].includes(r.band));
});
