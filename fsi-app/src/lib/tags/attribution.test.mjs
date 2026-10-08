// Unit tests for src/lib/tags/attribution.ts (lane s8b-tag-attribution, 2026-10-07, migration 313 created_by/created_at):
// the pure wording and shaping behind "applied by <name> on <date>". No database, no npm package.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributionText,
  buildApplications,
  formatAppliedDate,
  memberDisplayName,
} from "./attribution.ts";

test("formatAppliedDate: UTC day, short month, no padding", () => {
  assert.equal(formatAppliedDate("2026-09-03T23:30:00Z"), "3 Sep 2026");
  assert.equal(formatAppliedDate("2026-01-15T00:00:00Z"), "15 Jan 2026");
});

test("formatAppliedDate: missing or unparseable input is null, never a placeholder", () => {
  assert.equal(formatAppliedDate(null), null);
  assert.equal(formatAppliedDate(undefined), null);
  assert.equal(formatAppliedDate("not a date"), null);
});

test("memberDisplayName: full name, else display name, else null; an email is never used", () => {
  assert.equal(memberDisplayName({ full_name: " Ada Lovelace ", display_name: "ada" }), "Ada Lovelace");
  assert.equal(memberDisplayName({ full_name: "  ", display_name: "ada" }), "ada");
  assert.equal(memberDisplayName({ full_name: null, display_name: null, email: "ada@example.com" }), null);
  assert.equal(memberDisplayName(null), null);
});

test("buildApplications: one entry per link, name resolved by author id, removed author stays null", () => {
  const apps = buildApplications(
    [
      { tag_id: "t1", created_by: "u1", created_at: "2026-09-03T10:00:00Z" },
      { tag_id: "t2", created_by: null, created_at: "2026-09-04T10:00:00Z" },
      { tag_id: "t3", created_by: "u9", created_at: "2026-09-05T10:00:00Z" },
    ],
    new Map([["u1", "Ada Lovelace"]])
  );
  assert.deepEqual(apps, [
    { tagId: "t1", appliedBy: "u1", appliedByName: "Ada Lovelace", appliedAt: "2026-09-03T10:00:00Z" },
    { tagId: "t2", appliedBy: null, appliedByName: null, appliedAt: "2026-09-04T10:00:00Z" },
    { tagId: "t3", appliedBy: "u9", appliedByName: null, appliedAt: "2026-09-05T10:00:00Z" },
  ]);
});

test("attributionText: the three author states and the missing date", () => {
  assert.equal(
    attributionText({ tagId: "t", appliedBy: "u1", appliedByName: "Ada Lovelace", appliedAt: "2026-09-03T10:00:00Z" }),
    "applied by Ada Lovelace on 3 Sep 2026"
  );
  assert.equal(
    attributionText({ tagId: "t", appliedBy: "u1", appliedByName: null, appliedAt: "2026-09-03T10:00:00Z" }),
    "applied by a workspace member on 3 Sep 2026"
  );
  assert.equal(
    attributionText({ tagId: "t", appliedBy: null, appliedByName: null, appliedAt: "2026-09-03T10:00:00Z" }),
    "applied by a former member on 3 Sep 2026"
  );
  assert.equal(
    attributionText({ tagId: "t", appliedBy: "u1", appliedByName: "Ada", appliedAt: null }),
    "applied by Ada"
  );
  assert.equal(attributionText(undefined), null);
});

import { groupApplicationsByItem } from "./attribution.ts";

test("groupApplicationsByItem: one list per item, names resolved, order kept", () => {
  const grouped = groupApplicationsByItem(
    [
      { tag_id: "t1", intelligence_item_id: "i1", created_by: "u1", created_at: "2026-09-03T10:00:00Z" },
      { tag_id: "t2", intelligence_item_id: "i1", created_by: null, created_at: "2026-09-04T10:00:00Z" },
      { tag_id: "t1", intelligence_item_id: "i2", created_by: "u1", created_at: "2026-09-05T10:00:00Z" },
    ],
    new Map([["u1", "Ada Lovelace"]])
  );
  assert.deepEqual(Object.keys(grouped), ["i1", "i2"]);
  assert.deepEqual(grouped.i1.map((a) => a.tagId), ["t1", "t2"]);
  assert.equal(grouped.i1[0].appliedByName, "Ada Lovelace");
  assert.equal(grouped.i1[1].appliedByName, null);
  assert.equal(grouped.i2[0].appliedAt, "2026-09-05T10:00:00Z");
});
