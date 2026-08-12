// Proof for the source licence register and the factor tier resolver (2026-08-12).
//
// Run standalone: node --test fsi-app/src/__tests__/contracts-licence-and-tier.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh.
//
// WHAT THIS LOCKS. A licence verification pass on 2026-08-12 found that four datasets a v1 seed plan
// named cannot be embedded and re-served commercially, and that three assumed-safe ones are also not
// safe. The register turns that finding into a GATE rather than a memo, because a licence policy in a
// document gets violated by whoever writes the next importer, and a gate that throws does not.
//
// It also locks the DQI DIRECTION. The original tier design implied higher-is-better ("2 of 5" for a
// default upgrading to "5/5"), which is inverted relative to the ecoinvent/ISO 14083 pedigree already
// shipped in vocabularies.mjs (1 = best). Two scales pointing opposite ways in one product is how a
// quality score silently inverts, and section 3 asserts the direction in both directions.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REDISTRIBUTION, SOURCE_LICENCES, SOURCE_KEYS,
  licenceFor, mayEmbedAsSeed, assertEmbeddable, attributionFor, attributionsFor, licenceTriage,
} from "../lib/contracts/source-licence.mjs";
import {
  FACTOR_TIERS, TIER_CODES, isPrimaryData, validateFactor,
  resolveActiveFactor, primaryDataShare, pedigreeToStars, renderFactorCandidateViewSql,
} from "../lib/contracts/factor-tier.mjs";

// A complete, VALID modal factor. Every field is required by validateFactor for scope_kind "modal".
// The shape changed 2026-08-12 when the table was designed: a factor is no longer a bare
// co2e_per_tkm, it carries its scope, its denominator, its GWP basis and its validity window.
const MODAL = Object.freeze({
  tier: "modal_default", scope_kind: "modal",
  vehicle_class: "artic_33_44t", energy_carrier: "diesel", jurisdiction: "GB",
  quantity_basis: "tonne_km", wtw_co2e: 0.062, gwp_basis: "AR6_GWP100",
  source_key: "desnz_ghg_factors", as_at_date: "2026-07-31", valid_from: "2026-01-01",
});

// ── 1. the register is well-formed and evidence-bearing ──────────────────

test("every register entry carries a verdict, a URL and the date it was verified", () => {
  for (const k of SOURCE_KEYS) {
    const e = SOURCE_LICENCES[k];
    assert.equal(e.key, k, `${k} key mismatch`);
    assert.ok(REDISTRIBUTION[e.redistribution], `${k} has an unknown verdict`);
    assert.ok(e.url && e.url.startsWith("http"), `${k} needs the URL that was read`);
    assert.match(e.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, `${k} needs a verification date`);
  }
});

test("every prohibited entry names its blocker, and every conditional names who to ask", () => {
  for (const k of SOURCE_KEYS) {
    const e = SOURCE_LICENCES[k];
    if (e.redistribution === "prohibited") {
      assert.ok(e.blocker && e.blocker.length > 20, `${k} must state WHY it is blocked`);
    }
    if (e.redistribution === "conditional") {
      assert.ok(e.askWho && e.askWhat, `${k} must name who to ask and what to ask`);
    }
  }
});

test("a permitted entry either states its attribution or explicitly requires none", () => {
  for (const k of SOURCE_KEYS) {
    const e = SOURCE_LICENCES[k];
    if (e.redistribution !== "permitted") continue;
    // CC0 sources legitimately have null attribution; everything else must carry a string.
    const isCc0 = /CC0/i.test(e.licence);
    if (isCc0) assert.equal(e.attribution, null, `${k} is CC0 and should not claim required attribution`);
    else assert.ok(e.attribution && e.attribution.length > 5, `${k} must carry its attribution string`);
  }
});

// ── 2. the gate ──────────────────────────────────────────────────────────

test("only `permitted` is embeddable; conditional and unverified are NOT", () => {
  assert.equal(REDISTRIBUTION.permitted.embeddable, true);
  // Conditional means "permitted once we do the thing", and we have not done the thing.
  assert.equal(REDISTRIBUTION.conditional.embeddable, false);
  assert.equal(REDISTRIBUTION.unverified.embeddable, false);
  assert.equal(REDISTRIBUTION.prohibited.embeddable, false);
});

