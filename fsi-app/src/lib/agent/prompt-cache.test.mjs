// Red-then-green tests for the prompt-cache prefix builder (Phase-3a).
// The load-bearing guarantees: (1) CONTENT IDENTITY — a cached body carries exactly the same text
// the uncached shape carried (cache_control is metadata, never content); (2) exactly ONE cache
// breakpoint, on the FIRST system block; (3) PREFIX STABILITY — the cached first block is
// byte-identical across calls that share a pool, regardless of how their task prompts differ
// (this IS the property the Anthropic cache keys on); (4) the savings math.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedSystemBlocks, systemTextContent, cacheSavingsUsd, POOL_HEADER } from "./prompt-cache.mjs";

const POOL = "=== SOURCE 1 — https://eur-lex.europa.eu/x ===\nArticle 1. This Regulation applies from 12 August 2026.";
const SYNTH_SYS = "You are the synthesis contract.";
const GROUND_SYS = "You are the grounding contract.";

test("content identity: cached blocks carry exactly pool + task system, nothing more or less", () => {
  const blocks = cachedSystemBlocks(POOL, SYNTH_SYS);
  assert.equal(systemTextContent(blocks), POOL_HEADER + POOL + SYNTH_SYS);
});

test("exactly one cache_control breakpoint, on the FIRST system block", () => {
  const blocks = cachedSystemBlocks(POOL, SYNTH_SYS);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(blocks[1].cache_control, undefined);
});

test("prefix stability: same pool → byte-identical cached block across DIFFERENT task systems", () => {
  const a = cachedSystemBlocks(POOL, SYNTH_SYS)[0].text;
  const b = cachedSystemBlocks(POOL, GROUND_SYS)[0].text;
  assert.equal(a, b); // synthesis and grounding share the cached prefix
});

test("different pools do NOT share a prefix (no cross-item cache bleed)", () => {
  const a = cachedSystemBlocks(POOL, SYNTH_SYS)[0].text;
  const b = cachedSystemBlocks(POOL + " amended", SYNTH_SYS)[0].text;
  assert.notEqual(a, b);
});

test("systemTextContent: passthrough for plain-string system (legacy call shape)", () => {
  assert.equal(systemTextContent("plain"), "plain");
});

test("cacheSavingsUsd: cache reads bill 0.1× → savings are 0.9× the full-rate cost", () => {
  // 1M cached tokens at $3/MTok input rate → full price $3.00, cached $0.30, saved $2.70.
  assert.equal(cacheSavingsUsd(1_000_000, 3), 2.7);
  assert.equal(cacheSavingsUsd(0, 3), 0);
  assert.equal(cacheSavingsUsd(undefined, 3), 0);
});
