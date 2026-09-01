// market-eia-v2-petroleum-spot-parser.test.mjs — composition proof for
// scripts/producers/market/eia-v2-petroleum-spot-producer.mjs (lane SURF, 2026-09-01).
//
// F27 (producer-seam-proof) SHAPE: this producer's own first-party seam set (everything it imports from
// fsi-app/src/lib/**) is [write-market-series.mjs, series-registry.mjs] — it has no separate parser
// module (fetch + parse are inline in the producer file itself, same posture ecb-fx-producer.mjs takes
// and states its own reason for, see that file's header). This ONE proof imports the producer's own
// exported parseEiaV2PetroleumSpot/decideApply/PRODUCTS ALONGSIDE both of those seam modules and asserts
// the composed output against market_series' LIVE constraints — the exact shape
// market-ecb-fx-parser.test.mjs and market-producer-composition.test.mjs already establish for the other
// two market producers, so a single file satisfies the gate for this producer too.
//
// LOCATION AND NAME: matches the market convention (src/__tests__/market-*-parser.test.mjs, plain
// .test.mjs, not co-located, not .npmtest.mjs) — this producer is plain ESM with zero npm dependencies.
//
// FIXTURE PROVENANCE (rule 14, spoken plainly). EIA_FIXTURE_JSON below is built against the EIA API v2's
// own long-documented, stable response envelope for petroleum/pri/spt
// (`{ response: { data: [ {period, duoarea, "area-name", product, "product-name", process, series,
// value, units}, ... ] } }`) and against the producer's own header note on why the exact product-code
// set was not read back live this session (sandbox egress to api.eia.gov is blocked; a network-tool
// fetch reached the live endpoint and got EIA's own 403 with no/invalid api_key, confirming the endpoint
// is real and live but not returning an authenticated body here). The numeric VALUES below are
// illustrative test data only, never asserted as real prices — same posture
// market-ecb-fx-parser.test.mjs states for its own fixture numbers.
//
// $0, pure, in-process — no network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEiaV2PetroleumSpot,
  decideApply,
  PRODUCTS,
} from "../../scripts/producers/market/eia-v2-petroleum-spot-producer.mjs";
import { planMarketSeriesUpsert } from "../lib/market/write-market-series.mjs";
import { producerFor } from "../lib/market/series-registry.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

const SERIES_KEY_FORMAT_RE = /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/; // mirrors migration 268's CHECK, pinned independently

const REGISTRY_ENTRY = producerFor("eia-v2");

// A well-formed weekly response: 6 rows matching the closed product vocabulary, plus 2 outside it (an
// unrecognised product, and a recognised product with a missing "units" field) — exercises both the
// happy path and the honest-skip paths in one document.
const EIA_FIXTURE_JSON = {
  response: {
    warnings: [],
    data: [
      { period: "2026-08-24", duoarea: "CUS", "area-name": "Cushing, OK", product: "EPCWTI", "product-name": "WTI Crude", process: "PF4", series: "RWTC", "series-description": "Cushing, OK WTI Spot Price FOB", value: "72.14", units: "$/BBL" },
      { period: "2026-08-24", duoarea: "NUS", "area-name": "Europe", product: "EPCBRENT", "product-name": "Brent Crude", process: "PF4", series: "RBRTE", "series-description": "Europe Brent Spot Price FOB", value: "76.02", units: "$/BBL" },
      { period: "2026-08-24", duoarea: "Y35NY", "area-name": "New York Harbor", product: "EPD2F", "product-name": "No 2 Diesel Low Sulfur (0-15 ppm)", process: "PF4", series: "EER_EPD2F_PF4_Y35NY_DPG", "series-description": "NY Harbor ULSD Spot Price", value: "2.361", units: "$/GAL" },
      { period: "2026-08-24", duoarea: "R30XX", "area-name": "US Gulf Coast", product: "EPJK", "product-name": "Kerosene-Type Jet Fuel", process: "PF4", series: "EER_EPJK_PF4_RGC_DPG", "series-description": "Gulf Coast Jet Fuel Spot Price", value: "2.198", units: "$/GAL" },
      { period: "2026-08-24", duoarea: "Y35NY", "area-name": "New York Harbor", product: "EPMRR", "product-name": "RBOB Regular Gasoline", process: "PF4", series: "EER_EPMRR_PF4_Y35NY_DPG", "series-description": "NY Harbor RBOB Spot Price", value: "2.045", units: "$/GAL" },
      { period: "2026-08-24", duoarea: "YPBT", "area-name": "Mont Belvieu, TX", product: "EPLLPA", "product-name": "Propane", process: "PF4", series: "EER_EPLLPA_PF4_YPBT_DPG", "series-description": "Mont Belvieu Propane Spot Price", value: "0.842", units: "$/GAL" },
      { period: "2026-08-24", duoarea: "NUS", "area-name": "US", product: "EPPR", "product-name": "Propane (legacy code)", process: "PF4", series: "SOMETHING_ELSE", value: "0.900", units: "$/GAL" },
      { period: "2026-08-24", duoarea: "R30XX", "area-name": "US Gulf Coast", product: "EPD2F", "product-name": "No 2 Diesel Low Sulfur (0-15 ppm)", process: "PF4", series: "EER_EPD2F_PF4_RGC_DPG", value: "2.401" },
    ],
  },
};

