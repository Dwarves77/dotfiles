// Unit proof for src/lib/api/authed-fetch.ts, the ONE authenticated fetcher (lane TAGS-401,
// 2026-09-08, train 61). Every branch the seven deleted hand-rolled copies disagreed about is
// pinned here: the header is attached, a caller's own headers survive, and a missing session
// produces NO REQUEST and requireAuth's own 401 body rather than a `Bearer ` carrying no identity.
//
// The session client and the fetch implementation are injected (the AuthedFetchDeps seam), the same
// pattern src/lib/watchlist/membership.ts's client half uses, so this runs with no browser, no
// Supabase project and no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { authedFetch, authHeaders, resolveAccessToken, unauthorizedResponse, withBearer, AUTH_REQUIRED_ERROR } =
  await jiti.import("./authed-fetch.ts");

const signedIn = (token = "jwt-abc") => ({ auth: { getSession: async () => ({ data: { session: { access_token: token } } }) } });
const signedOut = { auth: { getSession: async () => ({ data: { session: null } }) } };

/** A fetch stand-in that records the request it was handed instead of making one. */
function recorder() {
  const seen = [];
  const impl = async (input, init) => {
    seen.push({ input, init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return { seen, impl };
}

// ── resolveAccessToken ────────────────────────────────────────────────────────────────────────

test("resolveAccessToken returns the token for a live session", async () => {
  assert.equal(await resolveAccessToken(signedIn()), "jwt-abc");
});

test("resolveAccessToken returns null for no session, and for the empty-string token", async () => {
  assert.equal(await resolveAccessToken(signedOut), null);
  assert.equal(await resolveAccessToken(signedIn("")), null);
  assert.equal(await resolveAccessToken({ auth: { getSession: async () => ({ data: { session: {} } }) } }), null);
});

// ── withBearer ────────────────────────────────────────────────────────────────────────────────

test("withBearer attaches the header without dropping the caller's own", () => {
  const init = withBearer({ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, "t");
  assert.equal(init.method, "POST");
  assert.equal(init.body, "{}");
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(init.headers.authorization, "Bearer t");
});

test("withBearer works with no init at all", () => {
  assert.equal(withBearer(undefined, "t").headers.authorization, "Bearer t");
});

// ── authedFetch ───────────────────────────────────────────────────────────────────────────────

test("authedFetch sends Authorization: Bearer <jwt> — the header requireAuth reads and the one the tags client never sent", async () => {
  const { seen, impl } = recorder();
  await authedFetch("/api/workspace/tags", undefined, { client: signedIn("jwt-abc"), fetchImpl: impl });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].input, "/api/workspace/tags");
  assert.equal(new Headers(seen[0].init.headers).get("authorization"), "Bearer jwt-abc");
});

test("authedFetch preserves method, body and the caller's Content-Type (the apply/remove calls)", async () => {
  const { seen, impl } = recorder();
  await authedFetch(
    "/api/workspace/tags/tag-1/items",
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: "r7" }) },
    { client: signedIn(), fetchImpl: impl }
  );
  const { init } = seen[0];
  assert.equal(init.method, "PUT");
  assert.equal(init.body, '{"itemId":"r7"}');
  assert.equal(new Headers(init.headers).get("content-type"), "application/json");
  assert.match(new Headers(init.headers).get("authorization"), /^Bearer /);
});

test("no session: NO REQUEST is made — never a `Bearer ` or `Bearer undefined` on the wire", async () => {
  const { seen, impl } = recorder();
  const res = await authedFetch("/api/workspace/tags", undefined, { client: signedOut, fetchImpl: impl });
  assert.equal(seen.length, 0, "the request must not leave the browser without an identity");
  assert.equal(res.status, 401);
});

test("the synthetic 401 body is byte-identical to requireAuth's, so callers cannot tell them apart", async () => {
  const res = await authedFetch("/api/workspace/tags", undefined, { client: signedOut, fetchImpl: recorder().impl });
  assert.deepEqual(await res.json(), { error: AUTH_REQUIRED_ERROR });
  assert.equal(AUTH_REQUIRED_ERROR, "Authentication required");
  assert.equal(unauthorizedResponse().status, 401);
});

// ── authHeaders ───────────────────────────────────────────────────────────────────────────────

test("authHeaders merges extras and returns null (not a headerless object) when signed out", async () => {
  const h = await authHeaders({ "Content-Type": "application/json" }, { client: signedIn("t") });
  assert.deepEqual(h, { "Content-Type": "application/json", Authorization: "Bearer t" });
  assert.equal(await authHeaders({}, { client: signedOut }), null);
});

test("the null return is what makes the caller's signed-out branch reachable", async () => {
  // useWorkspaceBootstrap / useAdminAttention / useListOrder all branch on this to distinguish
  // "signed out, nothing personal to load" from "the request failed". A copy that returned
  // `{ Authorization: "Bearer " }` instead made that branch dead and turned every such load into
  // an indistinguishable 401. This assertion is the difference.
  assert.equal(await authHeaders({}, { client: signedIn("") }), null);
});
