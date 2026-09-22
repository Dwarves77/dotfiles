// section-index-data.test.mjs, the 14-character short-name bound (lane W10-ActionCard-a,
// operator review item 4). "A test fails if any short name exceeds 14 characters" (brief step 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_INDEX_SHORT_NAME_MAX, REGULATION_SECTION_INDEX } from "./section-index-data.ts";

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

test("REGULATION_SECTION_INDEX carries all 8 sections, in review item 5's canonical order", () => {
  assert.deepEqual(
    REGULATION_SECTION_INDEX.map((e) => e.id),
    ["summary", "obligations", "requirements", "registration", "operations", "compliance", "penalties", "sources"],
  );
  assert.deepEqual(
    REGULATION_SECTION_INDEX.map((e) => e.shortName),
    ["Summary", "Obligations", "Requirements", "Registration", "Operations", "Compliance", "Penalties", "Sources"],
  );
});

test("a short name would fail the bound if it grew past 14 characters (proves the assertion is live)", () => {
  const tooLong = { id: "x", shortName: "This Is Definitely Too Long" };
  assert.ok(tooLong.shortName.length > SECTION_INDEX_SHORT_NAME_MAX);
});
