// Structural regression test for CommandBar.tsx (fix58-tokens, 2026-09-07, design audit B88-B94).
// Text-level, same convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "CommandBar.tsx"),
  "utf8"
);

test("outer form border is rgba(0,0,0,.25) at radius 8px (dc.html p1), not the --line-1/6px token pair", () => {
  assert.match(SOURCE, /border:\s*"1px solid rgba\(0,0,0,\.25\)"/);
  assert.match(SOURCE, /borderRadius:\s*8,/);
});

test("cmd-K hint is 10px monospace (dc.html p1), not 10.5px sans", () => {
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontSize:\s*"var\(--fs-10\)"/);
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontFamily:\s*"ui-monospace/);
});

test("Ask button is full-bar height (40px) with 14px horizontal padding (dc.html p1), not a fixed 30px/16px", () => {
  assert.match(SOURCE, /height:\s*40,\s*\n\s*padding:\s*"0 14px"/);
});

// ── CMDSEARCH lane (2026-09-09): mode toggle + Ask enablement ───────────────────────────────────
//
// No JSX render harness exists in this repo (see workspace/tags/route.npmtest.mjs's own header for
// why — the component tests here are structural/source-level, same convention as every test above).
// These assert the STRUCTURE that produces the two required states rather than rendered DOM: (1)
// Ask disabled/unavailable while ASSISTANT_ENABLED is off, (2) Ask enabled once it flips true, with
// no further code change — both states are driven by the SAME `assistantEnabled` read on every
// render, not a value captured once, so the second state requires no new code path, only the flag.

test("Search is the default mode", () => {
  assert.match(SOURCE, /useState<CommandBarMode>\("search"\)/);
});

test("assistantEnabled comes from the ONE existing server-to-client flag path (useWorkspaceBootstrap), never a second mechanism", () => {
  assert.match(SOURCE, /import \{ useWorkspaceBootstrap \} from "@\/lib\/hooks\/useWorkspaceBootstrap"/);
  assert.match(SOURCE, /bootstrap\.data\?\.assistantEnabled === true/);
  // Fail-closed default: `=== true` (not a truthy check) means undefined/absent reads as disabled,
  // matching the server route's own exact-string ASSISTANT_ENABLED === "true" gate.
});

test("Ask state 1 (flag OFF): input and button are both disabled, and the input's placeholder says so BEFORE the reader types", () => {
  assert.match(SOURCE, /const askDisabled = mode === "ask" && !assistantEnabled;/);
  assert.match(SOURCE, /disabled=\{askDisabled\}[\s\S]{0,400}onChange/); // input carries the disabled prop
  assert.match(SOURCE, /"The Assistant is currently unavailable"/);
  assert.match(SOURCE, /<button[\s\S]{0,200}disabled=\{askDisabled\}/);
});

test("Ask state 2 (flag ON): the SAME askDisabled/assistantEnabled read renders Ask enabled — no separate code path, no separate placeholder branch to add", () => {
  // The placeholder ternary's positive branch is the enabled-state copy; proven present alongside
  // the disabled-state copy asserted above, both keyed off the one `assistantEnabled` boolean.
  assert.match(SOURCE, /assistantEnabled\s*\n\s*\?\s*"Ask a question…"/);
});

test("ask() itself refuses to dispatch while the flag is off — belt-and-suspenders beyond the disabled DOM attribute", () => {
  assert.match(SOURCE, /const ask = \(\) => \{\s*\n\s*if \(!assistantEnabled\) return;/);
});

test("no fetch to /api/ask lives in this file — Ask still dispatches via the pre-existing open-ask-assistant CustomEvent, never a second call path", () => {
  assert.doesNotMatch(SOURCE, /fetch\(.*\/api\/ask/);
  assert.match(SOURCE, /"open-ask-assistant"/);
});

test("Standard Search calls the new bounded /api/search route through authedFetch (F40), never a hand-rolled fetch", () => {
  assert.match(SOURCE, /authedFetch\(`\/api\/search\?q=/);
});

test("empty/short query shows no results dropdown (client-side mirror of the route's own MIN_QUERY_LEN gate)", () => {
  assert.match(SOURCE, /value\.trim\(\)\.length < MIN_QUERY_LEN/);
});
