// Vocab-drift guards (STEP 3): two competing-vocabulary drifts that were latent bugs — one display
// (DOMAIN labels), one a DB-constraint footgun (severity). Pure STATIC scans (read source as text via
// node:fs, no imports of .ts) so this runs in the depless discipline CI. Each guard prevents the
// retired drift from being reintroduced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // .discipline -> fsi-app
const read = (rel) => readFileSync(resolve(FSI, rel), "utf8");

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
