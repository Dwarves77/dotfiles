// Unit test for GET /api/notices's pure helpers, imported from their sibling logic.ts (BUILDGATE,
// 2026-09-02: route.ts may export only route handlers, so these were moved out of it — see
// logic.ts's header) — same sibling-logic-module pattern src/app/api/watchlist/logic.ts's
// teamOnlyError and src/app/api/admin/recompute-trust/logic.ts's demotionOutcomeFor already use.
// Exercises the REAL exported functions this route calls (resolveSinceParam, attachEntityLabels),
// not a reimplementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { resolveSinceParam, attachEntityLabels } = await jiti.import("./logic.ts");

const NOW = new Date("2026-09-02T00:00:00Z");

test("resolveSinceParam: an absent since falls back to the default window before now", () => {
  const iso = resolveSinceParam(null, NOW);
  const days = (NOW.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
  assert.equal(days, 30);
});

test("resolveSinceParam: an unparseable since falls back to the default window, not a throw", () => {
  const iso = resolveSinceParam("not-a-date", NOW);
  const days = (NOW.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
  assert.equal(days, 30);
});

test("resolveSinceParam: an empty-string since falls back to the default window", () => {
  const iso = resolveSinceParam("", NOW);
  assert.equal(iso, resolveSinceParam(null, NOW));
});

test("resolveSinceParam: a valid ISO since is passed through, normalised", () => {
  const iso = resolveSinceParam("2026-08-01T00:00:00Z", NOW);
  assert.equal(iso, "2026-08-01T00:00:00.000Z");
});

test("attachEntityLabels: a resolvable entity gets its canonical_name as entityLabel and a /entities href", () => {
  const notices = [{ entityId: "cl:jurisdiction:1", newValueId: "v1" }];
  const out = attachEntityLabels(notices, { "cl:jurisdiction:1": "Rotterdam" });
  assert.equal(out[0].entityLabel, "Rotterdam");
  assert.equal(out[0].href, "/entities/cl%3Ajurisdiction%3A1");
});

test("attachEntityLabels: an unresolvable label falls back to the raw entityId, never blank", () => {
  const notices = [{ entityId: "cl:jurisdiction:2", newValueId: "v2" }];
  const out = attachEntityLabels(notices, {});
  assert.equal(out[0].entityLabel, "cl:jurisdiction:2");
});

test("attachEntityLabels: a null entityId yields a null label and a null href", () => {
  const notices = [{ entityId: null, newValueId: "v3" }];
  const out = attachEntityLabels(notices, {});
  assert.equal(out[0].entityLabel, null);
  assert.equal(out[0].href, null);
});
