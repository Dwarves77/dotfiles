// Discrimination selftest for the Supabase error-drop probe (HARD job — must pass).
// Red-then-green: it MUST catch the swallow shapes and MUST NOT flag the safe ones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findErrorDrops } from "./error-drop-probe.mjs";

const flagged = (src) => findErrorDrops(src, "x.ts").length;

test("RED — single-line {data} drop on a .from().select()", () => {
  assert.equal(flagged(`const { data } = await supabase.from("t").select("*");`), 1);
});

test("RED — renamed data binding on an .rpc()", () => {
  assert.equal(flagged(`const { data: rows } = await serviceClient.rpc("f", {});`), 1);
});

test("RED — multi-line supabase chain", () => {
  const src = [
    "const { data } = await supabase",
    '  .from("intelligence_items")',
    '  .select("*")',
    '  .eq("id", id);',
  ].join("\n");
  assert.equal(flagged(src), 1);
});

test("GREEN — error is captured", () => {
  assert.equal(flagged(`const { data, error } = await supabase.from("t").select("*");`), 0);
});

test("GREEN — deliberate, annotated drop (escape hatch same line)", () => {
  assert.equal(
    flagged(`const { data } = await supabase.from("t").select("*"); // error-intentionally-ignored`),
    0
  );
});

test("GREEN — escape hatch on the line above", () => {
  const src = [
    "// error-intentionally-ignored: fire-and-forget",
    `const { data } = await supabase.from("t").select("*");`,
  ].join("\n");
  assert.equal(flagged(src), 0);
});

test("GREEN — not a Supabase call (request.json has no {data,error} contract)", () => {
  assert.equal(flagged(`const { data } = await request.json();`), 0);
});

test("GREEN — binds something other than data", () => {
  assert.equal(flagged(`const { metadata } = await supabase.from("t").select("*");`), 0);
});

test("GREEN — 'error' substring must not count as a real error binding", () => {
  // errorMessage is not the `error` field; this SHOULD still flag (data dropped, error absent)
  assert.equal(flagged(`const { data, errorMessage } = await supabase.from("t").select("*");`), 1);
});
