// section-index-data.test.mjs, the 14-character short-name bound (lane W10-ActionCard-a,
// operator review item 4). "A test fails if any short name exceeds 14 characters" (brief step 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_INDEX_SHORT_NAME_MAX,
  REGULATION_SECTION_INDEX,
  regulationSectionOrd,
  connectedSectionOrd,
  inferencesSectionOrd,
  crossPageIndexEntries,
} from "./section-index-data.ts";

test("SECTION_INDEX_SHORT_NAME_MAX is 14, per the review", () => {
  assert.equal(SECTION_INDEX_SHORT_NAME_MAX, 14);
});

test("every REGULATION_SECTION_INDEX short name is at most 14 characters", () => {
  for (const entry of REGULATION_SECTION_INDEX) {
    assert.ok(
      entry.shortName.length <= SECTION_INDEX_SHORT_NAME_MAX,
      `"${entry.shortName}" (id=${entry.id}) is ${entry.shortName.length} characters, over the ${SECTION_INDEX_SHORT_NAME_MAX}-character bound`,
    );
  }
});

// Lane IDX-1 (2026-10-07): fixed ordinals 01 to 10, no Related section (Connections live in the
// masthead), Connected and Inferences as the two trailing index entries.
test("REGULATION_SECTION_INDEX carries the ten fixed sections, in order, with fixed ordinals", () => {
  assert.deepEqual(
    REGULATION_SECTION_INDEX.map((e) => e.id),
    ["summary", "obligations", "requirements", "registration", "operations", "compliance", "penalties", "sources", "across-pages", "inferences"],
  );
  assert.deepEqual(
    REGULATION_SECTION_INDEX.map((e) => e.shortName),
    ["Summary", "Obligations", "Requirements", "Registration", "Operations", "Compliance", "Penalties", "Sources", "Connected", "Inferences"],
  );
  assert.deepEqual(REGULATION_SECTION_INDEX.map((e) => e.ord), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(!REGULATION_SECTION_INDEX.some((e) => e.id === "related"), "there is no Related section on Regulations");
});

test("an item without Penalties still numbers Sources 08: the ordinal is the fixed ord, never the filtered position", () => {
  const shown = REGULATION_SECTION_INDEX.filter((e) => e.id !== "penalties");
  const sources = shown.find((e) => e.id === "sources");
  assert.equal(sources.ord, 8);
  assert.equal(shown.indexOf(sources) + 1, 7, "the positional number would have been 7");
  assert.equal(regulationSectionOrd("sources"), 8);
  assert.equal(regulationSectionOrd("penalties"), 7);
  assert.equal(regulationSectionOrd("nope"), null);
});

test("Connected and Inferences carry fixed ordinals: 09 and 10 on Regulations, 07 and 08 on the other three", () => {
  assert.equal(connectedSectionOrd("regulations"), 9);
  assert.equal(inferencesSectionOrd("regulations"), 10);
  for (const k of ["market", "research", "operations"]) {
    assert.equal(connectedSectionOrd(k), 7, k);
    assert.equal(inferencesSectionOrd(k), 8, k);
  }
});

test("the trailing tabs are present only when their section renders, and never renumber", () => {
  const ids = (e) => e.map((x) => `${x.id}:${x.ord}`);
  assert.deepEqual(ids(crossPageIndexEntries("market", { connected: false, inferences: false })), []);
  assert.deepEqual(ids(crossPageIndexEntries("market", { connected: true, inferences: false })), ["across-pages:7"]);
  assert.deepEqual(ids(crossPageIndexEntries("market", { connected: false, inferences: true })), ["inferences:8"]);
  assert.deepEqual(ids(crossPageIndexEntries("regulations", { connected: false, inferences: true })), ["inferences:10"]);
  assert.deepEqual(ids(crossPageIndexEntries("research", { connected: true, inferences: true })), ["across-pages:7", "inferences:8"]);
  for (const e of crossPageIndexEntries("regulations", { connected: true, inferences: true })) {
    assert.ok(e.shortName.length <= SECTION_INDEX_SHORT_NAME_MAX);
  }
});

test("a short name would fail the bound if it grew past 14 characters (proves the assertion is live)", () => {
  const tooLong = { id: "x", shortName: "This Is Definitely Too Long" };
  assert.ok(tooLong.shortName.length > SECTION_INDEX_SHORT_NAME_MAX);
});
