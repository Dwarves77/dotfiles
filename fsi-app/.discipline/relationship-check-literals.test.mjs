// RELATIONSHIP-CHECK LITERAL GUARD (WO-28, ADR-021). Pure STATIC scan (read source as text via node:fs, no
// TS import) so this runs in the depless discipline CI — same pattern as vocab-drift-guard.test.mjs.
//
// HOME: this guard lives in .discipline/ (not src/__tests__/) for the same reason F15 and the assistant
// spend gate do (see assistant-spend-gate.test.mjs's own header) — rule 016 excludes the discipline engine
// because it references the pattern it enforces IN ORDER TO enforce it, never to call it. A scanner whose
// own comment and fixtures literally spell `relationship: "references"` (below) would flag itself if it
// lived under a glob this same file's sweep also scans.
//
// THE DEFECT THIS PINS: mint-item.ts:251's dedup-linked edge wrote `relationship: "references"` — a value
// item_cross_references_relationship_check (migration 004) FORBIDS — and the write's error was swallowed
// by `.then(() => {}, () => {})`. Every `dedup:linked` mint silently failed to write its edge, with no
// error surfaced anywhere, for as long as that line existed. Fixed in the same PR (mint-item.ts now writes
// 'related'); this guard is what stops the class from recurring anywhere else in src/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // .discipline -> fsi-app

// SOURCE OF TRUTH, read (not hand-copied): the live DB CHECK on item_cross_references.relationship,
// migration 004. Parsing it out of the migration means a future CHECK widening (e.g. `derogates_under`
// riding the WO-12/19 DDL window per docs/plans/connection-redesign-and-build-scope-2026-08-29.md) updates
// this guard's allowed set for free — no second hand-edit to drift out of sync with the schema.
const MIG_PATH = "supabase/migrations/004_source_trust_framework.sql";
const migText = readFileSync(resolve(FSI, MIG_PATH), "utf8");
const CHECK_MATCH = migText.match(/relationship\s+TEXT[\s\S]*?CHECK\s*\(\s*relationship\s+IN\s*\(([^)]*)\)\s*\)/);
if (!CHECK_MATCH) {
  throw new Error(
    `relationship-check-literals guard: could not locate the item_cross_references.relationship CHECK in ` +
      `${MIG_PATH}. Either the CHECK moved to a later migration (ALTER TABLE ... ADD CONSTRAINT) — update ` +
      `MIG_PATH above to the migration that now owns it — or the column/CHECK was renamed; this guard must ` +
      `track the live constraint, never assert a stale copy.`,
  );
}
const ALLOWED = new Set(CHECK_MATCH[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean));

test("sanity: the parsed CHECK set matches the verified live constraint (2026-08-29, six values)", () => {
  assert.deepEqual(
    [...ALLOWED].sort(),
    ["amends", "conflicts", "depends_on", "implements", "related", "supersedes"],
    "the CHECK parsed out of migration 004 no longer matches the verified live set — either the schema " +
      "changed (update this assertion + re-verify live) or the regex above mis-parsed the migration text.",
  );
});

// THE SCANNER (pure, exported for the self-tests below): finds every `relationship: "<literal>"` /
// `relationship: '<literal>'` object-literal assignment in a text blob and returns the ones whose literal
// is NOT in `allowed`, as {literal, line} (1-indexed, for readable failure messages).
export function scanRelationshipLiterals(text, allowed) {
  const violations = [];
  const re = /relationship\s*:\s*["']([A-Za-z_]+)["']/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const literal = m[1];
    if (!allowed.has(literal)) {
      violations.push({ literal, line: text.slice(0, m.index).split("\n").length });
    }
  }
  return violations;
}

// PROOF THE GUARD IS NOT VACUOUS (CLAUDE.md rule 15 — "a guard is proven by attack, not by presence").
// This fixture is byte-for-byte the pre-fix mint-item.ts:251 defect. The live sweep below (scanning the
// real, now-fixed src/) proves the repo is clean TODAY; this proves the scanner itself would have failed
// loud on the exact string that shipped silently broken for as long as it existed.
test("scanner self-test: relationship: \"references\" (the pre-fix mint-item.ts defect) IS flagged", () => {
  const fixture = `await sb.from("item_cross_references").upsert(
    { source_item_id: itemId, target_item_id: linkTargetId, relationship: "references", origin: "entity_extraction" },
    { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true }
  );`;
  const violations = scanRelationshipLiterals(fixture, ALLOWED);
  assert.equal(violations.length, 1, "the scanner must catch exactly one CHECK-illegal literal in this fixture");
  assert.equal(violations[0].literal, "references");
});

