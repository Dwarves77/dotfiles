// Structural proof for DissentPanel.tsx (lane L5, 2026-10-02). Text-level, same convention as
// ResearchLedger.npmtest.mjs's own header explains: no JSX mount infra for plain `node --test`; the
// rendering guard's UX smoke slot is the real-DOM check for this component (see
// detail-surfaces-smoke.mjs, which mounts the whole ResearchFindingDetailSurface this panel lives in).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "DissentPanel.tsx"),
  "utf8"
);

// Spec-03 section 7 component 6: "never collapsed" -- not merely expanded by default. No toggle
// state, no collapse control, anywhere in the component.
test("the panel is uncollapsed BY CONSTRUCTION -- no state hook or toggle controlling visibility", () => {
  assert.doesNotMatch(SOURCE, /useState\(/);
  assert.doesNotMatch(SOURCE, /\bisOpen\b/);
  assert.doesNotMatch(SOURCE, /<details/i);
});

test("an explicit dissentingSources list renders every entry, each with its source name and position", () => {
  assert.match(SOURCE, /hasDissent \? \(/);
  assert.match(SOURCE, /dissentingSources!\.map/);
  assert.match(SOURCE, /d\.sourceName/);
  assert.match(SOURCE, /d\.position/);
});

test("with no explicit dissent but a mixed authority distribution, the composition fallback renders the bucket counts rather than silence", () => {
  assert.match(SOURCE, /hasMixedComposition/);
  assert.match(SOURCE, /highAuthorityIndependent/);
  assert.match(SOURCE, /vendorFlagged/);
});

test("with no dissent data and no distribution at all, a distinct absence state renders (never a blank gap)", () => {
  assert.match(SOURCE, /No dissent recorded for this finding/);
});

test("the panel title goes through the shared SectionHeading (Anton card-title convention), never a bespoke header", () => {
  assert.match(SOURCE, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading";/);
  assert.match(SOURCE, /<SectionHeading title="Dissent" \/>/);
});

test("the component never claims resolved content-level dissent it cannot ground (CLAUDE.md rule 2) -- the fallback names the gap explicitly", () => {
  assert.match(SOURCE, /No per-source dissenting conclusion is recorded yet/);
});