// ── red/green on the documented shape ───────────────────────────────────────────────────────────────

test("RED (pre-fixture sanity): an empty object parses to zero rows and an explanatory warning, never a throw", () => {
  const { rows, warnings } = parseEiaV2PetroleumSpot({});
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no response\.data array/);
});

test("RED: an EIA error response ({error: ...}) parses to zero rows and surfaces the error, never a throw", () => {
  const { rows, warnings } = parseEiaV2PetroleumSpot({ error: "invalid or missing api_key" });
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /EIA API error: invalid or missing api_key/);
});

test("GREEN: the documented shape yields exactly the 6 recognised-product rows, dated from each row's own period", () => {
  const { rows, warnings } = parseEiaV2PetroleumSpot(EIA_FIXTURE_JSON);
  assert.equal(rows.length, 6, `expected 6 recognised rows, got ${rows.length}: ${JSON.stringify(rows.map((r) => r.series_key))}`);

  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  assert.ok(byKey.has("eia-v2:wti-crude-rwtc"));
  assert.ok(byKey.has("eia-v2:brent-crude-rbrte"));
  assert.ok(byKey.has("eia-v2:gasoline-rbob-regular-eer-epmrr-pf4-y35ny-dpg"));
  assert.ok(byKey.has("eia-v2:propane-mont-belvieu-eer-epllpa-pf4-ypbt-dpg"));

  const wti = byKey.get("eia-v2:wti-crude-rwtc");
  assert.equal(wti.value_numeric, 72.14);
  assert.equal(wti.unit, "$/BBL");
  assert.equal(wti.currency, "USD");
  assert.equal(wti.reference_period, "2026-08-24");
  assert.equal(wti.as_at_date, "2026-08-24");
  assert.equal(wti.derivation, "observed");
  assert.equal(wti.origin_class, "official");
  assert.match(wti.label, /WTI crude oil spot price — Cushing, OK/);

  // The unrecognised product (EPPR) and the row missing "units" -> 2 warnings, never silently dropped.
  assert.ok(warnings.some((w) => /unrecognised product "EPPR"/.test(w)));
  assert.ok(warnings.some((w) => /missing "units" for product "EPD2F"/.test(w)));
});

test("every row's series_key matches migration 268's format CHECK", () => {
  const { rows } = parseEiaV2PetroleumSpot(EIA_FIXTURE_JSON);
  for (const r of rows) assert.match(r.series_key, SERIES_KEY_FORMAT_RE, `series_key "${r.series_key}" fails the format CHECK`);
});

test("PRODUCTS is a non-empty closed vocabulary, every entry naming a slug and a label", () => {
  assert.ok(Object.keys(PRODUCTS).length > 0);
  for (const [code, def] of Object.entries(PRODUCTS)) {
    assert.equal(typeof def.slug, "string", `${code}: missing slug`);
    assert.ok(def.slug.length > 0, `${code}: empty slug`);
    assert.equal(typeof def.label, "string", `${code}: missing label`);
  }
});

