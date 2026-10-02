// Structural proof for SignpostList.tsx (lane L5, 2026-10-02). Text-level, same convention as
// ResearchLedger.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "SignpostList.tsx"),
  "utf8"
);

test("renders the honest absence state when no signposts prop is supplied (L6 not landed yet)", () => {
  assert.match(SOURCE, /No signposts watched yet for this finding/);
  assert.match(SOURCE, /hasSignposts \? \(/);
});

test("a supplied signpost list renders every entry's label and machine state, never an editorial affordance", () => {
  assert.match(SOURCE, /signposts!\.map/);
  assert.match(SOURCE, /STATE_LABELS\[s\.state\]/);
  // RD-20 / no-editorial-queue: no approve/feature-this/pick button or onClick handler anywhere.
  assert.doesNotMatch(SOURCE, /onClick/);
  assert.doesNotMatch(SOURCE, /<button/i);
});

test("the state vocabulary is exactly the spec-03 section 7 row 8 five-value set", () => {
  assert.match(
    SOURCE,
    /export type SignpostState = "emerging" \| "strengthening" \| "stalled" \| "resolved" \| "falsified";/,
  );
});

test("the panel title goes through the shared SectionHeading", () => {
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading";/);
  assert.match(SOURCE, /<SectionHeading title="Signposts" \/>/);
});
