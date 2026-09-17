// Lane L35 (F46 external-host-home): www.linkedin.com's one home is LINKEDIN_OAUTH_BASE_URL, exported
// from logic.ts -- already the shared import site between start/route.ts and ../callback/route.ts (see
// that file's header). logic.ts has no route-handler exports and no Next.js/npm dependency, so it is
// importable directly from a plain node:test file with no network and no side effect.
// Run: node --test src/app/api/auth/linkedin/start/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
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

// ── Sweep (lane L35, F46 external-host-home; models eurlex-cellar.mjs's own sweep). api.linkedin.com
// (the profile/email REST endpoints in callback/route.ts) is a DIFFERENT host, out of this sweep's scope.
test("ONE home for www.linkedin.com: no other in-scope source file builds this host's URL", () => {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = execFileSync("git", ["ls-files", "--", "fsi-app/scripts", "fsi-app/src"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(mjs|js|ts|tsx)$/.test(f) && !/\.(test|npmtest|selftest|golden)\.mjs$/.test(f) && !/\/fixtures\//.test(f));
  const EXCEPTIONS = new Set(["fsi-app/src/app/api/auth/linkedin/start/logic.ts"]);
  const hostRe = /https?:\/\/www\.linkedin\.com/;
  const offenders = [];
  for (const f of files) {
    if (EXCEPTIONS.has(f)) continue;
    const src = readFileSync(resolve(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (hostRe.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "import start/logic.ts's LINKEDIN_OAUTH_BASE_URL instead of building a www.linkedin.com URL in: " + offenders.join(", "));
});
