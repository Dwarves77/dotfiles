// PROOF (Phase R cheap-in-R triage: F13, F19, D2). One proportionate source-scan assertion each — the fixes
// are a guard move, a route error-path, and a comment correction, so a scan that the change landed is the
// right-sized proof. Runs in the no-npm discipline glob (src/lib/sources/*.test.mjs); node builtins + fs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, rel), "utf8");

// F13's own test REMOVED (lane W71-C, 2026-09-05): scripts/source-state-min-wage.mjs (the one-time
// state_cost_facts population program, operator ruling 2026-07-07) was deleted — state_cost_facts is
// live with 13/13 rows (docs/inventories/migrations.md #152; population report), the program it ran
// discharged. The F13 guard it proved (registerSource EXECUTE-gated) is retired with the module; the
// record of what ran lives in git history (F25-module-liveness.mjs's LEGACY_ALLOWLIST, this commit).

test("F19: decide route fails the response on a candidate-approved update failure (no silent warn-then-success)", () => {
  const src = read("../../app/api/admin/canonical-sources/decide/route.ts");
  assert.ok(!/console\.warn\("Candidate approve update failed/.test(src), "the warn-then-success on candUpdErr must be gone");
  assert.ok(/partialWrite: true/.test(src), "the candUpdErr branch must return the durable-partial-state signal");
});

test("D2: canonical-fetch header describes the actual 3-tier escalation, not the stale 2-tier claim", () => {
  const src = read("./canonical-fetch.mjs");
  assert.ok(!/Throws BrowserlessError only when BOTH the fast render/.test(src), "the stale 2-tier throw claim must be corrected");
  assert.ok(/plain → stealth → unblock/.test(src) && /THREE tiers/.test(src), "the header must describe the real 3-tier escalation");
});
