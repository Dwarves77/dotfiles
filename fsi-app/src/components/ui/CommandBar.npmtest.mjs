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

// ── SEARCHFIX (2026-09-11): submit control matches the active mode ──────────────────────────────
//
// Operator report, verbatim: "i hit ask and nothing happens when trying standard search". Root
// cause: the submit button was hard-wired to the literal text "Ask" and to `ask()` regardless of
// `mode` — in Search mode (the default) pressing it silently asked the assistant instead of
// running a search, or (assistant disabled) did nothing visible at all. Fixed to one `submit()`
// dispatcher, used by both the button's onClick and the form's onSubmit (Enter), so keyboard and
// click can never diverge.

test("one submit() dispatcher drives BOTH the button and Enter — mode decides ask() vs onSearch(), never two separate branches to keep in sync", () => {
  assert.match(
    SOURCE,
    /const submit = \(\) => \{\s*\n\s*if \(mode === "ask"\) ask\(\);\s*\n\s*else onSearch\?\.\(value\.trim\(\)\);\s*\n\s*\};/
  );
  // The form's Enter path calls submit(), not a second inline mode check.
  assert.match(SOURCE, /onSubmit=\{\(e\) => \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*submit\(\);\s*\n\s*\}\}/);
  // The button's onClick calls the SAME submit(), not ask() directly.
  assert.match(SOURCE, /<button[\s\S]{0,200}onClick=\{submit\}/);
  assert.doesNotMatch(
    SOURCE,
    /<button[\s\S]{0,200}onClick=\{ask\}/,
    "the submit button must never call ask() directly again — that is the exact regression this fix closes"
  );
});

test("the submit button's label reads what it does in the active mode — \"Search\" in Search mode, \"Ask\" in Ask mode, never a fixed \"Ask\"", () => {
  assert.match(SOURCE, /\{mode === "ask" \? "Ask" : "Search"\}\s*\n\s*<\/button>/);
});

test("Search mode's submit control is never disabled — askDisabled is scoped to mode===\"ask\" by construction, so the Search-mode label/handler above are always reachable", () => {
  assert.match(SOURCE, /const askDisabled = mode === "ask" && !assistantEnabled;/);
});