test("scanner self-test: every CHECK-legal literal passes clean (no false positives on legal values)", () => {
  const fixture = [...ALLOWED].map((v) => `relationship: "${v}"`).join(",\n");
  assert.deepEqual(scanRelationshipLiterals(fixture, ALLOWED), [], "no legal literal should ever be flagged");
});

test("scanner self-test: single-quoted literals are caught too (not just double-quoted)", () => {
  const violations = scanRelationshipLiterals(`relationship: 'references'`, ALLOWED);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].literal, "references");
});

// THE LIVE SWEEP: every `relationship: "<literal>"` assignment anywhere under fsi-app/src/ must be
// CHECK-legal. Recursive fs walk (readdirSync recursive:true, Node 20.1+), .ts/.tsx/.mjs only, no npm
// deps — stays in the depless discipline CI same as every other file this suite runs. src/ carries no
// node_modules/.next/dist/build of its own, but the skip list stays defensive rather than assuming that.
function listSourceFiles(absDir) {
  const SKIP = new Set(["node_modules", ".next", "dist", "build"]);
  let entries;
  try {
    entries = readdirSync(absDir, { recursive: true }).map((p) => String(p).split("\\").join("/"));
  } catch {
    return [];
  }
  return entries.filter((rel) => /\.(ts|tsx|mjs)$/.test(rel) && !rel.split("/").some((seg) => SKIP.has(seg)));
}

// NAMED EXCLUSION (never silent — mirrors run-test-suite.sh's own "NAMED EXCLUSIONS" convention above
// it in this suite). scoreConnection() in discover.mjs returns an internal `relationship: "none"` field
// when a pair scores zero — a SCORING-RESULT label ("no signal fired above the floor"), never a DB row.
// Verified 2026-08-29 (this session, live read): the only caller of writeDiscoveredEdges is
// scripts/connections/backfill-edges.mjs, which constructs its OWN literal `relationship: "related"` for
// every provenance_discovery edge — it does NOT thread scoreConnection's returned field through — so
// "none" never reaches item_cross_references.relationship. Scoped to this exact (file, literal) pair, not
// the whole file: a CHECK-illegal literal added anywhere else in discover.mjs, or a future path that DOES
// write "none" to a row, still fails the sweep below.
const KNOWN_NON_DB_LITERALS = new Set(["lib/connections/discover.mjs::none"]);

test("named exclusion stays honest: discover.mjs still carries exactly the excluded literal (not vacuous, not grown)", () => {
  const text = readFileSync(resolve(FSI, "src/lib/connections/discover.mjs"), "utf8");
  const found = scanRelationshipLiterals(text, ALLOWED).map((v) => v.literal);
  assert.deepEqual(found, ["none", "none"], "discover.mjs's relationship literal set changed — re-verify the exclusion above still applies before adjusting it");
});

test("live sweep: no relationship literal anywhere in src/ is outside the item_cross_references CHECK", () => {
  const srcAbs = resolve(FSI, "src");
  const files = listSourceFiles(srcAbs);
  assert.ok(files.length > 100, `sanity: expected src/ to contain well over 100 source files, found ${files.length} — the walk may be broken`);
  const failures = [];
  for (const rel of files) {
    const abs = resolve(srcAbs, rel);
    const text = readFileSync(abs, "utf8");
    for (const v of scanRelationshipLiterals(text, ALLOWED)) {
      if (KNOWN_NON_DB_LITERALS.has(`${rel}::${v.literal}`)) continue;
      failures.push(`src/${rel}:${v.line} — relationship: "${v.literal}" is not in the CHECK-allowed set {${[...ALLOWED].sort().join(", ")}}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `CHECK-illegal relationship literal(s) found — every write with this value silently fails the DB ` +
      `constraint (the exact mint-item.ts:251 class this guard exists to stop):\n${failures.join("\n")}`,
  );
});
