// Lane L35 (F46 external-host-home): www.linkedin.com's one home is LINKEDIN_OAUTH_BASE_URL, exported
// from logic.ts -- already the shared import site between start/route.ts and ../callback/route.ts (see
// that file's header). logic.ts has no route-handler exports and no Next.js/npm dependency, so it is
// importable directly from a plain node:test file with no network and no side effect.
// Run: node --test src/app/api/auth/linkedin/start/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanTree, HOST_HOMES } from "../../../../../../.discipline/fitness/functions/F46-external-host-home.mjs";
import { STATE_COOKIE, STATE_COOKIE_MAX_AGE_SECONDS, LINKEDIN_OAUTH_BASE_URL } from "./logic.ts";

test("LINKEDIN_OAUTH_BASE_URL: the one exported constant both OAuth routes compose from", () => {
  assert.equal(LINKEDIN_OAUTH_BASE_URL, "https://www.linkedin.com/oauth/v2");
  assert.equal(`${LINKEDIN_OAUTH_BASE_URL}/authorization`, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(`${LINKEDIN_OAUTH_BASE_URL}/accessToken`, "https://www.linkedin.com/oauth/v2/accessToken");
});

test("STATE_COOKIE constants unchanged by the F46 consolidation", () => {
  assert.equal(STATE_COOKIE, "li_oauth_state");
  assert.equal(STATE_COOKIE_MAX_AGE_SECONDS, 600);
});

// ── Sweep (lane L35, F46 external-host-home). Reused by import from F46 itself (lane L35h, 2026-09-18):
// the earlier copy here stripped comments mid-line, which deletes everything after the "//" inside
// "https://" and hides a URL literal from the check. api.linkedin.com (the profile/email REST endpoints
// in callback/route.ts) is a DIFFERENT host, out of this sweep's scope.
test("ONE home for www.linkedin.com: no other in-scope source file builds this host's URL", () => {
  const { strict } = scanTree();
  const hit = strict.find((s) => s.host === "www.linkedin.com");
  assert.equal(HOST_HOMES["www.linkedin.com"], "fsi-app/src/app/api/auth/linkedin/start/logic.ts");
  assert.equal(hit, undefined, hit && `import start/logic.ts's LINKEDIN_OAUTH_BASE_URL instead of building a www.linkedin.com URL in: ${hit.extra.join(", ")}`);
});
