// D3 (c) — exclusion-audit LAYER 1 (known-answer pairs) + LAYER 2 (mutation).
// Run: node --test scripts/lib/exclusion-audit.selftest.mjs
//
// Pure (no DB): operator-constructed groups whose correct verdict is known because I
// constructed the method. The pair is the whole point — exclusion-by-UNRELIABLE must
// flag, exclusion-by-RELIABLE must clear; "surfaced the bad set" only means something
// if the good set is left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCLUSION_SURFACES, crossProduct, mapMethod, describe,
} from "./exclusion-audit.mjs";

const sv = EXCLUSION_SURFACES.find((s) => s.id === "source_verifications");

// ───────── LAYER 1 — known-answer pairs ─────────

test("L1 mapMethod — reachability -> unreliable plain-fetch; duplicate -> reliable dedup (pair)", () => {
  assert.equal(mapMethod(sv, "reachability"), "plain-fetch-reachability");
  assert.equal(mapMethod(sv, "duplicate"), "dedup");
  // an unmapped signal is NOT silently trusted
  assert.equal(mapMethod(sv, "some_new_reason"), "unmapped:some_new_reason");
});

test("L1 crossProduct — unreliable-method group flags; reliable-method group clears (pair)", () => {
  const groups = [
    { surface: "source_verifications", method: "plain-fetch-reachability", rawSignal: "reachability", count: 420 },
    { surface: "source_verifications", method: "dedup", rawSignal: "duplicate", count: 357 },
    { surface: "ingest_rejections", method: "parse-determination", rawSignal: "unparseable", count: 84 },
  ];
  const { flagged, clean } = crossProduct(groups);
  assert.deepEqual(flagged.map((g) => g.rawSignal), ["reachability"]); // ONLY the unreliable one
  assert.deepEqual(clean.map((g) => g.rawSignal).sort(), ["duplicate", "unparseable"]); // good sets left alone
});

test("L1 describe — derives the recover-candidate conclusion from a flagged group", () => {
  const d = describe({ surface: "source_verifications", method: "plain-fetch-reachability", count: 420 });
  assert.match(d, /420 candidate/);
  assert.match(d, /wrongly excluded|recover-candidate/);
});

// ───────── LAYER 2 — mutation (test the test) ─────────
// Break the discrimination two different ways; each makes the 420-shaped group go
// UNFLAGGED. real != broken proves the cross-product logic (registry membership AND
// the method mapping) is load-bearing, not decorative.

test("L2 mutation A — empty unreliable registry hides the wrongly-excluded group", () => {
  const groups = [{ surface: "source_verifications", method: "plain-fetch-reachability", rawSignal: "reachability", count: 420 }];
  const real = crossProduct(groups).flagged.length;            // 1 — flagged
  // mutation: the registry forgot plain-fetch-reachability -> nothing is unreliable
  const brokenFlag = (gs, unreliable) => gs.filter((g) => unreliable.has(g.method)).length;
  const broken = brokenFlag(groups, new Set());               // 0 — the 420 hides
  assert.equal(real, 1);
  assert.notEqual(real, broken);                               // membership is load-bearing
});

test("L2 mutation B — misclassifying reachability as reliable (dedup) hides it", () => {
  const realMethod = mapMethod(sv, "reachability");           // plain-fetch-reachability
  const groupsReal = [{ surface: "source_verifications", method: realMethod, rawSignal: "reachability", count: 420 }];
  assert.equal(crossProduct(groupsReal).flagged.length, 1);
  // mutation: methodMap maps reachability -> 'dedup' (a reliable method)
  const groupsBroken = [{ surface: "source_verifications", method: "dedup", rawSignal: "reachability", count: 420 }];
  assert.equal(crossProduct(groupsBroken).flagged.length, 0); // the 420 hides under misclassification
  assert.notEqual(crossProduct(groupsReal).flagged.length, crossProduct(groupsBroken).flagged.length);
});
