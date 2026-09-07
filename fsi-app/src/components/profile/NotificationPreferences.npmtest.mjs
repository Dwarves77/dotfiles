// Structural regression test for src/components/profile/NotificationPreferences.tsx (lane
// fix58-account, 2026-09-07, operator audit rows B151-B153). Source-text check, same constraint as
// every other .npmtest.mjs beside a source file in this repo (no JSX render harness) — guards the
// row geometry the design-audit harness measures at runtime
// (fsi-app/.discipline/rendering/audit/spec/settings-notifications.json, "first toggle row").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "NotificationPreferences.tsx"),
  "utf8"
);

test("NotifRow: min-height 48px (dc.html p15 member-row), not the prior 44px", () => {
  const body = SOURCE.slice(SOURCE.indexOf("function NotifRow"));
  assert.match(body, /minHeight:\s*48,/);
});

test("NotifRow: border moved to border-bottom rgba(0,0,0,.06) (dc.html), no border-top left behind", () => {
  const body = SOURCE.slice(SOURCE.indexOf("function NotifRow"));
  assert.match(body, /borderBottom:\s*"1px solid rgba\(0,0,0,\.06\)"/);
  assert.doesNotMatch(body, /borderTop:/);
});
