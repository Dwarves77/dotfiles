// market-ecb-fx-parser.test.mjs — proof for scripts/producers/market/ecb-fx-producer.mjs's
// parseEcbFxXml/decideApply (lane P2, build/wave-p2).
//
// LOCATION AND NAME, DECIDED FROM THE REPO'S OWN CONVENTION, NOT ASSUMED. Two different placements exist
// in this repo for a parser's tests:
//   - regional/eurostat + regional/bls: parser module + its test CO-LOCATED under src/lib/regional/, the
//     test suffixed `.npmtest.mjs` (excluded from run-test-suite.sh's no-npm glob; picked up by the CI
//     "App unit tests requiring npm deps" step instead — see that job's own comment in
//     .discipline/run-test-suite.sh for why .npmtest.mjs exists as a category at all: a parser that
//     imports an npm dependency, transitively or directly, cannot run before `npm ci`).
//   - market/eu-weekly-oil-bulletin: parser test lives in src/__tests__/market-eu-oil-bulletin-parser.test.mjs
//     — `.test.mjs`, NOT co-located with the parser module, NOT `.npmtest.mjs` — because that parser is
//     PLAIN ESM with zero npm dependencies (its own header states this) and is meant to run in the no-npm
//     pre-push/CI gate, same as every other src/__tests__ proof.
// This file's subject, parseEcbFxXml, is the same shape as the oil-bulletin case: hand-rolled regex
// parsing (see the producer's own header — same "no XML-parsing dependency" call oil-bulletin-workbook.mjs
// makes for the much larger .xlsx XML), zero npm imports. It therefore matches the MARKET convention
// (src/__tests__/market-*-parser.test.mjs, plain .test.mjs), not the regional one — named
// market-ecb-fx-parser.test.mjs rather than .npmtest.mjs so it actually runs in run-test-suite.sh's
// no-npm gate instead of being silently skipped there (an .npmtest.mjs suffix on a dependency-free file
// would be a wrong-glob defect, not a faithful match of "how the eurostat/bls tests are placed").
//
// FIXTURE PROVENANCE (rule 14, spoken plainly). ECB_FIXTURE_XML below is built against the ECB daily
// reference-rate XML's PUBLICLY DOCUMENTED, long-stable shape (gesmes:Envelope > Cube > Cube time="..." >
// Cube currency="..." rate="..."), stated in full in ecb-fx-producer.mjs's own header. It is NOT a live
// capture: this session's sandbox egress to every ecb.europa.eu host returned a 403 policy denial
// (`curl -sS $HTTPS_PROXY/__agentproxy/status` -> recentRelayFailures: connect_rejected,
// "www.ecb.europa.eu:443"), so no live fetch was possible from here. [UNCONFIRMED] pending a runner or
// browser fetch — see the producer header's note on who should verify it next, and CLAUDE.md standing
// rule 2 (never present fabricated numbers as real): the rate VALUES below are illustrative test data
// only, not asserted live figures, exactly the same posture market-eu-oil-bulletin-parser.fixtures.mjs
// states for its own numbers.
//
// $0, pure, in-process — no network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEcbFxXml, decideApply, CURRENCIES } from "../../scripts/producers/market/ecb-fx-producer.mjs";
import { planMarketSeriesUpsert } from "../lib/market/write-market-series.mjs";
import { producerFor } from "../lib/market/series-registry.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

const SERIES_KEY_FORMAT_RE = /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/; // mirrors migration 268's CHECK, pinned independently

