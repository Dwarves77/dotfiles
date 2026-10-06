// ensure-profile.npmtest.mjs: lane AUTH-2 (2026-10-06). ensureProfile creates the caller's profiles row
// when it is missing and writes NOTHING else: no organisation, no workspace_settings, no membership, no
// platform-admin column. Idempotent, never overwrites, failure counted and never silent.
//
// Run: node --test fsi-app/src/lib/auth/ensure-profile.npmtest.mjs   (jiti loads the .ts module)
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { ensureProfile } = await jiti.import("./provision-personal-workspace.ts");

/** Stateful fake: profiles is a Map keyed by id; every write attempt is logged by table and verb. */
function fakeDb({ profiles = [], readError = null, insertError = null, raceInsert = false } = {}) {
  const rows = new Map(profiles.map((p) => [p.id, p]));
  const writes = [];
  return {
    rows,
    writes,
    from(table) {
      return {
        select() {
          return {
            eq(_col, id) {
              return {
                maybeSingle: async () => {
                  if (readError) return { data: null, error: readError };
                  return { data: rows.has(id) ? { id } : null, error: null };
                },
              };
            },
          };
        },
        async insert(row) {
          writes.push({ table, verb: "insert", row });
          if (insertError) return { error: insertError };
          if (raceInsert) {
            rows.set(row.id, row); // a concurrent call won the race
            return { error: { code: "23505", message: "duplicate key" } };
          }
          rows.set(row.id, row);
          return { error: null };
        },
        upsert() {
          writes.push({ table, verb: "upsert" });
          throw new Error("ensureProfile must never upsert (it would overwrite an existing profile)");
        },
        update() {
          writes.push({ table, verb: "update" });
          throw new Error("ensureProfile must never update");
        },
      };
    },
  };
}

const USER = "6853b368-0000-4000-8000-000000000001";

test("a user with no profile gets a profile row, and nothing else is written", async () => {
  const db = fakeDb();
  const failures = [];
  const res = await ensureProfile(USER, "new@example.com", { client: db, reportFailure: (s, m) => failures.push([s, m]) });
  assert.deepEqual(res, { created: true, exists: true });
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].table, "profiles");
  assert.equal(db.writes[0].verb, "insert");
  assert.equal(db.writes[0].row.id, USER);
  assert.equal(db.writes[0].row.email, "new@example.com");
  assert.equal("is_platform_admin" in db.writes[0].row, false, "platform admin is never in the payload");
  assert.deepEqual(failures, []);
  assert.equal(db.writes.some((w) => ["organizations", "org_memberships", "workspace_settings"].includes(w.table)), false);
});

test("a second call creates nothing (idempotent)", async () => {
  const db = fakeDb();
  await ensureProfile(USER, "new@example.com", { client: db });
  const again = await ensureProfile(USER, "new@example.com", { client: db });
  assert.deepEqual(again, { created: false, exists: true });
  assert.equal(db.writes.length, 1, "only the first call wrote");
});

test("an existing profile is returned untouched: no write of any kind", async () => {
  const db = fakeDb({ profiles: [{ id: USER, email: "x@example.com", is_platform_admin: true }] });
  const res = await ensureProfile(USER, "other@example.com", { client: db });
  assert.deepEqual(res, { created: false, exists: true });
  assert.equal(db.writes.length, 0);
  assert.equal(db.rows.get(USER).is_platform_admin, true, "platform admin untouched");
});

test("a concurrent insert (unique violation) is not a failure when the row now exists", async () => {
  const db = fakeDb({ raceInsert: true });
  const failures = [];
  const res = await ensureProfile(USER, "new@example.com", { client: db, reportFailure: (s) => failures.push(s) });
  assert.equal(res.exists, true);
  assert.deepEqual(failures, []);
});

test("an insert failure is logged, counted and reported with its step", async () => {
  const db = fakeDb({ insertError: { code: "42501", message: "permission denied" } });
  const failures = [];
  const res = await ensureProfile(USER, "new@example.com", { client: db, reportFailure: (s, m) => failures.push([s, m]) });
  assert.equal(res.exists, false);
  assert.equal(res.failedStep, "profiles_insert");
  assert.deepEqual(failures, [["profiles_insert", "permission denied"]]);
});

test("a failed READ is a counted failure, never treated as 'no profile' (no insert attempted)", async () => {
  const db = fakeDb({ readError: { message: "statement timeout" } });
  const failures = [];
  const res = await ensureProfile(USER, "new@example.com", { client: db, reportFailure: (s) => failures.push(s) });
  assert.equal(res.failedStep, "profiles_read");
  assert.deepEqual(failures, ["profiles_read"]);
  assert.equal(db.writes.length, 0);
});

test("a missing email is stored as null, not an empty string (profiles.email is unique)", async () => {
  const db = fakeDb();
  await ensureProfile(USER, "", { client: db });
  assert.equal(db.writes[0].row.email, null);
});