test("a duplicate (series_key, period) in the SAME response is skipped, not planned twice", () => {
  const dup = {
    response: {
      data: [
        EIA_FIXTURE_JSON.response.data[0], // WTI, period 2026-08-24
        { ...EIA_FIXTURE_JSON.response.data[0], value: "99.99" }, // same series+period, different value
      ],
    },
  };
  const { rows, warnings } = parseEiaV2PetroleumSpot(dup);
  assert.equal(rows.length, 1, "the duplicate must not be planned as a second row");
  assert.equal(rows[0].value_numeric, 72.14, "the FIRST occurrence is kept, never the later one silently overwriting it");
  assert.ok(warnings.some((w) => /duplicate \(series_key, period\)/.test(w)));
});

test("a non-numeric value or an unparseable period is skipped, never a throw or a guessed number", () => {
  const bad = {
    response: {
      data: [
        { ...EIA_FIXTURE_JSON.response.data[0], value: "not-a-number" },
        { ...EIA_FIXTURE_JSON.response.data[1], period: "not-a-date" },
      ],
    },
  };
  const { rows, warnings } = parseEiaV2PetroleumSpot(bad);
  assert.equal(rows.length, 0);
  assert.ok(warnings.some((w) => /non-numeric value/.test(w)));
  assert.ok(warnings.some((w) => /bad period/.test(w)));
});

// ── envelope shape: every planned CREATE would satisfy the LIVE table's constraints ────────────────────

test("every parsed row carries the full envelope and satisfies market_series' live CHECK vocabularies", () => {
  const { rows } = parseEiaV2PetroleumSpot(EIA_FIXTURE_JSON);
  assert.equal(rows.length, 6);
  for (const r of rows) {
    assert.equal(typeof r.series_key, "string");
    assert.ok(r.series_key.startsWith("eia-v2:"));
    assert.equal(typeof r.label, "string");
    assert.ok(r.label.length > 0, `row ${r.series_key} is missing NOT-NULL label`);
    assert.equal(typeof r.value_numeric, "number");
    assert.ok(Number.isFinite(r.value_numeric));
    assert.equal(typeof r.unit, "string");
    assert.ok(r.unit.length > 0);
    assert.ok(r.reference_period, `row ${r.series_key} is missing reference_period`);
    assert.ok(DERIVATION_VALUES.includes(r.derivation), `illegal derivation "${r.derivation}"`);
    assert.ok(ORIGIN_CLASS_VALUES.includes(r.origin_class), `illegal origin_class "${r.origin_class}"`);
    assert.equal(r.derivation, "observed");
    assert.equal(r.origin_class, "official");
    assert.equal(r.currency, "USD");
    assert.equal(r.n_observations, null, "a spot price is a point observation, not an aggregate");
    assert.equal(r.source_key, REGISTRY_ENTRY.sourceKey, "source_key must match the registry's declared sourceKey");
    assert.equal(r.source_key, "eia");
  }
});

// ── the seam: real parser output straight into the real planner (F27's whole point) ────────────────────

test("idempotency: the SAME week re-planned against its own prior output yields 0 new creates", () => {
  const { rows } = parseEiaV2PetroleumSpot(EIA_FIXTURE_JSON);
  const first = planMarketSeriesUpsert([], rows);
  assert.equal(first.toCreate.length, 6);
  assert.equal(first.toUpdate.length, 0);
  assert.equal(first.skippedNoReferencePeriod.length, 0);

  const existingAfterFirstRun = first.toCreate.map((r, i) => ({
    id: `row-${i}`,
    series_key: r.series_key,
    reference_period: r.reference_period,
  }));

  const second = planMarketSeriesUpsert(existingAfterFirstRun, rows);
  assert.equal(second.toCreate.length, 0, "a re-run of the SAME week must plan zero NEW rows");
  assert.equal(second.toUpdate.length, 6, "still refreshes each row (not a silent no-op skip)");

  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  for (const u of second.toUpdate) {
    const original = byKey.get(existingAfterFirstRun.find((e) => e.id === u.id).series_key);
    assert.equal(u.patch.value_numeric, original.value_numeric, "re-planning an unchanged input must never drift a price");
  }
});

