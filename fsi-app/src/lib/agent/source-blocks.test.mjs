// RED-then-GREEN for the grounding-truncation moat fix (Lane-#4 batch-1 root cause, 2026-07-03).
// The wall: a floor-qualifying source (T2 for reg-family) whose FACT span sits BEYOND the old
// per-corroborator cap was truncated by the ORDER-BASED builder (fetched[0]=primary, corroborators split
// the remainder), so the fact couldn't ground to it → fact_below_authority_floor. The fix: TIER-ORDERED
// allocation — floor-qualifiers reach the model COMPLETE, corroborators truncate lowest-tier-first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceBlocks, authorityFloorFor } from "./source-blocks.mjs";
import { readMigrationSql } from "../../../.discipline/lib/read-migration-sql.mjs";

// Reference implementation of the PRE-FIX order-based builder, kept ONLY to demonstrate the RED it produced.
function legacyOrderBasedBuild(fetched, budget) {
  if (!fetched.length) return "";
  const [primary, ...corr] = fetched;
  const primaryText = primary.text.length > budget ? primary.text.slice(0, budget) : primary.text;
  const parts = [`### SOURCE url=${primary.url}\n${primaryText}`];
  const remaining = Math.max(0, budget - primaryText.length);
  const perCorr = corr.length ? Math.floor(remaining / corr.length) : 0;
  for (const c of corr) {
    if (perCorr < 200) continue;
    parts.push(`### SOURCE url=${c.url}\n${c.text.slice(0, perCorr)}`);
  }
  return parts.join("\n\n");
}

const SPAN = "FLOOR_QUALIFYING_FACT_SPAN_AT_THE_BACK";
// A floor-qualifying T2 source whose fact span sits near the END (beyond any small per-corroborator cap),
// paired with a big LOW-tier source that under order-based logic becomes fetched[0] and eats the budget.
const floorText = "x".repeat(45000) + SPAN + "y".repeat(3000);
const lowText = "z".repeat(400000);
const POOL = [
  { url: "low.example", text: lowText, tier: 5 },  // fetched[0] under the old order-based split
  { url: "floor.gov", text: floorText, tier: 2 },  // the T2 floor-qualifier (a mere "corroborator" to the old builder)
];
const BUDGET = 120000;
const CEILING = 560000;

test("RED (pre-fix, order-based): the floor-qualifying fact span is TRUNCATED away → the wall", () => {
  const blocks = legacyOrderBasedBuild(POOL, BUDGET);
  assert.ok(!blocks.includes(SPAN), "order-based split drops the floor-qualifier — this IS fact_below_authority_floor");
});

test("GREEN (fixed, tier-ordered): the floor-qualifying source is COMPLETE, the fact span is matchable", () => {
  const floorTier = authorityFloorFor("regulation"); // 2
  const { blocks, trims, ceilingWalls } = buildSourceBlocks(POOL, BUDGET, { floorTier, hardCeiling: CEILING });
  assert.ok(blocks.includes(SPAN), "the T2 floor-qualifier reaches the model COMPLETE — the span is matchable (the moat)");
  assert.equal(ceilingWalls.length, 0, "floor source under the ceiling → no wall");
  assert.ok(!trims.some((t) => t.url === "floor.gov"), "the floor-qualifier is NEVER trimmed");
  assert.ok(trims.some((t) => t.url === "low.example"), "truncation pressure lands on the LOW-tier corroborator instead");
});

test("ceiling wall: a floor source larger than the hard ceiling is SURFACED, never silently sliced", () => {
  const huge = [{ url: "floor.gov", text: "q".repeat(700000), tier: 1 }];
  const { blocks, ceilingWalls } = buildSourceBlocks(huge, BUDGET, { floorTier: 2, hardCeiling: 560000 });
  assert.equal(ceilingWalls.length, 1, "over-ceiling floor source → a surfaced wall, not a silent truncation");
  assert.equal(ceilingWalls[0].transport, "context-ceiling-wall(floor)");
  assert.ok(!blocks.includes("q".repeat(1000)), "no truncated slice of an over-ceiling floor source is emitted");
});

test("authorityFloorFor: reg-family=2, research=4, tech=5, market/regional exempt=null", () => {
  assert.equal(authorityFloorFor("regulation"), 2);
  assert.equal(authorityFloorFor("directive"), 2);
  assert.equal(authorityFloorFor("research_finding"), 4);
  assert.equal(authorityFloorFor("technology"), 5);
  assert.equal(authorityFloorFor("market_signal"), null);
  assert.equal(authorityFloorFor("regional_data"), null);
});

// DRIFT-GUARD (SC-10, ruling 2 2026-07-03): the audit's authority floor lives in migration 141's
// validate_item_provenance `v_floor_max` CASE (the RUNTIME authority that raises fact_below_authority_floor).
// authorityFloorFor is the JS MIRROR and MUST NOT diverge — parse the SQL CASE and assert equality for every
// item_type it names (the surface_of pattern; SQL = authority, JS = asserted mirror). Catches the 'law'-class
// divergence that a second floor home would silently reintroduce.
test("floor vocab has ONE home: authorityFloorFor mirrors migration 141 v_floor_max CASE (no drift)", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const sql = readMigrationSql(resolve(HERE, "../../../supabase/migrations/141_per_type_authority_floor.sql")); // CRLF-normalized (guard-fix 2b)
  const caseBody = sql.match(/v_floor_max\s*:=\s*CASE([\s\S]*?)END\s*;/i);
  assert.ok(caseBody, "migration 141 must contain the v_floor_max CASE (the floor authority)");
  const expected = new Map(); // item_type -> floor number
  const whenRe = /WHEN\s+v_item\.item_type\s+(?:IN\s*\(([^)]*)\)|=\s*'([a-z_]+)')\s+THEN\s+(\d+)/gi;
  let m;
  while ((m = whenRe.exec(caseBody[1])) !== null) {
    const floor = Number(m[3]);
    const types = m[1] ? m[1].match(/'([a-z_]+)'/g).map((s) => s.replace(/'/g, "")) : [m[2]];
    for (const t of types) expected.set(t, floor);
  }
  assert.ok(expected.size >= 7, `parsed ${expected.size} floor mappings from migration 141 — expected the full reg/research/tech set`);
  for (const [itemType, floor] of expected) {
    assert.equal(authorityFloorFor(itemType), floor, `authorityFloorFor("${itemType}") must equal migration 141's floor ${floor}`);
  }
  // ELSE NULL: a type not in the CASE is exempt in both.
  assert.equal(authorityFloorFor("market_signal"), null, "market_signal is ELSE→NULL in migration 141; must be null here");
  // The specific 'law' divergence guard: migration 141 has NO 'law' → it must be exempt here too.
  assert.ok(!expected.has("law"), "migration 141 does not floor 'law'");
  assert.equal(authorityFloorFor("law"), null, "'law' is not reg-family in migration 141 → must be exempt (null) here, not 2");
});
