// reviewer-gate.npmtest.mjs: lane ROUTES-1 (2026-10-08), register row R069.
// POST /api/community/moderation/reports/[id] reads the report through the caller's RLS client, and
// moderation_reports_select lets the REPORTER read their own report, so a reporter reached the warn, mute and
// ban branches, which send a notification with the service role. The route now checks the reviewer role before
// any side effect: user_is_group_admin for the report's group, or a platform admin; 403 otherwise.
// The route's guard, rate limit, notification dispatch, platform-admin lookup and service client are stubbed
// through jiti aliases so the real handler runs with no network and no database.
//
// Run: node --test "fsi-app/src/app/api/community/moderation/reports/reviewer-gate.npmtest.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "mod-gate-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const AUTHOR = "author-1";

const state = {
  targetKind: "post",
  reportStatus: "open",
  groupAdmin: false,
  rpcError: null,
  platformAdmin: false,
  calls: [],
  notifications: [],
};
globalThis.__modGateState = state;

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
function builder(table) {
  const st = globalThis.__modGateState;
  const b = {
    select() { return b; },
    eq() { return b; },
    delete() { st.calls.push("delete:" + table); return b; },
    update() { st.calls.push("update:" + table); return b; },
    maybeSingle() {
      if (table === "moderation_reports") {
        return Promise.resolve({ data: { id: "${REPORT_ID}", target_kind: st.targetKind, target_id: st.targetKind === "group" ? "${GROUP_ID}" : "${POST_ID}", reason: "spam", status: st.reportStatus }, error: null });
      }
      return Promise.resolve({ data: { id: "${POST_ID}", group_id: "${GROUP_ID}", author_user_id: "${AUTHOR}" }, error: null });
    },
    then(res) { return Promise.resolve({ data: null, error: null }).then(res); },
  };
  return b;
}
export async function requireCommunityRoute() {
  const st = globalThis.__modGateState;
  return {
    userId: "actor-1",
    supabase: {
      from: builder,
      rpc(name, args) { st.calls.push("rpc:" + name + ":" + args._group_id + ":" + args._user_id); return Promise.resolve({ data: st.groupAdmin, error: st.rpcError }); },
    },
  };
}
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/auth/admin": f("admin.mjs", `export async function isPlatformAdmin() { globalThis.__modGateState.calls.push("isPlatformAdmin"); return globalThis.__modGateState.platformAdmin; }\n`),
  "@/lib/supabase-service": f("svc.mjs", `export function getServiceSupabase() { return {}; }\n`),
  "@/lib/notifications/dispatch": f("disp.mjs", `export async function dispatchNotification(a) { globalThis.__modGateState.notifications.push(a); return null; }\n`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");
const { POST } = await jiti.import("./[id]/route.ts");

const ctx = { params: Promise.resolve({ id: REPORT_ID }) };
const post = (action) =>
  POST(
    new NextRequest("http://x/api/community/moderation/reports/" + REPORT_ID, {
      method: "POST",
      body: JSON.stringify({ action }),
      headers: { "content-type": "application/json" },
    }),
    ctx
  );
const reset = (over = {}) => {
  Object.assign(state, { targetKind: "post", reportStatus: "open", groupAdmin: false, rpcError: null, platformAdmin: false, calls: [], notifications: [] }, over);
};

for (const action of ["warn_user", "mute_user", "ban_user", "remove_post", "dismiss"]) {
  test(`${action}: a reporter who is neither group moderator nor platform admin is refused 403 with no side effect`, async () => {
    reset();
    const res = await post(action);
    assert.equal(res.status, 403);
    assert.deepEqual(state.notifications, [], "no notification may be sent");
    assert.ok(!state.calls.some((c) => c.startsWith("delete:") || c.startsWith("update:")), "no delete or update may run: " + state.calls.join(","));
  });
}

test("a group moderator or admin (user_is_group_admin true) passes: the report resolves and the warning is sent", async () => {
  reset({ groupAdmin: true });
  const res = await post("warn_user");
  assert.equal(res.status, 200);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].userId, AUTHOR);
  assert.ok(state.calls.includes(`rpc:user_is_group_admin:${GROUP_ID}:actor-1`), "the helper is called with the report's group and the actor");
  assert.ok(state.calls.includes("update:moderation_reports"));
});

test("a platform admin who is not a group member passes", async () => {
  reset({ platformAdmin: true });
  const res = await post("warn_user");
  assert.equal(res.status, 200);
  assert.equal(state.notifications.length, 1);
});

test("the gate fails closed: an rpc error is a refusal, not a pass", async () => {
  reset({ groupAdmin: true, rpcError: { message: "boom" } });
  const res = await post("warn_user");
  assert.equal(res.status, 403);
  assert.deepEqual(state.notifications, []);
});

test("a group report resolves the group from target_id", async () => {
  reset({ targetKind: "group", groupAdmin: true });
  const res = await post("dismiss");
  assert.equal(res.status, 200);
  assert.ok(state.calls.includes(`rpc:user_is_group_admin:${GROUP_ID}:actor-1`));
});

test("the gate runs before the closed-report 409, so a non-reviewer learns nothing about the report state", async () => {
  reset({ reportStatus: "resolved" });
  const res = await post("dismiss");
  assert.equal(res.status, 403);
});

test("a reviewer on a closed report still gets the existing 409", async () => {
  reset({ groupAdmin: true, reportStatus: "resolved" });
  const res = await post("dismiss");
  assert.equal(res.status, 409);
});
