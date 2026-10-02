// Test for the read-time relevance lens (Option B, mig 251). Pure, runs in the no-npm discipline suite
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

// ── applicability wiring (coordinator ruling 2026-09-29, workstream 7 / ADR-034) ──────────────────
// roleScope is derived from the item's own compliance_object_tags (the only role-shaped field any
// item or obligations row carries live, see relevance.mjs header); org_roles/org_size come from
// the profile's new ADR-034 keys, distinct from PROFILE.roles (free text) above.

test("applicability: item's compliance_object_tags maps to a role the profile holds → applies", () => {
  const item = { title: "Freight forwarder customs liability rule", compliance_object_tags: ["freight-forwarder"] };
  const profile = { ...PROFILE, orgRoles: ["forwarder"], orgSize: {} };
  const r = computeItemRelevance(item, profile, SECTORS);
  assert.equal(r.applicability.status, "applies");
});

test("applicability: item's role scope excludes every role the profile holds → does_not_apply", () => {
  const item = { title: "Warehouse operator storage rule", compliance_object_tags: ["warehouse-operator"] };
  const profile = { ...PROFILE, orgRoles: ["carrier"], orgSize: {} };
  const r = computeItemRelevance(item, profile, SECTORS);
  assert.equal(r.applicability.status, "does_not_apply");
});

test("applicability: item's role scope set, profile has no org_roles → needs_profile_input naming 'role'", () => {
  const item = { title: "Carrier emissions rule", compliance_object_tags: ["carrier-ocean"] };
  const profile = { ...PROFILE, orgRoles: [], orgSize: {} };
  const r = computeItemRelevance(item, profile, SECTORS);
  assert.equal(r.applicability.status, "needs_profile_input");
  assert.deepEqual(r.applicability.missingDimensions, ["role"]);
});

test("applicability: a size threshold with no org_size → needs_profile_input naming org_size", () => {
  // No live field sets item.size_threshold today (checked: src/lib/obligations/read-register.mjs's
  // REGISTER_SELECT and migration 290 carry no size column), this proves the defensive read wires
  // computeApplicability's size gate correctly for the day a producer starts setting it, without any
  // schema change here.
  const item = {
    title: "Large-forwarder-only reporting duty",
    size_threshold: { dimension: "headcount", band: "medium", comparison: "at_least" },
  };
  const profile = { ...PROFILE, orgRoles: [], orgSize: {} };
  const r = computeItemRelevance(item, profile, SECTORS);
  assert.equal(r.applicability.status, "needs_profile_input");
  assert.deepEqual(r.applicability.missingDimensions, ["headcount"]);
});

test("applicability: unmapped compliance_object_tags (no ORG_ROLES counterpart) never blocks as does_not_apply", () => {
  const item = { title: "Port operator infrastructure rule", compliance_object_tags: ["port-operator"] };
  const profile = { ...PROFILE, orgRoles: ["forwarder"], orgSize: {} };
  const r = computeItemRelevance(item, profile, SECTORS);
  // "port-operator" has no ORG_ROLES mapping, so roleScope derives empty and applicability is
  // "applies to every role" (no scope named), never a false does_not_apply from a silent drop.
  assert.equal(r.applicability.status, "applies");
});
