// Vocab-drift guards (STEP 3): two competing-vocabulary drifts that were latent bugs — one display
// (DOMAIN labels), one a DB-constraint footgun (severity). Pure STATIC scans (read source as text via
// node:fs, no imports of .ts) so this runs in the depless discipline CI. Each guard prevents the
// retired drift from being reintroduced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSurfaceOfSql, surfaceOf, SURFACES } from "../src/lib/surface-of.mjs";
import { readMigrationSql } from "./lib/read-migration-sql.mjs";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // .discipline -> fsi-app
// CRLF-normalized read (guard-fix 2b): a Windows autocrlf checkout of a migration must not false-fail the
// byte-identical comparison against renderSurfaceOfSql()'s LF output.
const read = (rel) => readMigrationSql(resolve(FSI, rel));

// 3a — ONE source for domain labels. The stale constants.ts `DOMAINS` (retired 7-domain) DISAGREED with
// the canonical domains.ts `DOMAIN_LABELS` (live five-surface) on the same domain 1-7 key. domains.ts wins.
test("domain labels: domains.ts DOMAIN_LABELS is canonical; constants.ts has no competing DOMAINS map", () => {
  assert.ok(
    !/export\s+const\s+DOMAINS\b/.test(read("src/lib/constants.ts")),
    "constants.ts must NOT export a competing DOMAINS label map (it disagreed with domains.ts on the same key). Use DOMAIN_LABELS from src/lib/domains.ts.",
  );
  assert.ok(
    /export\s+const\s+DOMAIN_LABELS\b/.test(read("src/lib/domains.ts")),
    "domains.ts must export the canonical DOMAIN_LABELS",
  );
});

// 3b RETIRED (Wave A4, 2026-08-31): src/types/intelligence.ts — the file this guard read — was
// confirmed dead code (zero references anywhere in the tree, per full-read-audit-2026-08-31.md §5)
// and deleted in the same commit. The severity vocab it guarded ('moderate', not 'medium', per the
// migration-102 CHECK) has no other live TS-surface literal home at time of deletion; if one is
// added later, re-add a guard pointed at it rather than reviving this dead-file check.

// 3c — surface classification has ONE home across the JS/SQL boundary (count-integrity build, binding 3).
// The SQL surface_of() CASE in migration 148 is GENERATED from src/lib/surface-of.mjs SURFACE_RULES via
// renderSurfaceOfSql(). This guard regenerates it and asserts the migration embeds it byte-for-byte, so
// the (item_type, domain) -> surface mapping cannot drift between the runtime (JS) and the counting RPC
// (SQL). Migration #170 killed this drift class inside domains.ts; surface_of would re-create it in SQL.
test("surface classification: migration 148 surface_of() CASE is byte-identical to surface-of.mjs renderSurfaceOfSql()", () => {
  const mig = read("supabase/migrations/148_surface_counts.sql");
  const generated = renderSurfaceOfSql();
  assert.ok(
    mig.includes(generated),
    "migration 148 surface_of() must embed renderSurfaceOfSql() verbatim. The mapping changed in " +
      "src/lib/surface-of.mjs SURFACE_RULES but the migration was not regenerated — copy the exact " +
      "renderSurfaceOfSql() output into the surface_of CASE (do not hand-edit the SQL CASE).",
  );
  // Sanity: every rule resolves to a known surface (or uncategorized), and every declared SURFACE is
  // reachable — a dead surface constant would be silent drift the string check can't see.
  const produced = new Set();
  for (const it of [null, "regulation", "market_signal", "regional_data", "research_finding", "technology", "tool"]) {
    for (const d of [null, 1, 2, 3, 4, 6, 7]) produced.add(surfaceOf(it, d));
  }
  for (const s of SURFACES) {
    assert.ok(produced.has(s), `SURFACES declares "${s}" but no (item_type, domain) pair produces it — dead vocab.`);
  }
});

// 3d — surface-coverage.ts (the dashboard rail's fail-soft fallback) must DELEGATE to surfaceOf, not
// keep a competing local copy of the item_type vocab. A second JS home for the mapping is the exact
// drift 3c exists to prevent, one language over.
test("surface classification: surface-coverage.ts delegates to surfaceOf (no competing local vocab sets)", () => {
  const src = read("src/lib/dashboard/surface-coverage.ts");
  assert.ok(
    /surfaceOf/.test(src) && /surface-of\.mjs/.test(src),
    "surface-coverage.ts must import and use surfaceOf from src/lib/surface-of.mjs for classification.",
  );
  assert.ok(
    !/\bconst\s+MARKET_ITEM_TYPES\s*=\s*new\s+Set/.test(src),
    "surface-coverage.ts must NOT define its own MARKET_ITEM_TYPES set — that is the competing vocab home. Use surfaceOf.",
  );
});

// 3e — RETIRED SCOPE VOCABULARY must not return (ADR-020 Amendment 1, operator ruling 2026-08-28:
// "if tags exist with that then it's in scope"). The customs-declaration-* and dangerous-goods-*
// scenario families were removed from the tagger's core glossary because the vocabulary IS a scope
// surface: a reader offered `dangerous-goods-classification` as a scenario lens reads the domain as
// covered, whatever any doc says. WHY A GUARD AND NOT JUST AN EDIT: the families reached the corpus
// in the first place through the glossary (the WO-7 backfill sprayed customs tags onto US state
// environmental items), so the glossary is the upstream cause. Removing them without pinning them
// leaves the next edit free to reintroduce the whole class silently — the exact drift this file exists
// to prevent, one vocabulary over.
//
// NOT COVERED HERE, deliberately: `compliance_object_tags` keeps customs-broker/importer/exporter.
// Those name WHO a sustainability rule obligates (real freight parties), not a regulatory domain.
test("scope vocab: retired customs/dangerous-goods scenario families stay out of the tagger glossary", () => {
  const src = read("src/lib/agent/system-prompt.ts");
  const RETIRED = [
    "customs-declaration-import",
    "customs-declaration-export",
    "dangerous-goods-classification",
  ];
  for (const tag of RETIRED) {
    assert.ok(
      !src.includes(tag),
      `system-prompt.ts reintroduces the retired scenario tag "${tag}". ADR-020 Amendment 1 retired the ` +
        `customs-declaration-* and dangerous-goods-* families from live scope: the tag vocabulary is a scope ` +
        `declaration, so offering this tag re-declares a domain the platform does not cover. If customs is ` +
        `being restored as a vertical, that needs the regulatory_domain dimension first (ADR-020 backlog), ` +
        `not a tag added back to the sustainability glossary.`,
    );
  }
  // The replacement group must still exist — a guard that passes because the whole section was deleted
  // would be vacuous (the F23 orphaned-proof lesson, one file over).
  assert.ok(
    /Border-carbon\/due-diligence:\s*CBAM-declaration/.test(src),
    "The Border-carbon/due-diligence glossary group is missing — CBAM's border mechanism must still be " +
      "expressible via CBAM-declaration, or this guard is passing vacuously against a deleted section.",
  );
});