test("the four confirmed blockers are refused", () => {
  for (const k of ["glec_framework", "iso_14083", "clean_cargo_carrier", "iea_datasets"]) {
    assert.equal(mayEmbedAsSeed(k), false, k);
    assert.throws(() => assertEmbeddable(k), /prohibited for embedding/, k);
  }
});

test("the three assumed-safe-but-are-not sources are refused", () => {
  // The surprises: UN/LOCODE has restrictive UN terms, SBTi withholds repackaging rights, and the
  // identifier layer (IATA, SCAC, IMO register) is the largest single exposure.
  for (const k of ["un_locode", "sbti_dashboard", "iata_codes", "scac", "imo_register"]) {
    assert.equal(mayEmbedAsSeed(k), false, k);
  }
});

test("the open-licence baseline sources are permitted", () => {
  for (const k of ["desnz_ghg_factors", "eurostat", "eia", "bls", "ember", "eea", "eurlex", "gleif_lei"]) {
    assert.equal(mayEmbedAsSeed(k), true, k);
    assert.doesNotThrow(() => assertEmbeddable(k), k);
  }
});

test("an UNREGISTERED source fails closed, with an actionable message", () => {
  // The path by which unlicensed data actually enters a product: an importer names a source nobody
  // registered, and a permissive default lets it through.
  assert.equal(mayEmbedAsSeed("some_scraped_pdf"), false);
  assert.throws(() => assertEmbeddable("some_scraped_pdf"), /unregistered data source/);
  assert.equal(licenceFor("some_scraped_pdf"), null);
});

test("a refusal names the substitute, so the message is actionable rather than merely blocking", () => {
  assert.throws(() => assertEmbeddable("glec_framework"), /desnz_ghg_factors/);
  assert.throws(() => assertEmbeddable("iea_datasets"), /ember/);
  assert.throws(() => assertEmbeddable("clean_cargo_carrier"), /emsa_thetis_mrv/);
  assert.throws(() => assertEmbeddable("un_locode"), /nga_wpi/);
});

test("a conditional refusal names the question and the recipient", () => {
  assert.throws(() => assertEmbeddable("emsa_thetis_mrv"), /To discharge: ask/);
  assert.throws(() => assertEmbeddable("clean_cargo_aggregate"), /smartfreightcentre/);
});

test("every prohibited entry either names a substitute or explains why none exists", () => {
  for (const k of SOURCE_KEYS) {
    const e = SOURCE_LICENCES[k];
    if (e.redistribution !== "prohibited") continue;
    const hasSub = typeof e.substitute === "string" && SOURCE_LICENCES[e.substitute];
    assert.ok(hasSub || e.note, `${k} needs a substitute or a note explaining the gap`);
    if (typeof e.substitute === "string") {
      assert.ok(SOURCE_LICENCES[e.substitute], `${k} points at a substitute not in the register`);
    }
  }
});

test("attribution is emitted per source, deduplicated and sorted", () => {
  assert.match(attributionFor("desnz_ghg_factors"), /Open Government Licence v3\.0/);
  assert.equal(attributionFor("gleif_lei"), null, "CC0 requires none");
  const a = attributionsFor(["eurostat", "eia", "eurostat", "gleif_lei"]);
  assert.equal(a.length, 2, "duplicates collapse and CC0 contributes nothing");
  assert.deepEqual(a, [...a].sort(), "stable order");
});

test("triage partitions the register with no source in two buckets", () => {
  const { green, amber, red } = licenceTriage();
  assert.equal(green.length + amber.length + red.length, SOURCE_KEYS.length);
  assert.ok(green.includes("desnz_ghg_factors"));
  assert.ok(red.includes("glec_framework"));
  assert.ok(amber.includes("emsa_thetis_mrv"));
});

// ── 3. DQI direction: 1 = BEST, asserted both ways ───────────────────────

test("pedigree is 1-best, and a tier may not claim better than its floor", () => {
  const good = { ...MODAL, pedigree: 3 };
  assert.deepEqual(validateFactor(good), []);
  // A modal default claiming pedigree 1 would be presenting as primary data.
  const flattering = { ...good, pedigree: 1 };
  assert.ok(validateFactor(flattering).some((e) => /may claim/.test(e)));
  // And carrier primary legitimately may claim 1.
  assert.deepEqual(
    validateFactor({ ...good, tier: "carrier_primary", pedigree: 1 }), []
  );
});