// A well-formed daily document: our 4 tracked currencies (USD, GBP, CNY, JPY) plus 6 the closed
// vocabulary does NOT track (AUD, BGN, BRL, CAD, CHF, DKK) — exercises both the happy path and the
// unrecognised-currency warning path in one document, the same way the real file always carries ~30.
export const ECB_FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube>
		<Cube time="2026-08-28">
			<Cube currency="USD" rate="1.1801"/>
			<Cube currency="AUD" rate="1.7912"/>
			<Cube currency="BGN" rate="1.9558"/>
			<Cube currency="BRL" rate="6.4321"/>
			<Cube currency="CAD" rate="1.6203"/>
			<Cube currency="CHF" rate="0.9345"/>
			<Cube currency="CNY" rate="8.4123"/>
			<Cube currency="DKK" rate="7.4610"/>
			<Cube currency="GBP" rate="0.8623"/>
			<Cube currency="JPY" rate="164.63"/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

// Error/edge paths in one document: a bad (non-numeric-looking after strip) rate, a duplicate currency,
// and a currency-less structure is exercised separately below (ECB_FIXTURE_XML_NO_TIME).
export const ECB_FIXTURE_XML_WITH_ERRORS = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube>
		<Cube time="2026-08-28">
			<Cube currency="USD" rate="1.1801"/>
			<Cube currency="USD" rate="1.9999"/>
			<Cube currency="GBP" rate="0.0000"/>
			<Cube currency="XYZ" rate="notarate"/>
			<Cube currency="JPY" rate="164.63"/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

