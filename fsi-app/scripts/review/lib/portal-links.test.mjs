// Run: node --test scripts/review/lib/portal-links.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkPatternOf, recommendLinkDecision, groupRows, patchForDecision, freshestTimestamp } from "./portal-links.mjs";

test("linkPatternOf: classifies by the same token classes portal-links.mjs's INSTRUMENT_RE requires", () => {
  assert.equal(linkPatternOf("https://x/oj/2024/L123", ""), "gazette_path");
  assert.equal(linkPatternOf("https://x/regulation-2024-15", ""), "legislation_path");
  assert.equal(linkPatternOf("https://x/page1", "Consultation notice"), "guidance_path");
  assert.equal(linkPatternOf("https://x/page2", "Enforcement compliance report"), "compliance_path");
  assert.equal(linkPatternOf("https://x/page3", "unrelated anchor text"), "other");
});

test("recommendLinkDecision: both directions plus uncertain", () => {
  assert.equal(recommendLinkDecision("gazette_path"), "link");
  assert.equal(recommendLinkDecision("legislation_path"), "link");
  assert.equal(recommendLinkDecision("other"), "drop");
  assert.equal(recommendLinkDecision("guidance_path"), "uncertain");
});

const HOST_BY_ID = new Map([["src1", "portal.example.gov"], ["src2", "other-portal.example.gov"]]);
const ROWS = [
  { id: "p1", source_id: "src1", url: "https://portal.example.gov/regulation-1", anchor_text: "Regulation 1", last_seen_at: "2026-09-01T00:00:00Z", first_seen_at: "2026-08-01T00:00:00Z" },
  { id: "p2", source_id: "src1", url: "https://portal.example.gov/regulation-2", anchor_text: "Regulation 2", last_seen_at: "2026-09-02T00:00:00Z", first_seen_at: "2026-08-01T00:00:00Z" },
  { id: "p3", source_id: "src2", url: "https://other-portal.example.gov/misc-page", anchor_text: "Random page", last_seen_at: "2026-08-15T00:00:00Z", first_seen_at: "2026-08-01T00:00:00Z" },
];

test("groupRows: deterministic order, portal host x link pattern", () => {
  const g1 = groupRows(ROWS, HOST_BY_ID);
  const g2 = groupRows([...ROWS].reverse(), HOST_BY_ID);
  assert.deepEqual(g1.map((g) => g.key), g2.map((g) => g.key));
  const regGroup = g1.find((g) => g.key === "portal.example.gov::legislation_path");
  assert.equal(regGroup.count, 2);
  assert.equal(regGroup.recommended_decision, "link");
  const otherGroup = g1.find((g) => g.key === "other-portal.example.gov::other");
  assert.equal(otherGroup.recommended_decision, "drop");
});

test("patchForDecision: drop mutates (never 'promoted' — that status means 'minted' elsewhere); link/skip are no-ops", () => {
  assert.deepEqual(patchForDecision("drop", { reason: "r", now: "2026-09-02T00:00:00Z" }), {
    status: "rejected", disposition_reason: "r", dispositioned_at: "2026-09-02T00:00:00Z",
  });
  assert.equal(patchForDecision("link", { reason: "r", now: "2026-09-02T00:00:00Z" }), null);
  assert.equal(patchForDecision("skip"), null);
});

test("freshestTimestamp: max of last_seen_at/first_seen_at/dispositioned_at", () => {
  assert.equal(freshestTimestamp(ROWS), "2026-09-02T00:00:00.000Z");
});
