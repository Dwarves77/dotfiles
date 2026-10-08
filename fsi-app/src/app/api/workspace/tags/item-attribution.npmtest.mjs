// Route-level proof of the tag-attribution write (lane s8b-tag-attribution, 2026-10-07, migration 313 created_by/created_at):
// PUT /api/workspace/tags/[id]/items stamps the applying member from the SESSION, ignores any author the
// request body claims (the attack), and keeps the first applier on a repeat apply. The route file is the
// real one; only its module dependencies are substituted by jiti aliases (the same technique as
// ./route.npmtest.mjs), so no database and no Supabase project is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const STUBS = mkdtempSync(join(tmpdir(), "tags-items-route-"));

writeFileSync(
  join(STUBS, "auth.mjs"),
  `export async function requireAuth(request) {
     const header = request.headers.get("authorization");
     if (header !== "Bearer valid-token") {
       return Response.json({ error: "Authentication required" }, { status: 401 });
     }
     return { userId: "session-user" };
   }
   export function isAuthError(result) { return result instanceof Response; }
  `
);

// The service client records every upsert (row + options) so the test can read what the route wrote.
writeFileSync(
  join(STUBS, "supabase-service.mjs"),
  `export const writes = [];
   export function getServiceSupabase() {
     return {
       from(table) {
         const chain = {
           select: () => chain,
           eq: () => chain,
           maybeSingle: async () => ({ data: table === "workspace_tags" ? { id: "tag-1" } : { id: "00000000-0000-4000-8000-000000000007" }, error: null }),
           upsert: async (row, options) => { writes.push({ table, row, options }); return { error: null }; },
           delete: () => chain,
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

const { PUT } = await jiti.import("./[id]/items/route.ts");
const { NextRequest } = await jiti.import("next/server");
const { writes } = await jiti.import(join(STUBS, "supabase-service.mjs"));

function put(body) {
  return PUT(
    new NextRequest("https://carosledge.com/api/workspace/tags/tag-1/items", {
      method: "PUT",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "tag-1" }) }
  );
}

test("the applier is stamped from the session", async () => {
  writes.length = 0;
  const res = await put({ itemId: "00000000-0000-4000-8000-000000000007" });
  assert.equal(res.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "item_workspace_tags");
  assert.equal(writes[0].row.created_by, "session-user");
});

test("ATTACK: a forged author in the body (created_by, createdBy, applied_by, appliedBy, appliedAt, created_at) is ignored", async () => {
  writes.length = 0;
  const res = await put({
    itemId: "00000000-0000-4000-8000-000000000007",
    created_by: "someone-else",
    createdBy: "someone-else",
    applied_by: "someone-else",
    appliedBy: "someone-else",
    appliedAt: "2001-01-01T00:00:00Z",
    created_at: "2001-01-01T00:00:00Z",
    org_id: "another-org",
  });
  assert.equal(res.status, 200);
  const { row } = writes[0];
  assert.equal(row.created_by, "session-user", "the author is the session user, not the body's claim");
  assert.equal(row.org_id, "org-1", "the org is the caller's own, not the body's");
  assert.deepEqual(
    Object.keys(row).sort(),
    ["created_by", "intelligence_item_id", "org_id", "tag_id"],
    "no client-supplied field reaches the row; the date is the column default"
  );
});

test("a repeat apply keeps the first applier and date: upsert is ignore-duplicates", async () => {
  writes.length = 0;
  await put({ itemId: "00000000-0000-4000-8000-000000000007" });
  assert.equal(writes[0].options.ignoreDuplicates, true);
  assert.equal(writes[0].options.onConflict, "tag_id,intelligence_item_id");
});

test("an unauthenticated request writes nothing", async () => {
  writes.length = 0;
  const res = await PUT(
    new NextRequest("https://carosledge.com/api/workspace/tags/tag-1/items", {
      method: "PUT",
      body: JSON.stringify({ itemId: "x" }),
    }),
    { params: Promise.resolve({ id: "tag-1" }) }
  );
  assert.equal(res.status, 401);
  assert.equal(writes.length, 0);
});
