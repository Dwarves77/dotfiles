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
