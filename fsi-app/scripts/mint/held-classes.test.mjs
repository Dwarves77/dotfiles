// Tests for held-classes.mjs (Lane HELD, 2026-09-02). node:test + node:assert/strict.
// The grouping/classification/formatting functions are pure (no I/O); only the `main()` CLI test touches
// the filesystem, and only through a scratch tmp file this test writes and cleans up itself.
// Run: node --test scripts/mint/held-classes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  keyShapeOf,
  classifyMissing,
  recommendationFor,
  mergeHeldRows,
  buildDossier,
  flattenRecommendations,
  formatDossier,
  main,
} from "./held-classes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, "..", "_snapshots", "population-33678399902", "census-rows.held.json");
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

// ── keyShapeOf ───────────────────────────────────────────────────────────────────────────────────────

test("keyShapeOf: EFTA E-prefixed identifier is named distinctly from a plain no-shape row", () => {
  assert.equal(keyShapeOf({ instrument_identifier: "E2012C0522" }), "efta_e_prefixed");
  assert.equal(keyShapeOf({ instrument_identifier: "e2012c0522" }), "efta_e_prefixed"); // case-insensitive
});

test("keyShapeOf: an OJ citation URL (uri=OJ:...) is named distinctly", () => {
  assert.equal(keyShapeOf({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202500868" }), "oj_citation");
});

test("keyShapeOf: an identifier present but neither CELEX nor OJ shape is named, never silently grouped with 'no identifier'", () => {
  assert.equal(keyShapeOf({ instrument_identifier: "some-free-text-id" }), "identifier_present_no_celex_or_eli_shape");
});

test("keyShapeOf: no identifier and no OJ-shaped URL at all", () => {
  assert.equal(keyShapeOf({}), "no_identifier_on_row");
  assert.equal(keyShapeOf({ instrument_identifier: null, document_url: "https://example.com/x" }), "no_identifier_on_row");
});

// ── classifyMissing ──────────────────────────────────────────────────────────────────────────────────

test("classifyMissing: identity_unmapped_source groups by host, '(unknown)' when the row carries none", () => {
  assert.equal(classifyMissing({ reason: "identity_unmapped_source", host: "sdir.no" }), "host:sdir.no");
  assert.equal(classifyMissing({ reason: "identity_unmapped_source" }), "host:(unknown)");
});

test("classifyMissing: institution_category_unmapped groups by category, '(none)' when unset", () => {
  assert.equal(classifyMissing({ reason: "institution_category_unmapped", category: "research" }), "category:research");
  assert.equal(classifyMissing({ reason: "institution_category_unmapped", category: null }), "category:(none)");
});

test("classifyMissing: item_type_unmapped groups an FR row by fr_type, a CELEX row by sector+letter, else by scheme/host", () => {
  assert.equal(classifyMissing({ reason: "item_type_unmapped", fr_type: "Notice" }), "fr_type:Notice");
  assert.equal(
    classifyMissing({ reason: "item_type_unmapped", scheme: "celex", canonical_instrument_key: "32014C0788" }),
    "celex_sector_letter:3C",
  );
  assert.equal(classifyMissing({ reason: "item_type_unmapped", scheme: "uk_legislation", host: "www.legislation.gov.uk" }), "scheme:uk_legislation");
  assert.equal(classifyMissing({ reason: "item_type_unmapped", host: "example.gov" }), "scheme:example.gov");
});

test("classifyMissing: canonical_key_unresolved groups by keyShapeOf", () => {
  assert.equal(classifyMissing({ reason: "canonical_key_unresolved", instrument_identifier: "E2012C0522" }), "key_shape:efta_e_prefixed");
});

test("classifyMissing: an unrecognized/absent reason is still named, never silently dropped", () => {
  assert.equal(classifyMissing({ reason: "some_new_hold" }), "reason:some_new_hold");
  assert.equal(classifyMissing({}), "reason:(no reason on row)");
});

// ── recommendationFor ───────────────────────────────────────────────────────────────────────────────

test("recommendationFor: every reason this file classifies gets a non-empty, distinct recommendation string", () => {
  const cases = [
    ["identity_unmapped_source", "host:mlit.go.jp"],
    ["institution_category_unmapped", "category:(none)"],
    ["institution_category_unmapped", "category:research"],
    ["canonical_key_unresolved", "key_shape:efta_e_prefixed"],
    ["canonical_key_unresolved", "key_shape:oj_citation"],
    ["canonical_key_unresolved", "key_shape:no_identifier_on_row"],
    ["item_type_unmapped", "fr_type:Notice"],
    ["item_type_unmapped", "celex_sector_letter:3C"],
    ["item_type_unmapped", "scheme:uk_legislation"],
  ];
  const seen = new Set();
  for (const [reason, missing] of cases) {
    const rec = recommendationFor(reason, missing);
    assert.ok(typeof rec === "string" && rec.length > 20, `${reason}/${missing} should have a real recommendation`);
    seen.add(rec);
  }
  assert.equal(seen.size, cases.length, "every case's recommendation text should be distinct");
});

test("recommendationFor: an unrecognized reason still returns a ruling-needed fallback, never throws", () => {
  const rec = recommendationFor("brand_new_hold_reason", "host:x");
  assert.match(rec, /operator ruling/i);
  assert.match(rec, /brand_new_hold_reason/);
});

// ── mergeHeldRows ────────────────────────────────────────────────────────────────────────────────────

test("mergeHeldRows: dedups by row_id across runs, tracking seen_in_runs in order, later run's fields win", () => {
  const runs = [
    { runId: "run-a", rows: [{ row_id: "r1", reason: "identity_unmapped_source", host: "x.example" }] },
    { runId: "run-b", rows: [{ row_id: "r1", reason: "institution_category_unmapped", host: "x.example", category: "research" }] },
    { runId: "run-b", rows: [{ row_id: "r2", reason: "canonical_key_unresolved" }] },
  ];
  const merged = mergeHeldRows(runs);
  assert.equal(merged.length, 2);
  const r1 = merged.find((r) => r.row_id === "r1");
  assert.deepEqual(r1.seen_in_runs, ["run-a", "run-b"]);
  assert.equal(r1.reason, "institution_category_unmapped"); // later run wins
  const r2 = merged.find((r) => r.row_id === "r2");
  assert.deepEqual(r2.seen_in_runs, ["run-b"]);
});

test("mergeHeldRows: falls back to document_url as the dedup key when a row carries no row_id", () => {
  const runs = [
    { runId: "run-a", rows: [{ document_url: "https://x/1", reason: "no_capture" }] },
    { runId: "run-b", rows: [{ document_url: "https://x/1", reason: "no_capture" }] },
  ];
  const merged = mergeHeldRows(runs);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].seen_in_runs, ["run-a", "run-b"]);
});

test("mergeHeldRows: empty/absent input never throws", () => {
  assert.deepEqual(mergeHeldRows([]), []);
  assert.deepEqual(mergeHeldRows(undefined), []);
  assert.deepEqual(mergeHeldRows([{ runId: "r", rows: undefined }]), []);
});

// ── buildDossier / flattenRecommendations / formatDossier ──────────────────────────────────────────────

test("buildDossier: groups rows by reason then by classifyMissing bucket, counts and capped examples", () => {
  const rows = [
    { row_id: "a", reason: "identity_unmapped_source", host: "sdir.no", document_url: "https://sdir.no/1" },
    { row_id: "b", reason: "identity_unmapped_source", host: "sdir.no", document_url: "https://sdir.no/2" },
    { row_id: "c", reason: "identity_unmapped_source", host: "chp.ca.gov", document_url: "https://chp.ca.gov/1" },
    { row_id: "d", reason: "item_type_unmapped", fr_type: "Notice", document_url: "https://x/4" },
  ];
  const dossier = buildDossier(rows, { exampleLimit: 1 });
  assert.equal(dossier.total, 4);
  assert.equal(dossier.byReason.identity_unmapped_source.count, 3);
  assert.equal(dossier.byReason.identity_unmapped_source.groups["host:sdir.no"].count, 2);
  assert.equal(dossier.byReason.identity_unmapped_source.groups["host:sdir.no"].examples.length, 1); // capped
  assert.equal(dossier.byReason.identity_unmapped_source.groups["host:chp.ca.gov"].count, 1);
  assert.equal(dossier.byReason.item_type_unmapped.count, 1);
});

test("buildDossier: an empty rows array produces total 0 and no reasons", () => {
  const dossier = buildDossier([]);
  assert.equal(dossier.total, 0);
  assert.deepEqual(dossier.byReason, {});
});

test("flattenRecommendations: sorted by count descending, one entry per (reason, missing) group", () => {
  const dossier = buildDossier([
    { row_id: "a", reason: "identity_unmapped_source", host: "sdir.no" },
    { row_id: "b", reason: "identity_unmapped_source", host: "sdir.no" },
    { row_id: "c", reason: "identity_unmapped_source", host: "sdir.no" },
    { row_id: "d", reason: "item_type_unmapped", fr_type: "Notice" },
  ]);
  const recs = flattenRecommendations(dossier);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].count, 3);
  assert.equal(recs[0].reason, "identity_unmapped_source");
  assert.equal(recs[1].count, 1);
});

