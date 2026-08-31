// @ts-check
// Pins getWorkspaceProfile's contract — the ONE live consumer of "sector" data (the
// read-time relevance lens, and now also the /profile Sectors panel, Wave H1 REC-2
// §14). Verifies it reads workspace_settings.sector_profile and nothing else —
// specifically NOT profiles.sector_overrides, the per-user column no editing surface
// writes to anymore (Settings and the onboarding wizard both write
// workspace_settings.sector_profile; see components/onboarding/OnboardingWizard.tsx's
// persistSectors comment). Before Wave H1 the /profile Sectors panel read
// sector_overrides instead, so it silently showed "No sectors selected" for every
// org regardless of what was actually configured — this test guards the column the
// fix (components/profile/UserProfilePage.tsx) now depends on, so that regression
// can't come back quietly.
//
// jiti (@/ alias resolution) needed because profile.ts imports @/lib/constants and
// @/lib/workspace/relevance.mjs — same reason viewer-relevance.npmtest.mjs uses it.
// Runs via the CI "App unit tests requiring npm deps" step's *.npmtest.mjs glob
// (git ls-files 'fsi-app/src/**/*.npmtest.mjs') — no run-test-suite.sh edit needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { getWorkspaceProfile, DEFAULT_WORKSPACE_PROFILE } = await jiti.import("./profile.ts");

/** Minimal fake Supabase client covering exactly the query chain
 *  getWorkspaceProfile issues: .from("workspace_settings").select(...).eq(...).maybeSingle(). */
function fakeSupabase({ data = null, error = null } = {}) {
  return {
    from(table) {
      assert.equal(table, "workspace_settings");
      return {
        select(cols) {
          // Must ask for sector_profile — the column the rest of the platform reads.
          assert.match(cols, /sector_profile/);
          return {
            eq(col) {
              assert.equal(col, "org_id");
              return { maybeSingle: async () => ({ data, error }) };
            },
          };
        },
      };
    },
  };
}

test("orgId null → default profile, no query issued, verticals empty", async () => {
  // A client that would throw if .from() were ever called — orgId=null must short-circuit.
  const supabase = { from() { throw new Error("must not query when orgId is null"); } };
  const profile = await getWorkspaceProfile(supabase, null);
  assert.deepEqual(profile, DEFAULT_WORKSPACE_PROFILE);
  assert.deepEqual(profile.verticals, []);
});

test("reads verticals from workspace_settings.sector_profile for the given org", async () => {
  const supabase = fakeSupabase({
    data: { sector_profile: ["fine-art", "automotive"], jurisdiction_weights: null, profile: null },
  });
  const profile = await getWorkspaceProfile(supabase, "org-123");
  assert.deepEqual(profile.verticals, ["fine-art", "automotive"]);
});

test("missing row → falls back to default (empty verticals), never throws", async () => {
  const supabase = fakeSupabase({ data: null, error: null });
  const profile = await getWorkspaceProfile(supabase, "org-empty");
  assert.deepEqual(profile.verticals, []);
});

test("query error → fails soft to default profile", async () => {
  const supabase = fakeSupabase({ data: null, error: { message: "boom" } });
  const profile = await getWorkspaceProfile(supabase, "org-err");
  assert.deepEqual(profile, DEFAULT_WORKSPACE_PROFILE);
});

test("non-array sector_profile on the row degrades to empty verticals, not a throw", async () => {
  const supabase = fakeSupabase({
    data: { sector_profile: "not-an-array", jurisdiction_weights: null, profile: null },
  });
  const profile = await getWorkspaceProfile(supabase, "org-bad-shape");
  assert.deepEqual(profile.verticals, []);
});
