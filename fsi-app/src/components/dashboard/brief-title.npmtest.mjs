// Unit tests for DashboardMasthead's title derivation (UI system handoff 2026-09-06, README
// screen 1: the masthead title is the personalised "<first name>'S BRIEF", falling back to the
// workspace name, then the literal "YOUR BRIEF").
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBriefTitle, firstTokenOf } from "./brief-title.ts";

test("deriveBriefTitle: first name present -> \"<NAME>'S BRIEF\", uppercased", () => {
  assert.equal(deriveBriefTitle("Jason", "Dietl / Rockit"), "JASON'S BRIEF");
  assert.equal(deriveBriefTitle("jason", ""), "JASON'S BRIEF");
});

test("deriveBriefTitle: no first name -> the workspace name, uppercased, no 'S BRIEF' suffix", () => {
  assert.equal(deriveBriefTitle(null, "Dietl / Rockit"), "DIETL / ROCKIT");
});

test("deriveBriefTitle: neither first name nor workspace name -> the literal 'YOUR BRIEF'", () => {
  assert.equal(deriveBriefTitle(null, ""), "YOUR BRIEF");
});

test("firstTokenOf: a full name yields its first word", () => {
  assert.equal(firstTokenOf("Jason Losh"), "Jason");
});

test("firstTokenOf: an email fallback (no name on the profile) yields the token before '@'", () => {
  assert.equal(firstTokenOf("jason@example.com"), "jason");
});

test("firstTokenOf: null/undefined/blank/whitespace-only all yield null, never an empty string", () => {
  assert.equal(firstTokenOf(null), null);
  assert.equal(firstTokenOf(undefined), null);
  assert.equal(firstTokenOf(""), null);
  assert.equal(firstTokenOf("   "), null);
});
