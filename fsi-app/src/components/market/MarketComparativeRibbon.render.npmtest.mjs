// Real-render regression tests for the Market headline ribbon and the series parts it now shares with the
// series board (lane MKT-1, 2026-10-08; VERIFY-1 register rows 02S6 r1, r10, r11).
//
// WHY THIS FILE EXISTS ALONGSIDE MarketComparativeRibbon.npmtest.mjs. That file is a source-text test
// (no JSX harness for the no-npm glob). The claims here are about RENDERED OUTPUT: that the card shows
// level, 1w, 1m, YoY, sparkline and as-of; that a missing change names the spec 00 section 4 state it
// falls in instead of a dash; that the methodology disclosure and freshness panel are on the page. So
// this file follows ImpactMeter.npmtest.mjs: it compiles the real .tsx with esbuild (already a project
// dependency) and renders it with react-dom/server in Node, no browser. react and react-dom stay
// external so the component renders with the SAME React the app ships.
//
// The fixture board is built by the REAL pipeline (buildSeriesBoard over raw market_series-shaped rows),
// so the deltas under test are the ones series-deltas.mjs computes, not hand-written look-alikes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSeriesBoard } from "../../lib/market/series-board-view-model.mjs";
import { OBS_STATUS, isMissing } from "../../lib/contracts/vocabularies.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/
const OUT_DIR = resolve(REPO_ROOT, "scripts/tmp");

// next/link is a framework import that cannot load under plain Node ESM; the ribbon uses it for one
// anchor. A stub that renders the same <a href> keeps the markup under test identical.
const stubNextLink = {
  name: "stub-next-link",
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `import React from "react"; export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children); }`,
      loader: "js",
      resolveDir: REPO_ROOT,
    }));
  },
};

async function compile(relPath) {
  const entry = resolve(HERE, relPath);
  const outfile = join(OUT_DIR, `mkt1-${relPath.replace(/[^A-Za-z]/g, "")}-${process.pid}-${Date.now()}.mjs`);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    outfile,
    logLevel: "silent",
    absWorkingDir: REPO_ROOT,
    plugins: [stubNextLink],
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
  });
  const mod = await import(pathToFileURL(outfile).href);
  try {
    unlinkSync(outfile);
  } catch {
    // best-effort cleanup of a compiled fixture under gitignored scripts/tmp/
  }
  return mod;
}

const ribbon = await compile("MarketComparativeRibbon.tsx");
const freshnessMod = await compile("SeriesFreshness.tsx");
const provenanceMod = await compile("SeriesProvenance.tsx");
const { MarketComparativeRibbon, deltaCellModel, sparklineModel, SPARKLINE_MAX_POINTS, DELTA_STATE_OBS_CODE } = ribbon;

// ── fixture: raw market_series rows through the real board builder ─────────────────────────────────────

const NOW = "2026-09-08";

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function row(seriesKey, date, value, extra = {}) {
  return {
    id: `${seriesKey}@${date}`,
    series_key: seriesKey,
    label: extra.label ?? seriesKey,
    reference_period: date,
    as_at_date: date,
    value_numeric: value,
    unit: extra.unit ?? "EUR/1000L",
    currency: extra.currency ?? "EUR",
    source_key: "ec_weekly_oil_bulletin",
    source_ref: "oil-bulletin-fixture",
    derivation: "observed",
    origin_class: "official",
    method_version: "v1",
    n_observations: 27,
  };
}

/** Weekly rows ending at `last`, `count` of them, values from `valueAt(i)`. */
function weekly(seriesKey, last, count, valueAt, extra) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(row(seriesKey, addDays(last, -7 * (count - 1 - i)), valueAt(i), extra));
  return out;
}

const DIESEL = "eu-oil-bulletin:automotive-diesel";
const SUPER = "eu-oil-bulletin:eurosuper-95";
const HFO = "eu-oil-bulletin:heavy-fuel-oil-3-5pct";
const RESID = "eu-oil-bulletin:residual-fuel-oil-1pct";

function buildFixtureBoard() {
  const raw = [
    // 58 weekly observations: every window computes, and the sparkline has real shape.
    ...weekly(DIESEL, "2026-09-07", 58, (i) => 1100 + i * 2 + (i % 5) * 3, { label: "Diesel" }),
    // 3 weekly observations: the 1w window computes, 1m and YoY have no data yet.
    ...weekly(SUPER, "2026-09-07", 3, (i) => 1000 + i * 4, { label: "Euro-Super 95" }),
    // Unit changed on the 1w comparison pair only: 1w is suppressed, 1m still computes.
    row(HFO, "2026-08-03", 500, { label: "Heavy Fuel Oil", unit: "EUR/t" }),
    row(HFO, "2026-08-31", 510, { label: "Heavy Fuel Oil", unit: "USD/t", currency: "USD" }),
    row(HFO, "2026-09-07", 520, { label: "Heavy Fuel Oil", unit: "EUR/t" }),
    // Prior value zero: the change is known, the percent is undefined (not applicable).
    row(RESID, "2026-08-03", 0, { label: "Residual Fuel Oil", unit: "EUR/t" }),
    row(RESID, "2026-08-31", 0, { label: "Residual Fuel Oil", unit: "EUR/t" }),
    row(RESID, "2026-09-07", 646, { label: "Residual Fuel Oil", unit: "EUR/t" }),
  ];
  return buildSeriesBoard(raw);
}

