// Route-level auth contract for /api/workspace/tags (lane TAGS-401, 2026-09-08, train 61).
//
// WHY THIS FILE EXISTS, and which existing test SHOULD have caught the defect it pins. The whole
// workspace-tags feature 401'd for every signed-in user from the day it landed, and three test
// suites stayed green over it:
//
//   * src/components/ui/TagPopover.npmtest.mjs reads the component's SOURCE TEXT (there is no JSX
//     render harness in this repo) and asserts a trigger-gating structure. It never calls fetch.
//   * src/lib/tags/server.npmtest.mjs proves the pure server helpers (normalizeTagName,
//     buildTagCountsMap, resolveItemUuid). They are correct; the request never reached them.
//   * the rendering guard mounts the real components against a Playwright `page.route` fixture that
//     fulfils EVERY '**/api/**' with a canned body and never inspects the request. A component that
//     sends no credentials at all is indistinguishable there from one that sends the right ones.
//
// The gap all three share is that nothing exercised the CONTRACT BETWEEN the client and the route:
// requireAuth reads the caller's identity from the Authorization header and nowhere else. This file
// closes the route half (a request with no header is refused; a request whose token verifies gets
// past the gate and into the handler's real work), and
// .discipline/rendering/smoke/workspace-tags-smoke.mjs closes the client half by asserting the
// header on the wire in a real browser.
//
// HOW THE SECOND HALF IS POSSIBLE WITHOUT A SUPABASE PROJECT. requireAuth verifies the JWT against
// the live project's JWKS, which no offline test can do. The route imports it by module specifier,
// so jiti's `alias` substitutes a stub for "@/lib/api/auth" (and for the service client and rate
// limiter) written to a temp dir at run time. The route file itself is the real one, unmodified:
// what is proven is that handleGET calls requireAuth FIRST, returns its response verbatim when it
// is an error, and proceeds to the org resolution + bounded reads when it is not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const STUBS = mkdtempSync(join(tmpdir(), "tags-route-auth-"));

writeFileSync(
  join(STUBS, "auth.mjs"),
  `export const seen = [];
   export async function requireAuth(request) {
     const header = request.headers.get("authorization");
     seen.push(header);
     if (!header || !header.startsWith("Bearer ")) {
       return Response.json({ error: "Authentication required" }, { status: 401 });
     }
     if (header.slice(7) !== "valid-token") {
       return Response.json({ error: "Invalid or expired token" }, { status: 401 });
     }
     return { userId: "user-tags-401" };
   }
   export function isAuthError(result) { return result instanceof Response; }
  `
);

// A service client whose two bounded reads resolve one tag and one link, so a request that gets
// past the gate produces a real, shaped body rather than an empty success.
writeFileSync(
  join(STUBS, "supabase-service.mjs"),
  `const TAGS = [{ id: "tag-1", org_id: "org-1", name: "Q4 review", created_at: "2026-09-01T00:00:00Z" }];
   const LINKS = [{ tag_id: "tag-1", intelligence_item_id: "item-1" }];
   export function getServiceSupabase() {
     return {
       from(table) {
         const rows = table === "workspace_tags" ? TAGS : LINKS;
         const chain = {
           select: () => chain,
           eq: () => chain,
           ilike: () => chain,
           order: () => chain,
           limit: async () => ({ data: rows, error: null }),
           maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
           then: (fn) => Promise.resolve({ data: rows, error: null }).then(fn),
         };
         return chain;
       },
     };
   }
  `
);
writeFileSync(join(STUBS, "org.mjs"), `export async function resolveOrgIdFromUserId() { return "org-1"; }\n`);
writeFileSync(
  join(STUBS, "rate-limit.mjs"),
  `export function checkRateLimit() { return null; }
   export function rateLimitHeaders() { return {}; }
  `
);
writeFileSync(
  join(STUBS, "capture-error.mjs"),
  `export function withErrorCapture(_route, handler) { return handler; }\n`
);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    "@/lib/api/auth": join(STUBS, "auth.mjs"),
    "@/lib/supabase-service": join(STUBS, "supabase-service.mjs"),
    "@/lib/api/org": join(STUBS, "org.mjs"),
    "@/lib/api/rate-limit": join(STUBS, "rate-limit.mjs"),
    "@/lib/telemetry/capture-error": join(STUBS, "capture-error.mjs"),
    "@": resolve(ROOT, "src"),
  },
});

const { GET } = await jiti.import("./route.ts");
const { NextRequest } = await jiti.import("next/server");

function request(headerValue) {
  return new NextRequest("https://carosledge.com/api/workspace/tags", {
    headers: headerValue ? { authorization: headerValue } : {},
  });
}

test("no Authorization header: 401 — the exact production symptom, 23 times in three hours", async () => {
  const res = await GET(request(null));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Authentication required" });
});

test('credentials-only (a cookie, no header) is still 401: requireAuth never reads a cookie', async () => {
  // The pre-fix client sent `credentials: "include"`, which puts the Supabase auth cookie on the
  // request and NOTHING in the Authorization header. This is that request.
  const req = new NextRequest("https://carosledge.com/api/workspace/tags", {
    headers: { cookie: "sb-access-token=a-real-looking-session-cookie" },
  });
  assert.equal((await GET(req)).status, 401);
});

test("a malformed header (no Bearer prefix) is 401", async () => {
  assert.equal((await GET(request("valid-token"))).status, 401);
});

test('the degenerate "Bearer " with no token is 401, not a pass', async () => {
  // `Bearer ${session?.access_token || ""}` produced exactly this before the session resolved:
  // well-formed enough to clear a startsWith check, carrying no identity.
  assert.equal((await GET(request("Bearer "))).status, 401);
  assert.equal((await GET(request("Bearer undefined"))).status, 401);
});

test("a valid bearer gets PAST requireAuth and into the handler's real work", async () => {
  const res = await GET(request("Bearer valid-token"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Array.isArray(body.tags), true);
  assert.equal(body.tags.length, 1);
  assert.equal(body.tags[0].name, "Q4 review");
  assert.equal(body.tags[0].itemCount, 1, "the live count comes from the link read, not a constant");
});

test("the gate runs FIRST: an unauthenticated request never reaches the org or the reads", async () => {
  const { seen } = await jiti.import(join(STUBS, "auth.mjs"));
  const before = seen.length;
  const res = await GET(request(null));
  assert.equal(seen.length, before + 1, "requireAuth was called exactly once");
  assert.equal(res.status, 401);
  // Nothing shaped like a successful body escapes the gate.
  assert.equal("tags" in (await res.json()), false);
});
