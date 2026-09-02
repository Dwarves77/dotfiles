/**
 * Tests for emission-factors-desnz.mjs (WO-18, extended lane PROD-FIX 2026-09-02) — pure, $0, offline,
 * no DB, no fetch, no --apply.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM emission-factors-common.test.mjs. This lane's write set is the
 * DESNZ fixture, the DESNZ producer script, and its test — not the shared common module or its test
 * (emission-factors-common.mjs / emission-factors-common.test.mjs, both used by the EPA producer too).
 * splitPending() lives in emission-factors-desnz.mjs precisely so this DESNZ-specific behaviour (the
 * needs_runner_fetch shell convention) does not need to touch the shared module at all.
 *
 * emission-factors-common.test.mjs's own DESNZ-fixture assertions (row count, the validateFactor
 * zero-errors positive control, and every place it feeds loadFixtureRows(DESNZ_FIXTURE) straight into
 * seedFactors) were extended in the SAME commit to filter needs_runner_fetch rows out first, since that
 * fixture now legitimately contains rows that fail validateFactor by design. That was unavoidable: the
 * existing hardcoded `rows.length === 4` assertion there would otherwise break the moment this fixture
 * grew rows, regardless of which file owns the new tests.
 *
 * WIRING: `fsi-app/scripts/gen/*.test.mjs` is already an existing line in
 * fsi-app/.discipline/run-test-suite.sh (checked live, per COMMON's "wire it in only if its glob is not
 * already covered" instruction) — this file matches it as-is, no run-test-suite.sh edit needed or made.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFactor } from "../../src/lib/contracts/factor-tier.mjs";
import { loadFixtureRows } from "./emission-factors-common.mjs";
import { splitPending } from "./emission-factors-desnz.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESNZ_FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");

// A citation must name the sheet AND a row number — the two things a reader needs to check the figure
// against the primary without re-deriving it. Deliberately does not require a column letter: the rail
// row (existing, confirmed) cites "row 106, column D", but the pattern only requires what every
// confirmed row in this fixture actually has in common.
const SHEET_ROW_CITATION_RE = /sheet\s+'Freighting goods'.*?\brow\s+\d+/is;

function hasSheetRowCitation(row) {
  return typeof row.source_ref === "string" && SHEET_ROW_CITATION_RE.test(row.source_ref);
}

// ── splitPending() ──────────────────────────────────────────────────────────────────────────────────
test("splitPending separates needs_runner_fetch shells from seedable rows", () => {
  const all = loadFixtureRows(DESNZ_FIXTURE);
  const { seedable, pending } = splitPending(all);
  assert.equal(seedable.length + pending.length, all.length, "every row must land in exactly one bucket");
  for (const r of pending) assert.equal(r.needs_runner_fetch, true);
  for (const r of seedable) assert.notEqual(r.needs_runner_fetch, true);
});

test("splitPending: the 4 original DESNZ rows (road/rail) are seedable, and are unaffected by the new air/sea shells", () => {
  const { seedable } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  assert.equal(seedable.length, 4, "seedable row count changed — update this test deliberately if intended");
  for (const row of seedable) {
    assert.deepEqual(validateFactor(row), [], `unexpected validation errors for ${row.vehicle_class}`);
  }
});

test("splitPending: the 7 air/sea shells added 2026-09-02 are pending, not seedable", () => {
  const { pending } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  assert.equal(pending.length, 7, "pending row count changed — update this test deliberately if intended");
  const modes = pending.map((r) => r.mode).sort();
  assert.deepEqual(modes, ["air", "air", "air", "ocean", "ocean", "ocean", "ocean"]);
  const vehicleClasses = pending.map((r) => r.vehicle_class).sort();
  assert.deepEqual(vehicleClasses, [
    "air_freight_domestic",
    "air_freight_long_haul_international",
    "air_freight_short_haul_international",
    "ocean_bulk_carrier_average",
    "ocean_container_ship_average",
    "ocean_general_cargo_average",
    "ocean_roro_average",
  ]);
});

// ── THE NULL-TOLERANCE GUARD: a null value is legitimate ONLY behind the needs_runner_fetch marker ────
test("every needs_runner_fetch row has ttw_co2e/wtt_co2e/wtw_co2e all null and a 'NEEDS RUNNER FETCH:' source_ref", () => {
  const { pending } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  assert.ok(pending.length > 0, "sanity: there should be pending rows to check");
  for (const r of pending) {
    assert.equal(r.ttw_co2e, null, `${r.vehicle_class}: a pending shell must not carry a figure`);
    assert.equal(r.wtt_co2e, null, `${r.vehicle_class}: a pending shell must not carry a figure`);
    assert.equal(r.wtw_co2e, null, `${r.vehicle_class}: a pending shell must not carry a figure`);
    assert.ok(
      typeof r.source_ref === "string" && r.source_ref.startsWith("NEEDS RUNNER FETCH:"),
      `${r.vehicle_class}: pending source_ref must start with the marker, got: ${JSON.stringify(r.source_ref)}`
    );
  }
});

test("every seedable (non-pending) row passes validateFactor with zero errors — a null figure is REJECTED unless needs_runner_fetch is set", () => {
  const { seedable } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  for (const r of seedable) {
    assert.deepEqual(validateFactor(r), [], `${r.vehicle_class} must be fully valid: it carries no needs_runner_fetch marker`);
  }
});

test("ATTACK: a row with ttw_co2e null but no needs_runner_fetch marker is rejected by validateFactor (proves the tolerance is marker-gated, not blanket)", () => {
  const [pendingSample] = splitPending(loadFixtureRows(DESNZ_FIXTURE)).pending;
  // Strip the marker off an otherwise-identical shell. If validateFactor still passed this, a null
  // figure could sneak into the seed batch unmarked — this is the case the guard exists to prevent.
  const { needs_runner_fetch, ...unmarked } = pendingSample;
  const errors = validateFactor(unmarked);
  assert.ok(errors.length > 0, "a null-valued row with no marker must fail validateFactor");
});

// ── THE CITATION GUARD: extends the fixture test so a row without a sheet/row citation fails ──────────
test("every seedable DESNZ row's source_ref cites the sheet name and a row number", () => {
  const { seedable } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  for (const r of seedable) {
    assert.ok(
      hasSheetRowCitation(r),
      `${r.vehicle_class}: source_ref does not cite "sheet 'Freighting goods'" + a row number: ${JSON.stringify(r.source_ref)}`
    );
  }
});

test("ATTACK: a row whose source_ref citation is stripped of its row number is rejected by hasSheetRowCitation (proves the check does work, not merely exists)", () => {
  const { seedable } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  const [good] = seedable;
  assert.ok(hasSheetRowCitation(good), "sanity: the row must cite before it is corrupted");

  const stripped = { ...good, source_ref: good.source_ref.replace(/row\s+\d+/i, "row (unspecified)") };
  assert.ok(!hasSheetRowCitation(stripped), "citation check failed to reject a row number-less source_ref");

  const noSheet = { ...good, source_ref: good.source_ref.replace(/sheet\s+'Freighting goods'/i, "the workbook") };
  assert.ok(!hasSheetRowCitation(noSheet), "citation check failed to reject a sheet-name-less source_ref");
});

test("pending rows are correctly EXEMPT from the citation guard (they cannot cite a row number they do not have yet)", () => {
  const { pending } = splitPending(loadFixtureRows(DESNZ_FIXTURE));
  for (const r of pending) {
    assert.ok(!hasSheetRowCitation(r), `${r.vehicle_class}: a pending shell should not (yet) have a row citation`);
  }
});

// ── mode vocabulary: sea rows are stored under the canonical token ─────────────────────────────────────
test("the sea/ocean shells use the canonical mode token 'ocean' (migration 263), never the superseded 'sea'", () => {
  const oceanShells = loadFixtureRows(DESNZ_FIXTURE).filter((r) => r.vehicle_class.startsWith("ocean_"));
  assert.equal(oceanShells.length, 4);
  for (const r of oceanShells) {
    assert.equal(r.mode, "ocean", `${r.vehicle_class}: mode must be canonical 'ocean', not an input alias`);
  }
});
