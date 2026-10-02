import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMemberPrefToggle } from "./group-member-prefs.mjs";

test("validateMemberPrefToggle: accepts a valid boolean for the named field", () => {
  assert.deepEqual(validateMemberPrefToggle({ muted: true }, "muted"), { ok: true, value: true });
  assert.deepEqual(validateMemberPrefToggle({ starred: false }, "starred"), { ok: true, value: false });
});

test("validateMemberPrefToggle: rejects a missing field", () => {
  const r = validateMemberPrefToggle({}, "muted");
  assert.equal(r.ok, false);
  assert.match(r.error, /muted/);
});

test("validateMemberPrefToggle: rejects a non-boolean value (string 'true' is not true)", () => {
  const r = validateMemberPrefToggle({ muted: "true" }, "muted");
  assert.equal(r.ok, false);
});

test("validateMemberPrefToggle: rejects a non-object body", () => {
  assert.equal(validateMemberPrefToggle(null, "muted").ok, false);
  assert.equal(validateMemberPrefToggle([true], "muted").ok, false);
  assert.equal(validateMemberPrefToggle("true", "muted").ok, false);
});

test("validateMemberPrefToggle: the wrong field name on an otherwise-valid body is rejected, not silently accepted", () => {
  const r = validateMemberPrefToggle({ starred: true }, "muted");
  assert.equal(r.ok, false);
});
