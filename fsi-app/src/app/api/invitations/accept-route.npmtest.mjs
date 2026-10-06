// accept-route.npmtest.mjs: lane AUTH-2 (2026-10-06). Route-level proof that accepting an invitation
// sends ONLY the token to accept_invitation, whatever the request carries. The RPC takes no role, so the
// membership role can only be the one the inviter stored (migration 156: proposed_role). The route's
// guard modules are replaced by stubs through jiti aliases so the real POST handler runs with an injected
// RPC and no network.
//
// Run: node --test fsi-app/src/app/api/invitations/accept-route.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "accept-route-"));
const guardStub = resolve(dir, "route-guard-stub.mjs");
const limitStub = resolve(dir, "rate-limit-stub.mjs");
writeFileSync(guardStub, `
export const calls = [];
export const state = { rpcResult: { data: "org-1", error: null } };
export function isRefusal(r) { return r instanceof Response; }
export async function requireCommunityRoute() {
  return { userId: "user-1", supabase: { rpc: async (name, args) => { calls.push({ name, args }); return state.rpcResult; } } };
}
`);
writeFileSync(limitStub, `export function rateLimitHeaders() { return {}; }\n`);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: {
    "@/lib/api/route-guard": guardStub,
    "@/lib/api/rate-limit": limitStub,
    "@": resolve(ROOT, "src"),
  },
});
const { POST } = await jiti.import("./[token]/accept/route.ts");
const stub = await jiti.import(guardStub);

const TOKEN = "a".repeat(64);
const ctx = { params: Promise.resolve({ token: TOKEN }) };
const req = (body) => new Request("http://x/api/invitations/t/accept", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("accept sends only p_token to accept_invitation, ignoring a role, org or user in the request", async () => {
  stub.calls.length = 0;
  const res = await POST(req({ role: "owner", proposed_role: "admin", org_id: "org-victim", user_id: "someone" }), ctx);
  assert.equal(res.status, 200);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].name, "accept_invitation");
  assert.deepEqual(stub.calls[0].args, { p_token: TOKEN });
  assert.deepEqual(await res.json(), { ok: true, org_id: "org-1" });
});

test("a malformed token is refused before any RPC", async () => {
  stub.calls.length = 0;
  const res = await POST(req({}), { params: Promise.resolve({ token: "short" }) });
  assert.equal(res.status, 400);
  assert.equal(stub.calls.length, 0);
});

test("a wrong-email refusal from the RPC is a 403, not a membership", async () => {
  stub.state.rpcResult = { data: null, error: { code: "42501", message: "Invitation is for a different email" } };
  const res = await POST(req({}), ctx);
  assert.equal(res.status, 403);
  stub.state.rpcResult = { data: "org-1", error: null };
});
