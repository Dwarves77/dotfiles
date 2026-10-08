// org-writer.npmtest.mjs: lane SEC-3b (2026-10-08). requireOrgWriter (src/lib/api/org.ts) is the one gate the
// service-role workspace routes call before a write: role viewer is refused 403 viewer_read_only, owner, admin and
// member return their membership, and no membership (or a failed read) returns the routes' existing
// not-a-member 403. jiti resolves the @/ alias, same as org.npmtest.mjs; the client is injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { requireOrgWriter } = await jiti.import("./org.ts");

function client(row, error = null) {
  const seen = [];
  const q = {
    select() { return q; },
    eq(col, val) { seen.push([col, val]); return q; },
    async maybeSingle() { return { data: row, error }; },
  };
  return { seen, from(table) { assert.equal(table, "org_memberships"); return q; } };
}

test("a viewer gets the 403 viewer_read_only response", async () => {
  const r = await requireOrgWriter("u1", "o1", client({ org_id: "o1", role: "viewer" }));
  assert.ok("response" in r);
  assert.equal(r.response.status, 403);
  assert.deepEqual(await r.response.json(), { error: "viewer_read_only" });
});

for (const role of ["member", "admin", "owner"]) {
  test(`a ${role} gets the membership back`, async () => {
    const r = await requireOrgWriter("u1", "o1", client({ org_id: "o1", role }));
    assert.deepEqual(r, { membership: { orgId: "o1", role } });
  });
}

test("no membership of that org returns the existing not-a-member 403, unchanged", async () => {
  const r = await requireOrgWriter("u1", "o1", client(null));
  assert.ok("response" in r);
  assert.equal(r.response.status, 403);
  assert.deepEqual(await r.response.json(), { error: "User has no organization membership" });
});

test("a failed membership read fails closed to the same not-a-member 403", async () => {
  const r = await requireOrgWriter("u1", "o1", client(null, { message: "boom" }));
  assert.ok("response" in r);
  assert.equal(r.response.status, 403);
});

test("the lookup is scoped to the caller and the org given, not the oldest membership", async () => {
  const c = client({ org_id: "o2", role: "member" });
  await requireOrgWriter("u9", "o2", c);
  assert.deepEqual(c.seen, [["user_id", "u9"], ["org_id", "o2"]]);
});

test("a null org (the caller's org was not resolved) is the not-a-member 403 and reads nothing", async () => {
  const c = client({ org_id: "o1", role: "member" });
  const r = await requireOrgWriter("u1", null, c);
  assert.ok("response" in r);
  assert.equal(r.response.status, 403);
  assert.deepEqual(await r.response.json(), { error: "User has no organization membership" });
  assert.deepEqual(c.seen, []);
});