test("a NEW week for the same products plans 6 creates alongside the prior week's rows, never overwriting them", () => {
  const week1 = parseEiaV2PetroleumSpot(EIA_FIXTURE_JSON).rows;
  const week2Json = JSON.parse(JSON.stringify(EIA_FIXTURE_JSON));
  for (const row of week2Json.response.data) row.period = "2026-08-31";
  const week2 = parseEiaV2PetroleumSpot(week2Json).rows;
  assert.notEqual(week1[0].reference_period, week2[0].reference_period);

  const existing = week1.map((r, i) => ({ id: `row-${i}`, series_key: r.series_key, reference_period: r.reference_period }));
  const plan = planMarketSeriesUpsert(existing, week2);
  assert.equal(plan.toCreate.length, 6, "a new reference_period is a new row under UNIQUE(series_key, reference_period), not an update");
  assert.equal(plan.toUpdate.length, 0);
});

// ── ENABLED-gate no-op (decideApply is pure — no subprocess spawn needed) ──────────────────────────────

test("ENABLED-gate no-op: dry run (no --apply) never writes, regardless of every other gate's state", () => {
  const d = decideApply({ apply: false, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
});

test("ENABLED-gate no-op: --apply with ENABLED=false REFUSES even when the env switch and creds are both on", () => {
  const d = decideApply({ apply: true, enabled: false, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /ENABLED constant.*false/);
});

test("--apply with ENABLED=true but the runtime kill switch off still REFUSES", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: false, hasCreds: true });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /kill switch/);
});

test("--apply with both switches on but no DB creds still REFUSES", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false });
  assert.equal(d.canWrite, false);
  assert.match(d.reason, /DB creds/);
});

test("--apply only writes when EVERY gate is satisfied", () => {
  const d = decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: true });
  assert.equal(d.canWrite, true);
});

test("today's ACTUAL shipped state: running the real CLI with --apply refuses, exit 1 — not a simulated gate", () => {
  // Pins the literal shipped constant, not just decideApply's logic: spawns the real file as a
  // subprocess, --input'd against the fixture so it never attempts a live fetch, with the runtime kill
  // switch and (fake) DB creds BOTH set — if ENABLED ever silently flips true, this is the test that
  // catches it.
  const fixturePath = join(tmpdir(), `eia-v2-fixture-${process.pid}.json`);
  writeFileSync(fixturePath, JSON.stringify(EIA_FIXTURE_JSON));
  try {
    const producerPath = fileURLToPath(new URL("../../scripts/producers/market/eia-v2-petroleum-spot-producer.mjs", import.meta.url));
    const res = spawnSync(process.execPath, [producerPath, "--input", fixturePath, "--apply"], {
      encoding: "utf8",
      env: {
        ...process.env,
        MARKET_PRODUCER_EIA_V2_ENABLED: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-gate-test-only",
      },
    });
    assert.equal(res.status, 1, `expected exit 1 (refused), got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stderr, /ENABLED constant.*false/, `expected the ENABLED-constant refusal message, got: ${res.stderr}`);
  } finally {
    rmSync(fixturePath, { force: true });
  }
});

test("with --input, a --dry run never attempts a live fetch (no network needed to see the plan)", () => {
  const fixturePath = join(tmpdir(), `eia-v2-fixture-dry-${process.pid}.json`);
  writeFileSync(fixturePath, JSON.stringify(EIA_FIXTURE_JSON));
  try {
    const producerPath = fileURLToPath(new URL("../../scripts/producers/market/eia-v2-petroleum-spot-producer.mjs", import.meta.url));
    const res = spawnSync(process.execPath, [producerPath, "--input", fixturePath], { encoding: "utf8" });
    assert.equal(res.status, 0, `expected exit 0 (clean dry run), got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /parsed 6 row\(s\)/);
    assert.match(res.stdout, /DRY RUN/);
  } finally {
    rmSync(fixturePath, { force: true });
  }
});
