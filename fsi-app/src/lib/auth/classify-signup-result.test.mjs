// Unit tests for the signUp result classifier (lane AUTH-1). Run:
//   node --test fsi-app/src/lib/auth/classify-signup-result.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySignUpResult } from "./classify-signup-result.mjs";

test("a new address: user with an identity, no error, is confirmation_sent", () => {
  const result = {
    data: { user: { id: "u1", email: "a@example.com", identities: [{ id: "i1", provider: "email" }] }, session: null },
    error: null,
  };
  assert.equal(classifySignUpResult(result), "confirmation_sent");
});

test("an already registered address: user with an empty identities array is already_registered", () => {
  const result = {
    data: { user: { id: "u2", email: "a@example.com", identities: [] }, session: null },
    error: null,
  };
  assert.equal(classifySignUpResult(result), "already_registered");
});

test("an error response is error, whatever else it carries", () => {
  assert.equal(
    classifySignUpResult({ data: { user: null, session: null }, error: { message: "Password too weak" } }),
    "error",
  );
  assert.equal(
    classifySignUpResult({ data: { user: { identities: [] } }, error: { message: "boom" } }),
    "error",
  );
});

test("a response with no user or no identities field is not treated as already registered", () => {
  assert.equal(classifySignUpResult({ data: {}, error: null }), "confirmation_sent");
  assert.equal(classifySignUpResult({ data: { user: { id: "u3" } }, error: null }), "confirmation_sent");
  assert.equal(classifySignUpResult(undefined), "confirmation_sent");
});
