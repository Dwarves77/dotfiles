// @ts-check
// Red-then-green tests for the grounding acquire lock. Pure, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acquireEnabled, assertAcquireAllowed, AcquireLockError, ACQUIRE_FLAG } from "./acquire-lock.mjs";

test("acquire lock: OFF by default (unset env)", () => {
  assert.equal(acquireEnabled({}), false);
});

test("acquire lock: OFF for non-affirmative values", () => {
  for (const v of ["", "0", "off", "false", "no", "disabled", "maybe", " "]) {
    assert.equal(acquireEnabled({ [ACQUIRE_FLAG]: v }), false, `expected OFF for "${v}"`);
  }
});

test("acquire lock: ON only for explicit affirmative tokens (case/space-insensitive)", () => {
  for (const v of ["1", "on", "true", "enabled", "yes", "ON", " True ", "Enabled"]) {
    assert.equal(acquireEnabled({ [ACQUIRE_FLAG]: v }), true, `expected ON for "${v}"`);
  }
});

test("acquire lock: assertAcquireAllowed THROWS a named error when OFF", () => {
  assert.throws(
    () => assertAcquireAllowed("missing_snapshot: abc", {}),
    (e) => e instanceof AcquireLockError && /GROUNDING_ACQUIRE_LOCKED/.test(e.message) && /missing_snapshot: abc/.test(e.message),
  );
});

test("acquire lock: assertAcquireAllowed passes silently when ON", () => {
  assert.doesNotThrow(() => assertAcquireAllowed("content_changed: xyz", { [ACQUIRE_FLAG]: "on" }));
});
