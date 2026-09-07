// initial-tab.npmtest.mjs — pins resolveInitialProfileTab's contract (UI
// system handoff 2026-09-06, README screens 14/15's merged Account tab
// row). Exercises the REAL exported function via jiti — this repo's
// established way to unit-test a plain-.ts module with node --test with no
// JSX mount infra (see src/components/AppShell.npmtest.mjs's own header for
// the precedent this follows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { resolveInitialProfileTab, PROFILE_TAB_KEYS } = await jiti.import("./initial-tab.ts");

test("every real tab key round-trips to itself", () => {
  for (const key of PROFILE_TAB_KEYS) {
    assert.equal(resolveInitialProfileTab(key), key);
  }
});

test("missing tab param -> personal", () => {
  assert.equal(resolveInitialProfileTab(null), "personal");
  assert.equal(resolveInitialProfileTab(undefined), "personal");
});

test("unknown tab param (stale bookmark / typo / future key) -> personal, never blank", () => {
  assert.equal(resolveInitialProfileTab("billing"), "personal");
  assert.equal(resolveInitialProfileTab(""), "personal");
  assert.equal(resolveInitialProfileTab("Personal"), "personal"); // case-sensitive, not fuzzy-matched
});

test("the settings entry itself is not a profile tab key (Settings is the 8th tab-row entry, a route link)", () => {
  assert.equal(resolveInitialProfileTab("settings"), "personal");
});
