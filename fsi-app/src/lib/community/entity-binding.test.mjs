import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEntityIds, MAX_ENTITY_IDS } from "./entity-binding.mjs";

const VALID_ID = "cl:corridor:0123456789abcdef";
const VALID_ID_2 = "cl:jurisdiction:fedcba9876543210";

test("validateEntityIds: refuses an empty/missing list", () => {
  assert.equal(validateEntityIds([]).ok, false);
  assert.equal(validateEntityIds(null).ok, false);
  assert.equal(validateEntityIds(undefined).ok, false);
});

test("validateEntityIds: refuses a list of only blank strings", () => {
  const r = validateEntityIds(["", "   "]);
  assert.equal(r.ok, false);
});

test("validateEntityIds: accepts one well-formed id", () => {
  const r = validateEntityIds([VALID_ID]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entityIds, [VALID_ID]);
});

test("validateEntityIds: accepts several well-formed ids, trims blanks", () => {
  const r = validateEntityIds([VALID_ID, "", VALID_ID_2]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entityIds, [VALID_ID, VALID_ID_2]);
});

test(`validateEntityIds: refuses more than MAX_ENTITY_IDS (${MAX_ENTITY_IDS}) ids`, () => {
  const many = Array.from({ length: MAX_ENTITY_IDS + 1 }, (_, i) => `cl:corridor:${i.toString(16).padStart(16, "0")}`);
  const r = validateEntityIds(many);
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(`${MAX_ENTITY_IDS} or fewer`));
});

test(`validateEntityIds: accepts exactly MAX_ENTITY_IDS (${MAX_ENTITY_IDS}) ids`, () => {
  const exactly = Array.from({ length: MAX_ENTITY_IDS }, (_, i) => `cl:corridor:${i.toString(16).padStart(16, "0")}`);
  const r = validateEntityIds(exactly);
  assert.equal(r.ok, true);
  assert.equal(r.entityIds.length, MAX_ENTITY_IDS);
});

test("validateEntityIds: refuses a malformed id, names it in the error", () => {
  const r = validateEntityIds(["not-a-real-entity-id"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /malformed/);
  assert.match(r.error, /not-a-real-entity-id/);
});

test("validateEntityIds: a mix of a valid id and a malformed one is refused (not silently dropped)", () => {
  const r = validateEntityIds([VALID_ID, "garbage"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /garbage/);
});

test("validateEntityIds: non-string entries in the array are dropped before validation, never coerced", () => {
  const r = validateEntityIds([VALID_ID, 12345, null, {}]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entityIds, [VALID_ID]);
});
