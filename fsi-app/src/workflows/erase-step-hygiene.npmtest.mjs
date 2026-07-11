// @ts-check
// ERASE-STEP HYGIENE (Wave-α C6, F-07 + F-08). eraseStep must (a) DELETE the erased item's harvested
// item_timelines rows (else customer-facing milestones outlive the brief), and (b) NOT clobber
// recommended_actions on the item's OTHER open integrity_flags — it INSERTs one erase-owned flag instead
// of a blanket UPDATE that destroyed cited-host-gate / error-body-gate / null-tier action payloads.
//
// eraseStep is a "use step" that builds its own service client from env (no injectable sb), so this is a
// SOURCE-CONTRACT guarantee (the vocab-drift-guard pattern): the destructive/blanket patterns are gone and
// the correct ones present. Red before the C6 edit (blanket update, no timeline delete), green after.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(resolve(ROOT, "src/workflows/generate-brief.ts"), "utf8");

test("F-07: eraseStep DELETEs harvested item_timelines for the erased item", () => {
  assert.match(src, /from\("item_timelines"\)\.delete\(\)\.eq\("item_id", itemId\)/,
    "eraseStep must delete item_timelines for the erased item");
});

test("F-08: eraseStep does NOT blanket-update recommended_actions on the item's open flags", () => {
  assert.doesNotMatch(src, /integrity_flags"\)\.update\(\{\s*recommended_actions/,
    "eraseStep must NOT overwrite recommended_actions across all open flags (destroys other producers' payloads)");
});

test("F-08: eraseStep inserts ONE distinct erase-owned flag instead", () => {
  assert.match(src, /created_by: "research-or-erase"/,
    "eraseStep must insert a distinct erase-owned flag rather than clobbering others");
});
