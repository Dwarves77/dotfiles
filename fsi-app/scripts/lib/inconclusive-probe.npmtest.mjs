// Discrimination proof for the bug-class detector: each form FLAGS its known-bad shape and
// PASSES its known-good control. If a future edit relaxes a form into flagging everything (or
// stops flagging the known shape), a test here fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findClassifyDefaults, findErrorBodyContent, findOrchestrationMishandling,
} from "./inconclusive-probe.mjs";
import { findFetchNegativeMappings } from "./fetch-negative-probe.mjs";

const corrupt = (hits) => hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT");

// ── FORM 1 (delegated) ─────────────────────────────────────────────────────────
test("F1 BAD: a fetch failure mapped to a substantive negative is flagged", () => {
  const bad = `const res = await fetch(url);\nif (!res.ok) {\n  return { reachable: false, status: "dead" };\n}`;
  assert.ok(corrupt(findFetchNegativeMappings(bad, "bad.ts")).length >= 1);
});
test("F1 GOOD: a fetch failure mapped to inconclusive/throw passes", () => {
  const good = `const res = await fetch(url);\nif (!res.ok) {\n  throw new Error("INCONCLUSIVE: retry later");\n}`;
  assert.equal(corrupt(findFetchNegativeMappings(good, "good.ts")).length, 0);
});

// ── FORM 2 — classifier-uncertainty -> substantive default ──────────────────────
test("F2 BAD: classifier-uncertain defaulting to a substantive type is flagged (line-191 shape)", () => {
  const bad = `// firstFetchClassify\nconst item_type = haikuVerdict.type || "regulation";`;
  assert.ok(corrupt(findClassifyDefaults(bad, "bad.ts")).length >= 1, "should flag item_type || 'regulation'");
});
test("F2 GOOD: uncertain -> explicit 'uncertain' verdict passes", () => {
  const good = `// firstFetchClassify\nconst entity_verdict = sure ? haikuVerdict : "uncertain";`;
  assert.equal(corrupt(findClassifyDefaults(good, "good.ts")).length, 0);
});
test("F2 GOOD: a non-classify default (unrelated field) is NOT flagged (discrimination)", () => {
  const unrelated = `const pageTitle = doc.title || "document";`; // 'document' literal but field is not classify-ish AND no classify egress
  assert.equal(corrupt(findClassifyDefaults(unrelated, "u.ts")).length, 0);
});

// ── FORM 3 — error / empty body consumed as content ─────────────────────────────
test("F3 BAD: fetch+consume content with NO error-body guard is flagged (Entry-4 shape)", () => {
  const bad = `const content = await browserlessRender(url);\nawait supabase.from("intelligence_items").insert({ full_brief: content });`;
  assert.ok(corrupt(findErrorBodyContent(bad, "bad.ts")).length >= 1);
});
test("F3 GOOD: the same flow WITH an isErrorBody guard passes (not corrupt)", () => {
  const good = `const content = await browserlessRender(url);\nif (isErrorBody(content)) return;\nawait supabase.from("intelligence_items").insert({ full_brief: content });`;
  assert.equal(corrupt(findErrorBodyContent(good, "good.ts")).length, 0);
});

// ── FORM 4 — orchestration: retry non-idempotent / transient -> hard fail ────────
test("F4 BAD: --retry on a POST is flagged (CI double-fire shape)", () => {
  const bad = `curl --retry 1 -X POST -H "x: y" "$target"`;
  assert.ok(corrupt(findOrchestrationMishandling(bad, "ci.yml")).length >= 1);
});
test("F4 GOOD: --retry 0 on a POST passes", () => {
  const good = `curl --retry 0 -X POST -H "x: y" "$target"`;
  assert.equal(corrupt(findOrchestrationMishandling(good, "ci.yml")).length, 0);
});
test("F4 BAD: a 429 mapped to a hard failure (exit 1) with no skip branch is flagged", () => {
  const bad = `if [ "$status" -eq 429 ]; then\n  echo "::error::rate limited"\n  exit 1\nfi`;
  assert.ok(corrupt(findOrchestrationMishandling(bad, "ci.yml")).length >= 1);
});
test("F4 GOOD: a 429 mapped to skip (exit 0) passes", () => {
  const good = `if [ "$status" -eq 429 ]; then\n  echo "on cooldown — skipping"\n  exit 0\nfi`;
  assert.equal(corrupt(findOrchestrationMishandling(good, "ci.yml")).length, 0);
});
