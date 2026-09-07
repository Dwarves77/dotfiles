// Structural regression test for src/components/AskAssistant.tsx — operator audit item 2.2
// (2026-09-07, CLOSED ruling): "Remove the floating 'Ask AI' button on every page (bottom-right).
// The masthead command bar is the ask. No floating control." Source-text regression (no JSX render
// harness in this repo — see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AskAssistant.tsx"),
  "utf8"
);

test("no floating bottom-right trigger button remains (no 'fixed bottom-6 right-6', no 'Ask AI' label)", () => {
  assert.doesNotMatch(SOURCE, /fixed bottom-6 right-6/);
  assert.doesNotMatch(SOURCE, />Ask AI</);
});

test("the closed state renders nothing (null), rather than a visible control", () => {
  assert.match(SOURCE, /if \(!isOpen\) \{\s*return null;\s*\}/);
});

test("the open-ask-assistant event listener (the masthead CommandBar's ask path) is still wired — component is not dormant", () => {
  assert.match(SOURCE, /addEventListener\("open-ask-assistant", handler\)/);
});
