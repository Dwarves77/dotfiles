// @ts-check
// W2.F AUTO-APPROVE TIER CONTRACT (Wave-α C6, F-06). The auto-approve insert must write base_tier (the
// moat resolver institution.ts tierOfSource reads base_tier ONLY) — the prior legacy `tier` write left an
// auto-approved source tier-NULL to grounding/floor unless the sync trigger happened to be present — and
// must set a REAL surface domain (REGULATIONS from domains.ts) rather than a magic `[1]` stand-in.
//
// executeAction is not exported and the insert is deep in the H-tier branch, so this is a SOURCE-CONTRACT
// guarantee (vocab-drift-guard pattern): red before the C6 edit (`tier: numericTier`, `domains: [1]`),
// green after. jiti not needed — pure text scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, "verification.ts"), "utf8");
// isolate the auto-approve newSource literal
const block = src.slice(src.indexOf("const newSource = {"), src.indexOf("const newSource = {") + 1400);

test("W2.F writes base_tier (moat resolver reads base_tier only)", () => {
  assert.match(block, /base_tier: numericTier/, "the auto-approve insert must set base_tier");
});

test("W2.F no longer writes the legacy `tier: numericTier` stand-in in the newSource literal", () => {
  assert.doesNotMatch(block, /\btier: numericTier/, "the legacy `tier:` write must be gone (base_tier is canonical)");
});

test("W2.F sets a REAL domain from the domains.ts SoT (REGULATIONS), not a magic [1]", () => {
  assert.match(block, /domains: \[REGULATIONS_DOMAIN\]/, "domains must use the named REGULATIONS_DOMAIN constant");
  assert.doesNotMatch(block, /domains: \[1\]/, "the magic `[1]` stand-in must be gone");
  assert.match(src, /import \{ REGULATIONS_DOMAIN \} from "@\/lib\/domains"/, "REGULATIONS_DOMAIN must be imported from domains.ts");
});
