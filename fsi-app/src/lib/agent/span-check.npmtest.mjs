// span-check.npmtest.mjs — task 1.14's proof, rewired (lane W71-C, 2026-09-05).
//
// Replaces scripts/sprint4-114-spancheck-test.mjs (deleted this lane): same assertion (an unreachable URL
// throws RetryableError, the timeout/network -> retry-then-stage policy spanCheckClaim's header cites),
// rewritten as a real node:test file instead of a hand-rolled pass/fail script that shelled out to `tsc`
// to compile span-check.ts into a temp dir before importing it. Node 24's native type-stripping makes a
// direct relative `.ts` import portable (the same pattern every other src/lib/agent/*.test.mjs file uses),
// so the compile step was never necessary.
//
// `.npmtest.mjs`, not `.test.mjs`: span-check.ts imports the "workflow" npm package (for RetryableError),
// so this cannot join the no-npm-ci discipline glob (see run-test-suite.sh's NAMED EXCLUSIONS note). It IS
// picked up automatically by discipline.yml's "App unit tests requiring npm deps" step, which globs
// `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` — no workflow-file edit needed for this to run in CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spanCheckFetch } from "./span-check.ts";

test("spanCheckFetch: an unreachable URL throws RetryableError (timeout/network -> retry-then-stage)", async () => {
  // Closed port on loopback -> ECONNREFUSED (a network error, not a timeout) -> RetryableError. Fast and
  // deterministic: no real network access, no dependency on an external host being up or down.
  let thrown = null;
  try {
    await spanCheckFetch("http://127.0.0.1:1/", 2000);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown !== null, "spanCheckFetch must throw for an unreachable URL, not resolve");
  assert.equal(
    thrown?.constructor?.name,
    "RetryableError",
    `expected a RetryableError, got ${thrown?.constructor?.name}: ${thrown?.message}`,
  );
});
