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
import { parseEcbFxXml, decideApply, CURRENCIES, formatSourceEvidence } from "../../scripts/producers/market/ecb-fx-producer.mjs";
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
// and a currency-less structure is exercised separately below (ECB_FIXTURE_XML_NO_TIME). Carries the full
// gesmes:Sender block (envelope-authenticity validation now checks for it — see parseEcbFxXml) so this
// fixture keeps testing ONLY the currency/rate error paths it was built for, not envelope validation.
export const ECB_FIXTURE_XML_WITH_ERRORS = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
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

// A full, valid envelope (namespace + Sender, same as every other fixture here) whose Cube tree simply
// carries no time="..." attribute anywhere — isolates the "no dated Cube" refusal path from envelope
// validation (which has its own dedicated refusal tests below).
const ECB_FIXTURE_XML_NO_TIME = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube><Cube><Cube currency="USD" rate="1.1801"/></Cube></Cube>
</gesmes:Envelope>
`;

// ── THE LIVE SHAPE (root-cause fixture) ─────────────────────────────────────────────────────────────
// Built from the coordinator's own live re-fetch (GitHub Codespace, 2026-09-04 00:58 UTC, plain curl, no
// special headers: HTTP 200, text/xml, 1547 bytes, https://www.ecb.europa.eu/stats/eurofxref/
// eurofxref-daily.xml) — SINGLE-quoted attributes, TAB indentation, the eurofxref default namespace, this
// is the exact shape (through P...) run #22 failed to parse. The leading currencies (USD, JPY, CZK, DKK,
// GBP, HUF) are copied verbatim from that fetch; the remainder of the ~30-currency set is filled out with
// plausible ECB-vocabulary codes to exercise the closed-vocabulary warning path the same way ECB_FIXTURE_XML
// does — ILLUSTRATIVE TEST DATA for the trailing entries, NOT asserted live figures (CLAUDE.md rule 2),
// same posture the double-quoted fixture above already states for its own numbers. Every rate VALUE here
// (including the four tracked ones) is illustrative; only the leading shape/order is a verbatim copy.
export const ECB_FIXTURE_XML_SINGLE_QUOTED = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube>
		<Cube time='2026-09-03'>
			<Cube currency='USD' rate='1.1615'/>
			<Cube currency='JPY' rate='181.21'/>
			<Cube currency='CZK' rate='24.221'/>
			<Cube currency='DKK' rate='7.4746'/>
			<Cube currency='GBP' rate='0.86055'/>
			<Cube currency='HUF' rate='367.43'/>
			<Cube currency='PLN' rate='4.2519'/>
			<Cube currency='RON' rate='4.9741'/>
			<Cube currency='SEK' rate='11.0421'/>
			<Cube currency='CHF' rate='1.0678'/>
			<Cube currency='CNY' rate='8.2891'/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

// SAME shape as ECB_FIXTURE_XML_SINGLE_QUOTED, but with the currency/rate attribute order SWAPPED
// (rate before currency) and a THIRD-quote-style mix (some Cube tags single-quoted, one double-quoted) to
// prove attribute order and quote-per-attribute are both truly independent of one another, not just
// "the whole document picked one alternate style".
export const ECB_FIXTURE_XML_MIXED_QUOTES_AND_ORDER = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes='http://www.gesmes.org/xml/2002-08-01' xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
	<Cube>
		<Cube time="2026-09-03">
			<Cube rate='1.1615' currency='USD'/>
			<Cube currency="GBP" rate="0.86055"/>
			<Cube
				rate='8.2891'
				currency='CNY'
			/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

// ── malformed documents that must still refuse (never accepted just because a Cube tag is present) ─────

// Same Cube/time/currency shape as a real document, but with NO gesmes namespace declaration at all —
// proves envelope-authenticity validation is not bypassed by the quote-agnostic rewrite.
const ECB_FIXTURE_XML_NO_GESMES_NAMESPACE = `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube>
		<Cube time='2026-09-03'>
			<Cube currency='USD' rate='1.1615'/>
		</Cube>
	</Cube>
