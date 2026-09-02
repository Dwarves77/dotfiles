// Run: node --test scripts/review/lib/provisional-sources.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reachabilityBucket,
  officialnessTier,
  recommendDisposition,
  groupRows,
  patchForDecision,
  freshestTimestamp,
} from "./provisional-sources.mjs";

test("reachabilityBucket: status/counters map to the right bucket", () => {
  assert.equal(reachabilityBucket({ status: "inaccessible" }), "confirmed_inaccessible");
  assert.equal(reachabilityBucket({ status: "provisional", total_checks: 0 }), "never_checked");
  assert.equal(reachabilityBucket({ status: "provisional", total_checks: 5, accessibility_rate: 0.9 }), "reachable");
  assert.equal(reachabilityBucket({ status: "provisional", total_checks: 5, accessibility_rate: 0.1 }), "unreachable");
  assert.equal(reachabilityBucket({ status: "provisional", total_checks: 5, accessibility_rate: 0.5 }), "flaky");
});

test("officialnessTier: host-authority.ts classification, 'unclassified' when the host has no codified rule", () => {
  assert.equal(officialnessTier({ url: "https://eur-lex.europa.eu/x" }), "1");
  assert.equal(officialnessTier({ url: "https://example.gov/x" }), "2");
  assert.equal(officialnessTier({ url: "https://freightblog.example.com/x" }), "unclassified");
});

test("recommendDisposition: both directions plus the uncertain fallback, deterministic on (tier, reachability) alone", () => {
  assert.equal(recommendDisposition("1", "reachable"), "keep");
  assert.equal(recommendDisposition("2", "flaky"), "keep");
  assert.equal(recommendDisposition("6", "unreachable"), "suspend");
  assert.equal(recommendDisposition("unclassified", "confirmed_inaccessible"), "suspend");
  assert.equal(recommendDisposition("1", "never_checked"), "uncertain");
  assert.equal(recommendDisposition("7", "reachable"), "uncertain");
});

const ROWS = [
  { id: "s1", name: "EUR-Lex mirror", url: "https://eur-lex.europa.eu/a", status: "provisional", total_checks: 5, accessibility_rate: 0.9, updated_at: "2026-09-01T00:00:00Z" },
  { id: "s2", name: "Unknown blog", url: "https://random-blog.example.com/a", status: "provisional", total_checks: 5, accessibility_rate: 0.1, updated_at: "2026-09-02T00:00:00Z" },
  { id: "s3", name: "Unknown blog dupe", url: "https://random-blog.example.com/b", status: "provisional", total_checks: 5, accessibility_rate: 0.15, updated_at: "2026-08-30T00:00:00Z" },
];

test("groupRows: deterministic regardless of input order, surfaces duplicate institutions within a group", () => {
  const g1 = groupRows(ROWS);
  const g2 = groupRows([...ROWS].reverse());
  assert.deepEqual(g1.map((g) => g.key), g2.map((g) => g.key));
  const dupGroup = g1.find((g) => g.row_ids.includes("s2"));
  assert.ok(dupGroup.evidence.duplicate_institutions.some((d) => d.institution === "random-blog.example.com" && d.count === 2));
});

test("patchForDecision: keep/suspend/skip map to the right sources.status patch", () => {
  assert.deepEqual(patchForDecision("keep"), { status: "active" });
  assert.deepEqual(patchForDecision("suspend"), { status: "suspended" });
  assert.equal(patchForDecision("skip"), null);
});

test("freshestTimestamp: the max updated_at among live rows", () => {
  assert.equal(freshestTimestamp(ROWS), "2026-09-02T00:00:00.000Z");
});
