// handlers.npmtest.mjs , the admin gate and the actor binding of the item-corrections API (lane G7-CORR). Uses the
// REAL requireAdminRoute with injected deps (the same injection route-guard.npmtest.mjs uses), so a non-admin is
// refused by the production gate, not by a stub. Runs in the CI "App unit tests requiring npm deps" step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const ROUTE_DIR = resolve(ROOT, "src", "app", "api", "admin", "items", "[id]", "corrections");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { requireAdminRoute } = await jiti.import("@/lib/api/route-guard");
const { handleList, handleCreate, handleRevoke } = await jiti.import("./handlers.ts");
const { NextRequest, NextResponse } = await jiti.import("next/server");

const ITEM = "11111111-1111-4111-8111-111111111111";
const CID = "44444444-4444-4444-8444-444444444444";
const SESSION_USER = "99999999-9999-4999-8999-999999999999";

/** A service client that records every touch. A refused caller must leave `touched` empty. */
function recordingClient() {
  const touched = [];
  const sb = {
    touched,
    rpc: async (name, args) => { touched.push({ rpc: name, args }); return { data: CID, error: null }; },
    from(table) {
      touched.push({ from: table });
      const b = { select() { return b; }, eq() { return b; }, in() { return b; }, maybeSingle: async () => ({ data: { id: ITEM }, error: null }), then(res) { res({ data: [], error: null }); } };
      return b;
    },
  };
  return sb;
}

function guardFor({ isAdmin, sb, authed = true }) {
  return (req) => requireAdminRoute(req, {
    authenticate: async () => (authed ? { userId: SESSION_USER } : NextResponse.json({ error: "Authentication required" }, { status: 401 })),
    rateLimit: () => null,
    isAdmin: async () => isAdmin,
    serviceClient: () => sb,
    limitHeaders: () => ({ "x-test": "1" }),
  });
}

const post = (body) => new NextRequest(`https://example.com/api/admin/items/${ITEM}/corrections`, { method: "POST", body: JSON.stringify(body) });
const get = () => new NextRequest(`https://example.com/api/admin/items/${ITEM}/corrections`);
const goodBody = { target_kind: "tag", target_ref: "topic_tags:carbon", op: "remove", reason: "too broad" };

test("a NON-ADMIN is refused with 403 on every route and the database is never touched (attack)", async () => {
  for (const run of [
    (g) => handleList(get(), ITEM, g),
    (g) => handleCreate(post(goodBody), ITEM, g),
    (g) => handleRevoke(post({}), ITEM, CID, g),
  ]) {
    const sb = recordingClient();
    const res = await run(guardFor({ isAdmin: false, sb }));
    assert.equal(res.status, 403);
    // requireAdminRoute itself resolves the admin check with the service client but our fake isAdmin never
    // touches it; nothing of ours (no rpc, no table read) may have run
    assert.deepEqual(sb.touched, []);
  }
});

test("an UNAUTHENTICATED caller is refused with 401 and the database is never touched (attack)", async () => {
  const sb = recordingClient();
  const res = await handleCreate(post(goodBody), ITEM, guardFor({ isAdmin: true, sb, authed: false }));
  assert.equal(res.status, 401);
  assert.deepEqual(sb.touched, []);
});

test("an admin create binds created_by to the SESSION user; a forged created_by in the body is ignored (attack)", async () => {
  const sb = recordingClient();
  const res = await handleCreate(post({ ...goodBody, created_by: "00000000-0000-4000-8000-000000000bad" }), ITEM, guardFor({ isAdmin: true, sb }));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("x-test"), "1", "the rate-limit headers ride on the response");
  assert.deepEqual(await res.json(), { id: CID, item_id: ITEM, applied: true });
  const rpc = sb.touched.find((t) => t.rpc === "create_item_correction");
  assert.equal(rpc.args.p_created_by, SESSION_USER);
});

test("a create without a reason is 400 and never reaches the database (attack)", async () => {
  const sb = recordingClient();
  const res = await handleCreate(post({ target_kind: "tag", target_ref: "topic_tags:x", op: "remove" }), ITEM, guardFor({ isAdmin: true, sb }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "reason_required");
  assert.deepEqual(sb.touched, []);
});

test("an invalid JSON body is 400 invalid_json", async () => {
  const sb = recordingClient();
  const bad = new NextRequest(`https://example.com/api/admin/items/${ITEM}/corrections`, { method: "POST", body: "{nope" });
  const res = await handleCreate(bad, ITEM, guardFor({ isAdmin: true, sb }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_json");
});

test("an admin revoke binds revoked_by to the session user and tolerates an empty body", async () => {
  const sb = recordingClient();
  const empty = new NextRequest(`https://example.com/x`, { method: "POST" });
  const res = await handleRevoke(empty, ITEM, CID, guardFor({ isAdmin: true, sb }));
  assert.equal(res.status, 200);
  assert.equal(sb.touched.find((t) => t.rpc === "revoke_item_correction").args.p_revoked_by, SESSION_USER);
});

test("both route files call requireAdminRoute (the shape fitness F2 reads) and pass it as the guard", () => {
  for (const rel of ["route.ts", "[correctionId]/revoke/route.ts"]) {
    const src = readFileSync(resolve(ROUTE_DIR, rel), "utf8");
    assert.match(src, /requireAdminRoute\(req\)/, `${rel} must call requireAdminRoute`);
    assert.doesNotMatch(src, /createClient|getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY/, `${rel} must not build its own client`);
  }
});
