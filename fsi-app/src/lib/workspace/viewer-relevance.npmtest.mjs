// @ts-check
// GOLDEN (flywheel U9): getViewerRelevanceForItem's fail-soft contract — "a relevance-lens failure must
// never fail the detail page render." jiti imports the TS helper (@/ alias resolution).
//
// This test runs OUTSIDE a Next.js request context (plain node --test), so resolveOrgIdFromCookies'
// underlying next/headers cookies() call throws (no request scope) — exactly the realistic failure mode
// the try/catch exists for. That makes this a genuine end-to-end proof of the fail-soft contract, not a
// mocked no-op: no request context IS what makes the catch block load-bearing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { getViewerRelevanceForItem } = await jiti.import("./viewer-relevance.ts");

test("no item → null immediately, no cookie/org resolution attempted", async () => {
  assert.equal(await getViewerRelevanceForItem(null), null);
  assert.equal(await getViewerRelevanceForItem(undefined), null);
});

test("outside a request context (no cookies scope) → fails soft to null, never throws", async () => {
  const item = { title: "Ocean freight rule", transport_modes: ["ocean"], jurisdictions: ["eu"] };
  const result = await getViewerRelevanceForItem(item);
  assert.equal(result, null, "a relevance-lens failure must degrade to null, never throw or crash the page");
});