</Envelope>
`;

// Correct namespace, but no gesmes:Sender/name element — a document that merely LOOKS like ECB's envelope
// (same tag/namespace shape) must not be accepted without the sender identity actually being present.
const ECB_FIXTURE_XML_NO_SENDER = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube>
		<Cube time='2026-09-03'>
			<Cube currency='USD' rate='1.1615'/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

// A full valid envelope carrying TWO dated Cube blocks (the shape ECB's separate multi-day history file
// has) — must refuse rather than silently pick the first or merge both.
const ECB_FIXTURE_XML_TWO_DATED_CUBES = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
	<Cube>
		<Cube time='2026-09-03'><Cube currency='USD' rate='1.1615'/></Cube>
		<Cube time='2026-09-02'><Cube currency='USD' rate='1.1620'/></Cube>
	</Cube>
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

// ── THE ROOT-CAUSE PROOF: single-quoted, tab-indented attributes (run #22's actual live shape) ─────────

test("REGRESSION (producers run #22): the live single-quoted, tab-indented shape parses exactly like the double-quoted shape", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_SINGLE_QUOTED);
  assert.equal(rows.length, 4, `expected 4 tracked-currency rows, got ${rows.length}: ${JSON.stringify(rows.map((r) => r.series_key))}`);

  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  const usd = byKey.get("ecb-fx:eur-usd");
  assert.ok(usd, "USD row missing — single-quoted attributes were not parsed");
  assert.equal(usd.value_numeric, 1.1615);
  assert.equal(usd.currency, "USD");
  assert.equal(usd.reference_period, "2026-09-03");
  assert.equal(usd.as_at_date, "2026-09-03");

  const jpy = byKey.get("ecb-fx:eur-jpy");
  assert.equal(jpy.value_numeric, 181.21);

  const gbp = byKey.get("ecb-fx:eur-gbp");
  assert.equal(gbp.value_numeric, 0.86055);

  const cny = byKey.get("ecb-fx:eur-cny");
  assert.equal(cny.value_numeric, 8.2891);

  // CZK/DKK/HUF/PLN/RON/SEK/CHF are outside the closed vocabulary — 7 unrecognised-currency warnings.
  const unrecognised = warnings.filter((w) => /not in this lane's closed vocabulary/.test(w));
  assert.equal(unrecognised.length, 7, `expected 7 unrecognised-currency warnings, got: ${JSON.stringify(warnings)}`);
});

test("attribute order and per-attribute quote style are independent: rate-before-currency and a single-vs-double mix within one document both parse", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_MIXED_QUOTES_AND_ORDER);
  assert.equal(rows.length, 3, `expected 3 rows (USD, GBP, CNY), got ${rows.length}, warnings: ${JSON.stringify(warnings)}`);
  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  assert.equal(byKey.get("ecb-fx:eur-usd").value_numeric, 1.1615, "rate-before-currency attribute order must parse");
  assert.equal(byKey.get("ecb-fx:eur-gbp").value_numeric, 0.86055, "double-quoted Cube in a mostly-single-quoted document must still parse");
  assert.equal(byKey.get("ecb-fx:eur-cny").value_numeric, 8.2891, "attributes split across multiple lines (newlines/tabs between them) must still parse");
});

// ── envelope-authenticity validation: kept, not weakened, by the quote-agnostic rewrite ─────────────────

test("a document with no gesmes namespace declaration refuses, even with a well-formed dated Cube", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_NO_GESMES_NAMESPACE);
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /gesmes/i);
  assert.match(warnings[0], /namespace/i);
});

test("a document with the right namespace but no gesmes:Sender/name refuses — looking similar is not being ECB", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_NO_SENDER);
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /European Central Bank/);
  assert.match(warnings[0], /sender/i);
});

test("a document with TWO dated Cube blocks (the multi-day-history shape) refuses rather than picking one silently", () => {
  const { rows, warnings } = parseEcbFxXml(ECB_FIXTURE_XML_TWO_DATED_CUBES);
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2 dated/);
  assert.match(warnings[0], /2026-09-03/);
  assert.match(warnings[0], /2026-09-02/);
});

// ── formatSourceEvidence: refusal evidence (HTTP status, content-type, byte count, first 200 chars) ─────

test("formatSourceEvidence carries HTTP status + content-type + byte count + a body snippet for a live fetch", () => {
  const line = formatSourceEvidence(ECB_FIXTURE_XML_NO_GESMES_NAMESPACE, { status: 200, contentType: "text/xml" });
  assert.match(line, /HTTP 200/);
  assert.match(line, /content-type "text\/xml"/);
  assert.match(line, new RegExp(`${Buffer.byteLength(ECB_FIXTURE_XML_NO_GESMES_NAMESPACE, "utf8")} byte\\(s\\)`));
  assert.match(line, /first 200 chars:/);
  assert.match(line, /<\?xml version/);
});

test("formatSourceEvidence omits HTTP fields (never fabricates them) when no source metadata is available (--input/stdin)", () => {
  const line = formatSourceEvidence("<a/>", null);
  assert.doesNotMatch(line, /HTTP/);
  assert.doesNotMatch(line, /content-type/);
  assert.match(line, /4 byte\(s\)/);
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

// UPDATED 2026-09-02 (Lane PROD, system-completion train): ENABLED flipped false -> true in
// ecb-fx-producer.mjs (see its own header's REVIEWED-CHANGE LOG), in the same commit as migration 281
// (registers source_key 'ecb'). This test used to pin "ENABLED is false at authorship" by spawning the
// real file and asserting the ENABLED-constant refusal message. It now pins the OPPOSITE fact — that
// ENABLED really did flip to true, not just that decideApply's logic can accept true — by spawning the
// real file with the runtime kill switch left OFF (the actual shipped default) and asserting the refusal
// is the KILL-SWITCH message, not the ENABLED-constant one. If ENABLED were ever silently reverted to
// false, this test would fail (the CLI would print the ENABLED-constant message instead). No network
// call is made (no DB creds are set; the kill-switch gate refuses before any DB read is attempted).
test("today's ACTUAL shipped state: ENABLED is true — the real CLI's default-state refusal is now the kill switch, never the ENABLED-constant message", () => {
  const fixturePath = join(tmpdir(), `ecb-fx-fixture-${process.pid}.xml`);
  writeFileSync(fixturePath, ECB_FIXTURE_XML);
  try {
    const producerPath = fileURLToPath(new URL("../../scripts/producers/market/ecb-fx-producer.mjs", import.meta.url));
    const res = spawnSync(process.execPath, [producerPath, "--input", fixturePath, "--apply"], {
      encoding: "utf8",
      env: process.env, // no kill switch, no DB creds — the real, shipped, out-of-the-box environment
    });
    assert.equal(res.status, 1, `expected exit 1 (refused), got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stderr, /kill switch.*OFF/, `expected the kill-switch refusal message (proving ENABLED is true), got: ${res.stderr}`);
    assert.doesNotMatch(res.stderr, /ENABLED constant.*false/, `ENABLED must be true today — an "ENABLED constant... false" message here would mean it was reverted`);
  } finally {
    rmSync(fixturePath, { force: true });
  }
});
