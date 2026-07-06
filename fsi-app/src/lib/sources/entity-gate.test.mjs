// @ts-check
// Red-then-green for the ERROR-BODY GROUNDABILITY GATE (dispatch item 1). Fixtures are REAL failed-fetch
// captures from the corpus adjudication (a EUR-Lex 404, a Cloudflare bot wall, a 403 block). RED: the old
// ungated pool includes the error body → grounding would copy nav/error boilerplate as a "FACT" (the
// fabricate-via-error-page breach). GREEN: partitionErrorBodies excludes it from the pool that feeds grounding
// input, the floor pool, and slot-forcing nomination.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isErrorBody, partitionErrorBodies } from "./entity-gate.mjs";

// real captures (abbreviated, verbatim shape) from the 2026-07-06 adjudication
const EURLEX_404 = "Page Not Found - EUR-Lex Skip to main content English Select your language Official EU languages: bg български es Español cs Čeština da Dansk de Deutsch en English fr Français The page you are looking for was moved or doesn't exist.";
const CLOUDFLARE = "Just a moment... Enable JavaScript and cookies to continue. Checking your browser before accessing the site. This process is automatic.";
const BLOCK_403 = "403 ERROR The request could not be satisfied. Request blocked. We can't connect to the server for this app or website at this time.";
const REAL_LAW = "Article 1 Subject matter and scope. This Regulation establishes rules on the sustainability of batteries. Article 2 Definitions. Economic operators shall ensure that ... " + "x".repeat(3000);

test("RED→GREEN: a EUR-Lex 404 capture is an error body and is EXCLUDED from the grounding pool", () => {
  assert.equal(isErrorBody(EURLEX_404), true);
  const { usable, errorBodies } = partitionErrorBodies([{ url: "https://eur-lex.europa.eu/x", text: EURLEX_404 }]);
  assert.equal(usable.length, 0, "the 404 never enters grounding input / floor pool / nomination");
  assert.equal(errorBodies.length, 1);
});

test("bot walls + 403 blocks are error bodies (excluded)", () => {
  assert.equal(isErrorBody(CLOUDFLARE), true);
  assert.equal(isErrorBody(BLOCK_403), true);
});

test("a REAL law body is NOT an error body (stays in the pool — no over-exclusion)", () => {
  assert.equal(isErrorBody(REAL_LAW), false);
  const { usable, errorBodies } = partitionErrorBodies([{ url: "https://eur-lex.europa.eu/reg", text: REAL_LAW }]);
  assert.equal(usable.length, 1);
  assert.equal(errorBodies.length, 0);
});

test("partitionErrorBodies splits a mixed pool, preserving order within each side", () => {
  const pool = [
    { url: "a", text: REAL_LAW },
    { url: "b", text: EURLEX_404 },
    { url: "c", text: CLOUDFLARE },
    { url: "d", text: REAL_LAW + " more" },
  ];
  const { usable, errorBodies } = partitionErrorBodies(pool);
  assert.deepEqual(usable.map((x) => x.url), ["a", "d"]);
  assert.deepEqual(errorBodies.map((x) => x.url), ["b", "c"]);
});

test("empty / null pool is handled", () => {
  assert.deepEqual(partitionErrorBodies([]), { usable: [], errorBodies: [] });
  assert.deepEqual(partitionErrorBodies(null), { usable: [], errorBodies: [] });
});
