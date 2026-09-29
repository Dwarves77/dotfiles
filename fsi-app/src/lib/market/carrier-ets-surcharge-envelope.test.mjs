import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVerbatimSpan,
  groundCandidate,
  carrierSlug,
  buildCarrierEtsSurchargeRow,
  buildEtsProxyBand,
  rowKey,
} from "./carrier-ets-surcharge-envelope.mjs";

test("isVerbatimSpan: whitespace-insensitive substring match", () => {
  assert.equal(isVerbatimSpan("The   EU ETS surcharge is USD 210 per FEU.", "EU ETS surcharge is USD 210 per FEU"), true);
  assert.equal(isVerbatimSpan("The EU ETS surcharge is USD 210 per FEU.", "EU ETS surcharge is USD 999 per FEU"), false);
  assert.equal(isVerbatimSpan("", "anything"), false);
});

test("groundCandidate: refuses no span_text", () => {
  const r = groundCandidate({ span_text: null }, "some capture text");
  assert.equal(r.ok, false);
  assert.match(r.reason, /no span_text/);
});

test("groundCandidate: refuses no capture", () => {
  const r = groundCandidate({ span_text: "x" }, null);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no capture text/);
});

test("groundCandidate: refuses paraphrased span", () => {
  const r = groundCandidate({ span_text: "surcharge rose to two hundred dollars" }, "The EU ETS surcharge is USD 210 per FEU.");
  assert.equal(r.ok, false);
  assert.match(r.reason, /not a verbatim/);
});

test("groundCandidate: accepts a verbatim span", () => {
  const r = groundCandidate({ span_text: "EU ETS surcharge is USD 210 per FEU" }, "Effective 2026-10-01: the EU ETS surcharge is USD 210 per FEU on all Asia-Europe services.");
  assert.deepEqual(r, { ok: true });
});

test("carrierSlug: lower-cases, hyphenates, strips edge hyphens", () => {
  assert.equal(carrierSlug("A.P. Moller - Maersk"), "a-p-moller-maersk");
  assert.equal(carrierSlug("CMA CGM"), "cma-cgm");
  assert.equal(carrierSlug(""), "");
});

test("buildCarrierEtsSurchargeRow: shapes a market_series row, never fabricates a tier line when unrated", () => {
  const candidate = {
    carrierName: "Maersk",
    tradeLane: "Asia-North Europe",
    currency: "USD",
    value: "210",
    unit: "USD/FEU",
    effectivePeriod: "2026-10-01",
    surchargeType: "EU ETS",
    sourceUrl: "https://www.maersk.com/news/articles/ets-surcharge",
  };
  const source = { source_id: "preview:maersk.com", source_key: "maersk_com_ets_notice", tier: 7 };
  const row = buildCarrierEtsSurchargeRow(candidate, source);
  assert.equal(row.series_key, "carrier-ets:maersk-asia-north-europe");
  assert.equal(row.value_numeric, 210);
  assert.equal(row.unit, "USD/FEU");
  assert.equal(row.currency, "USD");
  assert.equal(row.derivation, "observed");
  assert.equal(row.origin_class, "official");
  assert.equal(row.reference_period, "2026-10-01");
  assert.equal(row.as_at_date, "2026-10-01");
  assert.match(row.source_ref, /Maersk published surcharge notice/);
  assert.match(row.source_ref, /T7/);
});

test("buildCarrierEtsSurchargeRow: handles no trade lane", () => {
  const row = buildCarrierEtsSurchargeRow(
    { carrierName: "MSC", currency: "USD", value: "195", unit: "USD/FEU", effectivePeriod: "2026-10-01", surchargeType: "EU ETS" },
    { source_id: "preview:msc.com", source_key: "msc_com_ets_notice", tier: 7 },
  );
  assert.equal(row.series_key, "carrier-ets:msc");
  assert.doesNotMatch(row.label, /undefined/);
});

test("rowKey: matches series_key + reference_period", () => {
  const row = { series_key: "carrier-ets:msc", reference_period: "2026-10-01" };
  assert.equal(rowKey(row), "carrier-ets:msc\u00002026-10-01");
});

test("buildEtsProxyBand: never a bare point, refuses fewer than 2 observations", () => {
  assert.equal(buildEtsProxyBand([]), null);
  assert.equal(buildEtsProxyBand([{ value_numeric: 210, currency: "USD", reference_period: "2026-10-01" }]), null);
});

test("buildEtsProxyBand: real min/max/median across carriers, never an invented band", () => {
  const rows = [
    { value_numeric: 210, currency: "USD", reference_period: "2026-10-01" },
    { value_numeric: 195, currency: "USD", reference_period: "2026-10-01" },
    { value_numeric: 230, currency: "USD", reference_period: "2026-10-01" },
  ];
  const band = buildEtsProxyBand(rows);
  assert.equal(band.low, 195);
  assert.equal(band.high, 230);
  assert.equal(band.point, 210);
  assert.equal(band.n_carriers, 3);
  assert.equal(band.derivation, "calculated");
  assert.equal(band.currency, "USD");
  assert.equal(band.reference_period, "2026-10-01");
});

test("buildEtsProxyBand: even count medians the middle two", () => {
  const rows = [
    { value_numeric: 200, currency: "USD", reference_period: "2026-10-01" },
    { value_numeric: 220, currency: "USD", reference_period: "2026-10-01" },
  ];
  const band = buildEtsProxyBand(rows);
  assert.equal(band.point, 210);
  assert.equal(band.low, 200);
  assert.equal(band.high, 220);
});

test("buildEtsProxyBand: refuses mixed currencies rather than blending across them", () => {
  const rows = [
    { value_numeric: 210, currency: "USD", reference_period: "2026-10-01" },
    { value_numeric: 195, currency: "EUR", reference_period: "2026-10-01" },
  ];
  assert.throws(() => buildEtsProxyBand(rows), /mixed currencies/);
});

test("buildEtsProxyBand: refuses rows spanning multiple periods", () => {
  const rows = [
    { value_numeric: 210, currency: "USD", reference_period: "2026-10-01" },
    { value_numeric: 195, currency: "USD", reference_period: "2026-11-01" },
  ];
  assert.throws(() => buildEtsProxyBand(rows), /multiple reference_period/);
});
