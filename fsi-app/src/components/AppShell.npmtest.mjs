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
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { computeShowNoWorkspaceBanner, computeShowIdentityErrorNote } = await jiti.import("./app-shell-banner.ts");
const { resolveAuthSeed } = await jiti.import("./shell/bootstrap-seed.ts");

const SUPPRESS = ["/workspace/new", "/invitations/", "/onboarding", "/login", "/auth", "/signup"];
// Every pre-AUTH-IDENTITY case below is a RESOLVED lookup; the lookup's status is now an input.
const base = { pathname: "/regulations", suppressRoutes: SUPPRESS, identityStatus: "resolved" };

// ── Lane AUTH-IDENTITY failing-first (2026-09-24). The live shape: the operator (a real owner, rows
// correct) signed in, the one identity fetch failed, AuthProvider applied resolveAuthSeed(null), and
// the shell said "No workspace yet". This test drives the banner with EXACTLY what a failed lookup
// produces. On origin/master (44187dfa) that is `orgId: null` and the predicate shows the banner. ──
test("AUTH-IDENTITY failing-first: a FAILED identity lookup with a signed-in session never shows 'No workspace yet'", () => {
  const failed = resolveAuthSeed(null);
  const shown = computeShowNoWorkspaceBanner({
    ...base,
    user: { id: "2b7d21eb" },
    orgId: failed.orgId,
    identityStatus: failed.status,
  });
  assert.equal(shown, false);
});

test("AUTH-IDENTITY: the failed state renders the error note (with Retry) instead; never for a resolved or pending lookup", () => {
  const user = { id: "2b7d21eb" };
  assert.equal(computeShowIdentityErrorNote({ ...base, user, identityStatus: "error" }), true);
  assert.equal(computeShowIdentityErrorNote({ ...base, user, identityStatus: "resolved" }), false);
  assert.equal(computeShowIdentityErrorNote({ ...base, user, identityStatus: "pending" }), false);
  assert.equal(computeShowIdentityErrorNote({ ...base, user: null, identityStatus: "error" }), false, "no session, nothing to fail to load");
  assert.equal(computeShowIdentityErrorNote({ ...base, user, identityStatus: "error", pathname: "/onboarding" }), false);
});

test("AUTH-IDENTITY: a resolved-null org shows the banner only when the status is resolved (pending and error withhold it)", () => {
  const user = { id: "u1" };
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user, orgId: null, identityStatus: "resolved" }), true);
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user, orgId: null, identityStatus: "pending" }), false);
  assert.equal(computeShowNoWorkspaceBanner({ ...base, user, orgId: null, identityStatus: "error" }), false);
});

// AppShell mounts the note with the house error treatment and wires Retry to the provider.
{
  const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "AppShell.tsx"), "utf8");
  test("AppShell renders the identity error note as a CRITICAL-band StateNote whose action calls retryIdentity", () => {
    assert.match(SRC, /showIdentityErrorNote && \(/);
    assert.match(SRC, /band=\{bandFromPriority\("CRITICAL"\)\}/);
    assert.match(SRC, /retryIdentity/);
    assert.match(SRC, /identityStatus,\n\s+pathname,/);
  });
}

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
    identityStatus: "resolved",
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

// Frame fix, operator report 2026-09-07 ("the side navigation bar does not reach the length of
// the page"). Source-text regression (same convention as Sidebar.npmtest.mjs — no JSX render
// harness in this repo): the frame row's height/display must be inline, not Tailwind-class-only,
// so the nav card's own `align-self:stretch` (Sidebar.tsx) has a definite box to stretch against
// in every rendering context this repo has, including the design-audit harness
// (fsi-app/.discipline/rendering/audit), which injects only globals.css/theme.css — no compiled
// Tailwind utility CSS — so a Tailwind-only frame silently has no definite height there.
{
  const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "AppShell.tsx"), "utf8");
  test("frame outer row: height 100vh and display flex are inline, not Tailwind-class-only", () => {
    assert.match(SOURCE, /style=\{\{ backgroundColor: "var\(--desk\)", display: "flex", height: "100vh" \}\}/);
  });
  // STOP 1 fix, coordinator amendment 2, 2026-09-22 [CONFIRMED by a real Playwright mount]: the
  // prior flex row (`display: "flex"` + content column `flex: "1 1 0%"`) let the nav card's own
  // `marginLeft: 16` (Sidebar.tsx) subtract from the content column's share. A flex item's margin
  // is part of its outer box, so a fixed-width item's margin comes straight out of the sibling's
  // share. The content column measured 764px at 1440 instead of the artboard's 778px, a 16px
  // shortfall exactly equal to the margin. The artboard's own model
  // (`display:grid;grid-template-columns:252px 1fr`) does not leak this way: a grid TRACK absorbs
  // its child's margin, so switching this row to the same two-track grid reproduces the artboard's
  // box model exactly (Sidebar.tsx's `<aside>` no longer sets an explicit `width: 252`, so it
  // stretches to fill its 252px track minus its own margin, the same way the artboard's nav card
  // does).
  test("frame content column: gridTemplateColumns '252px minmax(0, 1fr)' is inline (grid sizing must not depend on a compiled-Tailwind-only class)", () => {
    assert.match(SOURCE, /display: "grid", gridTemplateColumns: "252px minmax\(0, 1fr\)"/);
  });
  test("frame content column no longer carries the flex-row sizing that leaked the nav card's margin into its share", () => {
    assert.doesNotMatch(SOURCE, /flex: "1 1 0%"/);
  });
}
