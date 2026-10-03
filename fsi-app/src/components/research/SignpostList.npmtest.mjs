// Structural proof for SignpostList.tsx (lane L5, 2026-10-02; rewritten after lane L6/PR #890's
// migration 346 landed and the real signposts schema became readable). Text-level, same convention
// as ResearchLedger.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "SignpostList.tsx"),
  "utf8"
);

test("renders the honest absence state when no signposts are supplied", () => {
  assert.match(SOURCE, /No signposts watched yet for this finding/);
  assert.match(SOURCE, /hasSignposts \? \(/);
});

test("a supplied signpost list renders the real schema fields -- watches, direction, predicate summary, fired/unfired -- never an invented state enum", () => {
  assert.match(SOURCE, /signposts!\.map/);
  assert.match(SOURCE, /s\.watches/);
  assert.match(SOURCE, /s\.predicateSummary/);
  assert.match(SOURCE, /s\.isFired \? `Fired \$\{formatDate\(s\.firedAt\)\}` : "Watching"/);
  assert.doesNotMatch(SOURCE, /export type SignpostState/);
});

test("the view type is imported from the real read module, not redeclared locally", () => {
  assert.match(SOURCE, /import type \{ selectSignpostView \} from "@\/lib\/research\/read-signposts\.mjs";/);
});

test("no click target or handler anywhere -- RD-20 / no-editorial-queue", () => {
  assert.doesNotMatch(SOURCE, /onClick/);
  assert.doesNotMatch(SOURCE, /<button/i);
});

test("the panel title goes through the shared SectionHeading", () => {
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading";/);
  assert.match(SOURCE, /<SectionHeading title="Signposts" \/>/);
});
