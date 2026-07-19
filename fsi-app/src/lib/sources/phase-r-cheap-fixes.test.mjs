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

test("F13: source-state-min-wage registerSource is EXECUTE-gated (dry-run no longer writes a source)", () => {
  const src = read("../../../scripts/source-state-min-wage.mjs");
  assert.ok(!/const ncsl = await registerSource/.test(src), "the unconditional top-level registerSource call must be gone");
  assert.ok(/if \(EXECUTE\)/.test(src) && /ncsl = await registerSource/.test(src), "registerSource must run only inside the EXECUTE guard");
});

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
