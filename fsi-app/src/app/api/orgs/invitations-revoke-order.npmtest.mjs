// invitations-revoke-order.npmtest.mjs: lane SEC-10 (2026-10-11), BACKLOG B-0002, B-0003, B-0004, B-0040.
// Two attacks on the invitation routes, run against the real handlers with the guard, rate limit and email
// seam replaced by stubs through jiti aliases (the viewer-read-only-routes.npmtest.mjs pattern, no network):
//   1. REVOKE ORDER. DELETE /api/orgs/[org_id]/invitations/[id] with an org_id that does not own the invitation
//      must be refused 404 BEFORE the revoke_invitation RPC runs (the RPC is the write; a URL-scope check after
//      it is a check after the damage). A matching org_id runs exactly one RPC. A read error on the ownership
//      read is a 500 with no RPC (the read's error was dropped before).
//   2. INVITE LOG. POST /api/orgs/[org_id]/invitations must not write the invite URL (it carries the bearer
//      token) or the invitee email to the function log.
//
// Run: node --test fsi-app/src/app/api/orgs/invitations-revoke-order.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "invitations-routes-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const INV = "33333333-3333-4333-8333-333333333333";
const TOKEN = "tok_SECRET_0123456789abcdef";

// One shared state object the stubs and the tests both reach through globalThis.
const state = {
  rpcCalls: [],
  rpcResult: { data: null, error: null },
  readResult: { data: null, error: null },
  insertResult: { data: null, error: null },
  emailCalls: [],
};
globalThis.__sec10InvState = state;

function fakeClient() {
  return {
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      return Promise.resolve(state.rpcResult);
    },
    from() {
      const chain = {
        _insert: false,
        select() { return chain; },
        eq() { return chain; },
        insert() { chain._insert = true; return chain; },
        maybeSingle() { return Promise.resolve(chain._insert ? state.insertResult : state.readResult); },
      };
      return chain;
    },
  };
}
globalThis.__sec10InvClient = fakeClient();

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireCommunityRoute() { return { userId: "user-1", supabase: globalThis.__sec10InvClient }; }
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/email/send-invitation-email": f("email.mjs", `
export async function sendInvitationEmail(args) { globalThis.__sec10InvState.emailCalls.push(args); return { status: "not_configured" }; }
`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");
const { DELETE } = await jiti.import("./[org_id]/invitations/[id]/route.ts");
const { POST } = await jiti.import("./[org_id]/invitations/route.ts");

const reset = () => {
  state.rpcCalls.length = 0;
  state.emailCalls.length = 0;
  state.rpcResult = { data: null, error: null };
  state.readResult = { data: null, error: null };
  state.insertResult = { data: null, error: null };
};
const revoke = (orgId) =>
  DELETE(new NextRequest("http://x/api/orgs/" + orgId + "/invitations/" + INV, { method: "DELETE" }), {
    params: Promise.resolve({ org_id: orgId, id: INV }),
  });

// 1. revoke order

test("revoke: an org_id that does not own the invitation is 404 and the RPC is never called", async () => {
  reset();
  state.readResult = { data: { id: INV, org_id: OTHER_ORG, status: "pending" }, error: null };
  const res = await revoke(ORG);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Invitation not found" });
  assert.equal(state.rpcCalls.length, 0, "revoke_invitation must not run for a mismatched org");
});

test("revoke: no such invitation row is 404 and the RPC is never called", async () => {
  reset();
  state.readResult = { data: null, error: null };
  const res = await revoke(ORG);
  assert.equal(res.status, 404);
  assert.equal(state.rpcCalls.length, 0);
});

test("revoke: a matching org_id runs exactly one revoke_invitation and returns revoked", async () => {
  reset();
  state.readResult = { data: { id: INV, org_id: ORG, status: "pending" }, error: null };
  const res = await revoke(ORG);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "revoked" });
  assert.equal(state.rpcCalls.length, 1);
  assert.deepEqual(state.rpcCalls[0], { name: "revoke_invitation", args: { p_invitation_id: INV } });
});

test("revoke: a read error on the ownership read is a 500 and the RPC is never called", async () => {
  reset();
  state.readResult = { data: null, error: { message: "read blew up", code: "XX000" } };
  const res = await revoke(ORG);
  assert.equal(res.status, 500);
  assert.equal(state.rpcCalls.length, 0);
});

test("revoke: the RPC's own refusals still map (42501 to 403, P0002 to 404, 22023 to 409)", async () => {
  for (const [code, status] of [["42501", 403], ["P0002", 404], ["22023", 409]]) {
    reset();
    state.readResult = { data: { id: INV, org_id: ORG, status: "pending" }, error: null };
    state.rpcResult = { data: null, error: { code, message: "m" } };
    const res = await revoke(ORG);
    assert.equal(res.status, status, "rpc error " + code);
    assert.equal(state.rpcCalls.length, 1);
  }
});

// 2. invite log

test("invite POST: the function log carries neither the token, the invite URL nor the email", async () => {
  reset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  state.insertResult = {
    data: {
      id: INV,
      token: TOKEN,
      invited_email: "invitee@example.test",
      proposed_role: "member",
      expires_at: "2026-12-01T00:00:00Z",
      status: "pending",
      created_at: "2026-10-11T00:00:00Z",
    },
    error: null,
  };
  const logged = [];
  const origLog = console.log;
  console.log = (...args) => { logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
  let res;
  try {
    res = await POST(
      new NextRequest("http://x/api/orgs/" + ORG + "/invitations", {
        method: "POST",
        body: JSON.stringify({ email: "invitee@example.test", role: "member" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ org_id: ORG }) }
    );
  } finally {
    console.log = origLog;
  }
  assert.equal(res.status, 201);
  const joined = logged.join("\n");
  assert.ok(logged.length >= 1, "the invitation line is still logged");
  assert.ok(!joined.includes(TOKEN), "the bearer token must not reach the log");
  assert.ok(!joined.includes("/invitations/"), "the invite URL must not reach the log");
  assert.ok(!joined.includes("invitee@example.test"), "the invitee email must not reach the log");
  assert.ok(joined.includes(`org=${ORG}`) && joined.includes(`invitation=${INV}`) && joined.includes("role=member"));
  // The inviter still gets the URL (copy-link path) in the JSON, unchanged.
  const body = await res.json();
  assert.equal(body.invitation.invite_url, "https://app.example.test/invitations/" + TOKEN);
});
