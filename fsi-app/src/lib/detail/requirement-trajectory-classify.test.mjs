// The invariant: the Trajectory cell's bolded step is the imminent one, never a fabricated guess.
//
// Task 2.3 (brief-chain-build-plan-2026-09-11, migration 316 intelligence_items.requirement_
// trajectory). Factored into its own plain .ts file (requirement-trajectory-classify.ts, no JSX)
// so this test can import the real module directly via node's native type-stripping without
// tripping over RequirementTrajectory.tsx's JSX (same convention as
// MilestoneTimeline.npmtest.mjs / milestone-timeline-classify.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCurrentStepIndex, formatTrajectoryStep } from "./requirement-trajectory-classify.ts";

test("a step in the future is the imminent milestone: bolded", () => {
  const steps = [
    { date: "2025", value: "40%" },
    { date: "Sep 30 2026", value: "70%" },
    { date: "2027", value: "100%" },
  ];
  // "Today" sits between the first and second step, same as the mock's own worked example.
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), 1);
});

test("every step already past: the last (most-recently-reached) step is bolded, not the first", () => {
  const steps = [
    { date: "2020-01-01", value: "10%" },
    { date: "2021-01-01", value: "50%" },
    { date: "2022-01-01", value: "100%" },
  ];
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), 2);
});

test("every step still in the future: the first (soonest) is bolded", () => {
  const steps = [
    { date: "2030-01-01", value: "10%" },
    { date: "2031-01-01", value: "50%" },
  ];
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), 0);
});

test("no step's date parses: bolds nothing rather than guess, -1", () => {
  const steps = [
    { date: "phase one", value: "40%" },
    { date: "phase two", value: "100%" },
  ];
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), -1);
});

test("a mix of parseable and unparseable dates: only the parseable ones are considered", () => {
  const steps = [
    { date: "phase one", value: "10%" },
    { date: "2030-01-01", value: "50%" },
  ];
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), 1);
});

test("single-step trajectory in the future: that one step is bolded", () => {
  const steps = [{ date: "2027-01-01", value: "100%" }];
  const now = new Date("2026-09-11T00:00:00Z");
  assert.equal(pickCurrentStepIndex(steps, now), 0);
});

test("empty steps array: no index to bold", () => {
  assert.equal(pickCurrentStepIndex([], new Date("2026-09-11T00:00:00Z")), -1);
});

test("formatTrajectoryStep renders exactly the mock's per-step shape: value (date)", () => {
  assert.equal(formatTrajectoryStep({ date: "2025", value: "40%" }), "40% (2025)");
  assert.equal(formatTrajectoryStep({ date: "Sep 30 2026", value: "70%" }), "70% (Sep 30 2026)");
});
