// Unit tests for `classifyTimelineEntries` (lane mobdetail, 2026-09-07, mobile 390 build). This is
// the one place raw TimelineEntry status turns into a passed/next/ahead dot state — factored into
// its own plain .ts file (milestone-timeline-classify.ts, no JSX) so DetailShell's new mobile
// vertical timeline stack classifies the SAME entries the same way MilestoneTimeline's own dot row
// does (CLAUDE.md rule 13, no duplication), and so this test can import the real module directly via
// jiti without tripping over MilestoneTimeline.tsx's JSX (same convention as
// tagPopoverKeyboard.npmtest.mjs / app-shell-banner.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { classifyTimelineEntries } = await jiti.import("./milestone-timeline-classify.ts");

test("an explicit 'current' entry is classified 'next', earlier entries 'passed', later entries 'ahead'", () => {
  const entries = [
    { date: "2026-01-01", label: "A", status: "past" },
    { date: "2026-06-01", label: "B", status: "current" },
    { date: "2026-12-01", label: "C", status: "future" },
  ];
  const states = classifyTimelineEntries(entries).map((r) => r.state);
  assert.deepEqual(states, ["passed", "next", "ahead"]);
});

test("with no explicit 'current', the first non-past entry becomes 'next' and later entries 'ahead'", () => {
  const entries = [
    { date: "2026-01-01", label: "A", status: "past" },
    { date: "2026-06-01", label: "B" },
    { date: "2026-12-01", label: "C" },
  ];
  const states = classifyTimelineEntries(entries).map((r) => r.state);
  assert.deepEqual(states, ["passed", "next", "ahead"]);
});

test("all-past entries: every one is 'passed', never a fabricated 'next'", () => {
  const entries = [
    { date: "2026-01-01", label: "A", status: "past" },
    { date: "2026-02-01", label: "B", status: "past" },
  ];
  const states = classifyTimelineEntries(entries).map((r) => r.state);
  assert.deepEqual(states, ["passed", "passed"]);
});

test("classifyTimelineEntries preserves the original entry object on each row (no re-derived copy)", () => {
  const entries = [{ date: "2026-01-01", label: "A", status: "current" }];
  const [row] = classifyTimelineEntries(entries);
  assert.equal(row.entry, entries[0]);
});

test("empty input returns an empty classification, never a fabricated row", () => {
  assert.deepEqual(classifyTimelineEntries([]), []);
});