const board = buildFixtureBoard();
const html = renderToStaticMarkup(React.createElement(MarketComparativeRibbon, { board, embedded: true, nowIso: NOW }));

/** The markup of one card, found by its label text. */
function cardFor(labelText) {
  const cards = html.split('data-audit="headline-card"').slice(1);
  const hit = cards.find((c) => c.includes(`title="${labelText}`));
  assert.ok(hit, `no headline card labelled ${labelText}`);
  return hit.split('data-audit="headline-card"')[0];
}

// ── row r1: all six values on the card ─────────────────────────────────────────────────────────────────

test("r1: a fully populated card renders the level, 1w, 1m, YoY, the sparkline and the as-of date", () => {
  const card = cardFor("Diesel · EU avg before tax");
  assert.match(card, /data-audit="headline-card-delta"[^>]*>[▲▼]\d+\.\d% 1w</);
  assert.match(card, /data-audit="headline-card-delta-1m"[^>]*>[▲▼]\d+\.\d% 1m</);
  assert.match(card, /data-audit="headline-card-delta-yoy"[^>]*>[▲▼]\d+\.\d% YoY</);
  assert.match(card, /<svg[^>]*role="img"[^>]*aria-label="Trend over 58 observations, 2025-08-04 to 2026-09-07"/);
  assert.match(card, /<polyline[^>]*points="[0-9., ]+"/);
  assert.match(card, /data-audit="headline-card-asof"[^>]*>as of 2026-09-07</);
  // The level is still there (never break existing display).
  assert.match(card, /€[\d,]+\.\d{2}/);
});

test("r1: the 1w text keeps the shape the existing audit row pins, so the old display is preserved", () => {
  const card = cardFor("Diesel · EU avg before tax");
  const m = card.match(/data-audit="headline-card-delta"[^>]*>([^<]*)</);
  assert.match(m[1], /^[▲▼]\d+\.\d% 1w$/);
});