test("formatDossier: renders total, per-reason headers with counts, group lines, and examples", () => {
  const dossier = buildDossier([{ row_id: "a", reason: "identity_unmapped_source", host: "sdir.no", document_url: "https://sdir.no/1" }]);
  const text = formatDossier(dossier);
  assert.match(text, /1 held row\(s\) across 1 reason\(s\)/);
  assert.match(text, /## identity_unmapped_source \(1\)/);
  assert.match(text, /host:sdir\.no: 1/);
  assert.match(text, /e\.g\. a — https:\/\/sdir\.no\/1/);
});

// ── the exact mint-run-012 held fixture (Lane HELD's own evidence file) ────────────────────────────────

test("mint-run-012 fixture: every one of the 8 held rows is grouped and given a recommendation, none silently dropped", () => {
  assert.equal(FIXTURE.length, 8);
  const dossier = buildDossier(FIXTURE);
  assert.equal(dossier.total, 8);
  let counted = 0;
  for (const { count } of Object.values(dossier.byReason)) counted += count;
  assert.equal(counted, 8);
  const recs = flattenRecommendations(dossier);
  for (const r of recs) {
    assert.ok(typeof r.recommendation === "string" && r.recommendation.length > 0, JSON.stringify(r));
  }
});

test("mint-run-012 fixture: the identity_unmapped_source rows group by host (sdir.no, climate.ec.europa.eu x2, rules.cityofnewyork.us)", () => {
  const dossier = buildDossier(FIXTURE);
  const groups = dossier.byReason.identity_unmapped_source.groups;
  assert.equal(groups["host:sdir.no"].count, 1);
  assert.equal(groups["host:climate.ec.europa.eu"].count, 2);
  assert.equal(groups["host:rules.cityofnewyork.us"].count, 1);
});

test("mint-run-012 fixture: the canonical_key_unresolved rows split into the EFTA E-prefixed shape (1) and the plain-CELEX-no-match shape (2)", () => {
  const dossier = buildDossier(FIXTURE);
  const groups = dossier.byReason.canonical_key_unresolved.groups;
  assert.equal(groups["key_shape:efta_e_prefixed"].count, 1);
  // 22004A0806(01) / 21998A0912(01) carry a resolved instrument_identifier already, so keyShapeOf calls
  // them "identifier_present_no_celex_or_eli_shape" is wrong per THIS classifier's own regex (it looks for
  // an E-prefix or an OJ-citation URL only) -- they group under the generic "identifier present" bucket,
  // which is exactly the "this lane's own root-cause fix (in export-census-rows.mjs), not this dossier,
  // closes them" case the module's header documents.
  assert.equal(groups["key_shape:identifier_present_no_celex_or_eli_shape"].count, 2);
});

test("mint-run-012 fixture: the item_type_unmapped row groups by its FR type (Proposed Rule)", () => {
  const dossier = buildDossier(FIXTURE);
  assert.equal(dossier.byReason.item_type_unmapped.groups["fr_type:Proposed Rule"].count, 1);
});

// ── main() CLI (scratch tmp files only) ─────────────────────────────────────────────────────────────

test("main(): reads --file, prints a dossier, and --out writes the grouped JSON with recommendations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "held-classes-test-"));
  try {
    const outPath = join(dir, "dossier.json");
    const origLog = console.log;
    const logged = [];
    console.log = (...args) => logged.push(args.join(" "));
    try {
      await main(["--file", FIXTURE_PATH, "--out", outPath]);
    } finally {
      console.log = origLog;
    }
    assert.ok(logged.some((l) => l.includes("held row(s)")));
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(written.total, 8);
    assert.ok(Array.isArray(written.recommendations));
    assert.ok(written.recommendations.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main(): no --file prints usage and sets a non-zero exit code, never throws", async () => {
  const origLog = console.log;
  console.log = () => {};
  const origExitCode = process.exitCode;
  try {
    await main([]);
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = origLog;
    process.exitCode = origExitCode;
  }
});
