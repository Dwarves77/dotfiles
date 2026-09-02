// regional-eurostat-lc-lci-lev-composition.test.mjs — the F27 (producer-seam-proof) proof
// scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs needs, same shape as
// regional-eurostat-nrg-pc-205-composition.test.mjs / regional-bls-oews-composition.test.mjs: this
// producer entry point imports TWO first-party seams (its own parser,
// src/lib/regional/eurostat-lc-lci-lev-parser.mjs, and the shared orchestration shell's toCandidateRows/
// latestPerNaturalKey, scripts/producers/regional/run-envelope-producer.mjs) and F27 requires ONE proof
// file that imports both together, composed, against real fixture-shaped data — not two isolated unit
// tests that never touch each other. See run-envelope-producer.mjs's own header for the exact incident
// class this closes (a chain of independently-correct layers that had never been run together).
//
// ALSO proves this producer's own decideApply() gating (the third, producer-specific kill-switch gate —
// see the producer's file header) and fetchAllMemberStates()'s per-geo fetch-failure tolerance, neither of
// which the shared orchestrator or the parser's own fixture test cover.
//
// LOCATION: same reasoning as every proof in this directory — run-test-suite.sh globs
// `fsi-app/src/__tests__/*.test.mjs`, which has no equivalent glob over `src/lib/regional/**` or
// `scripts/producers/**`.
//
// $0: pure, in-process, no database, no network (fetchAllMemberStates is exercised via an injected fake
// fetch, never the real one) — the exact composition eurostat-lc-lci-lev-producer.mjs performs via
// runEnvelopeProducer(), minus the guarded I/O boundary (scripts/lib/db.mjs) and region_id resolution,
// which happen strictly after latestPerNaturalKey and are out of scope for a seam proof between
// src/lib/regional and the orchestrator's pure core (same scoping the two sibling composition tests use).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { aggregateLcLciLevForRegion, EU_MEMBER_GEO_CODES } from "../lib/regional/eurostat-lc-lci-lev-parser.mjs";
import { toCandidateRows, latestPerNaturalKey } from "../../scripts/producers/regional/run-envelope-producer.mjs";
import { decideApply, fetchAllMemberStates } from "../../scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

// Live regional_data_facts_dimension_check (supabase/migrations/106_regions_and_facts.sql) — same
// constant, same reasoning, as the two sibling composition tests' own copies.
const DIMENSION_VALUES = Object.freeze([
  "regulatory_feasibility", "regional_resources", "labor_markets",
  "materials_sourcing", "infrastructure", "operational_cost",
]);

const HERE = dirname(fileURLToPath(import.meta.url));
// The SAME committed fixture eurostat-lc-lci-lev-parser.npmtest.mjs is proven against — real Eurostat
// JSON-stat 2.0 SHAPE (dimension codes confirmed live this session), illustrative numeric values (see the
// fixture's own "_test_fixture_note": outbound access to ec.europa.eu is blocked in the sandbox that
// authored both this file and the fixture). Two member states, DE (sparse — one year missing) and FR
// (both years present) — exercises the parser's "pick latest available per country" logic inside the
// full composition, not invented for this proof.
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "..", "lib", "regional", "fixtures", "eurostat-lc-lci-lev-sample.json"), "utf8"),
);

test("the full composition: fixture (2 member states) -> aggregateLcLciLevForRegion -> toCandidateRows -> latestPerNaturalKey", () => {
  const jsByGeo = { DE: FIXTURE.DE, FR: FIXTURE.FR };
  const observations = aggregateLcLciLevForRegion(jsByGeo, { geoCodes: ["DE", "FR"], regionCode: "EU" });
  assert.equal(observations.length, 1, "one aggregate observation for region 'EU', not one per country");

  const candidates = toCandidateRows(observations);
  assert.equal(candidates.length, 1, "toCandidateRows must not drop or add rows");

  // A single-observation run has nothing to reduce (latestPerNaturalKey exists for the multi-period-per-
  // key case the Eurostat semester shape produces, e.g. nrg_pc_205 — lc_lci_lev's aggregate is already
  // one row per natural key by construction), but the seam must still pass a single candidate through
  // unchanged rather than dropping it.
  const reduced = latestPerNaturalKey(candidates);
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].value_numeric, 46.2, "(50.3 + 42.1) / 2, DE's and FR's own latest (2023) values");
});

