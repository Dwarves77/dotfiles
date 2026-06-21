// Unit tests for the reactive 2-pass brief generation. Proves: normal briefs take ONE call; an oversized
// brief splits into body-pass + yaml-pass with the body WHOLE (no split, no duplication) and the YAML at
// the very end; and a body that still overflows fails with an actionable (non-fatal) error. CI-gated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { twoPassGenerate } from "./two-pass-generate.mjs";

// Recording fake stream: returns queued {text,stopReason} responses in order, records each call's args.
function fakeStream(responses) {
  const calls = [];
  const fn = async ({ apiKey, body }) => {
    calls.push({ apiKey, body });
    const r = responses[calls.length - 1];
    if (!r) throw new Error(`unexpected stream call #${calls.length}`);
    return r;
  };
  fn.calls = calls;
  return fn;
}
const findYamlNone = () => null;

test("normal path: a single non-truncated call returns its text and makes EXACTLY ONE call", async () => {
  const stream = fakeStream([{ text: "BODY\n\n---\nseverity: x\n---", stopReason: "end_turn" }]);
  const out = await twoPassGenerate({ system: "S", user: "U", stream, findYaml: findYamlNone, apiKey: "k" });
  assert.equal(out, "BODY\n\n---\nseverity: x\n---");
  assert.equal(stream.calls.length, 1, "no second pass for a normal brief");
});

test("truncation → 2-pass: body comes out WHOLE (stray YAML stripped), no duplication, YAML at the end", async () => {
  const stream = fakeStream([
    { text: "", stopReason: "max_tokens" },                                          // single call truncates
    { text: "FULL BODY CONTENT\n---\nstray: leftover\n---", stopReason: "end_turn" }, // pass 1: body (+ stray yaml)
    { text: "---\nseverity: action_required\npriority: high\n---", stopReason: "end_turn" }, // pass 2: yaml only
  ]);
  const findYaml = (t) => { const i = t.indexOf("\n---\nstray:"); return i >= 0 ? { start: i } : null; };
  const out = await twoPassGenerate({ system: "S", user: "U", stream, findYaml, apiKey: "k" });
  assert.equal(stream.calls.length, 3, "single + body pass + yaml pass");
  assert.match(out, /FULL BODY CONTENT/, "the informative body is preserved whole");
  assert.ok(!out.includes("stray: leftover"), "stray pass-1 YAML must be stripped");
  assert.match(out, /severity: action_required/, "pass-2 YAML is included");
  assert.ok(out.trimEnd().endsWith("---"), "YAML is the final block (parseable)");
  // body is NOT re-emitted by pass 2 — pass 2 receives it as context only
  assert.match(stream.calls[1].body.messages[0].content, /PASS 1 of 2/);
  assert.match(stream.calls[2].body.messages[0].content, /PASS 2 of 2/);
  assert.match(stream.calls[2].body.messages[0].content, /FULL BODY CONTENT/, "pass 2 gets the complete body as context");
  // ceilings: body pass at the full ceiling, yaml pass small
  assert.equal(stream.calls[1].body.max_tokens, 32000);
  assert.equal(stream.calls[2].body.max_tokens, 8000);
});

test("body STILL overflows body-only → throws an actionable, NON-FATAL error (the N-pass edge)", async () => {
  const stream = fakeStream([
    { text: "", stopReason: "max_tokens" },         // single truncates
    { text: "partial", stopReason: "max_tokens" },  // pass-1 body also truncates
  ]);
  await assert.rejects(
    () => twoPassGenerate({ system: "S", user: "U", stream, findYaml: findYamlNone, apiKey: "k" }),
    (e) => { assert.equal(e.fatal, false); assert.match(e.message, /too large for a single pass/i); return true; },
  );
});
