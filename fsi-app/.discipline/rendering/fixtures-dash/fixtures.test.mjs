// fixtures-dash/fixtures.test.mjs — portable, DB-free node --test proof for buildDashFixtures()'s
// SHAPE (id uniqueness, required fields, GREEN/RED pairing). The actual overflow measurement needs a
// real layout engine (scrollWidth/clientWidth are all-zero in jsdom/no-DOM Node — see
// .discipline/rendering/README.md "Why two layers") and runs in run-rendering-guard.mjs's Playwright
// leg once the coordinator wires buildDashFixtures() into the sibling fixtures.mjs (see this file's
// own header for the exact registration line). This proof is the guard against the shape itself
// silently breaking — a typo'd `red` flag or a missing `html` field the browser leg would otherwise
// discover only after a slow Playwright run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashFixtures } from "./fixtures.mjs";

test("buildDashFixtures: every fixture carries the required fields", () => {
  const fixtures = buildDashFixtures();
  assert.ok(fixtures.length > 0, "expected at least one fixture");
  for (const fx of fixtures) {
    assert.equal(typeof fx.id, "string");
    assert.ok(fx.id.length > 0);
    assert.equal(typeof fx.cls, "string");
    assert.equal(typeof fx.expectOverflow, "boolean");
    assert.equal(typeof fx.expectPlaceholder, "boolean");
    assert.equal(typeof fx.html, "string");
    assert.ok(fx.html.includes("<!doctype html>"), `${fx.id}: html is not a self-contained document`);
    assert.ok(fx.html.includes("data-guard-container"), `${fx.id}: html carries no [data-guard-container] for the guard to measure`);
  }
});

test("buildDashFixtures: fixture ids are unique", () => {
  const ids = buildDashFixtures().map((fx) => fx.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate fixture id");
});

test("buildDashFixtures: every RED fixture is a PREFIX-suffixed sibling of a GREEN fixture, and expects a defect", () => {
  const fixtures = buildDashFixtures();
  const greenIds = new Set(fixtures.filter((fx) => !fx.red).map((fx) => fx.id));
  for (const fx of fixtures.filter((fx) => fx.red)) {
    assert.ok(fx.id.endsWith("-PREFIX"), `${fx.id}: RED fixture id should end in -PREFIX per this dir's convention`);
    const greenId = fx.id.replace(/-PREFIX$/, "");
    assert.ok(greenIds.has(greenId), `${fx.id}: no matching GREEN fixture '${greenId}'`);
    assert.ok(
      fx.expectOverflow || fx.expectPlaceholder,
      `${fx.id}: a RED fixture must expect SOME defect (overflow or placeholder), otherwise it proves nothing`,
    );
  }
});

test("buildDashFixtures: GREEN fixtures never expect a defect (that is what makes them the fix)", () => {
  for (const fx of buildDashFixtures().filter((fx) => !fx.red)) {
    assert.equal(fx.expectOverflow, false, `${fx.id}: a GREEN fixture expecting overflow is mislabeled`);
    assert.equal(fx.expectPlaceholder, false, `${fx.id}: a GREEN fixture expecting a placeholder literal is mislabeled`);
  }
});

test("buildDashFixtures: a GREEN/RED pair renders the SAME extreme-data content, differing only in the safety CSS", () => {
  // The pulse-card pair and the grade-modifier pair each embed the same 96-char unbroken token; this
  // guards against a RED fixture accidentally being built from weaker (shorter/breakable) content
  // than its GREEN sibling, which would make the browser leg's red-then-green proof vacuous.
  const fixtures = buildDashFixtures();
  const byId = Object.fromEntries(fixtures.map((fx) => [fx.id, fx]));
  const pairs = fixtures.filter((fx) => fx.red).map((fx) => [fx.id.replace(/-PREFIX$/, ""), fx.id]);
  for (const [greenId, redId] of pairs) {
    const green = byId[greenId];
    const red = byId[redId];
    // Strip the one CSS declaration difference this lane's fix introduces, then compare visible text.
    const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.equal(textOf(green.html), textOf(red.html), `${greenId} vs ${redId}: visible text diverged beyond the safety CSS`);
  }
});