const ECB_FIXTURE_XML_NO_TIME = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube><Cube><Cube currency="USD" rate="1.1801"/></Cube></Cube>
</gesmes:Envelope>
`;

const REGISTRY_ENTRY = producerFor("ecb-fx");

// ── red/green on the documented shape ───────────────────────────────────────────────────────────────

test("RED (pre-fixture sanity): an empty document parses to zero rows and a warning, never a throw", () => {
  const { rows, warnings } = parseEcbFxXml("");
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no <Cube time=/);
});

test("GREEN: the documented shape yields exactly the 4 tracked currencies, dated from the document", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML);
  assert.equal(rows.length, 4, `expected 4 tracked-currency rows, got ${rows.length}: ${JSON.stringify(rows.map((r) => r.series_key))}`);

  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  assert.ok(byKey.has("ecb-fx:eur-usd"));
  assert.ok(byKey.has("ecb-fx:eur-gbp"));
  assert.ok(byKey.has("ecb-fx:eur-cny"));
  assert.ok(byKey.has("ecb-fx:eur-jpy"));

  const usd = byKey.get("ecb-fx:eur-usd");
  assert.equal(usd.value_numeric, 1.1801);
  assert.equal(usd.unit, "USD/EUR");
  assert.equal(usd.currency, "USD");
  assert.equal(usd.reference_period, "2026-08-28");
  assert.equal(usd.as_at_date, "2026-08-28");
  assert.equal(usd.derivation, "observed");
  assert.equal(usd.origin_class, "official");

  // 6 currencies outside the closed vocabulary -> 6 warnings, never silently dropped.
  const unrecognised = warnings.filter((w) => /not in this lane's closed vocabulary/.test(w));
  assert.equal(unrecognised.length, 6, `expected 6 unrecognised-currency warnings, got: ${JSON.stringify(warnings)}`);
});

test("every row's series_key matches migration 268's format CHECK", () => {
  const { rows } = parseEcbFxXml(ECB_FIXTURE_XML);
  for (const r of rows) assert.match(r.series_key, SERIES_KEY_FORMAT_RE, `series_key "${r.series_key}" fails the format CHECK`);
});

test("CURRENCIES is exactly the registry's own documented set (USD, GBP, CNY, JPY)", () => {
  assert.deepEqual(Object.keys(CURRENCIES).sort(), ["CNY", "GBP", "JPY", "USD"]);
});

test("error document: duplicate currency keeps the first, a non-positive rate is skipped, a non-numeric rate is skipped, an unrecognised currency is skipped — never a throw", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_WITH_ERRORS);
  // USD (first occurrence, 1.1801) and JPY survive; GBP (rate 0) and XYZ (unrecognised + bad rate) do not.
  assert.equal(rows.length, 2);
  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  assert.equal(byKey.get("ecb-fx:eur-usd").value_numeric, 1.1801);
  assert.ok(!byKey.has("ecb-fx:eur-gbp"), "a zero rate must not be planned as a valid observation");

  assert.ok(warnings.some((w) => /duplicate.*USD/.test(w)));
  assert.ok(warnings.some((w) => /bad rate "0\.0000".*GBP/.test(w)));
});

test("a document with no dated Cube produces zero rows and one explanatory warning, never a partial guess", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_NO_TIME);
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no <Cube time=/);
});

// ── envelope shape: every planned CREATE would satisfy the LIVE table's constraints ────────────────────

test("every parsed row carries the full envelope and satisfies market_series' live CHECK vocabularies", () => {
  const { rows } = parseEcbFxXml(ECB_FIXTURE_XML);
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(typeof r.series_key, "string");
    assert.ok(r.series_key.startsWith("ecb-fx:"));
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
    assert.equal(r.n_observations, null, "a single published rate is a point observation, not an aggregate");
    assert.equal(r.source_key, REGISTRY_ENTRY.sourceKey, "source_key must match the registry's declared sourceKey");
  }
});

// ── idempotency: mirrors eu-weekly-oil-bulletin's own composition proof (market-producer-composition.test.mjs) ─

test("idempotency: the SAME day re-planned against its own prior output yields 0 new creates", () => {
  const { rows } = parseEcbFxXml(ECB_FIXTURE_XML);
  const first = planMarketSeriesUpsert([], rows);
  assert.equal(first.toCreate.length, 4);
  assert.equal(first.toUpdate.length, 0);
  assert.equal(first.skippedNoReferencePeriod.length, 0);

  const existingAfterFirstRun = first.toCreate.map((r, i) => ({
    id: `row-${i}`,
    series_key: r.series_key,
    reference_period: r.reference_period,
  }));

  const second = planMarketSeriesUpsert(existingAfterFirstRun, rows);
  assert.equal(second.toCreate.length, 0, "a re-run of the SAME day must plan zero NEW rows — this is the idempotency proof");
  assert.equal(second.toUpdate.length, 4, "still refreshes each row (not a silent no-op skip)");

  // Refresh must never drift a value on an unchanged input.
  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  for (const u of second.toUpdate) {
    const original = byKey.get(existingAfterFirstRun.find((e) => e.id === u.id).series_key);
    assert.equal(u.patch.value_numeric, original.value_numeric);
  }
});

test("a NEW day for the same currencies plans 4 creates alongside the prior day's rows, never overwriting them", () => {
  const day1 = parseEcbFxXml(ECB_FIXTURE_XML).rows;
  const day2Xml = ECB_FIXTURE_XML.replace('time="2026-08-28"', 'time="2026-08-31"');
  const day2 = parseEcbFxXml(day2Xml).rows;
  assert.notEqual(day1[0].reference_period, day2[0].reference_period);

  const existing = day1.map((r, i) => ({ id: `row-${i}`, series_key: r.series_key, reference_period: r.reference_period }));
  const plan = planMarketSeriesUpsert(existing, day2);
  assert.equal(plan.toCreate.length, 4, "a new reference_period is a new row under UNIQUE(series_key, reference_period), not an update");
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
  // catches it, because the runtime gates alone would then let the write proceed.
  const fixturePath = join(tmpdir(), `ecb-fx-fixture-${process.pid}.xml`);
  writeFileSync(fixturePath, ECB_FIXTURE_XML);
  try {
    const producerPath = fileURLToPath(new URL("../../scripts/producers/market/ecb-fx-producer.mjs", import.meta.url));
    const res = spawnSync(process.execPath, [producerPath, "--input", fixturePath, "--apply"], {
      encoding: "utf8",
      env: {
        ...process.env,
        MARKET_PRODUCER_ECB_FX_ENABLED: "1",
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
