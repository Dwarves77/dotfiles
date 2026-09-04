// AppShell.npmtest.mjs — STEP 2(b) regression proof (PERF-MERGE, 2026-09-04).
//
// Pins computeShowNoWorkspaceBanner's contract (app-shell-banner.ts) — the fix for the live regression
// [CONFIRMED by the coordinator, Chrome on carosledge.com, 2026-09-04 19:56 UTC]: the "No workspace yet"
// banner rendered for a signed-in operator whose org exists ("workspace verticals: Live events · Fine
// art" visible in the same masthead). Root cause: AuthProvider.tsx's `onAuthStateChange` listener sets
// `user` independently of (and typically before) `orgId` resolves — see app-shell-banner.ts's own header
// for the full mechanism. The four states below are exactly the four states that header names.
//
// Exercises the REAL exported predicate (not a reimplementation), imported via jiti — this repo's
// established way to unit-test a plain-.ts module with node --test with no JSX mount infra (see
// src/components/regulations/band-empty-state.npmtest.mjs's own header for the precedent).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { computeShowNoWorkspaceBanner } = await jiti.import("./app-shell-banner.ts");

const SUPPRESS = ["/workspace/new", "/invitations/", "/onboarding", "/login", "/auth", "/signup"];
const base = { pathname: "/regulations", suppressRoutes: SUPPRESS };

test("signed-out: no user -> banner withheld regardless of orgId", () => {
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user: null, orgId: undefined }), false);
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user: null, orgId: null }), false);
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user: null, orgId: "org-1" }), false);
});

test("LIVE-DEFECT SHAPE: signed-in + orgId UNRESOLVED (undefined) -> banner withheld, not shown", () => {
  // This is the exact state the coordinator observed live: onAuthStateChange has already set `user`,
  // the identity fetch (and therefore orgId) has not resolved yet. Pre-fix (`!!user && !orgId`) this
  // was indistinguishable from "resolved: no org" and rendered the false banner.
  const shown = computeShowNoWorkspaceBanner({ ...base, user: { id: "u1" }, orgId: undefined });
  assert.equal(shown, false);
});

test("signed-in + orgId RESOLVED null -> banner shown (the one true case)", () => {
  const shown = computeShowNoWorkspaceBanner({ ...base, user: { id: "u1" }, orgId: null });
  assert.equal(shown, true);
});

test("signed-in + orgId resolved to an id -> banner withheld", () => {
  const shown = computeShowNoWorkspaceBanner({ ...base, user: { id: "u1" }, orgId: "org-42" });
  assert.equal(shown, false);
});

test("suppressed route: resolved-null org on a suppress-listed path never shows the banner", () => {
  const shown = computeShowNoWorkspaceBanner({
    user: { id: "u1" },
    orgId: null,
    pathname: "/workspace/new",
    suppressRoutes: SUPPRESS,
  });
  assert.equal(shown, false);
});

// Sanity check on the reproduction itself: prove the OLD (pre-fix) two-valued predicate really would
// have shown the banner in the unresolved case — otherwise the "unresolved" test above would be
// vacuous (it'd pass even if the fix had never been made, because nothing would ever disagree).
test("sanity: the OLD `!!user && !orgId` predicate DOES show the banner in the unresolved case (proves the fix is not vacuous)", () => {
  const user = { id: "u1" };
  const orgId = undefined; // unresolved
  const oldPredicate = !!user && !orgId;
  assert.equal(oldPredicate, true); // the live defect, reproduced
  const newPredicate = computeShowNoWorkspaceBanner({ ...base, user, orgId });
  assert.equal(newPredicate, false); // the fix
  assert.notEqual(oldPredicate, newPredicate);
});