test("pedigree outside 1..5 is rejected, and the message states the direction", () => {
  const f = { ...MODAL };
  assert.ok(validateFactor({ ...f, pedigree: 0 }).some((e) => /1 = best/.test(e)));
  assert.ok(validateFactor({ ...f, pedigree: 6 }).some((e) => /1 = best/.test(e)));
  assert.ok(validateFactor({ ...f, pedigree: 2.5 }).some((e) => /1 = best/.test(e)));
});

test("stars are display-only and invert correctly, and nothing inverted is stored", () => {
  assert.equal(pedigreeToStars(1), 5, "best pedigree reads as five stars");
  assert.equal(pedigreeToStars(5), 1, "worst pedigree reads as one star");
  assert.equal(pedigreeToStars(0), null);
  // The stored field is pedigree, not stars. Asserting the register has no `stars` field anywhere.
  for (const t of TIER_CODES) assert.equal(FACTOR_TIERS[t].stars, undefined);
});

test("tier ranks are unique and ordered best-first", () => {
  const ranks = TIER_CODES.map((t) => FACTOR_TIERS[t].rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(new Set(ranks).size, ranks.length);
  assert.equal(FACTOR_TIERS.carrier_primary.rank, 1);
});

test("primary-data classification matches the ISO 14083 sense of primary", () => {
  assert.equal(isPrimaryData("carrier_primary"), true);
  assert.equal(isPrimaryData("verified_operator_avg"), true);
  assert.equal(isPrimaryData("modal_default"), false);
  assert.equal(isPrimaryData("proxy_estimate"), false);
  assert.equal(isPrimaryData("__unknown__"), false);
});

// ── 4. resolution, including the licence skip ────────────────────────────

// Resolution fixtures inherit the full valid modal shape; each case overrides only what it is testing.
// carrier_primary/movement cases override scope_kind too, because a movement-scoped factor must carry a
// movement_ref and must NOT carry the modal-only dimensions.
const F = (over) => {
  const base = { ...MODAL, as_at_date: "2026-01-01" };
  if (over && (over.tier === "carrier_primary" || over.scope_kind === "movement")) {
    return { ...base, scope_kind: "movement", movement_ref: "voyage-test-1",
             vehicle_class: null, energy_carrier: null, jurisdiction: null, ...over };
  }
  return { ...base, ...over };
};

test("a better tier wins over a newer worse tier", () => {
  const { factor } = resolveActiveFactor([
    F({ tier: "modal_default", source_key: "desnz_ghg_factors", as_at_date: "2026-07-31", pedigree: 3 }),
    F({ tier: "carrier_primary", source_key: "eurostat", as_at_date: "2025-01-01", pedigree: 1 }),
  ]);
  assert.equal(factor.tier, "carrier_primary", "tier beats recency");
});

test("within a tier, the newer as-at date wins", () => {
  const { factor } = resolveActiveFactor([
    F({ tier: "modal_default", source_key: "desnz_ghg_factors", as_at_date: "2024-06-01", pedigree: 3 }),
    F({ tier: "modal_default", source_key: "desnz_ghg_factors", as_at_date: "2026-07-31", pedigree: 3 }),
  ]);
  assert.equal(factor.as_at_date, "2026-07-31");
});

test("A LICENCE-BLOCKED CANDIDATE IS SKIPPED AND RESOLUTION FALLS THROUGH", () => {
  // The central assertion of this file. A members-only programme factor sitting in the table must never
  // become the served value, however good its tier is.
  const { factor, skipped } = resolveActiveFactor([
    F({ tier: "programme_lane_avg", source_key: "clean_cargo_carrier", pedigree: 2 }),
    F({ tier: "modal_default", source_key: "desnz_ghg_factors", pedigree: 3 }),
  ]);
  assert.equal(factor.tier, "modal_default", "fell through to the open-licence default");
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, "licence");
});

test("skips are RETURNED, not swallowed", () => {
  // Silently dropping a candidate is how a licence problem becomes invisible.
  const { skipped } = resolveActiveFactor([
    F({ tier: "modal_default", source_key: "iea_datasets", pedigree: 3 }),
    F({ tier: "modal_default", source_key: "not_registered_anywhere", pedigree: 3 }),
    // Explicitly invalid: no source_key, so the licence gate CANNOT be applied to it. Written as an
    // override rather than an omission because F() now supplies a complete valid base, and an
    // "invalid" fixture that quietly became valid is how this assertion would rot into passing.
    F({ tier: "carrier_primary", source_key: null }),
  ]);
  assert.equal(skipped.length, 3);
  assert.ok(skipped.some((s) => s.reason === "licence"));
  assert.ok(skipped.some((s) => s.reason === "invalid"));
});

