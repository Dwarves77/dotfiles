// Unit tests for the dedup-hash normalization (Wave-β R0.2).
// Repo pattern: node --test over a pure .mjs module.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMessage, normalizeStack, stackHash } from "./stack-hash.mjs";

const STACK_A = `Error: item not found
    at fetchItem (/var/task/.next/server/chunks/1234.js:17:23)
    at runCategoryRpc (/var/task/.next/server/chunks/1234.js:88:11)
    at async GET (/var/task/.next/server/app/api/x/route.js:4:9)`;

test("same defect with different dynamic fragments groups to ONE hash", () => {
  const a = stackHash({
    side: "server",
    message: "item 42 not found for org 4f9c2a1e-0000-4000-8000-1234567890ab",
    stack: STACK_A,
  });
  const b = stackHash({
    side: "server",
    message: "item 97 not found for org 99999999-1111-4222-8333-abcdefabcdef",
    stack: STACK_A,
  });
  assert.equal(a, b, "dynamic ids/uuids must not split the group");
});

test("column/line drift within the same frames groups to ONE hash", () => {
  const shifted = STACK_A.replaceAll(":17:23", ":19:41").replaceAll(":88:11", ":91:2");
  const a = stackHash({ side: "server", message: "boom", stack: STACK_A });
  const b = stackHash({ side: "server", message: "boom", stack: shifted });
  assert.equal(a, b, "line:col positions must not split the group");
});

test("different messages produce DIFFERENT hashes", () => {
  const a = stackHash({ side: "server", message: "boom", stack: STACK_A });
  const b = stackHash({ side: "server", message: "totally different failure", stack: STACK_A });
  assert.notEqual(a, b);
});

test("different top frames produce DIFFERENT hashes", () => {
  const otherStack = STACK_A.replace("fetchItem", "writeBrief").replace("1234.js", "9876.js");
  const a = stackHash({ side: "server", message: "boom", stack: STACK_A });
  const b = stackHash({ side: "server", message: "boom", stack: otherStack });
  assert.notEqual(a, b);
});

test("side participates in identity (server vs client never merge)", () => {
  const a = stackHash({ side: "server", message: "boom", stack: STACK_A });
  const b = stackHash({ side: "client", message: "boom", stack: STACK_A });
  assert.notEqual(a, b);
});

test("hash is 64 hex chars (fits the stack_hash CHECK)", () => {
  const h = stackHash({ side: "server", message: "boom", stack: STACK_A });
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("null/undefined message and stack do not throw", () => {
  const h = stackHash({ side: "client", message: undefined, stack: null });
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("normalizeMessage collapses uuids, hex ids, and numbers", () => {
  assert.equal(
    normalizeMessage("run 12 of a1b2c3d4e5f60718 for 4f9c2a1e-0000-4000-8000-1234567890ab"),
    "run # of # for #"
  );
});

test("normalizeStack keeps basenames only and drops positions", () => {
  const n = normalizeStack(STACK_A);
  assert.ok(n.includes("1234.js"), "keeps chunk basename");
  assert.ok(!n.includes(":17"), "drops line numbers");
  assert.ok(!n.includes("/var/task"), "drops directory paths");
});