test("every composed candidate row satisfies the LIVE regional_data_facts constraints", () => {
  const jsByGeo = { DE: FIXTURE.DE, FR: FIXTURE.FR };
  const observations = aggregateLcLciLevForRegion(jsByGeo, { geoCodes: ["DE", "FR"], regionCode: "EU" });
  const reduced = latestPerNaturalKey(toCandidateRows(observations));
  assert.equal(reduced.length, 1);

  const r = reduced[0];
  // value: TEXT NOT NULL (migration 106) — the same WO-17 2026-08-30 regression guard the sibling
  // composition tests carry, proven here for THIS producer's own composed output.
  assert.equal(typeof r.value, "string");
  assert.ok(r.value.length > 0);

  assert.ok(DIMENSION_VALUES.includes(r.dimension), `illegal dimension "${r.dimension}"`);
  assert.equal(r.dimension, "labor_markets");
  assert.equal(typeof r.fact_label, "string");
  assert.ok(r.fact_label.length > 0);

  assert.equal(typeof r.value_numeric, "number");
  assert.ok(Number.isFinite(r.value_numeric));
  assert.equal(r.unit, "EUR/hour");

  assert.ok(DERIVATION_VALUES.includes(r.derivation), `illegal derivation "${r.derivation}"`);
  assert.equal(r.derivation, "calculated", "an aggregate this module computed, not a Eurostat-published figure");
  assert.ok(ORIGIN_CLASS_VALUES.includes(r.origin_class), `illegal origin_class "${r.origin_class}"`);
  assert.equal(r.origin_class, "derived");

  assert.ok(
    r.n_observations === null || (Number.isInteger(r.n_observations) && r.n_observations > 0),
    `illegal n_observations ${JSON.stringify(r.n_observations)}`,
  );
  assert.equal(r.n_observations, 2, "sample size behind the aggregate — both DE and FR contributed");

  assert.equal(r.source_key, "eurostat");
  assert.equal(typeof r.region_code, "string");
  assert.equal(r.region_code, "EU");
});

test("EU_MEMBER_GEO_CODES is exactly what the producer's fetch loop and the parser's mean both iterate — no drift between the two", () => {
  assert.deepEqual([...EU_MEMBER_GEO_CODES].sort(), ["BE", "DE", "ES", "FR", "IT", "NL"]);
});

// ── fetchAllMemberStates: per-geo fetch-failure tolerance (not covered by the parser's own fixture test) ──

test("fetchAllMemberStates: a 404/network failure for one geo excludes it, other geos still resolve", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("geo=DE")) return { ok: true, json: async () => FIXTURE.DE };
    if (url.includes("geo=FR")) return { ok: false, status: 404, statusText: "Not Found" };
    return { ok: true, json: async () => ({}) }; // other geos: empty-but-ok payload
  };
  const jsByGeo = await fetchAllMemberStates(fakeFetch);
  assert.ok(jsByGeo.DE, "DE resolved");
  assert.equal(jsByGeo.FR, undefined, "FR's 404 must exclude it, not throw or fabricate a value");
});

test("fetchAllMemberStates: a thrown fetch (network error) for one geo excludes it, does not abort the whole run", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("geo=DE")) throw new Error("ECONNRESET");
    return { ok: true, json: async () => FIXTURE.FR };
  };
  const jsByGeo = await fetchAllMemberStates(fakeFetch);
  assert.equal(jsByGeo.DE, undefined);
  assert.ok(jsByGeo.FR ?? jsByGeo.BE ?? jsByGeo.IT ?? jsByGeo.NL ?? jsByGeo.ES, "at least one other geo still resolved");
});

// ── decideApply: the producer's own third gate (mirrors ecb-fx-producer.mjs's contract exactly) ───────

test("decideApply: a dry run (no --apply) always proceeds, regardless of every other gate", () => {
  const d = decideApply({ apply: false, enabled: false, killSwitchOn: false, hasCreds: false });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /dry run/);
});

test("decideApply: --apply with ENABLED=false is refused even if the env kill switch and creds are on", () => {
  const d = decideApply({ apply: true, enabled: false, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /ENABLED constant/);
});

test("decideApply: --apply with ENABLED=true but the env kill switch off is refused (the default-off gate)", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: false, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /kill switch/);
  assert.match(d.reason, /REGIONAL_PRODUCER_EUROSTAT_LC_LCI_LEV_ENABLED/);
});

test("decideApply: --apply with every gate but DB creds is refused", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /DB creds/);
});

test("decideApply: --apply with all three gates satisfied can write", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, true);
});