test("no usable candidate yields a null factor rather than a guess", () => {
  const r = resolveActiveFactor([F({ tier: "modal_default", source_key: "glec_framework", pedigree: 3 })]);
  assert.equal(r.factor, null);
  assert.deepEqual(r.attribution, []);
  assert.equal(resolveActiveFactor([]).factor, null);
  assert.equal(resolveActiveFactor(null).factor, null);
});

test("the resolved factor carries its attribution", () => {
  const { attribution } = resolveActiveFactor([
    F({ tier: "modal_default", source_key: "desnz_ghg_factors", pedigree: 3 }),
  ]);
  assert.equal(attribution.length, 1);
  assert.match(attribution[0], /Open Government Licence/);
});

test("allowUnlicensed is opt-in and never the default", () => {
  const blocked = F({ tier: "programme_lane_avg", source_key: "clean_cargo_carrier", pedigree: 2 });
  assert.equal(resolveActiveFactor([blocked]).factor, null);
  assert.equal(resolveActiveFactor([blocked], { allowUnlicensed: true }).factor.tier, "programme_lane_avg");
});

test("a proxy estimate must name its donor", () => {
  const f = F({ tier: "proxy_estimate", source_key: "desnz_ghg_factors", pedigree: 4 });
  assert.ok(validateFactor(f).some((e) => /donor/.test(e)));
  assert.deepEqual(validateFactor({ ...f, donor: "rigid HGV 17t, EU, 2026" }), []);
});

// ── 5. primary-data share, tkm-weighted ──────────────────────────────────

test("primary-data share is weighted by tonne-km, not by leg count", () => {
  // Ten short primary legs and one long default leg is NOT 91% primary. A leg-count average is the
  // flattering answer; tkm weighting is the true one, and it is what ISO 14083 asks for.
  const legs = [
    ...Array.from({ length: 10 }, () => ({ tier: "carrier_primary", tkm: 10 })),
    { tier: "modal_default", tkm: 900 },
  ];
  const share = primaryDataShare(legs);
  assert.ok(share < 0.11, `expected ~10% by tkm, got ${share}`);
});

test("no legs yields null, never zero percent", () => {
  assert.equal(primaryDataShare([]), null);
  assert.equal(primaryDataShare([{ tier: "carrier_primary", tkm: 0 }]), null);
  assert.equal(primaryDataShare(null), null);
});

test("an all-primary chain is 1 and an all-default chain is 0", () => {
  assert.equal(primaryDataShare([{ tier: "carrier_primary", tkm: 5 }]), 1);
  assert.equal(primaryDataShare([{ tier: "modal_default", tkm: 5 }]), 0);
});

// ── 6. SQL parity ────────────────────────────────────────────────────────

test("the generated view orders by the same tier priority as the JS resolver", () => {
  const sql = renderFactorCandidateViewSql();
  TIER_CODES.forEach((t, i) => {
    assert.ok(sql.includes(`WHEN '${t}' THEN ${i + 1}`), `${t} must rank ${i + 1} in SQL too`);
  });
  assert.ok(sql.includes("GENERATED by"), "must announce itself as generated");
});

test("the view excludes future-dated rows and filters on licence-clear sources", () => {
  const sql = renderFactorCandidateViewSql();
  // A future as-at date would otherwise win the ORDER BY and serve as the active factor.
  assert.ok(sql.includes("as_at_date <= current_date"));
  assert.ok(sql.includes("licence_clear_sources"), "the SQL side must gate on licence too");
  assert.ok(sql.includes("superseded_by IS NULL"), "a superseded row is history, never a candidate");
  // THE VIEW MUST NOT RESOLVE. It emits ELIGIBILITY plus ranks; resolveActiveFactor picks the winner.
  // The earlier draft carried a DISTINCT ON that chose the active factor in SQL while the JS resolver
  // chose it again in JS, which is one doctrine implemented twice in two languages with nothing holding
  // them equal. That is the gate_a_* duplication F24 exists to catch, and this assertion forbids it.
  assert.ok(!sql.includes("DISTINCT ON"), "SQL owns eligibility, JS owns selection");
  assert.ok(sql.includes("tier_rank") && sql.includes("scope_specificity"), "ranks must reach the view");
});