test("r1: a series with too little history for 1m and YoY names the no-data-yet state, not a dash", () => {
  const card = cardFor("Euro-Super 95 · EU avg");
  assert.match(card, /data-audit="headline-card-delta"[^>]*>[▲▼]\d+\.\d% 1w</);
  for (const key of ["1m", "yoy"]) {
    const m = card.match(new RegExp(`data-audit="headline-card-delta-${key}"([^>]*)>([^<]*)<`));
    assert.ok(m, `${key} cell missing`);
    assert.match(m[1], /data-absence-state="no_data_yet"/);
    assert.match(m[1], /data-obs-status="H"/);
    assert.match(m[2], /no data yet/);
  }
  // The reason names what the window needs.
  assert.match(card, /title="Needs 30 days of history for the 1m change\./);
  assert.match(card, /title="Needs 365 days of history for the YoY change\./);
});

test("r1: a unit change across the compared pair is suppressed with its reason class, 1m still computes", () => {
  const card = cardFor("Heavy fuel oil 3.5%S");
  const w1 = card.match(/data-audit="headline-card-delta"([^>]*)>([^<]*)</);
  assert.match(w1[1], /data-absence-state="suppressed"/);
  assert.match(w1[1], /data-obs-status="Q"/);
  assert.match(w1[2], /suppressed/);
  assert.match(w1[1], /Unit or currency changed since 2026-08-31/);
  assert.match(card, /data-audit="headline-card-delta-1m"[^>]*>[▲▼]\d+\.\d% 1m</);
});

test("r1: a percent change over a zero prior is not applicable, never a fabricated percentage", () => {
  const card = cardFor("Residual fuel oil 1%S");
  const w1 = card.match(/data-audit="headline-card-delta"([^>]*)>([^<]*)</);
  assert.match(w1[1], /data-absence-state="not_applicable"/);
  assert.match(w1[1], /data-obs-status="O"/);
  assert.match(w1[2], /not applicable/);
});

test("r1: no card renders the retired word pending or a bare dash placeholder where a number would be", () => {
  assert.doesNotMatch(html, /pending/i);
  // A dash glyph only ever appears inside an element that is not a delta or level slot.
  assert.doesNotMatch(html, /data-audit="headline-card-delta[^"]*"[^>]*>\s*\u2014/);
});

test("r1: every card carries a freshness state derived from its own registry cadence", () => {
  const badges = html.match(/data-audit="series-freshness-badge" data-freshness="[a-z]+"/g) ?? [];
  assert.equal(badges.length, 4);
  // 2026-09-07 observation, 2026-09-08 render, weekly cadence: current.
  assert.ok(badges.every((b) => b.includes('data-freshness="current"')));
});

// ── rows r10 and r11: the shared panel and drawer are on the Market page ───────────────────────────────

test("r11: the freshness panel summary renders under the track from the shared part, worst state first", () => {
  assert.match(html, /data-audit="series-freshness-panel"/);
  assert.match(html, /Freshness \u2014 Current/);
  assert.match(html, /Every populated series is within its registered cadence\./);
});

test("r10: one methodology and provenance disclosure, closed by default, one block per series with the board's own fields", () => {
  const drawer = html.slice(html.indexOf('data-audit="headline-method-drawer"'));
  assert.ok(drawer.startsWith('data-audit="headline-method-drawer"'));
  assert.doesNotMatch(drawer.slice(0, 80), /\sopen[=\s>]/, "the disclosure must be closed by default");
  const blocks = drawer.split('data-audit="headline-method-block"').length - 1;
  assert.equal(blocks, 4);
  assert.match(drawer, /Derivation<\/span><span[^>]*>observed</);
  assert.match(drawer, /Origin class<\/span><span[^>]*>official</);
  assert.match(drawer, /Method version<\/span><span[^>]*>v1</);
  assert.match(drawer, /Observations \(n\)<\/span><span[^>]*>27</);
  assert.match(drawer, /Source key<\/span><span[^>]*>ec_weekly_oil_bulletin</);
  assert.match(drawer, /Licence<\/span>/);
  assert.match(drawer, /Attribution<\/span>/);
});

test("r10/r11: the shared parts render the same markup the series board did (moved, not changed)", () => {
  const { SeriesFreshnessPanel, SeriesFreshnessBadge } = freshnessMod;
  const { SeriesProvenanceDrawer } = provenanceMod;
  const panel = renderToStaticMarkup(
    React.createElement(SeriesFreshnessPanel, {
      summary: { counts: { current: 2, ageing: 1, stale: 0, frozen: 0, unknown: 0 }, total: 3, worst: "ageing" },
    }),
  );
  assert.match(panel, /Freshness \u2014 Ageing/);
  assert.match(panel, /At least one series is running late against its registered cadence\./);
  assert.match(panel, /2 current · 1 ageing/);
  assert.equal(
    renderToStaticMarkup(
      React.createElement(SeriesFreshnessPanel, { summary: { counts: { current: 0, ageing: 0, stale: 0, frozen: 0, unknown: 0 }, total: 0, worst: "unknown" } }),
    ),
    "",
    "an empty board renders no panel",
  );
  const badge = renderToStaticMarkup(
    React.createElement(SeriesFreshnessBadge, { freshness: { code: "stale", label: "Stale", asOfDate: "2026-07-01" } }),
  );
  assert.match(badge, /Stale/);
  assert.match(badge, /· as of 2026-07-01/);
  const drawer = renderToStaticMarkup(
    React.createElement(SeriesProvenanceDrawer, {
      row: { derivation: "observed", originClass: "official", methodVersion: "v1", nObservations: 3, sourceKey: "k", sourceRef: "r" },
      producer: { sourceName: "Src", sourceUrl: "https://example.test/x", licenceStatus: "CC BY 4.0" },
    }),
  );
  assert.match(drawer, /<details[^>]*><summary[^>]*>Methodology &amp; provenance<\/summary>/);
  assert.match(drawer, /Attribution<\/span><span[^>]*>Src\. CC BY 4\.0\.</);
  assert.match(drawer, /<a href="https:\/\/example\.test\/x"[^>]*>r<\/a>/);
});

// ── the pure decisions, attacked branch by branch ──────────────────────────────────────────────────────

test("deltaCellModel: every absent state maps to a missing SDMX code that exists in the shared vocabulary", () => {
  for (const [state, code] of Object.entries(DELTA_STATE_OBS_CODE)) {
    assert.ok(OBS_STATUS[code], `${state} -> ${code} is not in OBS_STATUS`);
    assert.equal(isMissing(code), true, `${code} must be a missing-family code`);
  }
});

test("deltaCellModel: not covered when the row carries no comparison; no data yet for an empty or single-point series", () => {
  const nc = deltaCellModel(undefined, "1m");
  assert.equal(nc.kind, "absent");
  assert.equal(nc.state, "not_covered");
  assert.equal(nc.lead, "comparison");
  const empty = deltaCellModel({ count: 0, latest: null, sparkline: [], delta1w: null, delta1m: null, deltaYoY: null, message: "x" }, "1w");
  assert.equal(empty.state, "no_data_yet");
  assert.match(empty.detail, /No observations on record/);
  const one = deltaCellModel(
    { count: 1, latest: { date: "2026-09-01", value: 1, unit: null, currency: null }, sparkline: [{ date: "2026-09-01", value: 1 }], delta1w: null, delta1m: null, deltaYoY: null, message: "one observation, no delta yet (history backfill pending)" },
    "YoY",
  );
  assert.equal(one.state, "no_data_yet");
  assert.match(one.detail, /One observation on record, 2026-09-01\. Needs 365 days/);
  assert.doesNotMatch(one.detail, /pending/i, "the upstream message is never echoed to the reader");
});

test("deltaCellModel: a numeric change renders arrow, unsigned magnitude and window; a flat change draws no arrow", () => {
  const base = { count: 5, latest: { date: "2026-09-07", value: 1, unit: null, currency: null }, sparkline: [], delta1m: null, deltaYoY: null, message: null };
  const up = deltaCellModel({ ...base, delta1w: { value: 2, pct: 1.234, fromDate: "2026-08-31" } }, "1w");
  assert.equal(up.kind, "value");
  assert.equal(up.text, "▲1.2% 1w");
  const down = deltaCellModel({ ...base, delta1w: { value: -2, pct: -8.1, fromDate: "2026-08-31" } }, "1w");
  assert.equal(down.text, "▼8.1% 1w");
  const flat = deltaCellModel({ ...base, delta1w: { value: 0, pct: 0, fromDate: "2026-08-31" } }, "1w");
  assert.equal(flat.kind, "value");
  assert.equal(flat.arrow, "");
  assert.equal(flat.text, "0.0% 1w");
});

test("sparklineModel: fewer than two numeric points is null; a long series is sampled with first and last kept", () => {
  assert.equal(sparklineModel(undefined), null);
  assert.equal(sparklineModel([{ date: "2026-01-01", value: 1 }]), null);
  assert.equal(sparklineModel([{ date: "2026-01-01", value: null }, { date: "2026-01-08", value: 2 }]), null);
  const long = Array.from({ length: 455 }, (_, i) => ({ date: addDays("2025-01-01", i), value: 100 + (i % 17) }));
  const m = sparklineModel(long);
  assert.equal(m.drawn, SPARKLINE_MAX_POINTS);
  assert.equal(m.total, 455);
  assert.equal(m.from, "2025-01-01");
  assert.equal(m.to, long[454].date);
  assert.equal(m.points.split(" ").length, SPARKLINE_MAX_POINTS);
  assert.ok(m.points.startsWith("0.00,"));
  assert.ok(m.points.split(" ").pop().startsWith("100.00,"));
  const flat = sparklineModel([{ date: "2026-01-01", value: 5 }, { date: "2026-01-08", value: 5 }]);
  assert.equal(flat.points, "0.00,12.00 100.00,12.00", "a flat series draws a level line, not NaN");
});

// ── fallbacks and mount points ─────────────────────────────────────────────────────────────────────────

test("the ribbon still renders nothing when no series carries a computed change (existing behaviour kept)", () => {
  const single = buildSeriesBoard([row(DIESEL, "2026-09-07", 1200, { label: "Diesel" })]);
  assert.equal(renderToStaticMarkup(React.createElement(MarketComparativeRibbon, { board: single, embedded: true, nowIso: NOW })), "");
});

test("market/page.tsx hands the ribbon the one server render instant, and the series page still mounts the board that uses the shared parts", () => {
  const page = readFileSync(resolve(HERE, "..", "..", "app", "market", "page.tsx"), "utf8");
  assert.match(page, /const nowIso = renderNowIso\(\);/);
  assert.match(page, /<MarketComparativeRibbon board=\{seriesBoard\} embedded nowIso=\{nowIso\} \/>/);
  const board = readFileSync(resolve(HERE, "MarketSeriesBoard.tsx"), "utf8");
  assert.match(board, /import \{ SeriesFreshnessPanel, SeriesFreshnessBadge, boardFreshnessSummary \} from "@\/components\/market\/SeriesFreshness";/);
  assert.match(board, /import \{ SeriesProvenanceDrawer \} from "@\/components\/market\/SeriesProvenance";/);
  assert.doesNotMatch(board, /function MethodRow/, "the drawer rows live in one home");
  assert.doesNotMatch(board, /const FRESHNESS_TONE/, "the tone table lives in one home");
});

