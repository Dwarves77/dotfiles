// row-fields.npmtest.mjs, proof for recentRegenInfo (D23 part (d), defect-fix-plan-2026-09-12.md).
// jiti-loaded like brief-rows.npmtest.mjs (this repo has no JSX/TS mount infra for a plain `node
// --test` run); *.npmtest.mjs joins fsi-app/src/**/*.npmtest.mjs by construction (discipline.yml).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { recentRegenInfo } = await jiti.import("./row-fields.ts");

const NOW = new Date("2026-09-13T00:00:00.000Z");

test("recentRegenInfo: null for a missing/absent lastRegeneratedAt", () => {
  assert.equal(recentRegenInfo(null, NOW), null);
  assert.equal(recentRegenInfo(undefined, NOW), null);
  assert.equal(recentRegenInfo("", NOW), null);
});

test("recentRegenInfo: a date today (0 days ago) is within the window", () => {
  const r = recentRegenInfo("2026-09-13T00:00:00Z", NOW);
  assert.ok(r);
  assert.equal(r.iso, "2026-09-13");
  assert.equal(r.label, "Sep 13");
});

test("recentRegenInfo: exactly 30 days ago is still within the (inclusive) default window", () => {
  const r = recentRegenInfo("2026-08-14T00:00:00Z", NOW);
  assert.ok(r, "30 days ago must still be inside the default 30-day window");
  assert.equal(r.iso, "2026-08-14");
});

test("recentRegenInfo: 31 days ago falls OUTSIDE the default window", () => {
  assert.equal(recentRegenInfo("2026-08-13T00:00:00Z", NOW), null);
});

test("recentRegenInfo: a custom `days` window is honoured", () => {
  assert.ok(recentRegenInfo("2026-09-06T00:00:00Z", NOW, 7), "7 days ago is inside a 7-day window");
  assert.equal(recentRegenInfo("2026-09-01T00:00:00Z", NOW, 7), null, "12 days ago is outside a 7-day window");
});

test("recentRegenInfo: a FUTURE date (clock skew or a bad write) is never presented as recent", () => {
  assert.equal(recentRegenInfo("2026-09-14T00:00:00Z", NOW), null);
});

test("recentRegenInfo: an unparseable date string is null, never thrown", () => {
  assert.equal(recentRegenInfo("not-a-date", NOW), null);
});

test("recentRegenInfo: the ledger chip and the detail header share this ONE function (no per-surface re-derivation)", async () => {
  // A structural guard: both consumers import from this module rather than hand-rolling their own
  // day-math, so the two surfaces can never silently disagree about the same item's regeneration date.
  const { readFileSync } = await import("node:fs");
  const ledgerSrc = readFileSync(resolve(ROOT, "src/components/regulations/RegulationsLedger.tsx"), "utf8");
  const detailSrc = readFileSync(resolve(ROOT, "src/components/regulations/RegulationDetailSurface.tsx"), "utf8");
  assert.match(ledgerSrc, /import \{[^}]*recentRegenInfo[^}]*\} from "@\/lib\/dashboard\/row-fields"/);
  assert.match(detailSrc, /import \{ recentRegenInfo \} from "@\/lib\/dashboard\/row-fields"/);
});
