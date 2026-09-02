// pulse-shared.test.mjs — DB-free node --test proof for the Dashboard five-surface pulse cards'
// pure helpers (Lane DASH, 2026-09-02). Plain ESM, zero deps — portable, joins the no-npm-ci
// discipline suite via a directory glob (see this lane's report for the exact line to add).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRIORITY_RANK,
  rankByPriorityThenRecency,
  formatShortDate,
  mapCommunityPulseThreads,
} from "./pulse-shared.mjs";

test("PRIORITY_RANK orders CRITICAL first, LOW last", () => {
  assert.equal(PRIORITY_RANK.CRITICAL, 0);
  assert.equal(PRIORITY_RANK.HIGH, 1);
  assert.equal(PRIORITY_RANK.MODERATE, 2);
  assert.equal(PRIORITY_RANK.LOW, 3);
});

test("rankByPriorityThenRecency: sorts by priority band first", () => {
  const input = [
    { id: "a", priority: "LOW", added: "2026-08-01" },
    { id: "b", priority: "CRITICAL", added: "2026-08-01" },
    { id: "c", priority: "MODERATE", added: "2026-08-01" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.deepEqual(out, ["b", "c", "a"]);
});

test("rankByPriorityThenRecency: ties on priority break by most-recent `added`", () => {
  const input = [
    { id: "old", priority: "HIGH", added: "2026-01-01" },
    { id: "new", priority: "HIGH", added: "2026-08-20" },
    { id: "mid", priority: "HIGH", added: "2026-05-15" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.deepEqual(out, ["new", "mid", "old"]);
});

test("rankByPriorityThenRecency: unrecognized/missing priority ranks last, never throws", () => {
  const input = [
    { id: "unknown", priority: "NOT_A_BAND", added: "2026-08-01" },
    { id: "low", priority: "LOW", added: "2026-08-01" },
    { id: "none", added: "2026-08-01" },
  ];
  const out = rankByPriorityThenRecency(input).map((r) => r.id);
  assert.equal(out[0], "low");
  assert.ok(out.includes("unknown") && out.includes("none"));
});

test("rankByPriorityThenRecency: does not mutate the input array", () => {
  const input = [
    { id: "a", priority: "LOW", added: "2026-08-01" },
    { id: "b", priority: "CRITICAL", added: "2026-08-01" },
  ];
  const copy = [...input];
  rankByPriorityThenRecency(input);
  assert.deepEqual(input, copy);
});

test("rankByPriorityThenRecency: null/undefined input returns empty array, never throws", () => {
  assert.deepEqual(rankByPriorityThenRecency(null), []);
  assert.deepEqual(rankByPriorityThenRecency(undefined), []);
});

test("formatShortDate: formats an ISO date as 'D Mon' in UTC", () => {
  assert.equal(formatShortDate("2026-08-12T00:00:00Z"), "12 Aug");
  assert.equal(formatShortDate("2026-01-01T23:59:00Z"), "1 Jan");
});

test("formatShortDate: empty/invalid/missing input returns empty string, never throws", () => {
  assert.equal(formatShortDate(""), "");
  assert.equal(formatShortDate(null), "");
  assert.equal(formatShortDate(undefined), "");
  assert.equal(formatShortDate("not-a-date"), "");
});

test("mapCommunityPulseThreads: uses the title when present", () => {
  const groups = new Map([["g1", { name: "EU Forwarders", slug: "eu-forwarders" }]]);
  const rows = [
    {
      id: "p1",
      group_id: "g1",
      title: "SAF premium on EU-US air",
      body: "body text",
      reply_count: 4,
      last_reply_at: "2026-08-20T10:00:00Z",
      created_at: "2026-08-15T10:00:00Z",
    },
  ];
  const [out] = mapCommunityPulseThreads(rows, groups);
  assert.equal(out.title, "SAF premium on EU-US air");
  assert.equal(out.groupName, "EU Forwarders");
  assert.equal(out.groupSlug, "eu-forwarders");
  assert.equal(out.replyCount, 4);
  assert.equal(out.lastActivityAt, "2026-08-20T10:00:00Z");
});

test("mapCommunityPulseThreads: falls back to the body (truncated to 120 chars) when title is null", () => {
  const groups = new Map([["g1", { name: "Room", slug: null }]]);
  const longBody = "x".repeat(200);
  const rows = [
    {
      id: "p2",
      group_id: "g1",
      title: null,
      body: longBody,
      reply_count: 0,
      last_reply_at: null,
      created_at: "2026-08-15T10:00:00Z",
    },
  ];
  const [out] = mapCommunityPulseThreads(rows, groups);
  assert.equal(out.title, "x".repeat(120));
  assert.equal(out.replyCount, 0);
  // No reply yet -> last activity falls back to created_at, never null when created_at exists.
  assert.equal(out.lastActivityAt, "2026-08-15T10:00:00Z");
});

test("mapCommunityPulseThreads: falls back to '(untitled thread)' when title and body are both empty", () => {
  const groups = new Map();
  const rows = [
    { id: "p3", group_id: "g-missing", title: null, body: "   ", reply_count: null, last_reply_at: null, created_at: "2026-08-01T00:00:00Z" },
  ];
  const [out] = mapCommunityPulseThreads(rows, groups);
  assert.equal(out.title, "(untitled thread)");
  assert.equal(out.groupName, "Room"); // honest fallback when the group lookup misses
  assert.equal(out.groupSlug, null);
  assert.equal(out.replyCount, 0);
});

test("mapCommunityPulseThreads: empty rows returns empty array", () => {
  assert.deepEqual(mapCommunityPulseThreads([], new Map()), []);
});
