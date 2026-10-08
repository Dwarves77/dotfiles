// signoff-decide-route.npmtest.mjs: lane SEC-6 (2026-10-08, migration 375).
// profiles.is_platform_admin is no longer selectable by a signed-in user, so the sign-off decide route's caller-role
// read (a precise 403 message; migration 153's RLS is the real gate) takes the admin bit from rpc("is_platform_admin")
// and only verifier_status from profiles. Proven on the real handler with a stubbed guard and a fake client that
// REFUSES a profiles select naming the column the way the database now does.
//
// Run: node --test fsi-app/src/app/api/community/signoff/signoff-decide-route.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "signoff-decide-route-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const ME = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQ = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const POST = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const state = { verifierStatus: "none", adminRpc: false, adminRpcError: null, calls: [], selects: [] };
globalThis.__sec6State = state;

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireCommunityRoute() {
  const s = globalThis.__sec6State;
  function builder(rows) {
    const b = {};
    for (const m of ["select", "eq", "update", "is", "order", "limit"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    return b;
  }
  return {
    userId: "${ME}",
    supabase: {
      from(t) {
        s.calls.push("from:" + t);
        if (t === "profiles") {
          return {
            select(cols) {
              s.selects.push(String(cols));
              if (/is_platform_admin/.test(String(cols))) {
                return { eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42501", message: "permission denied for table profiles" } }) }) };
              }
              return { eq: () => ({ maybeSingle: async () => ({ data: { verifier_status: s.verifierStatus }, error: null }) }) };
            },
          };
        }
        if (t === "community_post_signoff_requests") {
          return builder([{ id: "${REQ}", post_id: "${POST}", requested_by: "x", status: "signed_off", verifier_id: "${ME}", primary_doc_url: null, decision_note: null, created_at: "t", decided_at: "t" }]);
        }
        return builder([]);
      },
      rpc(fn, args) {
        s.calls.push("rpc:" + fn);
        if (fn !== "is_platform_admin") return Promise.resolve({ data: null, error: { message: "unexpected rpc " + fn } });
        return Promise.resolve(s.adminRpcError ? { data: null, error: s.adminRpcError } : { data: s.adminRpc, error: null });
      },
    },
  };
}
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/supabase-service": f("service.mjs", `
export function getServiceSupabase() {
  return { from() { return { update() { return { eq: async () => ({ error: null }) }; } }; } };
}
`),
};

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { ...stubs, "@": resolve(ROOT, "src") } });
const { NextRequest } = await jiti.import("next/server");
const route = await jiti.import("./[id]/decide/route.ts");

async function decide(over) {
  Object.assign(state, { verifierStatus: "none", adminRpc: false, adminRpcError: null, calls: [], selects: [] }, over);
  const req = new NextRequest("http://x/api/community/signoff/" + REQ + "/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "signed_off" }),
  });
  return route.POST(req, { params: Promise.resolve({ id: REQ }) });
}

test("SEC-6: an active verifier who is not an admin is let through; the caller-role read never selects is_platform_admin", async () => {
  const res = await decide({ verifierStatus: "active", adminRpc: false });
  assert.equal(res.status, 200);
  assert.ok(state.selects.length >= 1);
  for (const cols of state.selects) assert.doesNotMatch(cols, /is_platform_admin/);
});

test("SEC-6: a platform admin who is not a verifier is let through, and the admin bit came from rpc('is_platform_admin')", async () => {
  const res = await decide({ verifierStatus: "none", adminRpc: true });
  assert.equal(res.status, 200);
  assert.ok(state.calls.includes("rpc:is_platform_admin"));
});

test("SEC-6: neither a verifier nor an admin gets the precise 403", async () => {
  const res = await decide({ verifierStatus: "none", adminRpc: false });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Only active verifiers/);
});

test("SEC-6: an rpc error is not an admit: a non-verifier gets the 403 (the RLS policy stays the real gate)", async () => {
  const res = await decide({ verifierStatus: "none", adminRpc: true, adminRpcError: { message: "boom" } });
  assert.equal(res.status, 403);
});

test("SEC-6: only a literal true from the rpc admits", async () => {
  const res = await decide({ verifierStatus: "none", adminRpc: "true" });
  assert.equal(res.status, 403);
});
