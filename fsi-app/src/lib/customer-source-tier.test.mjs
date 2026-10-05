// customer-source-tier.test.mjs: proof for customer-source-tier.ts (lane P1, 2026-10-05).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { customerSourceTier, tierScaleSpan, SOURCE_TIER_MIN, SOURCE_TIER_MAX } from "./customer-source-tier.ts";

test("an admin override wins over the effective tier and the base tier", () => {
  assert.equal(customerSourceTier({ tier_override: 3, effective_tier: 5, base_tier: 7 }), 3);
});

test("without an override the dynamic effective tier wins over the base tier", () => {
  assert.equal(customerSourceTier({ tier_override: null, effective_tier: 4, base_tier: 6 }), 4);
});

test("without an override or an effective tier the base tier is shown", () => {
  assert.equal(customerSourceTier({ tier_override: null, effective_tier: null, base_tier: 7 }), 7);
  assert.equal(customerSourceTier({ base_tier: 2 }), 2);
});

test("a T7 source is T7, never clamped to T6", () => {
  assert.equal(customerSourceTier({ base_tier: 7, effective_tier: 7 }), 7);
  assert.equal(SOURCE_TIER_MAX, 7);
  assert.equal(SOURCE_TIER_MIN, 1);
});

test("no valid tier returns null (the caller renders the Absence part), never a guess", () => {
  assert.equal(customerSourceTier(null), null);
  assert.equal(customerSourceTier(undefined), null);
  assert.equal(customerSourceTier({}), null);
  assert.equal(customerSourceTier({ tier_override: null, effective_tier: null, base_tier: null }), null);
});

test("a value outside the vocabulary is treated as absent, not clamped", () => {
  assert.equal(customerSourceTier({ base_tier: 9 }), null);
  assert.equal(customerSourceTier({ base_tier: 0 }), null);
  assert.equal(customerSourceTier({ base_tier: 2.5 }), null);
  // an invalid override does not shadow a valid lower-precedence tier
  assert.equal(customerSourceTier({ tier_override: 12, effective_tier: 3 }), 3);
  assert.equal(customerSourceTier({ effective_tier: "4", base_tier: 6 }), 6);
});

test("the legend span is built from tier-labels.ts and ends at T7", () => {
  assert.equal(tierScaleSpan("→"), "T1 binding law → T7 news / commentary");
  assert.equal(tierScaleSpan("through"), "T1 binding law through T7 news / commentary");
  assert.doesNotMatch(tierScaleSpan("to"), /T6/);
});

test("no customer loader still computes the tier inline: each routes through the helper", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const server = readFileSync(resolve(HERE, "supabase-server.ts"), "utf8");
  assert.doesNotMatch(server, /effective_tier \?\? [a-zA-Z.?]*base_tier/, "supabase-server.ts must not inline effective_tier ?? base_tier");
  const ask = readFileSync(resolve(HERE, "../app/api/ask/route.ts"), "utf8");
  assert.doesNotMatch(ask, /effective_tier \?\? [a-zA-Z.?]*base_tier/, "api/ask/route.ts must not inline effective_tier ?? base_tier");
  assert.match(server, /customerSourceTier/);
  assert.match(ask, /customerSourceTier/);
});
