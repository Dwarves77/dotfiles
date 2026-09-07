// Structural regression test for src/components/account/AccountPrimitives.tsx (lane fix58-account,
// 2026-09-07, operator audit rows B137-B155). No JSX render harness exists in this repo for source
// files (see DetailShell.npmtest.mjs's own header for the same constraint) — this reads the
// component's source text to guard the exact geometry the design-audit harness measures at runtime
// (fsi-app/.discipline/rendering/audit/spec/account-members.json and settings-notifications.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AccountPrimitives.tsx"),
  "utf8"
);

function slice(fnName, len = 2200) {
  const start = SOURCE.indexOf(fnName);
  assert.notEqual(start, -1, `${fnName} not found in source`);
  return SOURCE.slice(start, start + len);
}

test("AccountCard shell: border-radius uses the shared 10px card token, not a page-local 8px", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /borderRadius:\s*"var\(--radius-card\)"/);
});

test("AccountCard header row: dc.html p14/p15 padding 14px 16px 10px + border-bottom rgba(0,0,0,.08)", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /padding:\s*"14px 16px 10px"/);
  assert.match(body, /borderBottom:\s*"1px solid rgba\(0,0,0,\.08\)"/);
});

test("AccountCard title: Anton 20px, .04em, not the prior 12.5px Plus Jakarta Sans treatment", () => {
  const body = slice("export function AccountCard");
  assert.match(body, /fontFamily:\s*"var\(--font-display\)"/);
  assert.match(body, /fontSize:\s*"20px"/);
  assert.match(body, /letterSpacing:\s*"0\.04em"/);
});

test("AccountCard meta: font-weight 600 (dc.html's later, applied declaration), not 700", () => {
  const body = slice("export function AccountCard");
  const metaBlock = body.slice(body.indexOf("meta != null"));
  assert.match(metaBlock, /fontWeight:\s*600/);
});

test("ToggleSwitch: 32x18 track, 14x14 knob (dc.html p15), not the prior 36x20/16x16", () => {
  const body = slice("export function ToggleSwitch");
  assert.match(body, /width:\s*32,/);
  assert.match(body, /height:\s*18,/);
  const knob = body.slice(body.indexOf("<span"));
  assert.match(knob, /width:\s*14,/);
  assert.match(knob, /height:\s*14,/);
});
