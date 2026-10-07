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

// ADR-041 (Community is social only) + operator ruling 2026-10-06 "Remove the toggle": the
// on_promote preference belonged to the retired editorial promotion path. The DB column stays until a
// population-stage DROP COLUMN, so only the code surface is asserted gone.
test("ADR-041: preferences rows, type, defaults, select and save carry no on_promote", () => {
  const code = SOURCE.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /on_promote/);
  assert.doesNotMatch(code, /gets promoted/);
});

test("ADR-041: remaining rows are the four live toggles", () => {
  const rows = [...SOURCE.matchAll(/key:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(rows, ["enabled", "on_mention", "on_reply_in_my_threads", "on_new_post_in_joined_groups"]);
});
