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

// 3b — severity must be DB-CHECK-valid. intelligence_items.severity CHECK (migration 102) allows
// 'moderate', NOT 'medium' (mig-102 even backfilled existing 'medium' -> 'moderate'). A write of
// "medium" violates the constraint. Guard: the live TS surface emits no "medium" severity literal.
test("severity vocab: intelligence.ts emits no DB-invalid \"medium\" (mig-102 CHECK uses \"moderate\")", () => {
  const mig = read("supabase/migrations/102_severity_band_theme_columns.sql");
  assert.ok(/severity/i.test(mig) && /'moderate'/.test(mig), "mig-102 must define the severity CHECK with 'moderate'");
  assert.ok(
    !/"medium"/.test(read("src/types/intelligence.ts")),
    'intelligence.ts must not use severity literal "medium" — the intelligence_items.severity CHECK (migration 102) rejects it; use "moderate" (mapPriorityToSeverity + the IntelligenceItem.severity type).',
  );
});

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
