// Structural regression test for GridQueuePanelView.tsx, absence rule (2026-09-25 close): "a value
// that exists is shown; one that cannot exist yet names the data it needs". The UNKNOWN status used
// to discard evaluateGridQueueGate()'s own `.reason` string (grid-queue.mjs); this lane (W2-C,
// 2026-09-29) surfaces it as `statusDetail`, and the bare per-row "M" placeholders for p50/p90 queue
// months now name the specific missing input. Source-text regression, same convention as
// StateNote.npmtest.mjs's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "GridQueuePanelView.tsx"),
  "utf8"
);

test("UNKNOWN status surfaces evaluateGridQueueGate's own reason instead of discarding it", () => {
  assert.match(SOURCE, /const statusDetail = status === "UNKNOWN"/);
  assert.match(SOURCE, /\(gate as \{ reason\?: string \}\)\.reason/);
});

test("p50/p90 queue-month cells name the specific missing input instead of a bare 'M'", () => {
  assert.doesNotMatch(SOURCE, /row\.queue_months_p50 \?\? "M"/);
  assert.doesNotMatch(SOURCE, /row\.queue_months_p90 \?\? "M"/);
  assert.match(SOURCE, /"needs p50 queue months"/);
  assert.match(SOURCE, /"needs p90 queue months"/);
});

test("the whole-panel empty state still names the specific no-source data requirement (unchanged)", () => {
  assert.match(SOURCE, /GRID_QUEUE_GAP_LINE =\s*\n?\s*"No rows yet \u2014 source: none confirmed, no \$0 feed for demand-side connection-queue months/); // glyph:verbatim (pre-existing constant text)
});

// Lane S8-E6 (migration 379): the per-substation columns a producer writes have a reader (F14 class).
const PANEL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "GridQueuePanel.tsx"), "utf8");

test("the panel reads every per-substation column migration 379 adds that the view shows", () => {
  for (const col of ["substation_name", "demand_firm_mw", "demand_available_mw", "demand_constraint", "demand_constraint_limiting_factor"]) {
    assert.ok(PANEL.includes(col), `GridQueuePanel selects ${col}`);
    assert.ok(SOURCE.includes(col), `GridQueuePanelView renders ${col}`);
  }
  assert.match(PANEL, /order\("demand_available_mw", \{ ascending: true, nullsFirst: true \}\)/, "band-level rows are never pushed out by substation rows");
});

test("a band-less substation row shows its name, operator, headroom (a deficit stays negative) and constraint, and still reaches the UNKNOWN gate", () => {
  assert.match(SOURCE, /capacity_band_mw: string \| null/);
  assert.match(SOURCE, /row\.substation_name \?\? row\.dso_name/);
  assert.match(SOURCE, /MW demand headroom/);
  assert.match(SOURCE, /constraint \$\{row\.demand_constraint\}/);
});
