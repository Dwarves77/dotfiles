// full-read-audit-2026-08-31.md §2.4: SourcesList's private TIER_STYLE covered tiers 1-5 only,
// so a T6/T7 citation rendered NO badge at all. TIER_TONE now covers 1-7 (extracted to this pure
// module so it is testable — SourcesList.tsx is a client component and JSX can't be imported by
// the no-npm-ci discipline test runner; see glob-portability.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Same fallback strategy as tier-labels.test.mjs: node --test without a TS loader parses the
 *  source's TIER_TONE object literal directly rather than executing it. */
async function load() {
  return import("./tier-badge-tone.ts").catch(() => {
    const src = readFileSync(resolve(HERE, "tier-badge-tone.ts"), "utf8");
    const TIER_TONE = {};
    const objSrc = /export const TIER_TONE[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(src)?.[1] || "";
    const entryRe = /(\d+):\s*\{([^}]*)\}/g;
    let m;
    while ((m = entryRe.exec(objSrc))) {
      const [, tier, body] = m;
      const fg = /fg:\s*"([^"]*)"/.exec(body)?.[1] ?? null;
      const bg = /bg:\s*"([^"]*)"/.exec(body)?.[1] ?? null;
      const border = /border:\s*"([^"]*)"/.exec(body)?.[1] ?? undefined;
      TIER_TONE[tier] = { fg, bg, ...(border !== undefined ? { border } : {}) };
    }
    const clampTier = (n) => Math.min(7, Math.max(1, Math.round(n)));
    const tierToneFor = (n) => TIER_TONE[clampTier(n)];
    return { TIER_TONE, clampTier, tierToneFor };
  });
}

test("TIER_TONE covers all seven tiers — none silently vanish", async () => {
  const { TIER_TONE } = await load();
  for (let t = 1; t <= 7; t++) {
    assert.ok(TIER_TONE[t], `tier ${t} has no tone entry`);
    assert.ok(TIER_TONE[t].fg, `tier ${t} tone missing fg`);
    assert.ok(TIER_TONE[t].bg, `tier ${t} tone missing bg`);
  }
});

test("T6/T7 use the dashed-muted 'unverified provenance' tone (matches RegulationDetailSurface/MarketSignalDetailSurface's TierBadge for tier > 5)", async () => {
  const { TIER_TONE } = await load();
  assert.equal(TIER_TONE[6].bg, "transparent");
  assert.equal(TIER_TONE[7].bg, "transparent");
  assert.ok(TIER_TONE[6].border, "tier 6 must have a border (dashed-muted fallback)");
  assert.ok(TIER_TONE[7].border, "tier 7 must have a border (dashed-muted fallback)");
  assert.equal(TIER_TONE[6].border, TIER_TONE[7].border);
});

test("clampTier / tierToneFor never leave a real tier unrendered, even out-of-range or fractional input", async () => {
  const { clampTier, tierToneFor } = await load();
  assert.equal(clampTier(0), 1);
  assert.equal(clampTier(-5), 1);
  assert.equal(clampTier(8), 7);
  assert.equal(clampTier(99), 7);
  assert.equal(clampTier(3.4), 3);
  assert.equal(clampTier(3.6), 4);
  // every clamped input must resolve to SOME tone (defect 2.4's "silently vanish" bug — a tier
  // outside the map produced `tone = undefined` and the badge was skipped entirely)
  for (const n of [0, -5, 8, 99, 3.4, 1, 7]) {
    assert.ok(tierToneFor(n), `tierToneFor(${n}) returned no tone`);
  }
});
